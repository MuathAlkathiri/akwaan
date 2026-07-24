import { BadRequestException } from '@nestjs/common';
import { createZeroDraftGenerationException } from './reviewed-generation-error.factory';

describe('createZeroDraftGenerationException', () => {
  const pipelineMeta = {
    pipelineVersion: '4.0',
    generationRequestId: 'request-1',
    plannedSlots: 1,
    createdSlots: 0,
    rejectedSlots: 1,
    failedSlots: 0,
    sourceSummary: {
      requested: 1,
      collected: 1,
      selected: 1,
      approved: 0,
      rejected: 1,
      failed: 0,
      notSelected: 0,
      returned: 0,
    },
    sourceDiagnostics: [
      { code: 'SOURCE_PARTIAL_RESULTS', sourceId: 'open-trivia-db' },
    ],
    candidateDiagnostics: [
      {
        sourceId: 'open-trivia-db',
        sourceQuestionId: 'question-1',
        sourceQuestion: 'Source question',
        sourceAnswer: 'Source answer',
        curatedQuestion: 'السؤال',
        curatedAnswer: 'الإجابة',
        semanticFingerprint: 'fingerprint-1',
        duplicateScore: 0,
        validationResult: {
          status: 'FAIL',
          issueCodes: ['WRONG_ANSWERS_LANGUAGE_MISMATCH'],
        },
        outcome: 'REJECTED',
        rejectionReason: 'DUPLICATE_SEMANTIC',
      },
    ],
    slotDiagnostics: [
      {
        slotId: 'slot-1',
        status: 'rejected',
        diagnostics: [{ code: 'PIPELINE_SLOT_FAILED', stage: 'pipeline' }],
        blockingIssues: ['DUPLICATE_SEMANTIC'],
      },
    ],
    prompt: 'must not leak',
    apiKey: 'must not leak',
  };

  it('returns HTTP 400 with structured issue and candidate diagnostics', () => {
    const exception = createZeroDraftGenerationException(pipelineMeta);
    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      message: 'AI pipeline produced no drafts',
      issueCodes: expect.arrayContaining([
        'PIPELINE_SLOT_FAILED',
        'DUPLICATE_SEMANTIC',
        'WRONG_ANSWERS_LANGUAGE_MISMATCH',
      ]),
      sourceSummary: pipelineMeta.sourceSummary,
      candidateDiagnostics: [
        expect.objectContaining({
          sourceQuestion: 'Source question',
          curatedQuestion: 'السؤال',
          rejectionReason: 'DUPLICATE_SEMANTIC',
        }),
      ],
      meta: {
        sourceSummary: pipelineMeta.sourceSummary,
        candidateDiagnostics: expect.any(Array),
      },
    });
  });

  it('does not expose prompts, keys, raw payloads, or stack traces', () => {
    const serialized = JSON.stringify(
      createZeroDraftGenerationException(pipelineMeta).getResponse(),
    );
    expect(serialized).not.toContain('must not leak');
    expect(serialized).not.toMatch(/"prompt"|"apiKey"|"stack"|rawPayload/);
  });

  it('bounds candidate diagnostics', () => {
    const exception = createZeroDraftGenerationException({
      ...pipelineMeta,
      candidateDiagnostics: Array.from(
        { length: 60 },
        () => pipelineMeta.candidateDiagnostics[0],
      ),
    });
    expect(
      (exception.getResponse() as Record<string, unknown>).candidateDiagnostics,
    ).toHaveLength(50);
  });

  it('does not expose NOT_SELECTED_FOR_REQUEST as a blocking issue', () => {
    const exception = createZeroDraftGenerationException({
      ...pipelineMeta,
      candidateDiagnostics: [
        ...pipelineMeta.candidateDiagnostics,
        {
          ...pipelineMeta.candidateDiagnostics[0],
          outcome: 'NOT_SELECTED',
          validationResult: { status: 'NOT_EVALUATED', issueCodes: [] },
          rejectionReason: 'NOT_SELECTED_FOR_REQUEST',
        },
      ],
    });
    expect(
      (exception.getResponse() as { issueCodes: string[] }).issueCodes,
    ).not.toContain('NOT_SELECTED_FOR_REQUEST');
  });
});
