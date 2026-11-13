import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticatedUser } from '../../auth/auth.types';
import { MediaRightsService } from '../../media-rights/application/media-rights.service';
import {
  acknowledgeMediaRights,
  CandidateMediaEvent,
  CandidateMediaRights,
  CandidateMediaSlot,
  CandidateMediaTransitionError,
  recordMediaReview,
  replaceMediaSlotAsset,
  withLiveRights,
} from '../domain/candidate-media-plan';
import {
  MediaSlotRequirement,
  resolveMediaRequirements,
} from '../domain/media-requirements';
import { EngineImageIngestionService } from '../infrastructure/engine-image-ingestion.service';
import { EngineCandidateDocument } from '../schemas/engine-candidate.schema';
import { EngineJobDocument } from '../schemas/engine-job.schema';
import {
  CandidateMediaAttachDto,
  CandidateMediaReviewDto,
  CandidateMediaRightsAcknowledgementDto,
} from '../presentation/content-engine-review.dto';
import { ContentEngineReviewService } from './content-engine-review.service';

export interface UploadedCandidateMediaFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const SLOT_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Failure reasons that mean the bytes were bad, not that storage was. */
const STORAGE_FAILURES = new Set([
  'STORAGE_NOT_DURABLE',
  'STORAGE_LOCAL_WRITE_FAILED',
  'STORAGE_MIRROR_WRITE_FAILED',
]);

/**
 * Admin media actions on an Engine candidate (roadmap §30.22, Phase 3A).
 *
 * Every action:
 * - targets a slot the media-requirements registry declares for the
 *   candidate's own job target — never a slot the caller invents;
 * - is refused once the candidate is text-approved, rejected or published
 *   (approval already required ready media, and the approved content includes
 *   it; to change media after approval, a text edit first voids the approval);
 * - is CAS'd on `mediaReviewRevision`, and touches only media fields — never
 *   `reviewRevision`, `humanAssessment`, `reviewDecision` or `reviewEvents`.
 *
 * Attaching stores verified bytes through the canonical ingestion and storage
 * services. No URL is ever taken from the client.
 */
@Injectable()
export class CandidateMediaReviewService {
  constructor(
    @InjectModel(EngineCandidateDocument.name)
    private readonly candidates: Model<EngineCandidateDocument>,
    @InjectModel(EngineJobDocument.name)
    private readonly jobs: Model<EngineJobDocument>,
    private readonly ingestion: EngineImageIngestionService,
    private readonly review: ContentEngineReviewService,
    @Optional() private readonly mediaRights?: MediaRightsService,
  ) {}

  async attachUpload(
    candidateId: string,
    slotKey: string,
    dto: CandidateMediaAttachDto,
    file: UploadedCandidateMediaFile | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: 'MEDIA_ASSET_REQUIRED',
        message: 'An image file is required',
      });
    }
    const { candidate, requirement } = await this.target(candidateId, slotKey);
    if (requirement.uploadUnsupportedReason) {
      throw new BadRequestException({
        code: 'MEDIA_SLOT_UPLOAD_UNSUPPORTED',
        message: `Slot "${slotKey}" cannot be filled by upload yet (${requirement.uploadUnsupportedReason})`,
        reason: requirement.uploadUnsupportedReason,
      });
    }
    if (requirement.mediaType !== 'image') {
      throw new BadRequestException({
        code: 'MEDIA_TYPE_NOT_SUPPORTED',
        message: `Slot "${slotKey}" takes ${requirement.mediaType}; only image upload is supported`,
      });
    }
    if (!requirement.acquisition.includes('upload')) {
      throw new BadRequestException({
        code: 'MEDIA_ACQUISITION_NOT_ALLOWED',
        message: `Slot "${slotKey}" does not accept an uploaded asset`,
      });
    }
    this.assertExpectedRevision(candidate, dto.expectedMediaReviewRevision);

    // Bytes are verified and stored (content-addressed, mirrored) before any
    // candidate write. If the write then loses a race, the stored file is a
    // harmless shared object that a retry reuses.
    const ingested = await this.ingestion.ingestBytes({
      bytes: file.buffer,
      acquisition: 'upload',
      provenance: { provider: 'admin-upload' },
    });
    if (ingested.status !== 'resolved') {
      const body = {
        code: ingested.failureReason,
        message: ingested.detail,
      };
      if (STORAGE_FAILURES.has(ingested.failureReason)) {
        throw new ServiceUnavailableException(body);
      }
      throw new UnprocessableEntityException(body);
    }

    const rights = await this.liveRights(ingested.asset.url, ingested.rights);
    const next = this.transition(() =>
      replaceMediaSlotAsset(this.state(candidate), {
        requirement,
        expectedMediaReviewRevision: dto.expectedMediaReviewRevision,
        asset: ingested.asset,
        provenance: { ...ingested.provenance, actorId: actor.id },
        rights,
      }),
    );
    const event = this.event('media_attached', [slotKey], actor, candidate, {
      mediaReviewRevision: next.mediaReviewRevision,
      details: {
        asset: ingested.asset,
        storage: ingested.storage,
        rightsStatus: rights.status,
        // What the replacement withdrew, so the history explains why an
        // earlier approval or acknowledgment no longer counts.
        superseded: next.previous
          ? {
              assetUrl: next.previous.asset?.url ?? null,
              reviewStatus: next.previous.review?.status ?? null,
              rightsAcknowledged: Boolean(next.previous.rightsAcknowledgement),
            }
          : null,
      },
    });
    await this.write(candidate, {
      textRevisionMustMatch: true,
      set: {
        mediaPlan: next.mediaPlan,
        mediaReviewRevision: next.mediaReviewRevision,
        // The draft field the gate checks; only ever written from a stored
        // asset, and in exactly the canonical `ContentAssetDto` shape, which
        // draft creation validates with `forbidNonWhitelisted`. Type and
        // dimensions stay on the slot's asset record.
        [`draft.${requirement.targetPath}`]: {
          type: requirement.mediaType,
          assets: [{ url: ingested.asset.url }],
        },
      },
      event,
    });
    return this.review.detail(candidateId);
  }

  async recordReview(
    candidateId: string,
    slotKey: string,
    dto: CandidateMediaReviewDto,
    actor: AuthenticatedUser,
  ) {
    const { candidate } = await this.target(candidateId, slotKey);
    this.assertExpectedRevision(candidate, dto.expectedMediaReviewRevision);
    const next = this.transition(() =>
      recordMediaReview(this.state(candidate), {
        slotKey,
        expectedMediaReviewRevision: dto.expectedMediaReviewRevision,
        status: dto.status,
        reasonCode: dto.reasonCode ?? null,
        explanation: dto.explanation ?? null,
        actorId: actor.id,
        actorEmail: actor.email,
        at: new Date(),
      }),
    );
    const decided = next.mediaPlan.find((slot) => slot.slotKey === slotKey);
    await this.write(candidate, {
      set: {
        mediaPlan: next.mediaPlan,
        mediaReviewRevision: next.mediaReviewRevision,
      },
      event: this.event('media_reviewed', [slotKey], actor, candidate, {
        mediaReviewRevision: next.mediaReviewRevision,
        details: {
          status: dto.status,
          assetUrl: decided?.review?.assetUrl ?? null,
          reasonCode: dto.reasonCode ?? null,
          explanation: dto.explanation ?? null,
        },
      }),
    });
    return this.review.detail(candidateId);
  }

  async acknowledgeRights(
    candidateId: string,
    slotKey: string,
    dto: CandidateMediaRightsAcknowledgementDto,
    actor: AuthenticatedUser,
  ) {
    // Rights can change after text approval (a record turns PENDING or
    // EXPIRED). Acknowledging is the one media action still allowed then: it
    // records a decision about the approved asset as-is and touches no draft
    // field, so the approval, its content hash and the text assessment hold.
    const { candidate } = await this.target(candidateId, slotKey, {
      rightsOnly: true,
    });
    const afterApproval = candidate.reviewStatus === 'approved';
    this.assertExpectedRevision(candidate, dto.expectedMediaReviewRevision);
    // The acknowledgment binds to the rights status as it is *now*, read from
    // the authoritative record, not to a snapshot taken at attachment.
    const state = await this.stateWithLiveRights(candidate);
    const next = this.transition(() =>
      acknowledgeMediaRights(state, {
        slotKey,
        expectedMediaReviewRevision: dto.expectedMediaReviewRevision,
        note: dto.note,
        actorId: actor.id,
        actorEmail: actor.email,
        at: new Date(),
      }),
    );
    const acknowledged = next.mediaPlan.find(
      (slot) => slot.slotKey === slotKey,
    )?.rightsAcknowledgement;
    await this.write(candidate, {
      set: {
        mediaPlan: next.mediaPlan,
        mediaReviewRevision: next.mediaReviewRevision,
      },
      allowApproved: afterApproval,
      event: this.event(
        'media_rights_acknowledged',
        [slotKey],
        actor,
        candidate,
        {
          mediaReviewRevision: next.mediaReviewRevision,
          details: {
            assetUrl: acknowledged?.assetUrl ?? null,
            rightsStatus: acknowledged?.rightsStatus ?? null,
            note: acknowledged?.note ?? null,
            afterApproval,
          },
        },
      ),
    });
    return this.review.detail(candidateId);
  }

  /**
   * Loads the candidate and resolves the slot against the registry for the
   * candidate's job target, refusing anything outside the contract and any
   * candidate whose text decision has closed media editing.
   */
  private async target(
    candidateId: string,
    slotKey: string,
    options: { rightsOnly?: boolean } = {},
  ): Promise<{
    candidate: EngineCandidateDocument;
    requirement: MediaSlotRequirement;
  }> {
    if (!SLOT_KEY.test(slotKey ?? '')) {
      throw new BadRequestException({
        code: 'MEDIA_SLOT_INVALID',
        message: 'Slot key is malformed',
      });
    }
    const candidate = await this.candidates
      .findOne({ candidateId })
      .lean()
      .exec();
    if (!candidate) {
      throw new NotFoundException('Content Engine candidate not found');
    }
    const job = await this.jobs.findById(candidate.jobId).lean().exec();
    if (!job) {
      throw new ConflictException({
        code: 'CANDIDATE_JOB_MISSING',
        message: 'Candidate job is missing; media cannot be resolved',
      });
    }
    const requirement = resolveMediaRequirements({
      mechanicKey: job.mechanicKey,
      scopeKey: job.scopeKey,
    }).find((slot) => slot.slotKey === slotKey);
    if (!requirement) {
      throw new BadRequestException({
        code: 'MEDIA_SLOT_NOT_REGISTERED',
        message: `Slot "${slotKey}" is not part of the media contract for ${job.mechanicKey}/${job.scopeKey}`,
      });
    }
    if (candidate.publishedContentItemId) {
      throw new ConflictException({
        code: 'MEDIA_LOCKED',
        message: 'Candidate already created a canonical draft',
      });
    }
    if (candidate.reviewStatus === 'approved' && !options.rightsOnly) {
      throw new ConflictException({
        code: 'MEDIA_LOCKED',
        message:
          'Media is fixed once the candidate is approved; edit the candidate to void the approval before changing media',
      });
    }
    if (candidate.reviewStatus === 'rejected') {
      throw new ConflictException({
        code: 'MEDIA_LOCKED',
        message: 'Rejected candidates do not take media changes',
      });
    }
    return { candidate, requirement };
  }

  private assertExpectedRevision(
    candidate: EngineCandidateDocument,
    expected: number,
  ) {
    if ((candidate.mediaReviewRevision ?? 0) !== expected) {
      throw new ConflictException({
        code: 'MEDIA_REVISION_CONFLICT',
        message: 'Candidate media changed; reload before acting',
        currentMediaReviewRevision: candidate.mediaReviewRevision ?? 0,
      });
    }
  }

  private state(candidate: EngineCandidateDocument) {
    return {
      mediaPlan: (candidate.mediaPlan ?? []) as unknown as CandidateMediaSlot[],
      mediaReviewRevision: candidate.mediaReviewRevision ?? 0,
    };
  }

  private async stateWithLiveRights(candidate: EngineCandidateDocument) {
    const state = this.state(candidate);
    if (!this.mediaRights) return state;
    const urls = state.mediaPlan
      .map((slot) => slot.asset?.url?.trim())
      .filter((url): url is string => Boolean(url));
    if (!urls.length) return state;
    const now = new Date();
    const statuses = await this.mediaRights.statusForMany(urls, now);
    return {
      ...state,
      mediaPlan: withLiveRights(
        state.mediaPlan,
        // Only an existing record overrides the stored observation.
        new Map(
          statuses
            .filter((status) => status.recordExists)
            .map((status) => [
              status.assetUrl,
              {
                status: status.assetRights,
                licence: status.licence,
                rightsHolder: status.rightsHolder,
              },
            ]),
        ),
        now,
      ),
    };
  }

  private async liveRights(
    url: string,
    fallback: CandidateMediaRights,
  ): Promise<CandidateMediaRights> {
    if (!this.mediaRights) return fallback;
    const now = new Date();
    const status = await this.mediaRights.statusFor(url, now);
    // No record means nothing is known; keep the ingestion's own observation.
    if (!status.recordExists) return fallback;
    return {
      status: status.assetRights,
      source: 'media-rights',
      licence: status.licence,
      rightsHolder: status.rightsHolder,
      observedAt: now.toISOString(),
    };
  }

  private transition<T>(run: () => T): T {
    try {
      return run();
    } catch (error) {
      if (!(error instanceof CandidateMediaTransitionError)) throw error;
      const body = { code: error.code, message: error.message };
      if (error.code === 'MEDIA_REVISION_CONFLICT') {
        throw new ConflictException(body);
      }
      if (error.code === 'MEDIA_RIGHTS_BLOCKED') {
        throw new ConflictException(body);
      }
      throw new BadRequestException(body);
    }
  }

  private event(
    action: CandidateMediaEvent['action'],
    slotKeys: string[],
    actor: AuthenticatedUser,
    candidate: EngineCandidateDocument,
    input: { mediaReviewRevision: number; details: Record<string, unknown> },
  ): CandidateMediaEvent {
    return {
      action,
      slotKeys,
      actorId: actor.id,
      actorEmail: actor.email,
      occurredAt: new Date(),
      mediaReviewRevision: input.mediaReviewRevision,
      reviewRevision: candidate.reviewRevision ?? 0,
      details: input.details,
    };
  }

  /**
   * One conditional write. It matches only if the media revision is still
   * the one the action was computed from and the candidate is still open; an
   * attach also requires the text revision to be unchanged, because it writes
   * into the draft that a text edit replaces whole.
   */
  private async write(
    candidate: EngineCandidateDocument,
    input: {
      set: Record<string, unknown>;
      event: CandidateMediaEvent;
      textRevisionMustMatch?: boolean;
      /**
       * Rights acknowledgment on an approved, unpublished candidate. It must
       * still be approved at the same text revision when the write lands, so
       * an edit that voided the approval in between turns this into a 409.
       */
      allowApproved?: boolean;
    },
  ): Promise<void> {
    const revision = candidate.mediaReviewRevision ?? 0;
    const result = await this.candidates
      .updateOne(
        {
          candidateId: candidate.candidateId,
          publishedContentItemId: null,
          ...(input.allowApproved
            ? {
                reviewStatus: 'approved',
                reviewRevision: candidate.reviewRevision ?? 0,
              }
            : { reviewStatus: { $nin: ['approved', 'rejected'] } }),
          mediaReviewRevision: revision === 0 ? { $in: [0, null] } : revision,
          ...(input.textRevisionMustMatch
            ? { reviewRevision: candidate.reviewRevision ?? 0 }
            : {}),
        },
        { $set: input.set, $push: { mediaEvents: input.event } },
      )
      .exec();
    if (result.matchedCount !== 1) {
      throw new ConflictException({
        code: 'MEDIA_REVISION_CONFLICT',
        message:
          'Candidate changed while the media action ran; reload and retry',
      });
    }
  }
}
