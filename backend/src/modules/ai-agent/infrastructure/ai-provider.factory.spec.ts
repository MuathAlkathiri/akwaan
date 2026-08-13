import { ConfigService } from '@nestjs/config';
import { AiProviderFactory } from './ai-provider.factory';
import { DisabledAiProvider } from './providers/disabled-ai.provider';
import { GeminiAiProvider } from './providers/gemini-ai.provider';
import { LmStudioAiProvider } from './providers/lm-studio-ai.provider';

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as ConfigService;

describe('AiProviderFactory when generation is disabled', () => {
  // The production BETA runs with the flag off and no provider credentials at
  // all. Bootstrap resolves this factory, so anything that reads a key here
  // stops the whole application from starting.
  it('initializes without GEMINI_API_KEY while AI_PROVIDER=gemini', () => {
    const provider = new AiProviderFactory(
      config({
        AI_QUESTION_GENERATION_ENABLED: 'false',
        AI_PROVIDER: 'gemini',
      }),
    ).create();
    expect(provider).toBeInstanceOf(DisabledAiProvider);
  });

  it.each(['false', 'FALSE', ' false ', '0', 'no', 'off'])(
    'treats %p as disabled',
    (flag) => {
      const provider = new AiProviderFactory(
        config({
          AI_QUESTION_GENERATION_ENABLED: flag,
          AI_PROVIDER: 'gemini',
        }),
      ).create();
      expect(provider).toBeInstanceOf(DisabledAiProvider);
    },
  );

  it('does not disable generation merely because the flag is unset', () => {
    // Unset must keep the previous behaviour rather than silently turning AI
    // off for a deployment that already had it working.
    const provider = new AiProviderFactory(
      config({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'secret' }),
    ).create();
    expect(provider).toBeInstanceOf(GeminiAiProvider);
  });

  it('skips validation of an otherwise unsupported provider', () => {
    const provider = new AiProviderFactory(
      config({
        AI_QUESTION_GENERATION_ENABLED: 'false',
        AI_PROVIDER: 'unknown',
      }),
    ).create();
    expect(provider).toBeInstanceOf(DisabledAiProvider);
  });

  it('fails loudly and names the flag if something calls it anyway', async () => {
    const provider = new AiProviderFactory(
      config({ AI_QUESTION_GENERATION_ENABLED: 'false' }),
    ).create();
    await expect(
      provider.generateText({ prompt: 'hello' } as never),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_DISABLED',
      message: expect.stringContaining('AI_QUESTION_GENERATION_ENABLED=true'),
    });
  });
});

describe('AiProviderFactory when generation is enabled', () => {
  it('still requires GEMINI_API_KEY for gemini', () => {
    expect(() =>
      new AiProviderFactory(
        config({
          AI_QUESTION_GENERATION_ENABLED: 'true',
          AI_PROVIDER: 'gemini',
        }),
      ).create(),
    ).toThrow('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
  });

  it('initializes Gemini when the key is present', () => {
    const provider = new AiProviderFactory(
      config({
        AI_QUESTION_GENERATION_ENABLED: 'true',
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'secret',
      }),
    ).create();
    expect(provider).toBeInstanceOf(GeminiAiProvider);
  });

  it('still rejects unsupported providers', () => {
    expect(() =>
      new AiProviderFactory(
        config({
          AI_QUESTION_GENERATION_ENABLED: 'true',
          AI_PROVIDER: 'unknown',
        }),
      ).create(),
    ).toThrow('Supported providers: gemini, lmstudio');
  });
});

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
