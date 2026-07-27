import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProvider } from '../domain/ai-provider.interface';
import { GeminiAiProvider } from './providers/gemini-ai.provider';
import { LmStudioAiProvider } from './providers/lm-studio-ai.provider';

@Injectable()
export class AiProviderFactory {
  constructor(private readonly config: ConfigService) {}

  create(): AiProvider {
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
}
