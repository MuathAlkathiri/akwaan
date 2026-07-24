import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type LlmPurpose =
  | 'research-normalization'
  | 'question-writing'
  | 'question-review'
  | 'question-repair'
  | 'answer-alias-generation';

export type LlmClientFailureCode =
  | 'LLM_PROVIDER_NOT_CONFIGURED'
  | 'LLM_CONNECTION_FAILED'
  | 'LLM_MODEL_NOT_FOUND'
  | 'LLM_REQUEST_TIMEOUT'
  | 'LLM_HTTP_ERROR'
  | 'LLM_RESPONSE_INVALID';

export type LlmFailureStage =
  | 'configuration'
  | 'request'
  | 'http'
  | 'response-json'
  | 'response-content'
  | 'structured-parse'
  | 'structured-repair';

export interface LlmRuntimeConfig {
  provider: string;
  baseUrl: string;
  model: string;
}

export class LlmClientError extends Error {
  constructor(
    readonly code: LlmClientFailureCode,
    message: string,
    readonly diagnostics: LlmRuntimeConfig & {
      stage: LlmFailureStage;
      httpStatus?: number;
      errorType?: string;
    },
  ) {
    super(message);
    this.name = 'LlmClientError';
  }
}

export class StructuredOutputError extends Error {
  constructor(
    readonly code: 'STRUCTURED_OUTPUT_TRUNCATED' | 'STRUCTURED_OUTPUT_INVALID',
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}

export function parseStructuredJson<T>(content: string, truncated = false): T {
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith('```')
    ? trimmed
        .replace(/^```(?:json)?[ \t]*\r?\n/i, '')
        .replace(/\r?\n```[ \t]*$/, '')
        .trim()
    : trimmed;
  if (truncated || !unfenced || !['{', '['].includes(unfenced[0])) {
    throw new StructuredOutputError(
      truncated ? 'STRUCTURED_OUTPUT_TRUNCATED' : 'STRUCTURED_OUTPUT_INVALID',
      truncated
        ? 'model response reached its output limit'
        : 'expected a JSON object or array',
    );
  }
  try {
    return JSON.parse(unfenced) as T;
  } catch (error) {
    throw new StructuredOutputError(
      /unterminated|unexpected end/i.test(
        error instanceof Error ? error.message : '',
      )
        ? 'STRUCTURED_OUTPUT_TRUNCATED'
        : 'STRUCTURED_OUTPUT_INVALID',
      error instanceof Error ? error.message : String(error),
    );
  }
}

@Injectable()
export class LlmClientService {
  constructor(private readonly config: ConfigService) {}

  getRuntimeConfig(
    purpose: LlmPurpose,
    modelOverride?: string,
  ): LlmRuntimeConfig {
    const provider = (
      this.config.get<string>('AI_PROVIDER') ?? 'openrouter'
    ).toLowerCase();
    const isOpenRouter = provider === 'openrouter';
    const roleKey = {
      'research-normalization': 'AI_RESEARCH_MODEL',
      'question-writing': 'AI_WRITER_MODEL',
      'question-review': 'AI_REVIEWER_MODEL',
      'question-repair': 'AI_REPAIR_MODEL',
      'answer-alias-generation': 'AI_WRITER_MODEL',
    }[purpose];
    const configuredRoleModel = this.config.get<string>(roleKey)?.trim();
    const configuredProviderModel = this.config
      .get<string>(isOpenRouter ? 'OPENROUTER_MODEL' : 'LM_STUDIO_MODEL')
      ?.trim();
    return {
      provider,
      baseUrl: isOpenRouter
        ? 'https://openrouter.ai/api/v1'
        : (
            this.config.get<string>('LM_STUDIO_BASE_URL') ??
            'http://localhost:1234/v1'
          ).replace(/\/+$/, ''),
      model:
        modelOverride?.trim() ||
        configuredRoleModel ||
        configuredProviderModel ||
        'local-model',
    };
  }

  async complete(prompt: string, temperature?: number): Promise<string> {
    const provider = (
      this.config.get<string>('AI_PROVIDER') ?? 'openrouter'
    ).toLowerCase();
    const isOpenRouter = provider === 'openrouter';
    const base = isOpenRouter
      ? 'https://openrouter.ai/api/v1'
      : (
          this.config.get<string>('LM_STUDIO_BASE_URL') ??
          'http://localhost:1234/v1'
        ).replace(/\/+$/, '');
    const key = isOpenRouter
      ? this.config.get<string>('OPENROUTER_API_KEY')
      : (this.config.get<string>('LM_STUDIO_API_KEY') ?? 'lm-studio');
    const model = isOpenRouter
      ? (this.config.get<string>('OPENROUTER_MODEL') ?? 'openai/gpt-4o-mini')
      : (this.config.get<string>('LM_STUDIO_MODEL') ?? 'local-model');
    if (isOpenRouter && !key) throw new Error('OPENROUTER_API_KEY is required');
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(
        Number(this.config.get('AI_REQUEST_TIMEOUT_MS')) || 300_000,
      ),
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature ?? 0.7,
        max_tokens: this.maxTokens(),
        ...(!isOpenRouter ? { reasoning_effort: 'none' } : {}),
      }),
    });
    if (!response.ok) throw await this.responseError(response);
    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned empty content');
    return content;
  }

  async completeJson<T>(prompt: string, temperature?: number): Promise<T> {
    const content = await this.complete(
      `${prompt}\nReturn JSON only.`,
      temperature,
    );
    return JSON.parse(
      content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''),
    ) as T;
  }

  async generateStructured<T>(input: {
    purpose: LlmPurpose;
    systemPrompt: string;
    userPrompt: string;
    schema: unknown;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    repairMalformed?: boolean;
  }): Promise<{ value: T; provider: string; model: string }> {
    const runtime = this.getRuntimeConfig(input.purpose, input.model);
    const { provider, baseUrl: base, model } = runtime;
    const isOpenRouter = provider === 'openrouter';
    const key = isOpenRouter
      ? this.config.get<string>('OPENROUTER_API_KEY')
      : (this.config.get<string>('LM_STUDIO_API_KEY') ?? 'lm-studio');
    if (isOpenRouter && !key)
      throw new LlmClientError(
        'LLM_PROVIDER_NOT_CONFIGURED',
        'OPENROUTER_API_KEY is required',
        {
          ...runtime,
          stage: 'configuration',
          errorType: 'ConfigurationError',
        },
      );
    let response: Response;
    try {
      response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(
          (input.timeoutMs ??
            Number(this.config.get('AI_REQUEST_TIMEOUT_MS'))) ||
            300_000,
        ),
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: input.systemPrompt },
            {
              role: 'user',
              content: `${input.userPrompt}\nReturn one JSON instance matching the supplied schema. Do not return or describe the schema itself.`,
            },
          ],
          temperature: input.temperature ?? 0.3,
          max_tokens: Math.min(
            this.maxTokens(),
            input.maxTokens ??
              (input.purpose === 'research-normalization' ? 1200 : 2000),
          ),
          ...(!isOpenRouter
            ? {
                reasoning_effort: 'none',
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: `${input.purpose.replace(/-/g, '_')}_response`,
                    strict: true,
                    schema: input.schema,
                  },
                },
              }
            : {}),
        }),
      });
    } catch (error) {
      throw this.requestFailure(error, runtime);
    }
    if (!response.ok) throw await this.responseError(response, runtime, 'http');
    let data: {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
    };
    try {
      data = (await response.json()) as typeof data;
    } catch (error) {
      throw new LlmClientError(
        'LLM_RESPONSE_INVALID',
        'LLM returned a non-JSON HTTP response',
        {
          ...runtime,
          stage: 'response-json',
          httpStatus: response.status,
          errorType: error instanceof Error ? error.name : typeof error,
        },
      );
    }
    const content = data.choices?.[0]?.message?.content;
    if (!content)
      throw new LlmClientError(
        'LLM_RESPONSE_INVALID',
        'LLM returned empty content',
        {
          ...runtime,
          stage: 'response-content',
          httpStatus: response.status,
          errorType: 'EmptyContentError',
        },
      );
    try {
      return {
        value: parseStructuredJson<T>(
          content,
          data.choices?.[0]?.finish_reason === 'length',
        ),
        provider,
        model,
      };
    } catch (error) {
      if (!(error instanceof StructuredOutputError)) throw error;
      if (input.repairMalformed === false) throw error;
      let repaired: string;
      try {
        repaired = await this.repairStructuredOutput({
          base,
          key,
          model,
          schema: input.schema,
          malformed: content,
          isOpenRouter,
          timeoutMs: input.timeoutMs,
        });
      } catch (repairError) {
        if (repairError instanceof LlmClientError) throw repairError;
        throw new LlmClientError(
          'LLM_RESPONSE_INVALID',
          this.safeMessage(repairError),
          {
            ...runtime,
            stage: 'structured-repair',
            errorType:
              repairError instanceof Error
                ? repairError.name
                : typeof repairError,
          },
        );
      }
      return { value: parseStructuredJson<T>(repaired), provider, model };
    }
  }

  private async repairStructuredOutput(input: {
    base: string;
    key?: string;
    model: string;
    schema: unknown;
    malformed: string;
    isOpenRouter: boolean;
    timeoutMs?: number;
  }): Promise<string> {
    const response = await fetch(`${input.base}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(input.timeoutMs ?? 60_000),
      headers: {
        'Content-Type': 'application/json',
        ...(input.key ? { Authorization: `Bearer ${input.key}` } : {}),
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: 'user',
            content: `Repair this malformed JSON once. Return only the smallest object matching ${JSON.stringify(input.schema)}. Do not add facts. Malformed input:\n${input.malformed.slice(0, 12_000)}`,
          },
        ],
        temperature: 0,
        max_tokens: 1200,
        ...(!input.isOpenRouter ? { reasoning_effort: 'none' } : {}),
      }),
    });
    if (!response.ok) throw await this.responseError(response);
    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content)
      throw new StructuredOutputError(
        'STRUCTURED_OUTPUT_INVALID',
        'repair returned empty content',
      );
    if (data.choices?.[0]?.finish_reason === 'length')
      throw new StructuredOutputError(
        'STRUCTURED_OUTPUT_TRUNCATED',
        'repair reached its output limit',
      );
    return content;
  }

  private async responseError(
    response: Response,
    runtime?: LlmRuntimeConfig,
    stage: LlmFailureStage = 'http',
  ): Promise<Error> {
    const fallback = `LLM request failed with HTTP ${response.status}`;
    let message = fallback;
    try {
      const body = (await response.json()) as {
        error?: { message?: unknown };
        message?: unknown;
      };
      const detail = body.error?.message ?? body.message;
      if (typeof detail === 'string' && detail.trim())
        message = `${fallback}: ${detail.trim()}`;
    } catch {}
    if (!runtime) return new Error(message);
    const modelNotFound =
      response.status === 404 ||
      /model.{0,40}(not found|unknown|invalid|unavailable|not loaded)/i.test(
        message,
      );
    return new LlmClientError(
      modelNotFound ? 'LLM_MODEL_NOT_FOUND' : 'LLM_HTTP_ERROR',
      this.safeMessage(message),
      {
        ...runtime,
        stage,
        httpStatus: response.status,
        errorType: 'HttpError',
      },
    );
  }

  private requestFailure(
    error: unknown,
    runtime: LlmRuntimeConfig,
  ): LlmClientError {
    const errorType = error instanceof Error ? error.name : typeof error;
    const timeout =
      errorType === 'TimeoutError' ||
      errorType === 'AbortError' ||
      /timed? ?out|timeout/i.test(this.safeMessage(error));
    return new LlmClientError(
      timeout ? 'LLM_REQUEST_TIMEOUT' : 'LLM_CONNECTION_FAILED',
      timeout
        ? 'LLM request timed out'
        : `Could not connect to the configured LLM provider: ${this.safeMessage(error)}`,
      {
        ...runtime,
        stage: 'request',
        errorType,
      },
    );
  }

  private safeMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/\b(?:sk|key)-[A-Za-z0-9_-]+\b/g, '[REDACTED]')
      .slice(0, 400);
  }

  private maxTokens(): number {
    return Math.max(
      256,
      Math.min(16_384, Number(this.config.get('AI_MAX_TOKENS')) || 4096),
    );
  }
}
