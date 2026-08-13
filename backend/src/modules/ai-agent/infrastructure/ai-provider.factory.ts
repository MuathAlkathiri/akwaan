import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProvider } from '../domain/ai-provider.interface';
import { DisabledAiProvider } from './providers/disabled-ai.provider';
import { GeminiAiProvider } from './providers/gemini-ai.provider';
import { LmStudioAiProvider } from './providers/lm-studio-ai.provider';

/**
 * Only an explicit falsy value disables generation. An unset flag keeps the
 * previous behaviour — a deployment that already runs AI with credentials and
 * no flag must not silently lose it because a default changed.
 */
const DISABLED_VALUES = new Set(['false', '0', 'no', 'off']);

@Injectable()
export class AiProviderFactory {
  private readonly logger = new Logger(AiProviderFactory.name);

  constructor(private readonly config: ConfigService) {}

  create(): AiProvider {
    // Checked before any provider is constructed. Provider constructors
    // validate credentials, and this factory runs during bootstrap, so
    // resolving a real provider here is what made a disabled deployment fail to
    // start for want of a key it was never going to use.
    if (this.generationDisabled()) {
      this.logger.log(
        'AI question generation is disabled; skipping AI provider initialization',
      );
      return new DisabledAiProvider();
    }

    const provider = (
      this.config.get<string>('AI_PROVIDER') ?? 'gemini'
    ).toLowerCase();
    switch (provider) {
      case 'gemini':
        return new GeminiAiProvider(this.config);
      case 'lmstudio':
        return new LmStudioAiProvider(this.config);
      default:
        throw new Error(
          `Unsupported AI_PROVIDER "${provider}". Supported providers: gemini, lmstudio`,
        );
    }
  }

  private generationDisabled(): boolean {
    const raw = this.config
      .get<string>('AI_QUESTION_GENERATION_ENABLED')
      ?.trim()
      .toLowerCase();
    return raw !== undefined && DISABLED_VALUES.has(raw);
  }
}
