import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AiTextProviderModule } from './ai-text-provider.module';
import { AI_PROVIDER_TOKEN } from './domain/ai-provider.interface';
import { DisabledAiProvider } from './infrastructure/providers/disabled-ai.provider';
import { GeminiAiProvider } from './infrastructure/providers/gemini-ai.provider';

/**
 * The regression these cover is a bootstrap failure, not a unit-level one.
 * `AI_PROVIDER_TOKEN` is resolved eagerly while the module graph is built, so
 * the provider is constructed before any request is served — which is why a
 * missing key took down the whole application rather than one endpoint.
 * Compiling the real module is the only thing that reproduces that.
 */
const withConfig = (values: Record<string, string>) => {
  @Global()
  @Module({
    providers: [
      {
        provide: ConfigService,
        useValue: { get: (key: string) => values[key] } as ConfigService,
      },
    ],
    exports: [ConfigService],
  })
  class TestConfigModule {}

  return Test.createTestingModule({
    imports: [TestConfigModule, AiTextProviderModule],
  }).compile();
};

describe('AiTextProviderModule bootstrap', () => {
  it('compiles with generation disabled and no GEMINI_API_KEY', async () => {
    const moduleRef = await withConfig({
      AI_QUESTION_GENERATION_ENABLED: 'false',
      AI_PROVIDER: 'gemini',
    });

    expect(moduleRef.get(AI_PROVIDER_TOKEN)).toBeInstanceOf(DisabledAiProvider);
    await moduleRef.close();
  });

  it('fails to compile when generation is enabled and the key is missing', async () => {
    await expect(
      withConfig({
        AI_QUESTION_GENERATION_ENABLED: 'true',
        AI_PROVIDER: 'gemini',
      }),
    ).rejects.toThrow('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
  });

  it('compiles with a real Gemini provider when enabled and configured', async () => {
    const moduleRef = await withConfig({
      AI_QUESTION_GENERATION_ENABLED: 'true',
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'secret',
    });

    expect(moduleRef.get(AI_PROVIDER_TOKEN)).toBeInstanceOf(GeminiAiProvider);
    await moduleRef.close();
  });
});
