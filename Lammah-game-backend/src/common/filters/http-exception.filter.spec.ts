import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';
import { createZeroDraftGenerationException } from '../../modules/ai-agent/application/reviewed-generation-error.factory';

describe('AllExceptionsFilter structured generation errors', () => {
  it('preserves allowlisted diagnostics during exception serialization', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/admin/ai-generator/generate-reviewed' }),
      }),
    } as unknown as ArgumentsHost;
    const exception = createZeroDraftGenerationException({
      sourceSummary: { requested: 1, returned: 0 },
      sourceDiagnostics: [{ code: 'SOURCE_TIMEOUT', sourceId: 'source' }],
      candidateDiagnostics: [
        {
          sourceId: 'source',
          sourceQuestionId: 'q1',
          sourceQuestion: 'Question',
          sourceAnswer: 'Answer',
          curatedQuestion: null,
          curatedAnswer: null,
          semanticFingerprint: 'fp',
          duplicateScore: 0,
          validationResult: {
            status: 'FAIL',
            issueCodes: ['PIPELINE_SLOT_FAILED'],
          },
          outcome: 'FAILED',
          rejectionReason: 'PIPELINE_SLOT_FAILED',
        },
      ],
      slotDiagnostics: [],
    });

    new AllExceptionsFilter().catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: 'AI pipeline produced no drafts',
        issueCodes: ['PIPELINE_SLOT_FAILED', 'SOURCE_TIMEOUT'],
        sourceSummary: expect.objectContaining({ requested: 1, returned: 0 }),
        candidateDiagnostics: [
          expect.objectContaining({ sourceQuestionId: 'q1' }),
        ],
        meta: expect.objectContaining({
          candidateDiagnostics: expect.any(Array),
        }),
      }),
    );
  });
});

describe('AllExceptionsFilter game validation errors', () => {
  it('preserves bounded typed gameplay validation details', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/games' }),
      }),
    } as unknown as ArgumentsHost;
    const details = [
      {
        code: 'STANDARD_MISSING_200_QUESTIONS',
        message: 'Missing questions',
        categoryId: 'category-1',
        gameplayMode: 'STANDARD',
        requiredCounts: { '200': 2 },
        actualCounts: { '200': 1 },
      },
    ];
    new AllExceptionsFilter().catch(
      new BadRequestException({
        error: 'Bad Request',
        code: details[0].code,
        message: details[0].message,
        issueCodes: [details[0].code],
        details,
      }),
      host,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        code: 'STANDARD_MISSING_200_QUESTIONS',
        issueCodes: ['STANDARD_MISSING_200_QUESTIONS'],
        details,
      }),
    );
  });
});
