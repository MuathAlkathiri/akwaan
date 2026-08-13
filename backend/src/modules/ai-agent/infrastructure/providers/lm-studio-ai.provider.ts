import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProvider } from '../../domain/ai-provider.interface';
import type {
  AiTextGenerationRequest,
  AiTextGenerationResult,
} from '../../domain/ai-provider.types';
import { AiProviderError } from './ai-provider.error';

@Injectable()
export class LmStudioAiProvider implements AiProvider {
  readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (
      this.config.get<string>('LM_STUDIO_BASE_URL') ??
      'http://localhost:1234/v1'
    ).replace(/\/+$/, '');
    this.model =
      this.config.get<string>('LM_STUDIO_MODEL')?.trim() || 'local-model';
  }

  async generateText(
    request: AiTextGenerationRequest,
  ): Promise<AiTextGenerationResult> {
    const startedAt = Date.now();
    const timeoutMs =
      (request.timeoutMs ?? Number(this.config.get('AI_REQUEST_TIMEOUT_MS'))) ||
      120_000;
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${
            this.config.get<string>('LM_STUDIO_API_KEY') ?? 'lm-studio'
          }`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            ...(request.systemInstruction
              ? [{ role: 'system', content: request.systemInstruction }]
              : []),
            { role: 'user', content: request.prompt },
          ],
          temperature: request.temperature ?? 0.3,
          max_tokens: request.maxOutputTokens ?? 4096,
          reasoning_effort: 'none',
          ...(request.responseSchema
            ? {
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: 'structured_response',
                    strict: true,
                    schema: request.responseSchema,
                  },
                },
              }
            : {}),
        }),
      });
      if (!response.ok)
        throw new AiProviderError(
          'AI_PROVIDER_REQUEST_FAILED',
          `LM Studio request failed with HTTP ${response.status}`,
          'lmstudio',
          this.model,
        );
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text)
        throw new AiProviderError(
          'AI_PROVIDER_EMPTY_RESPONSE',
          'LM Studio returned an empty response',
          'lmstudio',
          this.model,
        );
      return {
        text,
        provider: 'lmstudio',
        model: this.model,
        durationMs: Date.now() - startedAt,
        ...(data.usage
          ? {
              usage: {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
              },
            }
          : {}),
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      const timeout =
        error instanceof Error &&
        /abort|timed? ?out|timeout/i.test(`${error.name} ${error.message}`);
      throw new AiProviderError(
        timeout ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_REQUEST_FAILED',
        timeout ? 'LM Studio request timed out' : 'LM Studio request failed',
        'lmstudio',
        this.model,
      );
    }
  }
}
