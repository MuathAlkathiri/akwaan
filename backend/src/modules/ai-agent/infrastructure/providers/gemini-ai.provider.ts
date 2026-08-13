import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import type { AiProvider } from '../../domain/ai-provider.interface';
import type {
  AiTextGenerationRequest,
  AiTextGenerationResult,
} from '../../domain/ai-provider.types';
import { AiProviderError, type AiProviderErrorCode } from './ai-provider.error';

type GeminiClient = Pick<GoogleGenAI, 'models'>;

@Injectable()
export class GeminiAiProvider implements AiProvider {
  private readonly logger = new Logger(GeminiAiProvider.name);
  readonly model: string;
  private readonly client: GeminiClient;
  private readonly defaultTimeoutMs: number;
  private readonly maxTokens: number;

  constructor(
    private readonly config: ConfigService,
    client?: GeminiClient,
  ) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY')?.trim();
    if (!apiKey)
      throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
    this.model =
      this.config.get<string>('GEMINI_MODEL')?.trim() || 'gemini-2.5-flash';
    this.defaultTimeoutMs =
      this.positiveInteger('AI_REQUEST_TIMEOUT_MS') ?? 120_000;
    this.maxTokens = this.positiveInteger('AI_MAX_TOKENS') ?? 4096;
    this.client = client ?? new GoogleGenAI({ apiKey });
  }

  async generateText(
    request: AiTextGenerationRequest,
  ): Promise<AiTextGenerationResult> {
    const startedAt = Date.now();
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    this.logger.log(
      JSON.stringify({
        event: 'gemini.request.started',
        provider: 'gemini',
        model: this.model,
        promptLength: request.prompt.length,
        systemInstructionLength: request.systemInstruction?.length ?? 0,
      }),
    );
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: request.prompt,
        config: {
          abortSignal: controller.signal,
          systemInstruction: request.systemInstruction,
          temperature: request.temperature ?? 0.3,
          maxOutputTokens: Math.min(
            this.maxTokens,
            request.maxOutputTokens ?? this.maxTokens,
          ),
          ...(request.responseSchema
            ? {
                responseMimeType: 'application/json',
                responseJsonSchema: request.responseSchema,
              }
            : {}),
        },
      });
      const text = response.text?.trim();
      const finishReason = response.candidates?.[0]?.finishReason;
      const rawDetails = {
        finishReason: finishReason ?? null,
        candidatesLength: response.candidates?.length ?? 0,
        textLength: text?.length ?? 0,
        blockedReason: response.promptFeedback?.blockReason ?? null,
        safetyRatings:
          response.candidates?.[0]?.safetyRatings ??
          response.promptFeedback?.safetyRatings ??
          [],
        usage: response.usageMetadata
          ? {
              promptTokens: response.usageMetadata.promptTokenCount,
              completionTokens: response.usageMetadata.candidatesTokenCount,
              totalTokens: response.usageMetadata.totalTokenCount,
            }
          : null,
      };
      this.logger.log(
        JSON.stringify({
          event: 'gemini.request.completed',
          provider: 'gemini',
          model: this.model,
          durationMs: Date.now() - startedAt,
          ...rawDetails,
        }),
      );
      if (!text) {
        const safetyRefusal =
          Boolean(response.promptFeedback?.blockReason) ||
          /SAFETY|BLOCKLIST|PROHIBITED/i.test(String(finishReason ?? ''));
        throw new AiProviderError(
          safetyRefusal
            ? 'AI_PROVIDER_SAFETY_REFUSAL'
            : 'AI_PROVIDER_EMPTY_RESPONSE',
          safetyRefusal
            ? 'Gemini refused the request for safety reasons'
            : 'Gemini returned an empty response',
          'gemini',
          this.model,
          rawDetails,
        );
      }
      if (request.responseSchema) {
        try {
          JSON.parse(text);
        } catch {
          throw new AiProviderError(
            'AI_PROVIDER_INVALID_RESPONSE',
            'Gemini returned invalid structured JSON',
            'gemini',
            this.model,
          );
        }
      }
      const usage = response.usageMetadata;
      return {
        text,
        provider: 'gemini',
        model: this.model,
        durationMs: Date.now() - startedAt,
        diagnostics: rawDetails,
        ...(usage
          ? {
              usage: {
                promptTokens: usage.promptTokenCount,
                completionTokens: usage.candidatesTokenCount,
                totalTokens: usage.totalTokenCount,
              },
            }
          : {}),
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw this.mapError(error, controller.signal.aborted);
    } finally {
      clearTimeout(timer);
    }
  }

  private mapError(error: unknown, aborted: boolean): AiProviderError {
    const message = this.sanitize(error);
    const status = this.errorStatus(error);
    let code: AiProviderErrorCode = 'AI_PROVIDER_REQUEST_FAILED';
    let safeMessage = 'Gemini request failed';
    if (aborted || /abort|timed? ?out|timeout/i.test(message)) {
      code = 'AI_PROVIDER_TIMEOUT';
      safeMessage = 'Gemini request timed out';
    } else if (
      status === 401 ||
      status === 403 ||
      /api.?key|unauth/i.test(message)
    ) {
      code = 'AI_PROVIDER_AUTHENTICATION_FAILED';
      safeMessage = 'Gemini API key is invalid or unauthorized';
    } else if (
      status === 429 ||
      /quota|rate.?limit|resource.?exhausted/i.test(message)
    ) {
      code = 'AI_PROVIDER_RATE_LIMITED';
      safeMessage = 'Gemini rate limit or quota was exceeded';
    } else if (/safety|blocked|prohibited/i.test(message)) {
      code = 'AI_PROVIDER_SAFETY_REFUSAL';
      safeMessage = 'Gemini refused the request for safety reasons';
    }
    const details = {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorCode:
        error && typeof error === 'object'
          ? String(
              (error as { code?: unknown; status?: unknown }).code ??
                (error as { status?: unknown }).status ??
                '',
            ) || null
          : null,
      status: status ?? null,
      originalMessage: message,
      stack: error instanceof Error ? this.sanitize(error.stack ?? '') : null,
    };
    this.logger.error(
      JSON.stringify({
        event: 'gemini.request.failed',
        provider: 'gemini',
        model: this.model,
        code,
        message: safeMessage,
        ...details,
      }),
    );
    return new AiProviderError(
      code,
      safeMessage,
      'gemini',
      this.model,
      details,
      { cause: error },
    );
  }

  private errorStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const candidate = error as { status?: unknown; code?: unknown };
    const value = Number(candidate.status ?? candidate.code);
    return Number.isInteger(value) ? value : undefined;
  }

  private sanitize(error: unknown): string {
    const apiKey = this.config.get<string>('GEMINI_API_KEY')?.trim();
    let message = error instanceof Error ? error.message : String(error);
    if (apiKey) message = message.split(apiKey).join('[REDACTED]');
    return message.slice(0, 400);
  }

  private positiveInteger(key: string): number | undefined {
    const value = Number(this.config.get(key));
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
}
