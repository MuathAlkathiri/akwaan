import { Injectable } from '@nestjs/common';
import type { AiProvider } from '../../domain/ai-provider.interface';
import type {
  AiTextGenerationRequest,
  AiTextGenerationResult,
} from '../../domain/ai-provider.types';
import { AiProviderError } from './ai-provider.error';

/**
 * The provider used when AI question generation is switched off.
 *
 * `AI_PROVIDER_TOKEN` is injected by several modules, so the DI graph still
 * needs something to resolve — but a deployment that has generation disabled
 * should not need provider credentials to boot. This satisfies the interface
 * while holding no client, reading no API key, and validating nothing.
 *
 * Calling it is a programming error rather than a configuration one: the
 * feature flag is meant to keep callers away. So it fails loudly and says which
 * flag to flip, instead of returning something empty that would look like a
 * model refusing to answer.
 */
@Injectable()
export class DisabledAiProvider implements AiProvider {
  static readonly PROVIDER_NAME = 'disabled';

  async generateText(
    request: AiTextGenerationRequest,
  ): Promise<AiTextGenerationResult> {
    throw new AiProviderError(
      'AI_PROVIDER_DISABLED',
      'AI text generation is disabled. Set AI_QUESTION_GENERATION_ENABLED=true ' +
        'and configure the provider credentials to enable it.',
      DisabledAiProvider.PROVIDER_NAME,
      'none',
      { promptLength: request.prompt?.length ?? 0 },
    );
  }
}
