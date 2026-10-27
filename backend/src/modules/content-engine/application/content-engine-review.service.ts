import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Connection, FilterQuery, Model } from 'mongoose';
import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import { AuthenticatedUser } from '../../auth/auth.types';
import { ContentItemService } from '../../world-content/application/content-item.service';
import {
  toChallengeTypeView,
  toScopeView,
} from '../../world-content/application/world-content.mapper';
import { ContentItemStatus } from '../../world-content/domain/world-content.constants';
import { CreateContentItemDto } from '../../world-content/dto/content-item.dto';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { ScopeRepository } from '../../world-content/persistence/scope.repository';
import { WorldRepository } from '../../world-content/persistence/world.repository';
import { isGenerationSpecificationComplete } from '../domain/generation-specification';
import {
  CandidateReviewEvent,
  EngineCandidateDocument,
} from '../schemas/engine-candidate.schema';
import { EngineCostEntryDocument } from '../schemas/engine-cost-entry.schema';
import { EngineDraftPublicationDocument } from '../schemas/engine-draft-publication.schema';
import { EngineJobDocument } from '../schemas/engine-job.schema';
import {
  CandidateApprovalDto,
  CandidateAssessmentDto,
  CandidateEditDto,
  CandidateRejectionDto,
  ReviewCandidateQueryDto,
} from '../presentation/content-engine-review.dto';
import {
  resolveCanonicalWorld,
  resolveCanonicalScope,
  resolveCanonicalChallengeType,
} from './authoring-target-resolver';
import { CandidateCompatibilityService } from './candidate-compatibility.service';
import { DeterministicScreenService } from './deterministic-screen.service';

const REVIEWABLE_PIPELINE_STATUSES = [
  'awaiting_review',
  'fact_blocked',
  'screened_pass',
] as const;

const IMMUTABLE_DRAFT_TARGET_KEYS = [
  'worldId',
  'worldKey',
  'scopeId',
  'scopeKey',
  'mechanicKey',
  'compatibleChallengeTypeIds',
  'status',
] as const;

const MATERIAL_DRAFT_KEYS = [
  'prompt',
  'answerPayload',
  'mechanicPayload',
  'media',
  'revealMedia',
] as const;

const NON_MATERIAL_DRAFT_KEYS = [
  'metadata',
  'isReusableAcrossSessions',
] as const;

type FactualOverrideCode =
  'ACCEPTED_WITH_EVIDENCE' | 'CLAIM_NOT_ANSWER_CRITICAL' | 'CLAIM_CORRECTED';

type PresentableCandidate = object & {
  _id?: unknown;
  jobId: string;
  status?: string;
  reviewRevision?: number;
  reviewStatus?: string;
  findings?: Array<{ code: string; severity: string; message: string }>;
  factualClaims?: string[];
  factVerification?: Record<string, unknown> | null;
  qualityEvaluation?: Record<string, unknown> | null;
  compatibilityEvaluation?: Record<string, unknown> | null;
  humanAssessment?: Record<string, unknown> | null;
  lastInvalidatedAssessments?: Record<string, unknown> | null;
  reviewDecision?: Record<string, unknown> | null;
  reviewEvents?: CandidateReviewEvent[];
  publishedContentItemId?: string | null;
};

type PresentableJob = object & {
  _id?: unknown;
  mechanicKey: string;
  worldKey: string;
  scopeKey: string;
  status: string;
  specVersion?: string | null;
  generationSpec?: unknown;
};

const canonicalJson = (value: unknown): string => {
  if (value === undefined || value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
};

const compatibleDraftAnswerModesForChallengeAnswerMode = (
  challengeAnswerMode: string,
): readonly string[] => {
  switch (challengeAnswerMode) {
    case 'ryo':
    case 'multiple-choice':
    case 'multiple_choice':
      return ['multiple_choice'];
    case 'closest':
      return ['closest'];
    case 'match':
      return ['match'];
    default:
      return [];
  }
};

@Injectable()
export class ContentEngineReviewService {
  constructor(
    @InjectModel(EngineCandidateDocument.name)
    private readonly candidates: Model<EngineCandidateDocument>,
    @InjectModel(EngineJobDocument.name)
    private readonly jobs: Model<EngineJobDocument>,
    @InjectModel(EngineCostEntryDocument.name)
    private readonly ledger: Model<EngineCostEntryDocument>,
    @InjectModel(EngineDraftPublicationDocument.name)
    private readonly publications: Model<EngineDraftPublicationDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly screen: DeterministicScreenService,
    private readonly compatibility: CandidateCompatibilityService,
    private readonly contentItems: ContentItemService,
    private readonly worlds: WorldRepository,
    private readonly scopes: ScopeRepository,
    private readonly challengeTypes: ChallengeTypeRepository,
  ) {}

  async list(query: ReviewCandidateQueryDto) {
    const jobFilter: FilterQuery<EngineJobDocument> = {};
    if (query.jobId) jobFilter._id = query.jobId;
    if (query.worldKey) jobFilter.worldKey = query.worldKey;
    if (query.scopeKey) jobFilter.scopeKey = query.scopeKey;
    const jobs = await this.jobs.find(jobFilter).lean().exec();
    const byId = new Map(jobs.map((job) => [String(job._id), job]));
    if (!byId.size) return [];

    const candidateFilter: FilterQuery<EngineCandidateDocument> = {
      jobId: { $in: [...byId.keys()] },
    };
    if (query.status) {
      candidateFilter[
        ['pending', 'approved', 'rejected'].includes(query.status)
          ? 'reviewStatus'
          : 'status'
      ] = query.status;
    }
    const rows = await this.candidates
      .find(candidateFilter)
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean()
      .exec();
    return rows.map((candidate) =>
      this.present(candidate, byId.get(candidate.jobId)),
    );
  }

  async detail(candidateId: string) {
    const candidate = await this.requireCandidate(candidateId);
    const job = await this.jobs.findById(candidate.jobId).lean().exec();
    let canonicalTarget: Record<string, unknown> | null = null;
    let targetResolutionError: string | null = null;
    let liveCompatibility: Record<string, unknown> | null =
      (candidate.compatibilityEvaluation as Record<string, unknown> | null) ??
      null;
    try {
      const refs = await this.references(candidate.jobId, candidate);
      canonicalTarget = {
        worldId: String(refs.scope.worldId),
        worldKey: refs.job.worldKey,
        scopeId: String(refs.scope._id),
        scopeKey: refs.job.scopeKey,
        scopeName: refs.compatibility.scope.name,
        challengeTypeId: String(refs.challengeType._id),
        mechanicKey: refs.job.mechanicKey,
        challengeTypeName: refs.compatibility.challengeType.name,
        challengeAnswerMode: refs.compatibility.challengeType.answerMode,
      };
      if (candidate.draft) {
        liveCompatibility = this.compatibility.evaluate({
          mechanicKey: refs.job.mechanicKey,
          draft: candidate.draft,
          references: refs.compatibility,
        }) as unknown as Record<string, unknown>;
      }
    } catch (error) {
      // Missing canonical references or broken provenance are rendered as an
      // explicit null target plus diagnostic message; approval and canonical
      // creation fail closed with the precise error.
      targetResolutionError =
        error instanceof Error
          ? error.message
          : 'Failed to resolve canonical target';
    }
    const hydratedCandidate: PresentableCandidate = {
      ...candidate,
      compatibilityEvaluation: liveCompatibility,
    };
    return {
      ...this.present(
        hydratedCandidate,
        job ?? undefined,
        targetResolutionError,
      ),
      canonicalTarget,
      targetResolutionError,
    };
  }

  async spending(jobId: string) {
    const job = await this.jobs.findById(jobId).lean().exec();
    if (!job) throw new NotFoundException('Content Engine job not found');
    const entries = await this.ledger
      .find({ jobId })
      .sort({ createdAt: 1 })
      .lean();
    const byStage = new Map<
      string,
      {
        reservedMicros: number;
        actualMicros: number;
        calls: number;
        unknownUsage: number;
      }
    >();
    for (const entry of entries) {
      const row = byStage.get(entry.stage) ?? {
        reservedMicros: 0,
        actualMicros: 0,
        calls: 0,
        unknownUsage: 0,
      };
      row.reservedMicros += entry.reservedMicros;
      row.actualMicros += entry.actualMicros ?? entry.reservedMicros;
      row.calls += 1;
      if (!entry.usageKnown) row.unknownUsage += 1;
      byStage.set(entry.stage, row);
    }
    const stages = [...byStage.entries()].map(([stage, row]) => ({
      stage,
      ...row,
    }));
    // Totals come from the ledger rows already aggregated above, not from
    // `job.spentMicros` — nothing increments that field, so reading it reported
    // zero spend for every job that had actually run.
    const spentMicros = stages.reduce(
      (total, row) => total + row.actualMicros,
      0,
    );
    const reservedMicros = stages.reduce(
      (total, row) => total + row.reservedMicros,
      0,
    );
    return {
      jobId,
      spentMicros,
      reservedMicros,
      spentSar: spentMicros / 1_000_000,
      reservedSar: reservedMicros / 1_000_000,
      stages,
    };
  }

  async edit(
    candidateId: string,
    dto: CandidateEditDto,
    actor: AuthenticatedUser,
  ) {
    const current = await this.requireCandidate(candidateId);
    this.assertNotPublished(current);
    const explanation = dto.explanation?.trim() ?? '';
    if (!explanation) {
      throw new BadRequestException({
        code: 'EDIT_EXPLANATION_REQUIRED',
        message: 'Human edit requires a non-empty explanation',
      });
    }
    if (
      !dto.draft ||
      typeof dto.draft !== 'object' ||
      Array.isArray(dto.draft)
    ) {
      throw new BadRequestException({
        code: 'CANDIDATE_EDIT_INVALID',
        message: 'Candidate draft must be a JSON object',
      });
    }

    const references = await this.references(current.jobId, current);
    this.assertTargetNotRetargeted(dto.draft, references);
    const sanitizedDraft = this.stripTargetFields(dto.draft);
    const normalizedClaims = (
      Array.isArray(dto.factualClaims) ? dto.factualClaims : []
    )
      .map((claim) => (typeof claim === 'string' ? claim.trim() : ''))
      .filter(Boolean);

    await this.validateEditedDraft(
      sanitizedDraft,
      (current.draft as Record<string, unknown> | null) ?? null,
      references,
    );

    const editDiff = this.classifyEditChange(
      (current.draft as Record<string, unknown> | null) ?? null,
      sanitizedDraft,
      current.factualClaims ?? [],
      normalizedClaims,
    );

    this.screen.beginBatch();
    // The model's `stepsFromMin` describes the draft the model wrote. Once a
    // human edits the numbers that claim is void, so it is dropped rather than
    // used to block the editor — and `CLOSEST_SLIDER_TARGET_STEP_INVALID`
    // still checks reachability against the edited draft itself, which is the
    // authority either way. The prose rationale is kept: it is why the item
    // exists, and an edit does not change that.
    const priorAuthoring = (current.authoring ?? null) as Record<
      string,
      unknown
    > | null;
    const retainedAuthoring = priorAuthoring
      ? Object.fromEntries(
          Object.entries(priorAuthoring).filter(
            ([key]) => key !== 'stepsFromMin',
          ),
        )
      : null;
    const screened = this.screen.screen(sanitizedDraft, retainedAuthoring);
    const compatibility = this.compatibility.evaluate({
      mechanicKey: references.job.mechanicKey,
      draft: sanitizedDraft,
      references: references.compatibility,
    });
    const nextRevision = dto.expectedRevision + 1;

    if (!editDiff.materialChange) {
      const priorAssessment = current.humanAssessment as Record<
        string,
        unknown
      > | null;
      const carriedAssessment =
        priorAssessment &&
        typeof priorAssessment.assessedRevision === 'number' &&
        priorAssessment.assessedRevision <= current.reviewRevision
          ? {
              ...priorAssessment,
              assessedRevision: nextRevision,
              previousAssessedRevision: priorAssessment.assessedRevision,
            }
          : priorAssessment;

      // Human approval is "last and authoritative" (§30.2). Any edit performed
      // AFTER an approval (even non-material metadata) voids that approval so an
      // unreviewed modification cannot be published directly to canonical DRAFT.
      // However, human assessment (factual verification, rubric) is safely preserved
      // and advances its assessedRevision.
      const previousApprovalVoided = current.reviewStatus === 'approved';
      const nextReviewStatus = previousApprovalVoided
        ? 'pending'
        : (current.reviewStatus ?? 'pending');
      const nextReviewDecision = previousApprovalVoided
        ? null
        : (current.reviewDecision ?? null);

      const updated = await this.candidates
        .findOneAndUpdate(
          {
            candidateId,
            reviewRevision: dto.expectedRevision,
            publishedContentItemId: null,
          },
          {
            $set: {
              draft: sanitizedDraft,
              authoring: retainedAuthoring,
              factualClaims: normalizedClaims,
              findings: screened.findings,
              compatibilityEvaluation: compatibility,
              status: screened.passed ? current.status : 'screened_reject',
              humanAssessment: carriedAssessment,
              reviewStatus: nextReviewStatus,
              reviewDecision: nextReviewDecision,
            },
            $inc: { reviewRevision: 1 },
            $push: {
              reviewEvents: this.event('edited', actor, nextRevision, {
                explanation,
                details: {
                  materialChange: false,
                  assessmentsInvalidated: false,
                  changedFields: editDiff.changedFields,
                  previousApprovalVoided,
                },
              }),
            },
          },
          { returnDocument: 'after', runValidators: true },
        )
        .lean()
        .exec();
      if (!updated) await this.throwCas(candidateId, dto.expectedRevision);
      return this.detail(candidateId);
    }

    const hadPriorAssessments = Boolean(
      current.factVerification ||
      current.qualityEvaluation ||
      current.humanAssessment ||
      current.reviewDecision,
    );
    const invalidatedSnapshot = hadPriorAssessments
      ? {
          invalidatedAtRevision: nextRevision,
          previousRevision: current.reviewRevision ?? 0,
          invalidatedBy: actor.id,
          invalidatedByEmail: actor.email,
          invalidatedAt: new Date(),
          reason: explanation,
          changedFields: editDiff.changedFields,
          factVerification: current.factVerification ?? null,
          qualityEvaluation: current.qualityEvaluation ?? null,
          humanAssessment: current.humanAssessment ?? null,
          reviewDecision: current.reviewDecision ?? null,
        }
      : (current.lastInvalidatedAssessments ?? null);

    const eventsToPush: CandidateReviewEvent[] = [
      this.event('edited', actor, nextRevision, {
        explanation,
        details: {
          materialChange: true,
          assessmentsInvalidated: true,
          changedFields: editDiff.changedFields,
          preservedPriorAssessments: hadPriorAssessments,
        },
      }),
    ];
    if (hadPriorAssessments) {
      eventsToPush.push(
        this.event('assessment_invalidated', actor, nextRevision, {
          explanation,
          details: {
            previousRevision: current.reviewRevision ?? 0,
            changedFields: editDiff.changedFields,
            previousFactVerificationState:
              (current.factVerification as { state?: string } | null)?.state ??
              null,
            previousQualityRecommendation:
              (
                current.qualityEvaluation as {
                  recommendation?: string;
                } | null
              )?.recommendation ?? null,
            previousHumanFactualState:
              (current.humanAssessment as { factualState?: string } | null)
                ?.factualState ?? null,
            previousAssessedRevision:
              (current.humanAssessment as { assessedRevision?: number } | null)
                ?.assessedRevision ?? null,
            previousReviewStatus: current.reviewStatus ?? 'pending',
          },
        }),
      );
    }

    const updated = await this.candidates
      .findOneAndUpdate(
        {
          candidateId,
          reviewRevision: dto.expectedRevision,
          publishedContentItemId: null,
        },
        {
          $set: {
            draft: sanitizedDraft,
            authoring: retainedAuthoring,
            factualClaims: normalizedClaims,
            findings: screened.findings,
            compatibilityEvaluation: compatibility,
            status: screened.passed ? 'awaiting_review' : 'screened_reject',
            factVerification: null,
            qualityEvaluation: null,
            humanAssessment: null,
            lastInvalidatedAssessments: invalidatedSnapshot,
            reviewStatus: 'pending',
            reviewDecision: null,
          },
          $inc: { reviewRevision: 1 },
          $push: {
            reviewEvents:
              eventsToPush.length === 1
                ? eventsToPush[0]
                : { $each: eventsToPush },
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();
    if (!updated) await this.throwCas(candidateId, dto.expectedRevision);
    return this.detail(candidateId);
  }

  async assess(
    candidateId: string,
    dto: CandidateAssessmentDto,
    actor: AuthenticatedUser,
  ) {
    const current = await this.requireCandidate(candidateId);
    this.assertNotPublished(current);

    const factualExplanation = dto.factualExplanation?.trim() ?? '';
    const qualityExplanation = dto.quality?.explanation?.trim() ?? '';
    if (!factualExplanation || !qualityExplanation) {
      throw new BadRequestException({
        code: 'ASSESSMENT_EXPLANATION_REQUIRED',
        message:
          'Human assessment requires non-empty factual and quality explanations',
      });
    }

    const hasFactualClaims = (current.factualClaims ?? []).length > 0;
    const autoFactState =
      (current.factVerification as { state?: string } | null)?.state ?? null;
    const isAutoContradicted =
      autoFactState === 'CONTRADICTED' || current.status === 'fact_blocked';

    // Audit A: Contradicted automated verification cannot be silently turned into SUPPORTED
    if (dto.factualState === 'SUPPORTED' && isAutoContradicted) {
      throw new BadRequestException({
        code: 'CONTRADICTED_CANNOT_BE_MARKED_SUPPORTED',
        message:
          'Candidate has contradictory automated factual verification; it cannot be marked SUPPORTED directly. Edit the candidate to correct the claim, or assess as CONTRADICTED with claim-associated evidence for an explicit exceptional approval override.',
      });
    }

    const claims = current.factualClaims ?? [];
    const normalizedEvidence = (Array.isArray(dto.evidence) ? dto.evidence : [])
      .map((item) => {
        let claimIndex =
          typeof item?.claimIndex === 'number' ? item.claimIndex : undefined;
        let claimText =
          typeof item?.claimText === 'string'
            ? item.claimText.trim()
            : undefined;
        if (claimIndex === undefined && claims.length === 1) {
          claimIndex = 0;
          claimText = claims[0];
        }
        return {
          url: typeof item?.url === 'string' ? item.url.trim() : '',
          ...(claimIndex !== undefined ? { claimIndex } : {}),
          ...(claimText ? { claimText } : {}),
          ...(item?.title?.trim() ? { title: item.title.trim() } : {}),
          ...(item?.note?.trim() ? { note: item.note.trim() } : {}),
        };
      })
      .filter((item) => Boolean(item.url));

    for (const item of normalizedEvidence) {
      let parsed: URL;
      try {
        parsed = new URL(item.url);
      } catch {
        throw new BadRequestException({
          code: 'INVALID_EVIDENCE_URL',
          message: `Evidence URL "${item.url}" is not a valid URL`,
        });
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new BadRequestException({
          code: 'INVALID_EVIDENCE_URL',
          message: `Evidence URL "${item.url}" must use http or https`,
        });
      }

      if (item.claimIndex !== undefined) {
        if (
          claims.length === 0 ||
          item.claimIndex < 0 ||
          item.claimIndex >= claims.length
        ) {
          throw new BadRequestException({
            code: 'EVIDENCE_CLAIM_INDEX_INVALID',
            message: `Evidence claimIndex ${item.claimIndex} is out of bounds for candidate factual claims (total claims: ${claims.length})`,
          });
        }
      }

      if (item.claimText && claims.length > 0) {
        const matchesAny = claims.some(
          (c) => c.includes(item.claimText!) || item.claimText!.includes(c),
        );
        if (!matchesAny) {
          throw new BadRequestException({
            code: 'EVIDENCE_CLAIM_TEXT_MISMATCH',
            message: `Evidence claimText "${item.claimText}" does not match any candidate factual claims`,
          });
        }
      }

      // To prevent unrelated or bare URLs from being treated as proof for contradicted claims:
      if (dto.factualState === 'CONTRADICTED' || isAutoContradicted) {
        const explanationLength =
          `${item.title ?? ''} ${item.note ?? ''}`.trim().length;
        if (explanationLength < 10) {
          throw new BadRequestException({
            code: 'EVIDENCE_EXPLANATION_REQUIRED',
            message:
              'Evidence for contradicted claims must include an explanatory title or note (at least 10 characters) detailing how it addresses the claim',
          });
        }
        if (
          claims.length > 1 &&
          item.claimIndex === undefined &&
          !item.claimText
        ) {
          throw new BadRequestException({
            code: 'EVIDENCE_CLAIM_ASSOCIATION_REQUIRED',
            message:
              'Evidence for contradicted claims must be associated with a specific factual claim via claimIndex or claimText',
          });
        }
      }
    }

    if (
      dto.factualState === 'SUPPORTED' &&
      (current.status === 'fact_blocked' ||
        (hasFactualClaims && autoFactState !== 'SUPPORTED')) &&
      normalizedEvidence.length === 0
    ) {
      throw new BadRequestException({
        code: 'SUPPORTED_ASSESSMENT_REQUIRES_EVIDENCE',
        message:
          'Marking factual claims as SUPPORTED when automated verification is not SUPPORTED requires at least one evidence source URL',
      });
    }

    const nextRevision = dto.expectedRevision + 1;
    const assessment = {
      factualState: dto.factualState,
      factualExplanation,
      evidence: normalizedEvidence,
      quality: {
        ...dto.quality,
        explanation: qualityExplanation,
      },
      assessedRevision: nextRevision,
      reviewerId: actor.id,
      reviewerEmail: actor.email,
      assessedAt: new Date(),
    };
    const nextPipelineStatus =
      current.status === 'fact_blocked' &&
      normalizedEvidence.length > 0 &&
      !current.findings?.some((finding) => finding.severity === 'blocking')
        ? 'awaiting_review'
        : current.status;

    const updated = await this.candidates
      .findOneAndUpdate(
        {
          candidateId,
          reviewRevision: dto.expectedRevision,
          publishedContentItemId: null,
        },
        {
          $set: {
            status: nextPipelineStatus,
            humanAssessment: assessment,
            reviewStatus: 'pending',
            reviewDecision: null,
          },
          $inc: { reviewRevision: 1 },
          $push: {
            reviewEvents: this.event('assessed', actor, nextRevision, {
              explanation: factualExplanation,
              details: {
                factualState: dto.factualState,
                evidenceCount: normalizedEvidence.length,
                quality: assessment.quality,
                pipelineStatusTransition:
                  nextPipelineStatus !== current.status
                    ? { from: current.status, to: nextPipelineStatus }
                    : null,
              },
            }),
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();
    if (!updated) await this.throwCas(candidateId, dto.expectedRevision);
    return this.detail(candidateId);
  }

  async approve(
    candidateId: string,
    dto: CandidateApprovalDto,
    actor: AuthenticatedUser,
  ) {
    const current = await this.requireCandidate(candidateId);
    const explanation = dto.explanation?.trim() ?? '';
    if (!explanation) {
      throw new BadRequestException({
        code: 'APPROVAL_EXPLANATION_REQUIRED',
        message: 'Human approval requires a non-empty explanation',
      });
    }
    this.assertApprovable(current, dto);
    const liveCompatibility =
      await this.assertCanonicalCompatibilityForApproval(current);

    const assessment = current.humanAssessment as {
      factualState?: string;
      assessedRevision?: number;
      evidence?: Array<{
        url?: string;
        title?: string;
        note?: string;
        claimIndex?: number;
        claimText?: string;
      }>;
    };
    const overrideCode = dto.factualOverrideCode ?? null;
    const overrideExplanation = dto.factualOverrideExplanation?.trim() ?? null;
    const nextRevision = dto.expectedRevision + 1;
    const autoFactState =
      (current.factVerification as { state?: string } | null)?.state ?? null;
    const isAutoContradicted =
      autoFactState === 'CONTRADICTED' || current.status === 'fact_blocked';
    const contradictionOverridden =
      isAutoContradicted || assessment.factualState === 'CONTRADICTED';

    const decision = {
      decision: 'approved',
      explanation,
      factualOverrideCode: overrideCode,
      factualOverrideExplanation: overrideExplanation,
      exceptionalOverride: Boolean(overrideCode),
      factualStateAtApproval: assessment.factualState ?? 'SUPPORTED',
      automatedContradictionOverridden: contradictionOverridden,
      originalFactVerification: current.factVerification ?? null,
      assessedRevision: assessment.assessedRevision ?? current.reviewRevision,
      reviewerId: actor.id,
      reviewerEmail: actor.email,
      decidedAt: new Date(),
      revision: nextRevision,
    };
    const updated = await this.candidates
      .findOneAndUpdate(
        {
          candidateId,
          reviewRevision: dto.expectedRevision,
          publishedContentItemId: null,
        },
        {
          $set: {
            reviewStatus: 'approved',
            reviewDecision: decision,
            ...(liveCompatibility
              ? { compatibilityEvaluation: liveCompatibility }
              : {}),
          },
          $inc: { reviewRevision: 1 },
          $push: {
            reviewEvents: this.event('approved', actor, nextRevision, {
              explanation,
              details: {
                factualOverrideCode: overrideCode,
                factualOverrideExplanation: overrideExplanation,
                exceptionalOverride: Boolean(overrideCode),
                factualStateAtApproval: assessment.factualState ?? 'SUPPORTED',
                automatedContradictionOverridden: contradictionOverridden,
                originalFactVerificationState: autoFactState,
                evidenceCount: Array.isArray(assessment.evidence)
                  ? assessment.evidence.length
                  : 0,
                claimEvidenceAssociations: (assessment.evidence ?? []).map(
                  (e) => ({
                    claimIndex: e.claimIndex,
                    claimText: e.claimText,
                    url: e.url,
                  }),
                ),
              },
            }),
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();
    if (!updated) await this.throwCas(candidateId, dto.expectedRevision);
    return this.detail(candidateId);
  }

  async reject(
    candidateId: string,
    dto: CandidateRejectionDto,
    actor: AuthenticatedUser,
  ) {
    const current = await this.requireCandidate(candidateId);
    this.assertNotPublished(current);
    const explanation = dto.explanation?.trim() ?? '';
    if (!explanation) {
      throw new BadRequestException({
        code: 'REJECTION_EXPLANATION_REQUIRED',
        message: 'Human rejection requires a non-empty explanation',
      });
    }
    const nextRevision = dto.expectedRevision + 1;
    const decision = {
      decision: 'rejected',
      reasonCode: dto.reasonCode,
      explanation,
      reviewerId: actor.id,
      reviewerEmail: actor.email,
      decidedAt: new Date(),
      revision: nextRevision,
    };
    const updated = await this.candidates
      .findOneAndUpdate(
        {
          candidateId,
          reviewRevision: dto.expectedRevision,
          publishedContentItemId: null,
        },
        {
          $set: { reviewStatus: 'rejected', reviewDecision: decision },
          $inc: { reviewRevision: 1 },
          $push: {
            reviewEvents: this.event('rejected', actor, nextRevision, {
              reasonCode: dto.reasonCode,
              explanation,
            }),
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();
    if (!updated) await this.throwCas(candidateId, dto.expectedRevision);
    return this.detail(candidateId);
  }

  async createDraft(
    candidateId: string,
    expectedRevision: number,
    actor: AuthenticatedUser,
  ) {
    const existing = await this.publications
      .findOne({ candidateId })
      .lean()
      .exec();
    if (existing) return this.publicationResult(existing, true);

    const current = await this.requireCandidate(candidateId);
    if (current.reviewStatus === 'rejected') {
      throw new ConflictException('Rejected candidates cannot create drafts');
    }
    if (current.reviewStatus !== 'approved') {
      throw new ConflictException(
        'Candidate must be approved by a human reviewer',
      );
    }
    if (current.reviewRevision !== expectedRevision) {
      throw new ConflictException(
        'Candidate changed; reload before creating a draft',
      );
    }
    this.assertDraftCreationSafety(current);
    const canonicalDto = await this.canonicalDto(current);

    const session = await this.connection.startSession();
    try {
      let result!: { contentItemId: string };
      await session.withTransaction(async () => {
        const locked = await this.candidates
          .findOne({
            candidateId,
            reviewRevision: expectedRevision,
            reviewStatus: 'approved',
            publishedContentItemId: null,
          })
          .session(session)
          .exec();
        if (!locked)
          throw new ConflictException(
            'Candidate changed before draft creation',
          );

        const contentItem = await this.contentItems.create(canonicalDto, {
          session,
        });
        const contentItemId = contentItem.id;
        await this.publications.create(
          [
            {
              candidateId,
              jobId: locked.jobId,
              reviewRevision: expectedRevision,
              contentItemId,
              createdBy: actor.id,
              createdByEmail: actor.email,
            },
          ],
          { session },
        );
        const changed = await this.candidates.updateOne(
          {
            _id: locked._id,
            reviewRevision: expectedRevision,
            reviewStatus: 'approved',
            publishedContentItemId: null,
          },
          {
            $set: { publishedContentItemId: contentItemId },
            $inc: { reviewRevision: 1 },
            $push: {
              reviewEvents: this.event(
                'draft_created',
                actor,
                expectedRevision + 1,
                {
                  details: { contentItemId, status: ContentItemStatus.DRAFT },
                },
              ),
            },
          },
          { session, runValidators: true },
        );
        if (changed.modifiedCount !== 1) {
          throw new ConflictException(
            'Candidate changed before draft creation',
          );
        }
        result = { contentItemId };
      });
      return {
        ...result,
        status: ContentItemStatus.DRAFT,
        alreadyCreated: false,
      };
    } catch (error) {
      const winner = await this.publications
        .findOne({ candidateId })
        .lean()
        .exec();
      if (winner) return this.publicationResult(winner, true);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async canonicalDto(candidate: EngineCandidateDocument) {
    if (!candidate.draft)
      throw new BadRequestException('Candidate has no draft payload');
    const refs = await this.references(candidate.jobId, candidate);
    this.assertTargetNotRetargeted(candidate.draft, refs);
    const sanitizedDraft = this.stripTargetFields(candidate.draft);
    const raw = {
      ...sanitizedDraft,
      scopeId: String(refs.scope._id),
      compatibleChallengeTypeIds: [String(refs.challengeType._id)],
      status: ContentItemStatus.DRAFT,
    };
    const dto = plainToInstance(CreateContentItemDto, raw);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    });
    if (errors.length) {
      throw new BadRequestException({
        message: 'Candidate does not satisfy CreateContentItemDto',
        errors,
      });
    }
    const compatibility = this.compatibility.evaluate({
      mechanicKey: refs.job.mechanicKey,
      draft: sanitizedDraft,
      references: refs.compatibility,
    });
    if (compatibility.preDraft.blockers.length) {
      throw new BadRequestException({
        message: 'Candidate is incompatible with canonical World Content',
        blockers: compatibility.preDraft.blockers,
      });
    }
    return dto;
  }

  private async references(
    jobId: string,
    candidate?: Partial<EngineCandidateDocument>,
  ) {
    const job = await this.jobs.findById(jobId).lean().exec();
    if (!job) throw new NotFoundException('Content Engine job not found');

    if (
      !job.worldKey?.trim() ||
      !job.scopeKey?.trim() ||
      !job.mechanicKey?.trim()
    ) {
      throw new BadRequestException({
        code: 'TARGET_PROVENANCE_INSUFFICIENT',
        message:
          'Job is missing canonical target provenance (worldKey, scopeKey, or mechanicKey)',
      });
    }

    if (
      (job.specVersion !== undefined && job.specVersion !== null) ||
      (job.generationSpec !== undefined && job.generationSpec !== null)
    ) {
      if (!isGenerationSpecificationComplete(job.generationSpec)) {
        throw new BadRequestException({
          code: 'TARGET_PROVENANCE_INSUFFICIENT',
          message:
            'Job generation specification is incomplete or malformed; cannot verify target provenance',
        });
      }
      if (
        job.generationSpec.worldKey !== job.worldKey ||
        job.generationSpec.scopeKey !== job.scopeKey ||
        job.generationSpec.mechanicKey !== job.mechanicKey
      ) {
        throw new BadRequestException({
          code: 'TARGET_PROVENANCE_MISMATCH',
          message:
            'Job target keys do not match its pinned generation specification',
        });
      }
    }

    if (candidate) {
      if (
        (candidate.contextHash !== undefined &&
          !String(candidate.contextHash ?? '').trim()) ||
        (candidate.promptVersion !== undefined &&
          !String(candidate.promptVersion ?? '').trim())
      ) {
        throw new BadRequestException({
          code: 'CANDIDATE_PROVENANCE_INSUFFICIENT',
          message:
            'Candidate is missing required generation provenance (contextHash or promptVersion)',
        });
      }
    }

    const world = await resolveCanonicalWorld(this.worlds, job.worldKey);
    if (!world)
      throw new BadRequestException(`World "${job.worldKey}" does not exist`);
    const scope = await resolveCanonicalScope(
      this.scopes,
      String(world._id),
      job.scopeKey,
    );
    if (!scope)
      throw new BadRequestException(
        `Scope "${job.scopeKey}" does not exist in the job World`,
      );
    const challengeType = await resolveCanonicalChallengeType(
      this.challengeTypes,
      job.mechanicKey,
    );
    if (!challengeType)
      throw new BadRequestException(
        `ChallengeType "${job.mechanicKey}" does not exist`,
      );
    return {
      job,
      world,
      scope,
      challengeType,
      compatibility: {
        scope: toScopeView(scope),
        worldStatus: world.status,
        challengeType: toChallengeTypeView(challengeType),
      },
    };
  }

  private assertTargetNotRetargeted(
    draft: Record<string, unknown>,
    references: Awaited<ReturnType<ContentEngineReviewService['references']>>,
  ) {
    if (
      draft.worldKey !== undefined &&
      String(draft.worldKey) !== references.job.worldKey
    ) {
      throw new BadRequestException({
        code: 'CANDIDATE_TARGET_IMMUTABLE',
        message: `Candidate World is pinned to "${references.job.worldKey}" and cannot be changed`,
      });
    }
    if (
      draft.worldId !== undefined &&
      String(draft.worldId) !== String(references.scope.worldId)
    ) {
      throw new BadRequestException({
        code: 'CANDIDATE_TARGET_IMMUTABLE',
        message:
          'Candidate World ID is pinned to the job target and cannot be changed',
      });
    }
    if (
      draft.scopeKey !== undefined &&
      String(draft.scopeKey) !== references.job.scopeKey
    ) {
      throw new BadRequestException({
        code: 'CANDIDATE_TARGET_IMMUTABLE',
        message: `Candidate Scope is pinned to "${references.job.scopeKey}" and cannot be changed`,
      });
    }
    if (
      draft.scopeId !== undefined &&
      String(draft.scopeId) !== String(references.scope._id)
    ) {
      throw new BadRequestException({
        code: 'CANDIDATE_TARGET_IMMUTABLE',
        message:
          'Candidate Scope ID is pinned to the job target and cannot be changed',
      });
    }
    if (
      draft.mechanicKey !== undefined &&
      String(draft.mechanicKey) !== references.job.mechanicKey
    ) {
      throw new BadRequestException({
        code: 'CANDIDATE_TARGET_IMMUTABLE',
        message: `Candidate mechanic is pinned to "${references.job.mechanicKey}" and cannot be changed`,
      });
    }
    if (draft.compatibleChallengeTypeIds !== undefined) {
      const ids = Array.isArray(draft.compatibleChallengeTypeIds)
        ? draft.compatibleChallengeTypeIds.map((id) => String(id))
        : [];
      if (ids.length !== 1 || ids[0] !== String(references.challengeType._id)) {
        throw new BadRequestException({
          code: 'CANDIDATE_TARGET_IMMUTABLE',
          message:
            'Candidate compatibleChallengeTypeIds are pinned to the job mechanic and cannot be changed',
        });
      }
    }
    if (
      draft.status !== undefined &&
      draft.status !== ContentItemStatus.DRAFT
    ) {
      throw new BadRequestException({
        code: 'CANDIDATE_STATUS_MUST_BE_DRAFT',
        message: 'Candidate edits cannot promote status beyond draft',
      });
    }
  }

  private stripTargetFields(
    draft: Record<string, unknown>,
  ): Record<string, unknown> {
    const clean = { ...draft };
    for (const key of IMMUTABLE_DRAFT_TARGET_KEYS) {
      delete clean[key];
    }
    return clean;
  }

  private async validateEditedDraft(
    draft: Record<string, unknown>,
    priorDraft: Record<string, unknown> | null,
    references: Awaited<ReturnType<ContentEngineReviewService['references']>>,
  ) {
    const fieldErrors: Array<{ field: string; code: string; message: string }> =
      [];

    const prompt = draft.prompt as { ar?: unknown } | undefined;
    const promptAr = typeof prompt?.ar === 'string' ? prompt.ar.trim() : '';
    if (!promptAr) {
      fieldErrors.push({
        field: 'prompt.ar',
        code: 'PROMPT_AR_REQUIRED',
        message: 'Arabic question prompt (prompt.ar) is required',
      });
    }

    const answerPayload = draft.answerPayload as
      Record<string, unknown> | undefined;
    const mode =
      typeof answerPayload?.mode === 'string' ? answerPayload.mode : '';
    const priorMode =
      typeof (priorDraft?.answerPayload as { mode?: unknown } | undefined)
        ?.mode === 'string'
        ? String((priorDraft?.answerPayload as { mode?: unknown }).mode)
        : '';
    const allowedModes = compatibleDraftAnswerModesForChallengeAnswerMode(
      references.compatibility.challengeType.answerMode,
    );

    if (!mode) {
      fieldErrors.push({
        field: 'answerPayload.mode',
        code: 'ANSWER_MODE_REQUIRED',
        message: 'Answer payload mode is required',
      });
    } else if (
      mode !== priorMode &&
      allowedModes.length > 0 &&
      !allowedModes.includes(mode)
    ) {
      fieldErrors.push({
        field: 'answerPayload.mode',
        code: 'ANSWER_MODE_MECHANIC_MISMATCH',
        message: `Answer mode "${mode}" is incompatible with mechanic "${references.job.mechanicKey}" (expected ${allowedModes.join(', ')})`,
      });
    }

    if (mode === 'multiple_choice') {
      const options = Array.isArray(answerPayload?.options)
        ? (answerPayload.options as Array<Record<string, unknown>>)
        : [];
      if (options.length < 2 || options.length > 4) {
        fieldErrors.push({
          field: 'answerPayload.options',
          code: 'MC_OPTION_COUNT_OUT_OF_RANGE',
          message:
            'Multiple-choice questions must contain between 2 and 4 options',
        });
      }
      const seenIds = new Set<string>();
      const seenNormalizedLabels = new Set<string>();
      options.forEach((opt, index) => {
        const optId = typeof opt?.id === 'string' ? opt.id.trim() : '';
        const labelAr =
          typeof (opt?.label as { ar?: unknown } | undefined)?.ar === 'string'
            ? String((opt.label as { ar: string }).ar).trim()
            : '';
        if (!optId) {
          fieldErrors.push({
            field: `answerPayload.options[${index}].id`,
            code: 'MC_OPTION_ID_REQUIRED',
            message: `Option #${index + 1} requires an id`,
          });
        } else if (seenIds.has(optId)) {
          fieldErrors.push({
            field: `answerPayload.options[${index}].id`,
            code: 'MC_OPTION_ID_DUPLICATE',
            message: `Duplicate option id "${optId}"`,
          });
        } else {
          seenIds.add(optId);
        }

        const normalizedLabel = normalizeAnswer(labelAr);
        if (!labelAr || !normalizedLabel) {
          fieldErrors.push({
            field: `answerPayload.options[${index}].label.ar`,
            code: 'MC_OPTION_LABEL_REQUIRED',
            message: `Option #${index + 1} requires a non-empty Arabic label`,
          });
        } else if (seenNormalizedLabels.has(normalizedLabel)) {
          fieldErrors.push({
            field: `answerPayload.options[${index}].label.ar`,
            code: 'DUPLICATE_NORMALIZED_OPTIONS',
            message: `Option #${index + 1} duplicates another option after Arabic answer normalization`,
          });
        } else {
          seenNormalizedLabels.add(normalizedLabel);
        }
      });

      const correctOptionId =
        typeof answerPayload?.correctOptionId === 'string'
          ? answerPayload.correctOptionId.trim()
          : '';
      if (!correctOptionId || !seenIds.has(correctOptionId)) {
        fieldErrors.push({
          field: 'answerPayload.correctOptionId',
          code: 'MC_CORRECT_OPTION_INVALID',
          message: 'correctOptionId must reference one of the option IDs',
        });
      }
    } else if (mode === 'closest') {
      const correctValue = answerPayload?.correctValue;
      if (typeof correctValue !== 'number' || !Number.isFinite(correctValue)) {
        fieldErrors.push({
          field: 'answerPayload.correctValue',
          code: 'CLOSEST_CORRECT_VALUE_INVALID',
          message: 'Closest answer requires a finite correctValue',
        });
      }
      const slider = (
        draft.mechanicPayload as
          { closestSlider?: Record<string, unknown> } | undefined
      )?.closestSlider;
      if (!slider || typeof slider !== 'object') {
        fieldErrors.push({
          field: 'mechanicPayload.closestSlider',
          code: 'CLOSEST_SLIDER_REQUIRED',
          message: 'Closest candidate requires mechanicPayload.closestSlider',
        });
      } else {
        const min = slider.min;
        const max = slider.max;
        const step = slider.step;
        if (
          typeof min !== 'number' ||
          typeof max !== 'number' ||
          typeof step !== 'number' ||
          !Number.isFinite(min) ||
          !Number.isFinite(max) ||
          !Number.isFinite(step)
        ) {
          fieldErrors.push({
            field: 'mechanicPayload.closestSlider',
            code: 'CLOSEST_SLIDER_NUMBERS_INVALID',
            message: 'Closest slider min, max, and step must be finite numbers',
          });
        } else {
          if (min >= max) {
            fieldErrors.push({
              field: 'mechanicPayload.closestSlider.max',
              code: 'CLOSEST_SLIDER_RANGE_INVALID',
              message: 'Closest slider min must be strictly less than max',
            });
          }
          if (step <= 0) {
            fieldErrors.push({
              field: 'mechanicPayload.closestSlider.step',
              code: 'CLOSEST_SLIDER_STEP_INVALID',
              message: 'Closest slider step must be greater than 0',
            });
          }
          if (
            min < max &&
            step > 0 &&
            typeof correctValue === 'number' &&
            Number.isFinite(correctValue)
          ) {
            if (correctValue < min || correctValue > max) {
              fieldErrors.push({
                field: 'answerPayload.correctValue',
                code: 'CLOSEST_TARGET_OUTSIDE_RANGE',
                message: `Target value ${correctValue} must be within slider bounds [${min}, ${max}]`,
              });
            } else {
              const stepsFromMin = (correctValue - min) / step;
              if (Math.abs(stepsFromMin - Math.round(stepsFromMin)) > 1e-6) {
                fieldErrors.push({
                  field: 'answerPayload.correctValue',
                  code: 'CLOSEST_TARGET_OFF_STEP_GRID',
                  message: `Target value ${correctValue} is not reachable from min ${min} in steps of ${step}`,
                });
              }
            }
            const positions = Math.round((max - min) / step) + 1;
            if (positions > 2000) {
              fieldErrors.push({
                field: 'mechanicPayload.closestSlider.step',
                code: 'CLOSEST_SLIDER_TOO_MANY_POSITIONS',
                message: 'Closest slider exceeds maximum 2,000 positions',
              });
            }
          }
        }
      }
    } else if (mode === 'match') {
      const acceptedAnswers = Array.isArray(answerPayload?.acceptedAnswers)
        ? (answerPayload.acceptedAnswers as unknown[])
        : [];
      if (acceptedAnswers.length < 1 || acceptedAnswers.length > 10) {
        fieldErrors.push({
          field: 'answerPayload.acceptedAnswers',
          code: 'MATCH_ACCEPTED_ANSWERS_COUNT_INVALID',
          message: 'Match questions require between 1 and 10 accepted answers',
        });
      }
      const seenNormalized = new Set<string>();
      acceptedAnswers.forEach((rawAnswer, index) => {
        const text = typeof rawAnswer === 'string' ? rawAnswer.trim() : '';
        const normalized = normalizeAnswer(text);
        if (!text || !normalized) {
          fieldErrors.push({
            field: `answerPayload.acceptedAnswers[${index}]`,
            code: 'MATCH_ANSWER_EMPTY',
            message: `Accepted answer #${index + 1} must be non-empty after normalization`,
          });
        } else if (seenNormalized.has(normalized)) {
          fieldErrors.push({
            field: `answerPayload.acceptedAnswers[${index}]`,
            code: 'DUPLICATE_NORMALIZED_ACCEPTED_ANSWERS',
            message: `Accepted answer #${index + 1} duplicates another accepted answer after normalization`,
          });
        } else {
          seenNormalized.add(normalized);
        }
      });
    }

    const rawScopeId = String(references.scope._id);
    const rawChallengeId = String(references.challengeType._id);
    const rawDto = {
      ...draft,
      scopeId: /^[a-f\d]{24}$/i.test(rawScopeId)
        ? rawScopeId
        : '507f1f77bcf86cd799439011',
      compatibleChallengeTypeIds: [
        /^[a-f\d]{24}$/i.test(rawChallengeId)
          ? rawChallengeId
          : '507f1f77bcf86cd799439012',
      ],
      status: ContentItemStatus.DRAFT,
    };
    const dtoInstance = plainToInstance(CreateContentItemDto, rawDto);
    const dtoErrors = await validate(dtoInstance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    });

    if (fieldErrors.length > 0 || dtoErrors.length > 0) {
      throw new BadRequestException({
        code: 'CANDIDATE_EDIT_INVALID',
        message:
          fieldErrors[0]?.message ??
          'Candidate edit does not satisfy canonical ContentItem validation',
        fieldErrors,
        errors: dtoErrors,
      });
    }
  }

  private classifyEditChange(
    priorDraft: Record<string, unknown> | null,
    nextDraft: Record<string, unknown>,
    priorClaims: string[],
    nextClaims: string[],
  ): { materialChange: boolean; changedFields: string[] } {
    if (!priorDraft) {
      return { materialChange: true, changedFields: ['draft'] };
    }
    const changedMaterialFields: string[] = [];
    const changedNonMaterialFields: string[] = [];

    for (const key of MATERIAL_DRAFT_KEYS) {
      if (
        canonicalJson(priorDraft[key] ?? null) !==
        canonicalJson(nextDraft[key] ?? null)
      ) {
        changedMaterialFields.push(`draft.${key}`);
      }
    }

    const normalizedPriorClaims = priorClaims
      .map((c) => c.trim())
      .filter(Boolean);
    const normalizedNextClaims = nextClaims
      .map((c) => c.trim())
      .filter(Boolean);
    if (
      canonicalJson(normalizedPriorClaims) !==
      canonicalJson(normalizedNextClaims)
    ) {
      changedMaterialFields.push('factualClaims');
    }

    for (const key of NON_MATERIAL_DRAFT_KEYS) {
      if (
        canonicalJson(priorDraft[key] ?? null) !==
        canonicalJson(nextDraft[key] ?? null)
      ) {
        changedNonMaterialFields.push(`draft.${key}`);
      }
    }

    const allKnownKeys = new Set<string>([
      ...MATERIAL_DRAFT_KEYS,
      ...NON_MATERIAL_DRAFT_KEYS,
    ]);
    for (const key of new Set([
      ...Object.keys(priorDraft),
      ...Object.keys(nextDraft),
    ])) {
      if (!allKnownKeys.has(key)) {
        if (
          canonicalJson(priorDraft[key] ?? null) !==
          canonicalJson(nextDraft[key] ?? null)
        ) {
          changedMaterialFields.push(`draft.${key}`);
        }
      }
    }

    if (changedMaterialFields.length > 0) {
      return {
        materialChange: true,
        changedFields: [...changedMaterialFields, ...changedNonMaterialFields],
      };
    }

    if (changedNonMaterialFields.length > 0) {
      return {
        materialChange: false,
        changedFields: changedNonMaterialFields,
      };
    }

    // If an explicit edit submission kept all fields identical, treat as a
    // full re-save (material) so explicit re-screening/invalidation still runs.
    return {
      materialChange: true,
      changedFields: ['draft'],
    };
  }

  private assertApprovable(
    candidate: EngineCandidateDocument,
    dto: CandidateApprovalDto,
  ) {
    this.assertNotPublished(candidate);
    if (!REVIEWABLE_PIPELINE_STATUSES.includes(candidate.status as never)) {
      throw new ConflictException(
        'Candidate has blocking deterministic findings',
      );
    }
    if (candidate.findings.some((finding) => finding.severity === 'blocking')) {
      throw new ConflictException(
        'Candidate has blocking deterministic findings',
      );
    }
    const compatibility = candidate.compatibilityEvaluation as {
      preDraft?: { blockers?: unknown[] };
    } | null;
    if (compatibility?.preDraft?.blockers?.length) {
      throw new ConflictException(
        'Candidate has canonical compatibility blockers',
      );
    }
    const assessment = candidate.humanAssessment as {
      factualState?: string;
      assessedRevision?: number;
      evidence?: Array<{
        url?: string;
        title?: string;
        note?: string;
        claimIndex?: number;
        claimText?: string;
      }>;
    } | null;
    if (
      !assessment ||
      assessment.assessedRevision !== candidate.reviewRevision
    ) {
      throw new ConflictException(
        'Current candidate revision requires human assessment',
      );
    }

    const autoFactState =
      (candidate.factVerification as { state?: string } | null)?.state ?? null;
    const isAutoContradicted =
      autoFactState === 'CONTRADICTED' || candidate.status === 'fact_blocked';

    const validEvidence = Array.isArray(assessment.evidence)
      ? assessment.evidence.filter(
          (item) => typeof item?.url === 'string' && item.url.trim().length > 0,
        )
      : [];
    const evidenceCount = validEvidence.length;

    if (assessment.factualState === 'SUPPORTED') {
      if (dto.factualOverrideCode) {
        throw new BadRequestException({
          code: 'UNNECESSARY_FACTUAL_OVERRIDE',
          message:
            'factualOverrideCode must not be provided when human assessment factualState is SUPPORTED',
        });
      }
      if (isAutoContradicted) {
        throw new ConflictException(
          'Candidate has contradictory automated factual verification; cannot be approved as SUPPORTED without an exceptional override (ACCEPTED_WITH_EVIDENCE) or correcting the claim via edit',
        );
      }
      return;
    }

    if (!dto.factualOverrideCode || !dto.factualOverrideExplanation?.trim()) {
      throw new ConflictException(
        `${assessment.factualState ?? 'UNRESOLVED'} factual assessment requires explicit resolution`,
      );
    }

    if (isAutoContradicted || assessment.factualState === 'CONTRADICTED') {
      if (dto.factualOverrideCode !== 'ACCEPTED_WITH_EVIDENCE') {
        throw new ConflictException(
          'CONTRADICTED factual assessment can only be resolved with ACCEPTED_WITH_EVIDENCE or by editing the candidate and re-assessing',
        );
      }
      if (dto.factualOverrideExplanation.trim().length < 15) {
        throw new BadRequestException({
          code: 'FACTUAL_OVERRIDE_EXPLANATION_INSUFFICIENT',
          message:
            'factualOverrideExplanation must be meaningful (at least 15 characters)',
        });
      }
      if (evidenceCount === 0) {
        throw new ConflictException(
          'ACCEPTED_WITH_EVIDENCE requires at least one recorded evidence URL in the human assessment',
        );
      }
      const claimAssociatedEvidence = validEvidence.filter((item) => {
        const hasExplanation =
          `${item.title ?? ''} ${item.note ?? ''}`.trim().length >= 10;
        const hasClaimRef =
          item.claimIndex !== undefined || Boolean(item.claimText?.trim());
        return hasExplanation && hasClaimRef;
      });
      if (claimAssociatedEvidence.length === 0) {
        throw new ConflictException({
          code: 'CONTRADICTION_OVERRIDE_EVIDENCE_INSUFFICIENT',
          message:
            'ACCEPTED_WITH_EVIDENCE for contradicted claims requires at least one claim-associated evidence source with an explanatory title or note',
        });
      }
      return;
    }

    if (
      dto.factualOverrideCode === 'ACCEPTED_WITH_EVIDENCE' &&
      evidenceCount === 0
    ) {
      throw new ConflictException(
        'ACCEPTED_WITH_EVIDENCE requires at least one recorded evidence URL in the human assessment',
      );
    }

    if (dto.factualOverrideCode === 'CLAIM_CORRECTED') {
      const hasEditEvent = (candidate.reviewEvents ?? []).some(
        (event) => event.action === 'edited',
      );
      if (!hasEditEvent) {
        throw new ConflictException(
          'CLAIM_CORRECTED override requires a recorded human edit on the candidate',
        );
      }
    }
  }

  private async assertCanonicalCompatibilityForApproval(
    candidate: EngineCandidateDocument,
  ): Promise<Record<string, unknown> | null> {
    if (!candidate.draft) {
      throw new ConflictException('Candidate has no draft payload');
    }
    const refs = await this.references(candidate.jobId, candidate);
    this.assertTargetNotRetargeted(candidate.draft, refs);
    const liveCompatibility = this.compatibility.evaluate({
      mechanicKey: refs.job.mechanicKey,
      draft: this.stripTargetFields(candidate.draft),
      references: refs.compatibility,
    });
    if (liveCompatibility.preDraft.blockers.length > 0) {
      throw new ConflictException({
        code: 'CANDIDATE_COMPATIBILITY_BLOCKED',
        message: 'Candidate has canonical compatibility blockers',
        blockers: liveCompatibility.preDraft.blockers,
      });
    }
    return liveCompatibility as unknown as Record<string, unknown>;
  }

  private assertDraftCreationSafety(candidate: EngineCandidateDocument) {
    if (!REVIEWABLE_PIPELINE_STATUSES.includes(candidate.status as never)) {
      throw new ConflictException(
        'Candidate has blocking deterministic findings and cannot create a draft',
      );
    }
    if (
      candidate.findings?.some((finding) => finding.severity === 'blocking')
    ) {
      throw new ConflictException(
        'Candidate has blocking deterministic findings and cannot create a draft',
      );
    }
    const assessment = candidate.humanAssessment as {
      factualState?: string;
      assessedRevision?: number;
      evidence?: Array<{
        url?: string;
        title?: string;
        note?: string;
        claimIndex?: number;
        claimText?: string;
      }>;
    } | null;
    const decision = candidate.reviewDecision as {
      decision?: string;
      revision?: number;
      factualOverrideCode?: FactualOverrideCode | null;
      factualOverrideExplanation?: string | null;
      exceptionalOverride?: boolean;
    } | null;

    if (!decision) {
      throw new ConflictException(
        'Candidate must be approved by a human reviewer',
      );
    }
    if (
      decision.decision !== 'approved' ||
      (typeof decision.revision === 'number' &&
        decision.revision !== candidate.reviewRevision)
    ) {
      throw new ConflictException(
        'Candidate approval decision is stale for the current revision',
      );
    }

    if (!assessment) {
      throw new ConflictException(
        'Candidate requires human assessment before draft creation',
      );
    }
    if (
      typeof assessment.assessedRevision === 'number' &&
      assessment.assessedRevision > candidate.reviewRevision
    ) {
      throw new ConflictException(
        'Candidate human assessment revision is inconsistent with the current revision',
      );
    }

    const autoFactState =
      (candidate.factVerification as { state?: string } | null)?.state ?? null;
    const isAutoContradicted =
      autoFactState === 'CONTRADICTED' || candidate.status === 'fact_blocked';

    const validEvidence = Array.isArray(assessment.evidence)
      ? assessment.evidence.filter(
          (item) => typeof item?.url === 'string' && item.url.trim().length > 0,
        )
      : [];
    const evidenceCount = validEvidence.length;

    if (
      (assessment.factualState && assessment.factualState !== 'SUPPORTED') ||
      isAutoContradicted
    ) {
      if (
        !decision.factualOverrideCode ||
        !decision.factualOverrideExplanation?.trim()
      ) {
        throw new ConflictException(
          'Candidate with non-SUPPORTED or contradicted factual state cannot create a draft without an explicit override decision',
        );
      }
      if (
        (assessment.factualState === 'CONTRADICTED' ||
          isAutoContradicted ||
          decision.factualOverrideCode === 'ACCEPTED_WITH_EVIDENCE') &&
        evidenceCount === 0
      ) {
        throw new ConflictException(
          'Candidate approved under ACCEPTED_WITH_EVIDENCE or CONTRADICTED state requires recorded human evidence before draft creation',
        );
      }
      if (isAutoContradicted || assessment.factualState === 'CONTRADICTED') {
        const hasClaimEvidence = validEvidence.some((item) => {
          const hasExplanation =
            `${item.title ?? ''} ${item.note ?? ''}`.trim().length >= 10;
          const hasClaimRef =
            item.claimIndex !== undefined || Boolean(item.claimText?.trim());
          return hasExplanation && hasClaimRef;
        });
        if (!hasClaimEvidence) {
          throw new ConflictException(
            'Contradicted candidate requires claim-associated evidence with explanatory note before draft creation',
          );
        }
      }
    }
  }

  private assertNotPublished(candidate: EngineCandidateDocument) {
    if (candidate.publishedContentItemId) {
      throw new ConflictException(
        'Candidate already created a canonical draft',
      );
    }
  }

  private async requireCandidate(candidateId: string) {
    const candidate = await this.candidates
      .findOne({ candidateId })
      .lean()
      .exec();
    if (!candidate)
      throw new NotFoundException('Content Engine candidate not found');
    return candidate;
  }

  private async throwCas(
    candidateId: string,
    expectedRevision: number,
  ): Promise<never> {
    const current = await this.candidates
      .findOne({ candidateId })
      .lean()
      .exec();
    if (!current)
      throw new NotFoundException('Content Engine candidate not found');
    throw new ConflictException({
      message: 'Candidate changed; reload before reviewing',
      expectedRevision,
      currentRevision: current.reviewRevision,
    });
  }

  private event(
    action: CandidateReviewEvent['action'],
    actor: AuthenticatedUser,
    revision: number,
    fields: Partial<CandidateReviewEvent> = {},
  ): CandidateReviewEvent {
    return {
      action,
      actorId: actor.id,
      actorEmail: actor.email,
      occurredAt: new Date(),
      revision,
      reasonCode: fields.reasonCode ?? null,
      explanation: fields.explanation ?? null,
      details: fields.details ?? null,
    };
  }

  private publicationResult(
    publication: Pick<EngineDraftPublicationDocument, 'contentItemId'>,
    alreadyCreated: boolean,
  ) {
    return {
      contentItemId: publication.contentItemId,
      status: ContentItemStatus.DRAFT,
      alreadyCreated,
    };
  }

  private computeReviewEligibility(
    candidate: PresentableCandidate,
    targetResolutionError: string | null = null,
  ) {
    const reviewRevision = candidate.reviewRevision ?? 0;
    const reviewStatus = candidate.reviewStatus ?? 'pending';
    const published = Boolean(candidate.publishedContentItemId);
    const hasBlockingFindings = Boolean(
      !REVIEWABLE_PIPELINE_STATUSES.includes(
        (candidate.status ?? '') as never,
      ) ||
      candidate.findings?.some((finding) => finding.severity === 'blocking'),
    );
    const compatibilityBlockers =
      (
        candidate.compatibilityEvaluation as {
          preDraft?: {
            blockers?: Array<{ code?: string; message?: string }>;
          };
        } | null
      )?.preDraft?.blockers ?? [];

    const assessment = candidate.humanAssessment as {
      factualState?: string;
      assessedRevision?: number;
      evidence?: Array<{
        url?: string;
        title?: string;
        note?: string;
        claimIndex?: number;
        claimText?: string;
      }>;
    } | null;
    const assessedRevision =
      typeof assessment?.assessedRevision === 'number'
        ? assessment.assessedRevision
        : null;
    const assessmentCurrent =
      Boolean(assessment) &&
      (assessedRevision === reviewRevision ||
        (reviewStatus === 'approved' &&
          assessedRevision !== null &&
          assessedRevision <= reviewRevision));
    const assessmentStale =
      (Boolean(assessment) && !assessmentCurrent) ||
      (!assessment && Boolean(candidate.lastInvalidatedAssessments));

    const validEvidence = Array.isArray(assessment?.evidence)
      ? assessment.evidence.filter(
          (item) => typeof item?.url === 'string' && item.url.trim().length > 0,
        )
      : [];
    const evidenceCount = validEvidence.length;
    const hasClaimAssociatedEvidence = validEvidence.some(
      (item) =>
        (item.claimIndex !== undefined || Boolean(item.claimText?.trim())) &&
        `${item.title ?? ''} ${item.note ?? ''}`.trim().length >= 10,
    );
    const hasEditEvent = (candidate.reviewEvents ?? []).some(
      (event) => event.action === 'edited',
    );
    const factualState = assessment?.factualState ?? null;
    const autoFactState =
      (candidate.factVerification as { state?: string } | null)?.state ?? null;
    const isAutoContradicted =
      autoFactState === 'CONTRADICTED' || candidate.status === 'fact_blocked';

    const requiresFactualOverride =
      Boolean(assessmentCurrent) &&
      factualState !== null &&
      factualState !== 'SUPPORTED';

    const allowedFactualOverrideCodes: FactualOverrideCode[] = [];
    if (requiresFactualOverride) {
      if (factualState === 'CONTRADICTED' || isAutoContradicted) {
        if (evidenceCount > 0 && hasClaimAssociatedEvidence) {
          allowedFactualOverrideCodes.push('ACCEPTED_WITH_EVIDENCE');
        }
      } else {
        if (evidenceCount > 0) {
          allowedFactualOverrideCodes.push('ACCEPTED_WITH_EVIDENCE');
        }
        allowedFactualOverrideCodes.push('CLAIM_NOT_ANSWER_CRITICAL');
        if (hasEditEvent) {
          allowedFactualOverrideCodes.push('CLAIM_CORRECTED');
        }
      }
    }

    const approvalBlockers: string[] = [];
    if (published) {
      approvalBlockers.push('تم إنشاء المسودة القانونية لهذا المرشح مسبقًا.');
    }
    if (targetResolutionError) {
      approvalBlockers.push(
        `تعذر التحقق من الهدف القانوني (العالم/النطاق/الميكانيكا): ${targetResolutionError}`,
      );
    }
    if (hasBlockingFindings) {
      approvalBlockers.push(
        'يحتوي المرشح على ملاحظات فحص آلي مانعة (Blocking Findings)؛ يجب تعديله أولاً.',
      );
    }
    if (compatibilityBlockers.length > 0) {
      approvalBlockers.push(
        'يوجد تعارض في التوافق مع المحتوى القانوني (Compatibility Blockers).',
      );
    }
    if (!assessment) {
      approvalBlockers.push(
        assessmentStale
          ? 'تم إبطال التقييم السابق بعد تعديل جوهري؛ يجب حفظ تقييم بشري جديد للنسخة الحالية.'
          : 'يجب حفظ التقييم البشري (الحقائق والجودة) للنسخة الحالية قبل الاعتماد.',
      );
    } else if (assessedRevision !== reviewRevision) {
      approvalBlockers.push(
        'التقييم البشري الحالي لا يطابق رقم المراجعة الحالية؛ يلزم إعادة التقييم.',
      );
    } else if (
      (factualState === 'CONTRADICTED' || isAutoContradicted) &&
      !hasClaimAssociatedEvidence
    ) {
      approvalBlockers.push(
        'الحالة المتناقضة (CONTRADICTED) تتطلب إرفاق دليل مرتبط بالمعلومة مع ملاحظة توضيحية (10 أحرف على الأقل) أو تعديل المرشح.',
      );
    } else if (factualState === 'SUPPORTED' && isAutoContradicted) {
      approvalBlockers.push(
        'التحقق الآلي وجد تناقضًا مع المصادر (CONTRADICTED)؛ لا يمكن اعتماد المرشح كـ SUPPORTED مباشرة. يلزم تعديل المرشح لتصحيح المعلومة أو اعتماد تجاوز استثنائي مبني على دليل (ACCEPTED_WITH_EVIDENCE).',
      );
    }

    const canApprove =
      !published &&
      reviewStatus !== 'approved' &&
      approvalBlockers.length === 0;
    const canCreateDraft =
      !published &&
      reviewStatus === 'approved' &&
      !targetResolutionError &&
      !hasBlockingFindings &&
      compatibilityBlockers.length === 0;

    return {
      assessmentCurrent,
      assessmentStale,
      evidenceCount,
      requiresFactualOverride,
      allowedFactualOverrideCodes,
      canApprove,
      canCreateDraft,
      approvalBlockers,
    };
  }

  private present(
    candidate: PresentableCandidate,
    job?: PresentableJob,
    targetResolutionError: string | null = null,
  ) {
    return {
      ...candidate,
      id: String(candidate._id),
      _id: undefined,
      reviewRevision: candidate.reviewRevision ?? 0,
      reviewStatus: candidate.reviewStatus ?? 'pending',
      lastInvalidatedAssessments: candidate.lastInvalidatedAssessments ?? null,
      reviewEligibility: this.computeReviewEligibility(
        candidate,
        targetResolutionError,
      ),
      job: job
        ? {
            id: String(job._id),
            mechanicKey: job.mechanicKey,
            worldKey: job.worldKey,
            scopeKey: job.scopeKey,
            status: job.status,
            specVersion: job.specVersion ?? null,
          }
        : null,
    };
  }
}
