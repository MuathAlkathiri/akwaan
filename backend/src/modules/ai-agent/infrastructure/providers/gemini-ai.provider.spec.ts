import { ConfigService } from '@nestjs/config';
import { GeminiAiProvider } from './gemini-ai.provider';
import { AiProviderError } from './ai-provider.error';

const config = (values: Record<string, string> = {}) =>
  ({
    get: (key: string) =>
      ({
        GEMINI_API_KEY: 'test-secret-key',
        GEMINI_MODEL: 'gemini-test',
        ...values,
      })[key],
  }) as ConfigService;

const client = (generateContent: jest.Mock) =>
  ({
    models: { generateContent },
  }) as unknown as ConstructorParameters<typeof GeminiAiProvider>[1];

describe('GeminiAiProvider', () => {
  it('returns generated text and usage without exposing credentials', async () => {
    const generateContent = jest.fn().mockResolvedValue({
      text: 'مرحبا',
      usageMetadata: {
        promptTokenCount: 2,
        candidatesTokenCount: 3,
        totalTokenCount: 5,
      },
    });
    const result = await new GeminiAiProvider(
      config(),
      client(generateContent),
    ).generateText({ prompt: 'tiny prompt' });
    expect(result).toMatchObject({
      text: 'مرحبا',
      provider: 'gemini',
      model: 'gemini-test',
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
    });
  });

  it('accepts structured JSON and sends responseJsonSchema', async () => {
    const generateContent = jest
      .fn()
      .mockResolvedValue({ text: '{"questions":[]}' });
    const result = await new GeminiAiProvider(
      config(),
      client(generateContent),
    ).generateText({
      prompt: 'questions',
      responseSchema: { type: 'object' },
    });
    expect(JSON.parse(result.text)).toEqual({ questions: [] });
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          responseMimeType: 'application/json',
          responseJsonSchema: { type: 'object' },
        }),
      }),
    );
  });

  it('rejects an empty response', async () => {
    const provider = new GeminiAiProvider(
      config(),
      client(jest.fn().mockResolvedValue({ text: '' })),
    );
    await expect(provider.generateText({ prompt: 'x' })).rejects.toMatchObject({
      code: 'AI_PROVIDER_EMPTY_RESPONSE',
    });
  });

  it('rejects invalid structured JSON', async () => {
    const provider = new GeminiAiProvider(
      config(),
      client(jest.fn().mockResolvedValue({ text: 'not json' })),
    );
    await expect(
      provider.generateText({
        prompt: 'x',
        responseSchema: { type: 'object' },
      }),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_INVALID_RESPONSE' });
  });

  it('maps timeout errors', async () => {
    const error = Object.assign(new Error('request timeout'), {
      name: 'AbortError',
    });
    const provider = new GeminiAiProvider(
      config(),
      client(jest.fn().mockRejectedValue(error)),
    );
    await expect(provider.generateText({ prompt: 'x' })).rejects.toMatchObject({
      code: 'AI_PROVIDER_TIMEOUT',
    });
  });

  it('maps rate limits and never includes the API key in the error', async () => {
    const error = Object.assign(
      new Error('quota exceeded for test-secret-key'),
      { status: 429 },
    );
    const provider = new GeminiAiProvider(
      config(),
      client(jest.fn().mockRejectedValue(error)),
    );
    const caught = await provider
      .generateText({ prompt: 'x' })
      .catch((failure: unknown) => failure);
    expect(caught).toBeInstanceOf(AiProviderError);
    expect(caught).toMatchObject({ code: 'AI_PROVIDER_RATE_LIMITED' });
    expect(String(caught)).not.toContain('test-secret-key');
  });
});
