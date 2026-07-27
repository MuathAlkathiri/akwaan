import { ConfigService } from '@nestjs/config';
import { AiProviderFactory } from './ai-provider.factory';
import { GeminiAiProvider } from './providers/gemini-ai.provider';
import { LmStudioAiProvider } from './providers/lm-studio-ai.provider';

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as ConfigService;

describe('AiProviderFactory', () => {
  it('selects Gemini', () => {
    const provider = new AiProviderFactory(
      config({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'secret' }),
    ).create();
    expect(provider).toBeInstanceOf(GeminiAiProvider);
  });

  it('selects LM Studio without requiring Gemini configuration', () => {
    const provider = new AiProviderFactory(
      config({ AI_PROVIDER: 'lmstudio' }),
    ).create();
    expect(provider).toBeInstanceOf(LmStudioAiProvider);
  });

  it('fails clearly when Gemini has no API key', () => {
    expect(() =>
      new AiProviderFactory(config({ AI_PROVIDER: 'gemini' })).create(),
    ).toThrow('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
  });

  it('rejects unsupported providers', () => {
    expect(() =>
      new AiProviderFactory(config({ AI_PROVIDER: 'unknown' })).create(),
    ).toThrow('Supported providers: gemini, lmstudio');
  });
});
