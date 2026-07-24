import {
  LlmClientService,
  parseStructuredJson,
  StructuredOutputError,
} from './llm-client.service';
import type { ConfigService } from '@nestjs/config';

describe('parseStructuredJson', () => {
  it('accepts fenced JSON without scanning arbitrary surrounding text', () => {
    expect(parseStructuredJson('```json\n{"fact":"goal"}\n```')).toEqual({
      fact: 'goal',
    });
  });

  it.each([
    ['{"fact":"unterminated}', 'STRUCTURED_OUTPUT_TRUNCATED'],
    ['{"fact":', 'STRUCTURED_OUTPUT_TRUNCATED'],
    ['prefix {"fact":"goal"}', 'STRUCTURED_OUTPUT_INVALID'],
  ])('returns a typed failure for %s', (value, code) => {
    expect(() => parseStructuredJson(value)).toThrow(StructuredOutputError);
    try {
      parseStructuredJson(value);
    } catch (error) {
      expect((error as StructuredOutputError).code).toBe(code);
    }
  });
});

describe('LlmClientService SOURCE_CURATED call budget', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not make a repair call when malformed repair is disabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"status":' } }],
      }),
    } as Response);
    const service = new LlmClientService({
      get: (key: string) =>
        key === 'AI_PROVIDER'
          ? 'lm-studio'
          : key === 'LM_STUDIO_BASE_URL'
            ? 'http://localhost:1234/v1'
            : undefined,
    } as unknown as ConfigService);
    await expect(
      service.generateStructured({
        purpose: 'question-writing',
        systemPrompt: 'translate',
        userPrompt: '{}',
        schema: { status: ['ACCEPT', 'REJECT'] },
        repairMalformed: false,
      }),
    ).rejects.toMatchObject({ code: 'STRUCTURED_OUTPUT_TRUNCATED' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('LlmClientService LM Studio compatibility diagnostics', () => {
  const config = {
    get: (key: string) =>
      ({
        AI_PROVIDER: 'lmstudio',
        LM_STUDIO_BASE_URL: 'http://host.docker.internal:1234/v1',
        LM_STUDIO_MODEL: 'qwen/qwen3.5-9b',
        LM_STUDIO_API_KEY: 'dummy',
        AI_REQUEST_TIMEOUT_MS: '300000',
      })[key],
  } as unknown as ConfigService;
  const input = {
    purpose: 'answer-alias-generation' as const,
    systemPrompt: 'Generate aliases.',
    userPrompt: '{"answer":"Saudi Arabia"}',
    schema: {
      type: 'object',
      required: ['aliases'],
      properties: {
        aliases: { type: 'array', items: { type: 'string' } },
      },
    },
    repairMalformed: false,
  };

  afterEach(() => jest.restoreAllMocks());

  it('classifies provider connection failure', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      new LlmClientService(config).generateStructured(input),
    ).rejects.toMatchObject({
      code: 'LLM_CONNECTION_FAILED',
      diagnostics: {
        provider: 'lmstudio',
        baseUrl: 'http://host.docker.internal:1234/v1',
        model: 'qwen/qwen3.5-9b',
        stage: 'request',
      },
    });
  });

  it('classifies a request timeout', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(
      Object.assign(new Error('The operation timed out'), {
        name: 'TimeoutError',
      }),
    );
    await expect(
      new LlmClientService(config).generateStructured(input),
    ).rejects.toMatchObject({ code: 'LLM_REQUEST_TIMEOUT' });
  });

  it('classifies an LM Studio wrong-model response with HTTP status', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: "The model 'missing' was not found" },
      }),
    } as Response);
    await expect(
      new LlmClientService(config).generateStructured(input),
    ).rejects.toMatchObject({
      code: 'LLM_MODEL_NOT_FOUND',
      diagnostics: { httpStatus: 400, stage: 'http' },
    });
  });

  it('returns a typed malformed-JSON failure without a repair request', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"aliases":' } }],
      }),
    } as Response);
    await expect(
      new LlmClientService(config).generateStructured(input),
    ).rejects.toMatchObject({ code: 'STRUCTURED_OUTPUT_TRUNCATED' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('accepts a valid OpenAI-compatible LM Studio JSON response', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'qwen/qwen3.5-9b',
        choices: [
          {
            message: {
              content: JSON.stringify({
                aliases: ['السعودية', 'KSA', 'Saudi Arabia'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
      }),
    } as Response);
    await expect(
      new LlmClientService(config).generateStructured<{
        aliases: string[];
      }>(input),
    ).resolves.toMatchObject({
      provider: 'lmstudio',
      model: 'qwen/qwen3.5-9b',
      value: { aliases: ['السعودية', 'KSA', 'Saudi Arabia'] },
    });
    const requestBody = JSON.parse(
      String((fetchSpy.mock.calls[0][1] as RequestInit).body),
    );
    expect(requestBody).toMatchObject({
      model: 'qwen/qwen3.5-9b',
      response_format: {
        type: 'json_schema',
        json_schema: { strict: true },
      },
    });
  });
});
