import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import type {
  DeletionParticipantContext,
  DeletionParticipantImpact,
  WorldContentDeletionParticipant,
} from '../../world-content/application/permanent-deletion/world-content-deletion.types';
import { WorldContentReferenceRegistry } from '../../world-content/application/world-content-reference.registry';
import { TERMINAL_JOB_STATUSES } from '../domain/content-engine.constants';
import { EngineCandidateDocument } from '../schemas/engine-candidate.schema';
import { EngineDraftPublicationDocument } from '../schemas/engine-draft-publication.schema';
import { EngineInventoryFence } from '../schemas/engine-inventory-fence.schema';
import { EngineJobDocument } from '../schemas/engine-job.schema';

/**
 * The content engine in a permanent deletion.
 *
 * Engine records are provenance and spending history, so they are reported and
 * never deleted. A job still generating for the target blocks: it would try to
 * publish into a World, Scope or mechanic that no longer exists. Deleting a
 * Scope or World bumps the engine's own Scope fences inside the deletion
 * transaction, so an approval or publication in flight for that Scope and the
 * deletion serialise instead of passing each other.
 */
@Injectable()
export class ContentEngineDeletionParticipant
  implements WorldContentDeletionParticipant, OnModuleInit
{
  readonly source = 'content-engine';

  constructor(
    @InjectModel(EngineJobDocument.name)
    private readonly jobs: Model<EngineJobDocument>,
    @InjectModel(EngineCandidateDocument.name)
    private readonly candidates: Model<EngineCandidateDocument>,
    @InjectModel(EngineDraftPublicationDocument.name)
    private readonly publications: Model<EngineDraftPublicationDocument>,
    @InjectModel(EngineInventoryFence.name)
    private readonly fences: Model<EngineInventoryFence>,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * The engine registers its own copies of some world-content providers, so it
   * must not import WorldContentModule (that would make those tokens
   * ambiguous). The registry is looked up across modules instead: it is the
   * single instance WorldContentModule owns.
   */
  onModuleInit(): void {
    this.moduleRef
      .get(WorldContentReferenceRegistry, { strict: false })
      .registerDeletionParticipant(this);
  }

  async describe(
    context: DeletionParticipantContext,
  ): Promise<DeletionParticipantImpact> {
    const session = context.session ?? null;
    const counts: Record<string, number> = {};
    const blockers: DeletionParticipantImpact['blockers'] = [];
    const fingerprintIds: string[] = [];

    const jobFilter = this.jobFilter(context);
    if (jobFilter) {
      const jobs = await this.jobs
        .find(jobFilter)
        .select({ status: 1 })
        .session(session)
        .lean()
        .exec();
      const running = jobs.filter(
        (job) => !TERMINAL_JOB_STATUSES.includes(job.status),
      );
      counts.jobs = jobs.length;
      counts.runningJobs = running.length;
      if (running.length) {
        blockers.push({
          code: 'CONTENT_ENGINE_JOB_RUNNING',
          message: `${running.length} content-engine job(s) are still generating for this target. Cancel them or let them finish first.`,
          count: running.length,
          sample: running.slice(0, 5).map((job) => ({
            id: String(job._id),
            label: `Job ${job.status}`,
          })),
        });
        fingerprintIds.push(
          ...running.map((job) => `running:${String(job._id)}`),
        );
      }
      if (jobs.length) {
        counts.pendingCandidates = await this.candidates
          .countDocuments({
            jobId: { $in: jobs.map((job) => String(job._id)) },
            reviewStatus: 'pending',
          })
          .session(session)
          .exec();
      }
    }

    if (context.ids.contentItemsToDelete.length) {
      // The publication record stays as provenance; its ContentItem is gone.
      counts.publishedItemsDeleted = await this.publications
        .countDocuments({
          contentItemId: { $in: context.ids.contentItemsToDelete },
        })
        .session(session)
        .exec();
    }
    return { source: this.source, counts, blockers, fingerprintIds };
  }

  async apply(
    context: DeletionParticipantContext & { session: ClientSession },
  ): Promise<Record<string, number>> {
    const scopeIds = context.scopeTargets
      .map((target) => target.scopeId)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (!scopeIds.length) return {};
    // Only existing fences: a Scope no approval ever fenced has nothing in
    // flight, and a later approval finds the Scope gone.
    const result = await this.fences
      .updateMany(
        { _id: { $in: scopeIds } },
        { $inc: { revision: 1 } },
        { session: context.session },
      )
      .exec();
    return { scopeFencesBumped: result.modifiedCount };
  }

  private jobFilter(
    context: DeletionParticipantContext,
  ): FilterQuery<EngineJobDocument> | null {
    switch (context.entity.kind) {
      case 'world':
        return context.worldKeys.length
          ? { worldKey: { $in: context.worldKeys } }
          : null;
      case 'scope':
        return context.scopeTargets.length
          ? {
              $or: context.scopeTargets.map((target) => ({
                worldKey: target.worldKey,
                scopeKey: target.scopeKey,
              })),
            }
          : null;
      case 'challengeType':
        return context.challengeTypeSlug
          ? { mechanicKey: context.challengeTypeSlug }
          : null;
      default:
        return null;
    }
  }
}
