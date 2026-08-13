import { BadRequestException, HttpStatus } from '@nestjs/common';

type CandidateDiagnostic = {
  sourceId?: unknown;
  sourceQuestionId?: unknown;
  sourceQuestion?: unknown;
  sourceAnswer?: unknown;
  curatedQuestion?: unknown;
  curatedAnswer?: unknown;
  semanticFingerprint?: unknown;
  duplicateScore?: unknown;
  validationResult?: unknown;
  outcome?: unknown;
  rejectionReason?: unknown;
  curator?: unknown;
};

const boundedText = (value: unknown, limit = 2_000) =>
  typeof value === 'string'
    ? value
        .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
        .replace(
          /\b(api[_ -]?key|token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi,
          '$1=[redacted]',
        )
        .replace(/\/(?:Users|home|app)\/[^\s]+/g, '[redacted path]')
        .slice(0, limit)
    : null;

const safeDetails = (
  value: unknown,
  depth = 0,
): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || depth > 3) return null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .map(([key, item]) => {
        if (typeof item === 'string') return [key, boundedText(item, 8_000)];
        if (
          typeof item === 'number' ||
          typeof item === 'boolean' ||
          item == null
        )
          return [key, item];
        if (Array.isArray(item))
          return [
            key,
            item
              .slice(0, 30)
              .map((entry) =>
                typeof entry === 'object'
                  ? safeDetails(entry, depth + 1)
                  : typeof entry === 'string'
                    ? boundedText(entry, 2_000)
                    : entry,
              ),
          ];
        return [key, safeDetails(item, depth + 1)];
      }),
  );
};

const safeCandidate = (value: CandidateDiagnostic) => ({
  sourceId: boundedText(value.sourceId, 100),
  sourceQuestionId: boundedText(value.sourceQuestionId, 200),
  sourceQuestion: boundedText(value.sourceQuestion),
  sourceAnswer: boundedText(value.sourceAnswer),
  curatedQuestion: boundedText(value.curatedQuestion),
  curatedAnswer: boundedText(value.curatedAnswer),
  semanticFingerprint: boundedText(value.semanticFingerprint, 200),
  duplicateScore: Number.isFinite(Number(value.duplicateScore))
    ? Number(value.duplicateScore)
    : 0,
  validationResult:
    value.validationResult && typeof value.validationResult === 'object'
      ? {
          status: boundedText(
            (value.validationResult as Record<string, unknown>).status,
            30,
          ),
          issueCodes: Array.isArray(
            (value.validationResult as Record<string, unknown>).issueCodes,
          )
            ? (
                (value.validationResult as Record<string, unknown>)
                  .issueCodes as unknown[]
              )
                .map((code) => boundedText(code, 100))
                .filter(Boolean)
                .slice(0, 30)
            : [],
        }
      : { status: 'NOT_EVALUATED', issueCodes: [] },
  outcome: boundedText(value.outcome, 30),
  rejectionReason: boundedText(value.rejectionReason),
  curator: safeDetails(value.curator),
});

export function createZeroDraftGenerationException(
  pipelineMeta: Record<string, unknown>,
): BadRequestException {
  const rawSourceSummary =
    pipelineMeta.sourceSummary && typeof pipelineMeta.sourceSummary === 'object'
      ? (pipelineMeta.sourceSummary as Record<string, unknown>)
      : {};
  const sourceRequired = rawSourceSummary.sourceRequired === true;
  const sourceDiagnostics = Array.isArray(pipelineMeta.sourceDiagnostics)
    ? pipelineMeta.sourceDiagnostics.slice(0, 50).map((item) => {
        const record =
          item && typeof item === 'object'
            ? (item as Record<string, unknown>)
            : {};
        return {
          code: boundedText(record.code, 100),
          sourceId: boundedText(record.sourceId, 100),
          message: boundedText(record.message),
        };
      })
    : [];
  const candidateDiagnostics = Array.isArray(pipelineMeta.candidateDiagnostics)
    ? pipelineMeta.candidateDiagnostics
        .slice(0, 50)
        .map((item) => safeCandidate((item ?? {}) as CandidateDiagnostic))
    : [];
  const slotDiagnostics = Array.isArray(pipelineMeta.slotDiagnostics)
    ? pipelineMeta.slotDiagnostics.slice(0, 20).map((item) => {
        const slot =
          item && typeof item === 'object'
            ? (item as Record<string, unknown>)
            : {};
        const diagnostics = Array.isArray(slot.diagnostics)
          ? slot.diagnostics.slice(0, 30).map((entry) => {
              const diagnostic =
                entry && typeof entry === 'object'
                  ? (entry as Record<string, unknown>)
                  : {};
              return {
                code: boundedText(diagnostic.code, 100),
                stage: boundedText(diagnostic.stage, 100),
                message: boundedText(diagnostic.message, 8_000),
                details: safeDetails(diagnostic.details),
              };
            })
          : [];
        const trace = Array.isArray(slot.trace)
          ? slot.trace.slice(0, 100).map((entry) => {
              const event =
                entry && typeof entry === 'object'
                  ? (entry as Record<string, unknown>)
                  : {};
              return {
                stage: boundedText(event.stage, 100),
                event: boundedText(event.event, 100),
                timestamp: boundedText(event.timestamp, 100),
                details: safeDetails(event.details),
              };
            })
          : [];
        return {
          slotId: boundedText(slot.slotId, 100),
          status: boundedText(slot.status, 30),
          sourceStatus: boundedText(slot.sourceStatus, 100),
          diagnostics,
          trace,
          blockingIssues: Array.isArray(slot.blockingIssues)
            ? slot.blockingIssues
                .map((code) => boundedText(code, 100))
                .filter(Boolean)
                .slice(0, 30)
            : [],
        };
      })
    : [];
  const issueCodes = [
    ...slotDiagnostics.flatMap((slot) => [
      ...slot.diagnostics.map((item) => item.code),
      ...slot.blockingIssues,
    ]),
    ...(sourceRequired
      ? candidateDiagnostics
          .filter(
            (candidate) =>
              candidate.outcome === 'REJECTED' ||
              candidate.outcome === 'FAILED',
          )
          .flatMap((candidate) => [
            ...candidate.validationResult.issueCodes,
            candidate.rejectionReason?.split(/[:,]/, 1)[0] ?? null,
          ])
      : []),
    ...sourceDiagnostics.map((item) => item.code),
  ].filter((code): code is string => Boolean(code));
  const sourceSummary = Object.fromEntries(
    [
      'requested',
      'collected',
      'selected',
      'approved',
      'rejected',
      'failed',
      'notSelected',
      'returned',
      'optionalSourceUnavailable',
      'requiredSourceMissing',
      'curatorFailed',
      'curatorRejected',
      'sourceFallbackUsed',
      'generationFailed',
      'generationRejected',
    ].map((key) => [key, Number(rawSourceSummary[key]) || 0]),
  );
  Object.assign(sourceSummary, {
    sourceRequired,
  });
  const meta = {
    pipelineVersion: boundedText(pipelineMeta.pipelineVersion, 30),
    generationRequestId: boundedText(pipelineMeta.generationRequestId, 100),
    plannedSlots: Number(pipelineMeta.plannedSlots) || 0,
    createdSlots: Number(pipelineMeta.createdSlots) || 0,
    rejectedSlots: Number(pipelineMeta.rejectedSlots) || 0,
    failedSlots: Number(pipelineMeta.failedSlots) || 0,
    sourceSummary,
    sourceDiagnostics,
    candidateDiagnostics,
    slotDiagnostics,
  };

  return new BadRequestException({
    statusCode: HttpStatus.BAD_REQUEST,
    error: 'Bad Request',
    message: 'AI pipeline produced no drafts',
    issueCodes: [...new Set(issueCodes)],
    meta,
    sourceDiagnostics,
    sourceSummary,
    candidateDiagnostics,
  });
}
