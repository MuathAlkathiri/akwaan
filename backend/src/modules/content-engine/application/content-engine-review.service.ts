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
import { CandidateCompatibilityService } from './candidate-compatibility.service';
import { DeterministicScreenService } from './deterministic-screen.service';

const REVIEWABLE_PIPELINE_STATUSES = [
  'awaiting_review',
  'fact_blocked',
  'screened_pass',
] as const;

type PresentableCandidate = object & {
  _id?: unknown;
  jobId: string;
  reviewRevision?: number;
  reviewStatus?: string;
};

type PresentableJob = object & {
  _id?: unknown;
  mechanicKey: string;
  worldKey: string;
  scopeKey: string;
  status: string;
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
    let canonicalTarget: Record<string, string> | null = null;
    try {
      const refs = await this.references(candidate.jobId);
      canonicalTarget = {
        worldId: String(refs.scope.worldId),
        scopeId: String(refs.scope._id),
        challengeTypeId: String(refs.challengeType._id),
      };
    } catch {
      // Missing canonical references are rendered as an explicit null target;
      // canonical creation still fails closed with the precise error.
    }
    return { ...this.present(candidate, job ?? undefined), canonicalTarget };
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
    const references = await this.references(current.jobId);
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
    const screened = this.screen.screen(dto.draft, retainedAuthoring);
    const compatibility = this.compatibility.evaluate({
      mechanicKey: references.job.mechanicKey,
      draft: dto.draft,
      references: references.compatibility,
    });
    const nextRevision = dto.expectedRevision + 1;
    const updated = await this.candidates
      .findOneAndUpdate(
        {
          candidateId,
          reviewRevision: dto.expectedRevision,
          publishedContentItemId: null,
        },
        {
          $set: {
            draft: dto.draft,
            authoring: retainedAuthoring,
            factualClaims: dto.factualClaims
              .map((claim) => claim.trim())
              .filter(Boolean),
            findings: screened.findings,
            compatibilityEvaluation: compatibility,
            status: screened.passed ? 'awaiting_review' : 'screened_reject',
            factVerification: null,
            qualityEvaluation: null,
            humanAssessment: null,
            reviewStatus: 'pending',
            reviewDecision: null,
          },
          $inc: { reviewRevision: 1 },
          $push: {
            reviewEvents: this.event('edited', actor, nextRevision, {
              explanation: dto.explanation,
              details: { assessmentsInvalidated: true },
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

  async assess(
    candidateId: string,
    dto: CandidateAssessmentDto,
    actor: AuthenticatedUser,
  ) {
    const current = await this.requireCandidate(candidateId);
    this.assertNotPublished(current);
    const nextRevision = dto.expectedRevision + 1;
    const assessment = {
      factualState: dto.factualState,
      factualExplanation: dto.factualExplanation,
      evidence: dto.evidence,
      quality: dto.quality,
      assessedRevision: nextRevision,
      reviewerId: actor.id,
      reviewerEmail: actor.email,
      assessedAt: new Date(),
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
            humanAssessment: assessment,
            reviewStatus: 'pending',
            reviewDecision: null,
          },
          $inc: { reviewRevision: 1 },
          $push: {
            reviewEvents: this.event('assessed', actor, nextRevision, {
              explanation: dto.factualExplanation,
              details: { factualState: dto.factualState, quality: dto.quality },
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
    this.assertApprovable(current, dto);
    const nextRevision = dto.expectedRevision + 1;
    const decision = {
      decision: 'approved',
      explanation: dto.explanation,
      factualOverrideCode: dto.factualOverrideCode ?? null,
      factualOverrideExplanation: dto.factualOverrideExplanation ?? null,
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
          $set: { reviewStatus: 'approved', reviewDecision: decision },
          $inc: { reviewRevision: 1 },
          $push: {
            reviewEvents: this.event('approved', actor, nextRevision, {
              explanation: dto.explanation,
              details: {
                factualOverrideCode: dto.factualOverrideCode ?? null,
                factualOverrideExplanation:
                  dto.factualOverrideExplanation ?? null,
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
    const nextRevision = dto.expectedRevision + 1;
    const decision = {
      decision: 'rejected',
      reasonCode: dto.reasonCode,
      explanation: dto.explanation,
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
              explanation: dto.explanation,
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
    const refs = await this.references(candidate.jobId);
    const raw = {
      ...candidate.draft,
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
      draft: candidate.draft,
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

  private async references(jobId: string) {
    const job = await this.jobs.findById(jobId).lean().exec();
    if (!job) throw new NotFoundException('Content Engine job not found');
    const world = await this.worlds.findBySlug(job.worldKey);
    if (!world)
      throw new BadRequestException(`World "${job.worldKey}" does not exist`);
    const scope = await this.scopes.findBySlugInWorld(
      String(world._id),
      job.scopeKey,
    );
    if (!scope)
      throw new BadRequestException(
        `Scope "${job.scopeKey}" does not exist in the job World`,
      );
    const challengeType = await this.challengeTypes.findBySlug(job.mechanicKey);
    if (!challengeType)
      throw new BadRequestException(
        `ChallengeType "${job.mechanicKey}" does not exist`,
      );
    return {
      job,
      scope,
      challengeType,
      compatibility: {
        scope: toScopeView(scope),
        worldStatus: world.status,
        challengeType: toChallengeTypeView(challengeType),
      },
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
    } | null;
    if (
      !assessment ||
      assessment.assessedRevision !== candidate.reviewRevision
    ) {
      throw new ConflictException(
        'Current candidate revision requires human assessment',
      );
    }
    if (assessment.factualState !== 'SUPPORTED') {
      if (!dto.factualOverrideCode || !dto.factualOverrideExplanation?.trim()) {
        throw new ConflictException(
          `${assessment.factualState ?? 'UNRESOLVED'} factual assessment requires explicit resolution`,
        );
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

  private present(candidate: PresentableCandidate, job?: PresentableJob) {
    return {
      ...candidate,
      id: String(candidate._id),
      _id: undefined,
      reviewRevision: candidate.reviewRevision ?? 0,
      reviewStatus: candidate.reviewStatus ?? 'pending',
      job: job
        ? {
            id: String(job._id),
            mechanicKey: job.mechanicKey,
            worldKey: job.worldKey,
            scopeKey: job.scopeKey,
            status: job.status,
          }
        : null,
    };
  }
}
