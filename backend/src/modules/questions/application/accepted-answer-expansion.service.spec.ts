import { Logger } from '@nestjs/common';
import { LlmClientError } from '../../ai-agent/infrastructure/ai/llm-client.service';
import { AcceptedAnswerExpansionService } from './accepted-answer-expansion.service';

describe('AcceptedAnswerExpansionService', () => {
  const generateStructured = jest.fn();
  const getRuntimeConfig = jest.fn().mockReturnValue({
    provider: 'lmstudio',
    baseUrl: 'http://host.docker.internal:1234/v1',
    model: 'qwen/qwen3.5-9b',
  });
  const findByIdForQuestionAuthoring = jest.fn();
  const service = new AcceptedAnswerExpansionService(
    { generateStructured, getRuntimeConfig } as never,
    { findByIdForQuestionAuthoring } as never,
  );

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    generateStructured.mockReset();
    findByIdForQuestionAuthoring.mockReset();
  });

  afterEach(() => jest.restoreAllMocks());

  const rankedEntries = () =>
    Array.from({ length: 10 }, (_, index) => ({
      clientId: `ui-client-${index}-${'a'.repeat(24)}`,
      canonicalAnswerAr:
        index === 0 ? 'المملكة العربية السعودية' : `الدولة ${index + 1}`,
    }));

  const alias = (value: string) => ({
    value,
    language: /[\u0600-\u06ff]/.test(value) ? 'ar' : 'en',
    reason: 'alternate name',
    confidence: 'high',
  });

  const validProviderRows = () =>
    rankedEntries().map((_, rowIndex) => ({
      rowIndex,
      aliases: [alias(rowIndex === 0 ? 'السعودية' : `بلد ${rowIndex + 1}`)],
      warnings: [],
    }));

  it('sanitizes, bounds, and normalized-deduplicates generated aliases', async () => {
    generateStructured.mockResolvedValue({
      value: {
        entries: [
          {
            rowIndex: 0,
            aliases: [
              {
                value: ' السعودية ',
                language: 'ar',
                reason: 'short name',
                confidence: 'high',
              },
              {
                value: 'السُّعُودِيَّة',
                language: 'ar',
                reason: 'duplicate spelling',
                confidence: 'high',
              },
              {
                value: 'المملكة العربية السعودية',
                language: 'ar',
                reason: 'canonical',
                confidence: 'high',
              },
              {
                value: 'KSA',
                language: 'en',
                reason: 'abbreviation',
                confidence: 'high',
              },
              {
                value: 'country',
                language: 'en',
                reason: 'generic',
                confidence: 'low',
              },
            ],
            warnings: [],
          },
        ],
        warnings: [],
      },
    });
    const result = await service.generate({
      questionText: 'ما هذه الدولة؟',
      canonicalAnswerAr: 'المملكة العربية السعودية',
      canonicalAnswerEn: 'Saudi Arabia',
    });
    expect(result.aliases.map((alias) => alias.value)).toEqual([
      'السعودية',
      'KSA',
    ]);
    expect(result.warnings).toContain('AMBIGUOUS_ALIAS_REMOVED:country');
  });

  it('removes aliases belonging to sibling ranked entries', async () => {
    generateStructured.mockResolvedValue({
      value: {
        entries: [
          {
            rowIndex: 0,
            aliases: [
              {
                value: 'المملكة المتحدة',
                language: 'ar',
                reason: 'wrong sibling',
                confidence: 'high',
              },
            ],
            warnings: [],
          },
        ],
        warnings: [],
      },
    });
    const result = await service.generateRanked({
      questionText: 'اذكر الدول',
      categoryId: undefined,
      entries: [
        {
          clientId: 'row-a',
          canonicalAnswerAr: 'المملكة العربية السعودية',
        },
        ...Array.from({ length: 9 }, (_, index) => ({
          clientId: `row-${index + 2}`,
          canonicalAnswerAr:
            index === 0 ? 'المملكة المتحدة' : `الدولة ${index + 3}`,
        })),
      ],
    });
    expect(result.entries[0].aliases).toEqual([]);
    expect(result.entries[0].warnings[0]).toContain(
      'ALIAS_CONFLICTS_WITH_SIBLING',
    );
  });

  it('returns a safe non-blocking result when AI fails', async () => {
    generateStructured.mockRejectedValue(new Error('provider down'));
    await expect(
      service.generate({
        questionText: 'السؤال',
        canonicalAnswerAr: 'الإجابة',
      }),
    ).resolves.toEqual({
      aliases: [],
      warnings: ['ALIAS_GENERATION_UNAVAILABLE'],
    });
  });

  it.each([
    [
      'LLM_PROVIDER_NOT_CONFIGURED',
      'ALIAS_PROVIDER_NOT_CONFIGURED',
      'ConfigurationError',
    ],
    ['LLM_CONNECTION_FAILED', 'ALIAS_PROVIDER_CONNECTION_FAILED', 'TypeError'],
    ['LLM_MODEL_NOT_FOUND', 'ALIAS_MODEL_NOT_FOUND', 'HttpError'],
    ['LLM_REQUEST_TIMEOUT', 'ALIAS_GENERATION_TIMEOUT', 'TimeoutError'],
    ['LLM_RESPONSE_INVALID', 'ALIAS_RESPONSE_INVALID', 'SyntaxError'],
  ] as const)(
    'maps %s to a safe specific warning',
    async (failureCode, warningCode, errorType) => {
      generateStructured.mockRejectedValue(
        new LlmClientError(failureCode, 'safe provider failure', {
          ...getRuntimeConfig(),
          stage:
            failureCode === 'LLM_PROVIDER_NOT_CONFIGURED'
              ? 'configuration'
              : failureCode === 'LLM_RESPONSE_INVALID'
                ? 'structured-parse'
                : failureCode === 'LLM_MODEL_NOT_FOUND'
                  ? 'http'
                  : 'request',
          errorType,
          ...(failureCode === 'LLM_MODEL_NOT_FOUND' ? { httpStatus: 400 } : {}),
        }),
      );
      await expect(
        service.generate({
          questionText: 'السؤال',
          canonicalAnswerAr: 'الإجابة',
        }),
      ).resolves.toEqual({ aliases: [], warnings: [warningCode] });
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining(`"warningCode":"${warningCode}"`),
      );
    },
  );

  it('keeps valid rows when a bulk provider response is partial', async () => {
    generateStructured.mockResolvedValue({
      value: {
        entries: [
          {
            rowIndex: 0,
            aliases: [
              {
                value: 'السعودية',
                language: 'ar',
                reason: 'common short name',
                confidence: 'high',
              },
            ],
            warnings: [],
          },
        ],
        warnings: [],
      },
    });
    const result = await service.generateRanked({
      questionText: 'اذكر الدول',
      entries: Array.from({ length: 10 }, (_, index) => ({
        clientId: `row-${index + 1}`,
        canonicalAnswerAr:
          index === 0 ? 'المملكة العربية السعودية' : `دولة ${index + 1}`,
      })),
    });
    expect(result.entries[0].aliases[0].value).toBe('السعودية');
    expect(result.entries[1]).toMatchObject({
      aliases: [],
      warnings: ['ALIAS_RESPONSE_INVALID'],
    });
    expect(result.warnings).toEqual([]);
  });

  it('rejects a schema object echoed by the model as an invalid response', async () => {
    generateStructured.mockResolvedValue({
      value: { type: 'object', properties: { entries: { type: 'array' } } },
    });
    await expect(
      service.generate({
        questionText: 'ما هذه الدولة؟',
        canonicalAnswerAr: 'المملكة العربية السعودية',
      }),
    ).resolves.toEqual({
      aliases: [],
      warnings: ['ALIAS_RESPONSE_INVALID'],
    });
  });

  it('passes locale and resolved category context to the existing LLM client', async () => {
    findByIdForQuestionAuthoring.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      name: 'كرة القدم',
      description: 'أسئلة كرة القدم',
      catalog: { name: 'رياضة' },
    });
    generateStructured.mockResolvedValue({
      value: {
        entries: [{ rowIndex: 0, aliases: [], warnings: [] }],
        warnings: [],
      },
    });
    await service.generate({
      questionText: 'من فاز؟',
      canonicalAnswerAr: 'الهلال',
      categoryId: '507f1f77bcf86cd799439011',
      locale: 'ar',
    });
    expect(findByIdForQuestionAuthoring).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
    );
    const request = generateStructured.mock.calls[0][0] as {
      purpose: string;
      userPrompt: string;
    };
    expect(request.purpose).toBe('answer-alias-generation');
    expect(JSON.parse(request.userPrompt)).toMatchObject({
      locale: 'ar',
      categoryContext: {
        name: 'كرة القدم',
        catalog: 'رياضة',
      },
    });
    expect(JSON.parse(request.userPrompt).entries[0]).toEqual({
      rowIndex: 0,
      canonicalAnswerAr: 'الهلال',
    });
    expect(request.userPrompt).not.toContain('"clientId"');
  });

  it('accepts an exact valid ten-row structured response', async () => {
    generateStructured.mockResolvedValue({
      value: { entries: validProviderRows(), warnings: [] },
    });
    const result = await service.generateRanked({
      questionText: 'اذكر الدول',
      entries: rankedEntries(),
    });
    expect(result.entries).toHaveLength(10);
    expect(result.entries.every((row) => row.warnings.length === 0)).toBe(true);
    expect(result.entries[0].aliases[0].value).toBe('السعودية');
    expect(result.warnings).toEqual([]);
    expect(generateStructured.mock.calls[0][0]).toMatchObject({
      maxTokens: 4096,
      repairMalformed: false,
    });
  });

  it('maps structured alias objects to the public DTO', async () => {
    generateStructured.mockResolvedValue({
      value: { entries: validProviderRows(), warnings: [] },
    });
    const result = await service.generateRanked({
      questionText: 'اذكر الدول',
      entries: rankedEntries(),
    });
    expect(result.entries[0].aliases[0]).toEqual({
      value: 'السعودية',
      language: 'ar',
      reason: 'alternate name',
      confidence: 'high',
    });
  });

  it('accepts legacy string aliases and maps them explicitly', async () => {
    const rows = validProviderRows();
    rows[0].aliases = ['السعودية'] as never;
    generateStructured.mockResolvedValue({
      value: { entries: rows, warnings: [] },
    });
    const result = await service.generateRanked({
      questionText: 'اذكر الدول',
      entries: rankedEntries(),
    });
    expect(result.entries[0].aliases[0]).toEqual({
      value: 'السعودية',
      language: 'ar',
      reason: 'alternate name',
      confidence: 'medium',
    });
  });

  it('reconciles reordered rows by rowIndex', async () => {
    generateStructured.mockResolvedValue({
      value: { entries: validProviderRows().reverse(), warnings: [] },
    });
    const result = await service.generateRanked({
      questionText: 'اذكر الدول',
      entries: rankedEntries(),
    });
    expect(result.entries[0].aliases[0].value).toBe('السعودية');
    expect(result.entries[9].aliases[0].value).toBe('بلد 10');
  });

  it('does not ask the model to echo frontend UUID-like clientIds', async () => {
    generateStructured.mockResolvedValue({
      value: { entries: validProviderRows(), warnings: [] },
    });
    const entries = rankedEntries();
    const result = await service.generateRanked({
      questionText: 'اذكر الدول',
      entries,
    });
    const providerInput = JSON.parse(
      generateStructured.mock.calls[0][0].userPrompt,
    );
    expect(
      providerInput.entries.map((row: { rowIndex: number }) => row.rowIndex),
    ).toEqual(Array.from({ length: 10 }, (_, index) => index));
    expect(providerInput.entries[0].clientId).toBeUndefined();
    expect(result.entries.map((row) => row.clientId)).toEqual(
      entries.map((row) => row.clientId),
    );
  });

  it('marks only a missing row invalid without a global warning', async () => {
    generateStructured.mockResolvedValue({
      value: { entries: validProviderRows().slice(0, 9), warnings: [] },
    });
    const result = await service.generateRanked({
      questionText: 'اذكر الدول',
      entries: rankedEntries(),
    });
    expect(result.entries[9].warnings).toEqual(['ALIAS_RESPONSE_INVALID']);
    expect(
      result.entries.slice(0, 9).every((row) => !row.warnings.length),
    ).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('marks only one malformed row invalid', async () => {
    const rows = validProviderRows();
    rows[4] = { rowIndex: 4, aliases: 123, warnings: [] } as never;
    generateStructured.mockResolvedValue({
      value: { entries: rows, warnings: [] },
    });
    const result = await service.generateRanked({
      questionText: 'اذكر الدول',
      entries: rankedEntries(),
    });
    expect(result.entries[4].warnings).toEqual(['ALIAS_RESPONSE_INVALID']);
    expect(result.entries[3].aliases).not.toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('marks a duplicated rowIndex invalid', async () => {
    const rows = validProviderRows();
    rows[9] = { ...rows[9], rowIndex: 3 };
    generateStructured.mockResolvedValue({
      value: { entries: rows, warnings: [] },
    });
    const result = await service.generateRanked({
      questionText: 'اذكر الدول',
      entries: rankedEntries(),
    });
    expect(result.entries[3].warnings).toEqual(['ALIAS_RESPONSE_INVALID']);
    expect(result.entries[9].warnings).toEqual(['ALIAS_RESPONSE_INVALID']);
    expect(result.entries[2].aliases).not.toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('ignores an unknown rowIndex and marks the unmatched input row only', async () => {
    const rows = validProviderRows();
    rows[9] = { ...rows[9], rowIndex: 999 };
    generateStructured.mockResolvedValue({
      value: { entries: rows, warnings: [] },
    });
    const result = await service.generateRanked({
      questionText: 'اذكر الدول',
      entries: rankedEntries(),
    });
    expect(result.entries[9].warnings).toEqual(['ALIAS_RESPONSE_INVALID']);
    expect(result.entries[0].aliases[0].value).toBe('السعودية');
    expect(result.warnings).toEqual([]);
  });

  it('accepts an empty aliases array as a valid row', async () => {
    const rows = validProviderRows();
    rows[5].aliases = [];
    generateStructured.mockResolvedValue({
      value: { entries: rows, warnings: [] },
    });
    const result = await service.generateRanked({
      questionText: 'اذكر الدول',
      entries: rankedEntries(),
    });
    expect(result.entries[5]).toMatchObject({ aliases: [], warnings: [] });
    expect(result.warnings).toEqual([]);
  });
});
