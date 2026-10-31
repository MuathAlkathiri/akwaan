import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProvider } from '../../ai-agent/domain/ai-provider.interface';
import type {
  AiTextGenerationRequest,
  AiTextGenerationResult,
} from '../../ai-agent/domain/ai-provider.types';

/**
 * JSON Schema keywords OpenAI's strict structured-output mode accepts.
 *
 * Verified against OpenAI's structured-outputs documentation, 2026-10. Keeping
 * an explicit allow-list — rather than only a deny-list — is what lets the
 * adapter fail closed on a keyword nobody has classified yet, instead of
 * shipping it to a provider that will reject the request after we have paid
 * for the attempt.
 */
const OPENAI_STRICT_SUPPORTED = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'anyOf',
  'description',
  'title',
  '$defs',
  '$ref',
]);

/**
 * Keywords strict mode rejects. Removing one loses a constraint, so each is
 * only safe to drop where the rule it expressed is enforced elsewhere —
 * `ANSWER_OPTIONS_TOO_MANY` in the deterministic screen covers the array
 * bounds the multiple-choice schema used to carry.
 */
const OPENAI_STRICT_UNSUPPORTED = new Set([
  'minItems',
  'maxItems',
  'uniqueItems',
  'contains',
  'minContains',
  'maxContains',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'patternProperties',
  'unevaluatedProperties',
  'propertyNames',
  'minProperties',
  'maxProperties',
  'allOf',
  'oneOf',
  'not',
  'dependentRequired',
  'dependentSchemas',
  'if',
  'then',
  'else',
  'default',
  'examples',
]);

/** Raised before any request when a schema keyword has not been classified. */
export class UnclassifiedSchemaKeywordError extends Error {
  constructor(keyword: string, path: string) {
    super(
      `Schema keyword "${keyword}" at ${path} is neither known-supported nor ` +
        `known-unsupported under OpenAI strict mode. Refusing to send a paid ` +
        `request with an unverified schema.`,
    );
  }
}

/**
 * The canonical schema, adapted for OpenAI strict mode.
 *
 * One schema stays the source of truth; this is a mechanical transform at the
 * provider boundary. Gemini keeps the original, constraints and all. Unknown
 * keywords throw rather than being guessed at in either direction, because
 * both guesses are expensive: strip a supported constraint and the model loses
 * guidance, keep an unsupported one and the request is rejected after billing.
 */
export const adaptSchemaForOpenAiStrict = (
  node: unknown,
  path = '$',
): unknown => {
  if (Array.isArray(node)) {
    return node.map((item, i) =>
      adaptSchemaForOpenAiStrict(item, `${path}[${i}]`),
    );
  }
  if (!node || typeof node !== 'object') return node;

  const adapted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (OPENAI_STRICT_UNSUPPORTED.has(key)) continue;
    if (!OPENAI_STRICT_SUPPORTED.has(key)) {
      throw new UnclassifiedSchemaKeywordError(key, path);
    }
    // `properties` holds field names, not keywords — descend without
    // classifying its keys.
    adapted[key] =
      key === 'properties'
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(
              ([field, sub]) => [
                field,
                adaptSchemaForOpenAiStrict(sub, `${path}.properties.${field}`),
              ],
            ),
          )
        : key === 'enum' || key === 'required'
          ? value
          : adaptSchemaForOpenAiStrict(value, `${path}.${key}`);
  }

  // OpenAI strict mode requires additionalProperties: false on every object.
  if (
    (adapted.type === 'object' || adapted.properties !== undefined) &&
    adapted.additionalProperties === undefined
  ) {
    adapted.additionalProperties = false;
  }

  return adapted;
};

export class OpenRouterUnavailableError extends Error {
  /**
   * True when the provider answered with an error instead of running the
   * request, so no inference happened and nothing was billed. A GPT-5 batch
   * rejected for an invalid schema cost SAR 0 at OpenRouter while the ledger
   * charged its full reservation — this flag is what lets the budget tell the
   * two cases apart.
   */
  readonly definitelyNotBilled: boolean;

  constructor(message: string, definitelyNotBilled = false) {
    super(message);
    this.definitelyNotBilled = definitelyNotBilled;
  }
}
export class OpenRouterTimeoutError extends Error {
  /** Marks the ambiguous case: the request may still have been billed. */
  readonly billingUnknown = true;
}

/**
 * HTTP statuses from an LLM gateway (like OpenRouter) that are provably rejected
 * at the gateway edge *before* dispatching to an upstream inference worker.
 *
 * Only explicit, well-defined client validation, authentication, and credit rejections
 * belong here:
 * - 400: Bad Request (schema invalid, unsupported parameter, malformed JSON)
 * - 401: Unauthorized (missing or invalid API key)
 * - 402: Payment Required (insufficient balance or credit limit reached)
 * - 403: Forbidden (model access denied, region restricted)
 * - 404: Not Found (invalid endpoint or model slug)
 * - 422: Unprocessable Entity (semantic payload validation failure)
 * - 429: Too Many Requests (gateway rate limiter rejected request before inference)
 *
 * Any other HTTP status — including 408 (Request Timeout), 409 (Conflict),
 * 425 (Too Early), 499 (Client Closed Request), all 5xx server/gateway errors,
 * and any unclassified status code — is treated conservatively as billing-ambiguous
 * (definitelyNotBilled: false).
 */
export const DEFINITELY_UNBILLED_HTTP_STATUSES = new Set<number>([
  400, // Bad Request
  401, // Unauthorized
  402, // Payment Required
  403, // Forbidden
  404, // Not Found
  422, // Unprocessable Entity
  429, // Too Many Requests
]);

/**
 * OpenRouter behind the existing `AiProvider` boundary.
 *
 * Why here and not in `AiProviderFactory`: the factory throws for any provider
 * but `gemini`/`lmstudio`, while `LlmClientService.getRuntimeConfig` *defaults*
 * to `openrouter` and already speaks the OpenAI-compatible `/chat/completions`
 * dialect. That disagreement is real, but repairing it inside the factory would
 * change what `AI_PROVIDER=openrouter` means for the whole application — the
 * legacy question pipeline included. This class resolves the mismatch for the
 * engine alone and leaves global behaviour untouched; see the audit note on
 * fixing the factory as a separate, deliberate decision.
 *
 * One transport, one model, no fallback. A provider that silently retries on a
 * different model turns a priced reservation into an unpriced bill.
 */
export class OpenRouterAiProvider implements AiProvider {
  private readonly logger = new Logger(OpenRouterAiProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private truthy(key: string): boolean {
    return ['true', '1', 'yes', 'on'].includes(
      this.config.get<string>(key)?.trim().toLowerCase() ?? '',
    );
  }

  /**
   * Whether this model needs the OpenAI strict-schema adaptation.
   *
   * Detected from the model id rather than a flag that must be remembered: the
   * cost of forgetting is a rejected paid request, which has already happened
   * once. `ENGINE_STRICT_SCHEMA_ADAPT=false` disables it explicitly.
   */
  private requiresOpenAiStrictSchema(model: string): boolean {
    if (
      this.config
        .get<string>('ENGINE_STRICT_SCHEMA_ADAPT')
        ?.trim()
        .toLowerCase() === 'false'
    ) {
      return false;
    }
    return model.trim().toLowerCase().startsWith('openai/');
  }

  /** `minimal` | `low` | `medium` | `high`, or undefined to leave the default. */
  private reasoningEffort(): string | undefined {
    const value = this.config
      .get<string>('ENGINE_REASONING_EFFORT')
      ?.trim()
      .toLowerCase();
    return value && ['minimal', 'low', 'medium', 'high'].includes(value)
      ? value
      : undefined;
  }

  private baseUrl(): string {
    return (
      this.config.get<string>('OPENROUTER_BASE_URL')?.trim() ||
      'https://openrouter.ai/api/v1'
    ).replace(/\/+$/, '');
  }

  async generateText(
    request: AiTextGenerationRequest,
  ): Promise<AiTextGenerationResult> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY')?.trim();
    const configuredGenModel = this.config
      .get<string>('ENGINE_GENERATION_MODEL')
      ?.trim();
    const model = request.model?.trim() || configuredGenModel;
    const isGenerationModel =
      !request.model || request.model.trim() === configuredGenModel;
    const omitTemperature =
      request.omitTemperature !== undefined
        ? request.omitTemperature
        : isGenerationModel
          ? this.truthy('ENGINE_OMIT_TEMPERATURE')
          : false;
    const effort =
      request.reasoningEffort !== undefined
        ? (request.reasoningEffort ?? undefined)
        : isGenerationModel
          ? this.reasoningEffort()
          : undefined;
    // Fail closed, before a request exists. A missing key or model is a
    // configuration error, never a reason to pick something else.
    if (!apiKey)
      throw new OpenRouterUnavailableError('OPENROUTER_API_KEY is not set');
    if (!model)
      throw new OpenRouterUnavailableError(
        'ENGINE_GENERATION_MODEL is not set',
      );

    const timeoutMs =
      request.timeoutMs ??
      Number(this.config.get<string>('ENGINE_REQUEST_TIMEOUT_MS') ?? 120_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl()}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(request.systemInstruction
              ? [{ role: 'system', content: request.systemInstruction }]
              : []),
            { role: 'user', content: request.prompt },
          ],
          // Temperature is omitted for models that do not accept it.
          //
          // This is not cosmetic. Below, `require_parameters: true` tells
          // OpenRouter to route only to endpoints supporting every parameter
          // in the body. No `openai/gpt-5` endpoint lists `temperature`
          // (verified 2026-10-16 against /models/openai/gpt-5/endpoints), so
          // sending it leaves zero eligible endpoints and the request fails
          // outright rather than degrading. Config-driven so the setting is a
          // property of the deployed model, not a guess compiled in here.
          ...(request.temperature !== undefined && !omitTemperature
            ? { temperature: request.temperature }
            : {}),
          // `max_tokens` bounds reasoning *and* visible output together, which
          // is what keeps a reasoning model's bill inside its reservation.
          // Note it also narrows routing under `require_parameters`: for
          // gpt-5 only the OpenAI endpoint lists `max_tokens`, while the Azure
          // endpoints list `max_completion_tokens`. That is deliberate — the
          // OpenAI endpoint carries the reference price.
          ...(request.maxOutputTokens
            ? { max_tokens: request.maxOutputTokens }
            : {}),
          // Reasoning effort, where the model has it. Bounding effort does not
          // change the financial ceiling — `max_tokens` already does that —
          // but it is what leaves room for content inside the ceiling instead
          // of spending the whole allowance thinking and returning nothing.
          ...(effort ? { reasoning: { effort } } : {}),
          // Structured output is required, not preferred: a prose reply is a
          // failed generation, and the schema is what makes that detectable.
          ...(request.responseSchema
            ? {
                // Routing is per-endpoint, not per-model: without this,
                // OpenRouter may serve the request from an endpoint that
                // ignores `response_format`, and we pay for prose the strict
                // parser then rejects. Fail the request instead.
                provider: { require_parameters: true },
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: 'akwaan_candidates',
                    strict: true,
                    schema: this.requiresOpenAiStrictSchema(model)
                      ? adaptSchemaForOpenAiStrict(request.responseSchema)
                      : request.responseSchema,
                  },
                },
              }
            : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      // An aborted or failed request may still have reached the provider and
      // been billed. Surfacing that distinctly is what lets the budget charge
      // it conservatively instead of assuming it was free.
      const timeout = new OpenRouterTimeoutError(
        `OpenRouter request did not complete: ${(error as Error).message}`,
      );
      this.logger.warn({
        event: 'engine_provider_ambiguous_outcome',
        model,
        reason: (error as Error).message,
      });
      throw timeout;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      // A rejected request is only definitely unbilled if the provider explicitly
      // declined it at the gateway before inference began (e.g. 400 Bad Request,
      // 401 Unauthorized, 402 Payment Required, 403 Forbidden, 404 Not Found,
      // 422 Unprocessable Entity, 429 Too Many Requests).
      //
      // Gateway timeouts (504), bad gateways (502), server errors (500, 503),
      // and request timeouts (408) may occur after upstream model execution has
      // already begun or completed, and the provider may still bill for tokens.
      // Treating those as definitely not billed would let the ledger drift below
      // real provider spend. We classify them as ambiguous (definitelyNotBilled: false),
      // which settles at the full reserved amount and halts without auto-retrying.
      const definitelyNotBilled = DEFINITELY_UNBILLED_HTTP_STATUSES.has(
        response.status,
      );

      throw new OpenRouterUnavailableError(
        `OpenRouter responded ${response.status}: ${body.slice(0, 600)}`,
        definitelyNotBilled,
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        /**
         * Reasoning tokens, where a reasoning model reports them. For OpenAI
         * models these are **already included** in `completion_tokens`, so the
         * ledger charges them by charging completion tokens; surfacing them
         * separately here is for observation, and feeding them into `usage`
         * as well would bill them twice.
         */
        completion_tokens_details?: { reasoning_tokens?: number };
        /** OpenRouter's own charge, in USD credits — not SAR. */
        cost?: number;
        cost_details?: { upstream_inference_cost?: number };
      };
      model?: string;
    };

    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new OpenRouterUnavailableError('OpenRouter returned no content');
    }

    return {
      text,
      provider: 'openrouter',
      // What the provider says it served, which can differ from what was asked
      // for. The ledger records the served model so cost is attributable.
      model: payload.model ?? model,
      durationMs: Date.now() - startedAt,
      // Observation only. The provider reports its charge in USD credits while
      // the engine accounts in integer SAR micros, so this is recorded for
      // comparison and deliberately never fed into the ledger — converting it
      // would bake an exchange-rate assumption into settled money. See the
      // reconciliation proposal in the Phase 2b report.
      ...(typeof payload.usage?.cost === 'number' ||
      typeof payload.usage?.completion_tokens_details?.reasoning_tokens ===
        'number'
        ? {
            diagnostics: {
              ...(typeof payload.usage?.cost === 'number'
                ? { providerReportedCostUsd: payload.usage.cost }
                : {}),
              ...(typeof payload.usage?.completion_tokens_details
                ?.reasoning_tokens === 'number'
                ? {
                    reasoningTokens:
                      payload.usage.completion_tokens_details.reasoning_tokens,
                  }
                : {}),
              ...(typeof payload.usage.cost_details?.upstream_inference_cost ===
              'number'
                ? {
                    upstreamInferenceCostUsd:
                      payload.usage.cost_details.upstream_inference_cost,
                  }
                : {}),
            },
          }
        : {}),
      ...(payload.usage
        ? {
            usage: {
              promptTokens: payload.usage.prompt_tokens,
              completionTokens: payload.usage.completion_tokens,
              totalTokens: payload.usage.total_tokens,
            },
          }
        : {}),
    };
  }
}
