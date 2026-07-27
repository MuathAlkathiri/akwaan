import type {
  AiTextGenerationRequest,
  AiTextGenerationResult,
} from './ai-provider.types';

export const AI_PROVIDER_TOKEN = Symbol('AI_PROVIDER_TOKEN');

export interface AiProvider {
  generateText(
    request: AiTextGenerationRequest,
  ): Promise<AiTextGenerationResult>;
}
