import { createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  ContentItemStatus,
  WorldContentStatus,
} from '../../domain/world-content.constants';
import type { ContentAssetRef } from '../../domain/world-content.types';
import { ProductionMechanicLifecycleRepository } from '../../persistence/production-mechanic-lifecycle.repository';
import { productionMechanicDefinition } from '../../domain/production-mechanic.definition';
import { AdminDeletionLog } from '../../schemas/admin-deletion-log.schema';
import { ChallengeType } from '../../schemas/challenge-type.schema';
import { ContentItem } from '../../schemas/content-item.schema';
import { Scope } from '../../schemas/scope.schema';
import { ScopedMechanicTutorial } from '../../schemas/scoped-mechanic-tutorial.schema';
import { WorldChallengeConfiguration } from '../../schemas/world-challenge-configuration.schema';
import { World } from '../../schemas/world.schema';
import { WorldContentAssetMutator } from '../world-content-asset.mutator';
import {
  WorldContentReferenceKind,
  WorldContentReferenceRegistry,
} from '../world-content-reference.registry';
import { WorldContentFenceService } from './world-content-fence.service';
import type {
  DeletionBlocker,
  DeletionEntity,
  DeletionEntityKind,
  DeletionOperation,
  DeletionParticipantContext,
  DeletionParticipantImpact,
  DeletionPlanIds,
  DeletionPreview,
  DeletionResult,
} from './world-content-deletion.types';

/** Match usage guards are superseded here by the Match deletion participant. */
const MATCH_GUARD_SOURCES = [
  'persisted-matches-active',
  'persisted-matches-historical',
  'persisted-matches-unsafe-history',
] as const;

const TRANSACTION_OPTIONS = {
  readConcern: { level: 'snapshot' as const },
  writeConcern: { w: 'majority' as const },
};

const REQUEST_ID = /^[A-Za-z0-9-]{8,100}$/;

export interface DeletionActor {
  id: string;
  email: string;
  role: string;
}

export interface ExecuteDeletionInput {
  previewFingerprint: string;
  requestId: string;
  purgeDisposableHistory?: boolean;
}

interface DeletionPlan {
  entity: DeletionEntity;
  operation: DeletionOperation;
  ids: DeletionPlanIds;
  /** Extra identity that must not drift (e.g. the mechanic a slot holds). */
  identity: Record<string, string>;
  challengeTypeSlug?: string;
  worldKeys: string[];
  scopeTargets: DeletionParticipantContext['scopeTargets'];
  toDeleteReady: number;
  worldsBecomingIncomplete: Array<{ id: string; name: string }>;
  /** Single-file uploads owned by the deleted records (icon, banner, …). */
  recordAssets: ContentAssetRef[];
  /** Media URLs used by ContentItems this deletes. */
  contentMediaUrls: string[];
  blockers: DeletionBlocker[];
  external: DeletionParticipantImpact[];
}

type Lean<T> = T & { _id: Types.ObjectId; updatedAt?: Date };

/**
 * Admin permanent deletion and World detach (roadmap §19.1).
 *
 * One service plans, previews and executes every supported operation, so the
 * preview the operator confirms and the work that runs are the same code. The
 * plan is recomputed inside the transaction and must produce the fingerprint
 * the operator reviewed; any drift (content added, a slot rebound, a Match
 * created) is refused with `DELETION_PREVIEW_STALE`.
 *
 * Cascade rules:
 * - ChallengeType: deletes the mechanic, its World bindings and tutorials, and
 *   the ContentItems no other mechanic can play. Items another mechanic still
 *   plays are kept and only lose this mechanic.
 * - Scope / World: deletes everything they own. Content never crosses Worlds.
 * - ContentItem: deletes the item.
 * - Configuration (detach): deletes the World binding only. Content, the
 *   mechanic and other Worlds are untouched.
 *
 * ContentItem media is never deleted here: files are shared by URL and nothing
 * tracks ownership, so URLs that become unused are only reported. Single-file
 * uploads owned by a deleted record (World icon/banner/fallback, Scope image,
 * mechanic and binding icons) are removed after commit when nothing else uses
 * them.
 */
@Injectable()
export class WorldContentDeletionService {
  private readonly logger = new Logger(WorldContentDeletionService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(World.name) private readonly worlds: Model<World>,
    @InjectModel(Scope.name) private readonly scopes: Model<Scope>,
    @InjectModel(ChallengeType.name)
    private readonly challengeTypes: Model<ChallengeType>,
    @InjectModel(WorldChallengeConfiguration.name)
    private readonly configurations: Model<WorldChallengeConfiguration>,
    @InjectModel(ContentItem.name)
    private readonly contentItems: Model<ContentItem>,
    @InjectModel(ScopedMechanicTutorial.name)
    private readonly tutorials: Model<ScopedMechanicTutorial>,
    @InjectModel(AdminDeletionLog.name)
    private readonly log: Model<AdminDeletionLog>,
    private readonly registry: WorldContentReferenceRegistry,
    private readonly fence: WorldContentFenceService,
    private readonly assets: WorldContentAssetMutator,
    private readonly lifecycle: ProductionMechanicLifecycleRepository,
    private readonly config: ConfigService,
  ) {}

  async preview(
    kind: DeletionEntityKind,
    id: string,
    actor?: DeletionActor,
  ): Promise<DeletionPreview> {
    const plan = await this.plan(kind, id);
    return {
      ...this.toPreview(plan),
      actorMayExecute: actor ? this.mayExecute(plan.operation, actor) : false,
    };
  }

  /**
   * Who may execute. Detach removes a board binding only (content, mechanic
   * and other Worlds untouched) and stays an ordinary Admin action, as the
   * slot release it replaces was. Permanent deletion is irreversible, so it is
   * **fail-closed**: only user ids listed in PERMANENT_DELETION_ADMIN_IDS may
   * run it, and with the variable unset nobody can. Who belongs on that list is
   * a Product Owner decision; this code never widens it.
   */
  mayExecute(operation: DeletionOperation, actor: DeletionActor): boolean {
    if (operation === 'detach') return true;
    return permanentDeletionAdminIds(this.config).has(actor.id);
  }

  async execute(
    kind: DeletionEntityKind,
    id: string,
    input: ExecuteDeletionInput,
    actor: DeletionActor,
  ): Promise<DeletionResult> {
    if (!REQUEST_ID.test(input.requestId ?? '')) {
      throw new BadRequestException({
        code: 'DELETION_REQUEST_ID_INVALID',
        message: 'requestId must be 8–100 letters, digits or dashes',
      });
    }
    if (!input.previewFingerprint) {
      throw new BadRequestException({
        code: 'DELETION_PREVIEW_REQUIRED',
        message: 'Review the deletion preview before confirming it',
      });
    }
    const purge = input.purgeDisposableHistory === true;
    if (
      !this.mayExecute(
        kind === 'configuration' ? 'detach' : 'permanent_delete',
        actor,
      )
    ) {
      throw new ForbiddenException({
        code: 'PERMANENT_DELETION_NOT_PERMITTED',
        message:
          'Permanent deletion is restricted to the operators listed in PERMANENT_DELETION_ADMIN_IDS.',
      });
    }

    const replay = await this.replay(input.requestId, kind, id);
    if (replay) return replay;

    // Fences are created outside the transaction; the bump inside it is what
    // serialises against Match creation.
    let initial: DeletionPlan;
    try {
      initial = await this.plan(kind, id);
    } catch (error) {
      // The same request may have just committed concurrently.
      if (error instanceof NotFoundException) {
        const stored = await this.replay(input.requestId, kind, id);
        if (stored) return stored;
      }
      throw error;
    }
    await this.fence.ensure(initial.ids.fencedWorlds);

    const session = await this.connection.startSession();
    let committed: AdminDeletionLog | null = null;
    let plan: DeletionPlan = initial;
    try {
      await session.withTransaction(async () => {
        plan = await this.plan(kind, id, session);
        await this.fence.bump(plan.ids.fencedWorlds, session);

        const fingerprint = this.fingerprint(plan);
        if (fingerprint !== input.previewFingerprint) {
          throw new ConflictException({
            code: 'DELETION_PREVIEW_STALE',
            message:
              'What this deletion affects has changed since it was reviewed. Review the new impact and confirm again.',
          });
        }
        this.assertExecutable(plan, purge);

        const context = this.participantContext(plan, session);
        const counts: Record<string, number> = {};
        for (const participant of this.registry.participants()) {
          if (!participant.apply) continue;
          const applied = await participant.apply(context, {
            purgeDisposableHistory: purge,
          });
          for (const [key, value] of Object.entries(applied)) {
            counts[`${participant.source}.${key}`] = value;
          }
        }
        Object.assign(counts, await this.cascade(plan, session));

        const mediaCandidates = await this.unreferencedMedia(plan, session);
        const [row] = await this.log.create(
          [
            {
              requestId: input.requestId,
              operation: plan.operation,
              entity: { ...plan.entity },
              actor: { id: actor.id, email: actor.email, role: actor.role },
              previewFingerprint: fingerprint,
              options: { purgeDisposableHistory: purge },
              counts,
              affectedIds: this.affectedIds(plan),
              unreferencedMediaCandidates: mediaCandidates,
              committedAt: new Date(),
            },
          ],
          { session },
        );
        committed = row.toObject() as AdminDeletionLog;
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      // The same request committed concurrently: return what it did.
      if (
        (error as { code?: number }).code === 11000 ||
        error instanceof NotFoundException
      ) {
        const stored = await this.replay(input.requestId, kind, id);
        if (stored) return stored;
      }
      throw error;
    } finally {
      await session.endSession();
    }

    await this.discardRecordAssets(plan.recordAssets);
    const row = committed as unknown as AdminDeletionLog & { _id: unknown };
    this.logger.log({
      event: 'world_content_permanently_deleted',
      requestId: input.requestId,
      operation: plan.operation,
      kind,
      id,
      actorId: actor.id,
      counts: row.counts,
    });
    return this.toResult(row, false);
  }

  // ---------------------------------------------------------------------------
  // Planning
  // ---------------------------------------------------------------------------

  private async plan(
    kind: DeletionEntityKind,
    id: string,
    session?: ClientSession,
  ): Promise<DeletionPlan> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`${kind} not found`);
    }
    const base = await this.planFor(kind, id, session ?? null);
    const context = this.participantContext(base, session);
    const external = await Promise.all(
      this.registry
        .participants()
        .map((participant) => participant.describe(context)),
    );
    const legacy = await this.legacyBlockers(kind, id);
    return {
      ...base,
      external,
      blockers: [
        ...base.blockers,
        ...legacy,
        ...external.flatMap((impact) => impact.blockers),
      ],
    };
  }

  private async planFor(
    kind: DeletionEntityKind,
    id: string,
    session: ClientSession | null,
  ): Promise<DeletionPlan> {
    switch (kind) {
      case 'world':
        return this.planWorld(id, session);
      case 'scope':
        return this.planScope(id, session);
      case 'challengeType':
        return this.planChallengeType(id, session);
      case 'contentItem':
        return this.planContentItem(id, session);
      case 'configuration':
        return this.planDetach(id, session);
      default:
        throw new BadRequestException(`Unsupported deletion kind "${kind}"`);
    }
  }

  private async planWorld(
    id: string,
    session: ClientSession | null,
  ): Promise<DeletionPlan> {
    const world = await this.require(this.worlds, id, 'World', session);
    const [scopes, configurations, tutorials, items] = await Promise.all([
      this.scopes
        .find({ worldId: world._id })
        .select({ slug: 1, image: 1 })
        .session(session)
        .lean<Lean<Scope>[]>()
        .exec(),
      this.configurations
        .find({ worldId: world._id })
        .select({ icon: 1 })
        .session(session)
        .lean<Lean<WorldChallengeConfiguration>[]>()
        .exec(),
      this.tutorials
        .find({ worldId: world._id })
        .select({ _id: 1 })
        .session(session)
        .lean<Lean<ScopedMechanicTutorial>[]>()
        .exec(),
      // Items are owned through their Scope as well as the denormalised
      // worldId; selecting by both leaves no orphan if the two ever disagree.
      this.scopes
        .distinct('_id', { worldId: world._id })
        .session(session)
        .exec()
        .then((scopeIds) =>
          this.itemsFor(
            { $or: [{ worldId: world._id }, { scopeId: { $in: scopeIds } }] },
            session,
          ),
        ),
    ]);
    return this.emptyPlan({
      entity: this.entity('world', world, world.slug),
      operation: 'permanent_delete',
      ids: {
        worlds: [id],
        scopes: ids(scopes),
        configurations: ids(configurations),
        tutorials: ids(tutorials),
        contentItemsToDelete: ids(items),
        fencedWorlds: [id],
      },
      identity: { updatedAt: stamp(world.updatedAt) },
      worldKeys: [world.slug],
      scopeTargets: scopes.map((scope) => ({
        worldKey: world.slug,
        scopeKey: scope.slug,
        scopeId: String(scope._id),
      })),
      toDeleteReady: countReady(items),
      recordAssets: [
        world.icon,
        world.banner,
        world.questionFallback,
        ...scopes.map((scope) => scope.image),
        ...configurations.map((configuration) => configuration.icon),
      ],
      contentMediaUrls: mediaUrls(items),
    });
  }

  private async planScope(
    id: string,
    session: ClientSession | null,
  ): Promise<DeletionPlan> {
    const scope = await this.require(this.scopes, id, 'Scope', session);
    const world = await this.require(
      this.worlds,
      String(scope.worldId),
      'World',
      session,
    );
    const [items, remainingActiveScopes] = await Promise.all([
      this.itemsFor({ scopeId: scope._id }, session),
      this.scopes
        .countDocuments({
          worldId: world._id,
          _id: { $ne: scope._id },
          status: WorldContentStatus.ACTIVE,
        })
        .session(session)
        .exec(),
    ]);
    const worldId = String(world._id);
    return this.emptyPlan({
      entity: this.entity('scope', scope, scope.slug),
      operation: 'permanent_delete',
      ids: {
        scopes: [id],
        contentItemsToDelete: ids(items),
        fencedWorlds: [worldId],
      },
      identity: { updatedAt: stamp(scope.updatedAt), worldId },
      worldKeys: [],
      scopeTargets: [
        { worldKey: world.slug, scopeKey: scope.slug, scopeId: id },
      ],
      toDeleteReady: countReady(items),
      worldsBecomingIncomplete:
        world.status === WorldContentStatus.ACTIVE &&
        scope.status === WorldContentStatus.ACTIVE &&
        remainingActiveScopes === 0
          ? [{ id: worldId, name: world.name }]
          : [],
      recordAssets: [scope.image],
      contentMediaUrls: mediaUrls(items),
    });
  }

  private async planChallengeType(
    id: string,
    session: ClientSession | null,
  ): Promise<DeletionPlan> {
    const challengeType = await this.require(
      this.challengeTypes,
      id,
      'Challenge type',
      session,
    );
    const objectId = challengeType._id;
    const [items, configurations, tutorials, excludingScopes] =
      await Promise.all([
        this.itemsFor({ compatibleChallengeTypeIds: objectId }, session),
        this.configurations
          .find({ challengeTypeId: objectId })
          .select({ worldId: 1, icon: 1 })
          .session(session)
          .lean<Lean<WorldChallengeConfiguration>[]>()
          .exec(),
        this.tutorials
          .find({ challengeTypeId: objectId })
          .select({ _id: 1 })
          .session(session)
          .lean<Lean<ScopedMechanicTutorial>[]>()
          .exec(),
        this.scopes
          .find({ excludedChallengeTypeIds: objectId })
          .select({ _id: 1 })
          .session(session)
          .lean<Lean<Scope>[]>()
          .exec(),
      ]);
    const exclusive: typeof items = [];
    const shared: typeof items = [];
    for (const item of items) {
      const remaining = (item.compatibleChallengeTypeIds ?? []).filter(
        (value) => String(value) !== id,
      );
      (remaining.length ? shared : exclusive).push(item);
    }
    const boundWorldIds = configurations.map((configuration) =>
      String(configuration.worldId),
    );
    const activeBoundWorlds = boundWorldIds.length
      ? await this.worlds
          .find({
            _id: { $in: boundWorldIds },
            status: WorldContentStatus.ACTIVE,
          })
          .select({ name: 1 })
          .session(session)
          .lean<Lean<World>[]>()
          .exec()
      : [];
    return this.emptyPlan({
      entity: this.entity('challengeType', challengeType, challengeType.slug),
      operation: 'permanent_delete',
      ids: {
        configurations: ids(configurations),
        tutorials: ids(tutorials),
        contentItemsToDelete: ids(exclusive),
        contentItemsToDetach: ids(shared),
        scopesWithExclusion: ids(excludingScopes),
        fencedWorlds: unique([
          ...boundWorldIds,
          ...items.map((item) => String(item.worldId)),
        ]),
      },
      identity: { updatedAt: stamp(challengeType.updatedAt) },
      challengeTypeSlug: challengeType.slug,
      worldKeys: [],
      scopeTargets: [],
      toDeleteReady: countReady(exclusive),
      worldsBecomingIncomplete: activeBoundWorlds.map((world) => ({
        id: String(world._id),
        name: world.name,
      })),
      recordAssets: [
        challengeType.icon,
        ...configurations.map((configuration) => configuration.icon),
      ],
      contentMediaUrls: mediaUrls(exclusive),
    });
  }

  private async planContentItem(
    id: string,
    session: ClientSession | null,
  ): Promise<DeletionPlan> {
    const item = await this.require(
      this.contentItems,
      id,
      'Content item',
      session,
    );
    const prompt =
      (item.prompt as { ar?: string; en?: string } | undefined)?.ar ??
      (item.prompt as { en?: string } | undefined)?.en ??
      '';
    return this.emptyPlan({
      entity: {
        kind: 'contentItem',
        id,
        name: prompt.trim().slice(0, 120) || id,
        status: String(item.status),
      },
      operation: 'permanent_delete',
      ids: {
        contentItemsToDelete: [id],
        fencedWorlds: [String(item.worldId)],
      },
      identity: { updatedAt: stamp(item.updatedAt) },
      worldKeys: [],
      scopeTargets: [],
      toDeleteReady: item.status === ContentItemStatus.READY ? 1 : 0,
      contentMediaUrls: mediaUrls([item]),
    });
  }

  private async planDetach(
    id: string,
    session: ClientSession | null,
  ): Promise<DeletionPlan> {
    const configuration = await this.require(
      this.configurations,
      id,
      'Challenge configuration',
      session,
    );
    const [world, challengeType] = await Promise.all([
      this.worlds
        .findById(configuration.worldId)
        .session(session)
        .lean<Lean<World>>()
        .exec(),
      this.challengeTypes
        .findById(configuration.challengeTypeId)
        .session(session)
        .lean<Lean<ChallengeType>>()
        .exec(),
    ]);
    const worldId = String(configuration.worldId);
    return this.emptyPlan({
      entity: {
        kind: 'configuration',
        id,
        name: `${world?.name ?? worldId} · ${challengeType?.name ?? String(configuration.challengeTypeId)}`,
        key: String(configuration.slotKey),
      },
      operation: 'detach',
      ids: { configurations: [id], fencedWorlds: [worldId] },
      // The stale-confirmation guard: a slot rebound to another mechanic
      // between preview and confirm changes the fingerprint.
      identity: {
        updatedAt: stamp(configuration.updatedAt),
        worldId,
        challengeTypeId: String(configuration.challengeTypeId),
      },
      challengeTypeSlug: challengeType?.slug,
      worldKeys: [],
      scopeTargets: [],
      toDeleteReady: 0,
      worldsBecomingIncomplete:
        world?.status === WorldContentStatus.ACTIVE
          ? [{ id: worldId, name: world.name }]
          : [],
      recordAssets: [configuration.icon],
      contentMediaUrls: [],
    });
  }

  private async legacyBlockers(
    kind: DeletionEntityKind,
    id: string,
  ): Promise<DeletionBlocker[]> {
    if (kind !== 'world' && kind !== 'scope' && kind !== 'challengeType') {
      return [];
    }
    const blockers: DeletionBlocker[] = [];
    for (const guard of this.registry.guardsExcept(MATCH_GUARD_SOURCES)) {
      const count = await guard.countReferences(
        kind as WorldContentReferenceKind,
        id,
      );
      if (count === 0) continue;
      const references =
        (await guard.describeReferences?.(
          kind as WorldContentReferenceKind,
          id,
        )) ?? [];
      blockers.push({
        code: 'LEGACY_RECORDS_REFERENCE_ENTITY',
        message: `${count} record(s) in "${guard.source}" still reference this ${kind}`,
        count,
        sample: references
          .slice(0, 5)
          .map((reference) => ({ id: reference.id, label: reference.label })),
      });
    }
    return blockers;
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  private assertExecutable(plan: DeletionPlan, purge: boolean): void {
    const hard = plan.blockers.filter(
      (blocker) => !blocker.clearedByHistoryPurge,
    );
    if (hard.length) {
      throw new ConflictException({
        code: 'DELETION_BLOCKED',
        message: hard.map((blocker) => blocker.message).join(' · '),
        blockers: hard,
      });
    }
    if (plan.blockers.length && !purge) {
      throw new ConflictException({
        code: 'DELETION_REQUIRES_HISTORY_PURGE',
        message:
          'Disposable test history still references this record. Confirm removing it together with the deletion.',
        blockers: plan.blockers,
      });
    }
  }

  private async cascade(
    plan: DeletionPlan,
    session: ClientSession,
  ): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    const { ids: plan_ } = plan;
    const objectIds = (values: string[]) =>
      values.map((value) => new Types.ObjectId(value));

    if (plan_.contentItemsToDelete.length) {
      counts.contentItemsDeleted = (
        await this.contentItems
          .deleteMany(
            { _id: { $in: objectIds(plan_.contentItemsToDelete) } },
            { session },
          )
          .exec()
      ).deletedCount;
    }
    if (
      plan_.contentItemsToDetach.length &&
      plan.entity.kind === 'challengeType'
    ) {
      counts.contentItemsDetached = (
        await this.contentItems
          .updateMany(
            { _id: { $in: objectIds(plan_.contentItemsToDetach) } },
            {
              $pull: {
                compatibleChallengeTypeIds: new Types.ObjectId(plan.entity.id),
              },
            },
            { session },
          )
          .exec()
      ).modifiedCount;
    }
    if (
      plan_.scopesWithExclusion.length &&
      plan.entity.kind === 'challengeType'
    ) {
      counts.scopeExclusionsRemoved = (
        await this.scopes
          .updateMany(
            { _id: { $in: objectIds(plan_.scopesWithExclusion) } },
            {
              $pull: {
                excludedChallengeTypeIds: new Types.ObjectId(plan.entity.id),
              },
            },
            { session },
          )
          .exec()
      ).modifiedCount;
    }
    if (plan_.tutorials.length) {
      counts.tutorialsDeleted = (
        await this.tutorials
          .deleteMany({ _id: { $in: objectIds(plan_.tutorials) } }, { session })
          .exec()
      ).deletedCount;
    }
    if (plan_.configurations.length) {
      counts.configurationsDeleted = (
        await this.configurations
          .deleteMany(
            { _id: { $in: objectIds(plan_.configurations) } },
            { session },
          )
          .exec()
      ).deletedCount;
    }
    if (plan_.scopes.length) {
      counts.scopesDeleted = (
        await this.scopes
          .deleteMany({ _id: { $in: objectIds(plan_.scopes) } }, { session })
          .exec()
      ).deletedCount;
    }
    if (plan.entity.kind === 'challengeType') {
      const slug = plan.challengeTypeSlug ?? '';
      if (productionMechanicDefinition(slug)) {
        // Stops provisioning from recreating a mechanic the operator deleted.
        await this.lifecycle.markDeleted(slug, plan.entity.id, session);
      }
      counts.challengeTypesDeleted = (
        await this.challengeTypes
          .deleteOne({ _id: new Types.ObjectId(plan.entity.id) }, { session })
          .exec()
      ).deletedCount;
    }
    if (plan_.worlds.length) {
      counts.worldsDeleted = (
        await this.worlds
          .deleteMany({ _id: { $in: objectIds(plan_.worlds) } }, { session })
          .exec()
      ).deletedCount;
    }
    return counts;
  }

  /** URLs used by deleted items that no surviving item uses. Report only. */
  private async unreferencedMedia(
    plan: DeletionPlan,
    session: ClientSession,
  ): Promise<string[]> {
    const unused: string[] = [];
    for (const url of plan.contentMediaUrls) {
      // Read after the cascade, so the deleted items no longer count.
      const stillUsed = await this.contentItems
        .exists({
          $or: [{ 'media.assets.url': url }, { 'revealMedia.assets.url': url }],
        })
        .session(session)
        .exec();
      if (!stillUsed) unused.push(url);
    }
    return unused;
  }

  /**
   * Single-file uploads owned by deleted records. Discarded only when no
   * remaining record references the same file; a failure is logged, never
   * thrown, because the deletion has already committed.
   */
  private async discardRecordAssets(
    assets: Array<ContentAssetRef | null | undefined>,
  ): Promise<void> {
    for (const asset of assets) {
      if (!asset?.path) continue;
      try {
        const url = asset.url;
        const stillUsed = url
          ? (
              await Promise.all([
                this.worlds.exists({
                  $or: [
                    { 'icon.url': url },
                    { 'banner.url': url },
                    { 'questionFallback.url': url },
                  ],
                }),
                this.scopes.exists({ 'image.url': url }),
                this.challengeTypes.exists({ 'icon.url': url }),
                this.configurations.exists({ 'icon.url': url }),
                this.contentItems.exists({
                  $or: [
                    { 'media.assets.url': url },
                    { 'revealMedia.assets.url': url },
                  ],
                }),
              ])
            ).some(Boolean)
          : false;
        if (!stillUsed) await this.assets.discard(asset);
      } catch (error) {
        this.logger.warn({
          event: 'deleted_record_asset_discard_failed',
          path: asset.path,
          error: (error as Error).message,
        });
      }
    }
  }

  private async replay(
    requestId: string,
    kind: DeletionEntityKind,
    id: string,
  ): Promise<DeletionResult | null> {
    const row = await this.log.findOne({ requestId }).lean().exec();
    if (!row) return null;
    const entity = row.entity as { kind?: string; id?: string };
    if (entity.kind !== kind || entity.id !== id) {
      throw new ConflictException({
        code: 'DELETION_REQUEST_ID_REUSED',
        message: 'This request id was already used for a different deletion',
      });
    }
    return this.toResult(row as AdminDeletionLog & { _id: unknown }, true);
  }

  // ---------------------------------------------------------------------------
  // Shapes
  // ---------------------------------------------------------------------------

  private toPreview(
    plan: DeletionPlan,
  ): Omit<DeletionPreview, 'actorMayExecute'> {
    const hard = plan.blockers.filter(
      (blocker) => !blocker.clearedByHistoryPurge,
    );
    const external: DeletionPreview['impact']['external'] = {};
    for (const impact of plan.external) external[impact.source] = impact.counts;
    return {
      entity: plan.entity,
      operation: plan.operation,
      impact: {
        worlds: plan.ids.worlds.length,
        scopes: plan.ids.scopes.length,
        configurations: plan.ids.configurations.length,
        tutorials: plan.ids.tutorials.length,
        scopeExclusions: plan.ids.scopesWithExclusion.length,
        content: {
          toDelete: plan.ids.contentItemsToDelete.length,
          toDeleteReady: plan.toDeleteReady,
          sharedPreserved: plan.ids.contentItemsToDetach.length,
        },
        external,
        worldsBecomingIncomplete: plan.worldsBecomingIncomplete,
      },
      blockers: plan.blockers,
      safe: plan.blockers.length === 0,
      safeWithHistoryPurge: hard.length === 0,
      requiresHistoryPurge: hard.length === 0 && plan.blockers.length > 0,
      reversible: false,
      fingerprint: this.fingerprint(plan),
      generatedAt: new Date().toISOString(),
    };
  }

  private toResult(
    row: AdminDeletionLog & { _id: unknown },
    replayed: boolean,
  ): DeletionResult {
    return {
      requestId: row.requestId,
      auditId: String(row._id),
      entity: row.entity as unknown as DeletionEntity,
      operation: row.operation as DeletionOperation,
      counts: row.counts,
      unreferencedMediaCandidates: row.unreferencedMediaCandidates ?? [],
      replayed,
    };
  }

  /**
   * Everything that decides what the deletion does. Order-independent: id
   * lists are sorted, so the same state always gives the same fingerprint.
   */
  private fingerprint(plan: DeletionPlan): string {
    const material = {
      entity: { kind: plan.entity.kind, id: plan.entity.id },
      operation: plan.operation,
      identity: plan.identity,
      ids: Object.fromEntries(
        Object.entries(plan.ids).map(([key, value]) => [
          key,
          [...value].sort(),
        ]),
      ),
      blockers: plan.blockers
        .map((blocker) => `${blocker.code}:${blocker.count}`)
        .sort(),
      external: plan.external
        .map((impact) => ({
          source: impact.source,
          ids: [...(impact.fingerprintIds ?? [])].sort(),
        }))
        .sort((left, right) => left.source.localeCompare(right.source)),
    };
    return createHash('sha256').update(JSON.stringify(material)).digest('hex');
  }

  private affectedIds(plan: DeletionPlan): Record<string, string[]> {
    return {
      worlds: plan.ids.worlds,
      scopes: plan.ids.scopes,
      configurations: plan.ids.configurations,
      tutorials: plan.ids.tutorials,
      contentItemsDeleted: plan.ids.contentItemsToDelete,
      contentItemsDetached: plan.ids.contentItemsToDetach,
      ...Object.fromEntries(
        plan.external
          .filter((impact) => impact.fingerprintIds?.length)
          .map((impact) => [impact.source, impact.fingerprintIds ?? []]),
      ),
    };
  }

  private participantContext(
    plan: Pick<
      DeletionPlan,
      | 'entity'
      | 'operation'
      | 'ids'
      | 'challengeTypeSlug'
      | 'worldKeys'
      | 'scopeTargets'
    >,
    session: ClientSession,
  ): DeletionParticipantContext & { session: ClientSession };
  private participantContext(
    plan: Pick<
      DeletionPlan,
      | 'entity'
      | 'operation'
      | 'ids'
      | 'challengeTypeSlug'
      | 'worldKeys'
      | 'scopeTargets'
    >,
    session?: ClientSession,
  ): DeletionParticipantContext;
  private participantContext(
    plan: Pick<
      DeletionPlan,
      | 'entity'
      | 'operation'
      | 'ids'
      | 'challengeTypeSlug'
      | 'worldKeys'
      | 'scopeTargets'
    >,
    session?: ClientSession,
  ): DeletionParticipantContext {
    return {
      entity: plan.entity,
      operation: plan.operation,
      ids: plan.ids,
      challengeTypeSlug: plan.challengeTypeSlug,
      worldKeys: plan.worldKeys,
      scopeTargets: plan.scopeTargets,
      ...(session ? { session } : {}),
    };
  }

  private emptyPlan(
    partial: Omit<
      DeletionPlan,
      | 'ids'
      | 'blockers'
      | 'external'
      | 'worldsBecomingIncomplete'
      | 'recordAssets'
    > & {
      ids: Partial<DeletionPlanIds>;
      worldsBecomingIncomplete?: DeletionPlan['worldsBecomingIncomplete'];
      recordAssets?: Array<ContentAssetRef | null | undefined>;
    },
  ): DeletionPlan {
    return {
      ...partial,
      ids: {
        worlds: [],
        scopes: [],
        configurations: [],
        tutorials: [],
        contentItemsToDelete: [],
        contentItemsToDetach: [],
        scopesWithExclusion: [],
        fencedWorlds: [],
        ...partial.ids,
      },
      worldsBecomingIncomplete: partial.worldsBecomingIncomplete ?? [],
      recordAssets: (partial.recordAssets ?? []).filter(
        (asset): asset is ContentAssetRef => Boolean(asset),
      ),
      blockers: [],
      external: [],
    };
  }

  private entity(
    kind: DeletionEntityKind,
    record: { _id: Types.ObjectId; name?: string; status?: unknown },
    key?: string,
  ): DeletionEntity {
    return {
      kind,
      id: String(record._id),
      name: record.name ?? String(record._id),
      ...(key ? { key } : {}),
      ...(record.status ? { status: String(record.status) } : {}),
    };
  }

  private itemsFor(
    filter: Record<string, unknown>,
    session: ClientSession | null,
  ) {
    return this.contentItems
      .find(filter)
      .select({
        status: 1,
        worldId: 1,
        compatibleChallengeTypeIds: 1,
        'media.assets.url': 1,
        'revealMedia.assets.url': 1,
      })
      .session(session)
      .lean<Lean<ContentItem>[]>()
      .exec();
  }

  private async require<T>(
    model: Model<T>,
    id: string,
    label: string,
    session: ClientSession | null,
  ): Promise<Lean<T>> {
    const record = await model
      .findById(id)
      .session(session)
      .lean<Lean<T>>()
      .exec();
    if (!record) throw new NotFoundException(`${label} not found`);
    return record;
  }
}

function ids(records: Array<{ _id: Types.ObjectId }>): string[] {
  return records.map((record) => String(record._id));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function stamp(value: Date | undefined): string {
  return value ? new Date(value).toISOString() : '';
}

function countReady(items: Array<{ status?: unknown }>): number {
  return items.filter((item) => item.status === ContentItemStatus.READY).length;
}

function mediaUrls(
  items: Array<{
    media?: { assets?: Array<{ url?: string }> };
    revealMedia?: { assets?: Array<{ url?: string }> };
  }>,
): string[] {
  const urls = new Set<string>();
  for (const item of items) {
    for (const asset of [
      ...(item.media?.assets ?? []),
      ...(item.revealMedia?.assets ?? []),
    ]) {
      if (asset?.url) urls.add(asset.url);
    }
  }
  return [...urls].sort();
}

/** Comma-separated user ids; empty or unset means nobody (fail-closed). */
export function permanentDeletionAdminIds(config: ConfigService): Set<string> {
  return new Set(
    (config.get<string>('PERMANENT_DELETION_ADMIN_IDS') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}
