import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ContentItemStatus } from '../domain/world-content.constants';
import { WorldContentConflictError } from '../domain/world-content.errors';
import { ContentItemRepository } from '../persistence/content-item.repository';
import { WorldChallengeConfigurationRepository } from '../persistence/world-challenge-configuration.repository';
import { ChallengeTypeRepository } from '../persistence/challenge-type.repository';
import { WorldRepository } from '../persistence/world.repository';
import { WorldReadinessService } from './world-readiness.service';

export interface WorldSlotRemovalPreview {
  worldId: string;
  worldName: string;
  slotKey: string;
  challengeTypeId: string;
  challengeTypeSlug: string;
  challengeTypeName: string;
  content: {
    total: number;
    ready: number;
    /** Items no other mechanic can play — these would be deleted outright. */
    exclusive: number;
    /** Items another mechanic can still play — these only lose a relationship. */
    shared: number;
  };
  boardWillBecomeIncomplete: boolean;
}

export interface WorldSlotRemovalResult {
  worldId: string;
  slotKey: string;
  challengeTypeId: string;
  deletedContentItems: number;
  detachedSharedItems: number;
  slotNowEmpty: boolean;
  boardReady: boolean;
}

/**
 * Removing one mechanic from one board position of one World.
 *
 * This is deliberately **not** ChallengeType deletion. The mechanic stays in the
 * global catalog, every other World that configures it keeps its binding, and
 * only content belonging to *this* World is in scope. The unit of work is the
 * triple (World, slot, ChallengeType), and the ChallengeType is re-verified at
 * commit time so a stale confirmation cannot remove whatever happens to occupy
 * the slot by then.
 *
 * It also deliberately skips `assertChangeKeepsActiveWorldValid`. That guard
 * exists to stop an ordinary edit from silently breaking a live World; here an
 * incomplete board is the *requested outcome*. An unbound slot is a valid **admin
 * configuration** state and an invalid **playable** one — the board policy still
 * reports the empty slot as a blocker, so `boardReady` goes false and Match
 * preflight keeps rejecting the World until the slot is filled again. No board
 * invariant is relaxed and `WORLD_BOARD_SLOT_COUNT` is untouched.
 */
@Injectable()
export class WorldSlotMechanicRemovalService {
  private readonly logger = new Logger(WorldSlotMechanicRemovalService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configurations: WorldChallengeConfigurationRepository,
    private readonly contentItems: ContentItemRepository,
    private readonly challengeTypes: ChallengeTypeRepository,
    private readonly worlds: WorldRepository,
    private readonly readiness: WorldReadinessService,
  ) {}

  /**
   * What removing this binding would cost, counted by the server.
   *
   * The client never computes this: it cannot see other Worlds' content and must
   * not be trusted to scope the count correctly.
   */
  async preview(configurationId: string): Promise<WorldSlotRemovalPreview> {
    const { configuration, world, challengeType } =
      await this.resolve(configurationId);
    const worldId = String(configuration.worldId);
    const challengeTypeId = String(configuration.challengeTypeId);
    const items = await this.contentItems.listForWorldMechanic(
      worldId,
      challengeTypeId,
    );
    const { exclusive, shared } = this.partition(items, challengeTypeId);

    return {
      worldId,
      worldName: world.name,
      slotKey: String(configuration.slotKey),
      challengeTypeId,
      challengeTypeSlug: challengeType.slug,
      challengeTypeName: challengeType.name,
      content: {
        total: items.length,
        ready: items.filter((item) => item.status === ContentItemStatus.READY)
          .length,
        exclusive: exclusive.length,
        shared: shared.length,
      },
      // Releasing a slot always leaves the board short of its four positions.
      boardWillBecomeIncomplete: true,
    };
  }

  /**
   * Release the slot and dispose of this World's content for the mechanic.
   *
   * Both writes happen in one transaction, so the two states requirement 14
   * forbids — content deleted with the slot still bound, or the slot released
   * with content orphaned — are not reachable.
   */
  async remove(
    configurationId: string,
    input: { expectedChallengeTypeId: string },
  ): Promise<WorldSlotRemovalResult> {
    const { configuration } = await this.resolve(configurationId);
    const worldId = String(configuration.worldId);
    const challengeTypeId = String(configuration.challengeTypeId);
    const slotKey = String(configuration.slotKey);

    // The stale-confirmation guard. Between opening the dialog and confirming it,
    // this slot may have been rebound to another mechanic; removing *that* one
    // and its content is never what the operator asked for.
    if (challengeTypeId !== input.expectedChallengeTypeId) {
      throw new WorldContentConflictError(
        'BOARD_SLOT_REBOUND',
        `The ${slotKey} board position no longer holds the mechanic this removal was confirmed for.`,
      );
    }

    const items = await this.contentItems.listForWorldMechanic(
      worldId,
      challengeTypeId,
    );
    const { exclusive, shared } = this.partition(items, challengeTypeId);

    const mongoSession = await this.connection.startSession();
    let deleted = 0;
    let detached = 0;
    try {
      await mongoSession.withTransaction(async () => {
        deleted = await this.contentItems.deleteByIds(exclusive, mongoSession);
        detached = await this.contentItems.detachChallengeType(
          shared,
          challengeTypeId,
          mongoSession,
        );
        const released = await this.configurations.deleteByIdInSession(
          configurationId,
          mongoSession,
        );
        if (!released) {
          // Someone released it underneath us; abort rather than delete content
          // for a binding that no longer exists.
          throw new WorldContentConflictError(
            'BOARD_SLOT_REBOUND',
            `The ${slotKey} board position was already released.`,
          );
        }
      });
    } finally {
      await mongoSession.endSession();
    }

    this.logger.log({
      event: 'world_slot_mechanic_removed',
      worldId,
      slotKey,
      challengeTypeId,
      deletedContentItems: deleted,
      detachedSharedItems: detached,
    });

    // Read the board back rather than predicting it, so the caller is told what
    // the policy actually says now.
    const report = await this.readiness.evaluateWorld(worldId);
    return {
      worldId,
      slotKey,
      challengeTypeId,
      deletedContentItems: deleted,
      detachedSharedItems: detached,
      slotNowEmpty: true,
      boardReady: report.boardReady,
    };
  }

  /**
   * Split this World's items by whether the mechanic is their last one.
   *
   * The schema models compatibility as a list, so an item may legitimately be
   * playable through several mechanics. Deleting such an item would destroy
   * another mechanic's content, so it is detached instead; an item whose only
   * compatibility is the one being removed has no remaining owner and goes.
   */
  private partition(
    items: Array<{
      _id: unknown;
      compatibleChallengeTypeIds: unknown[];
    }>,
    challengeTypeId: string,
  ): { exclusive: string[]; shared: string[] } {
    const exclusive: string[] = [];
    const shared: string[] = [];
    for (const item of items) {
      const remaining = (item.compatibleChallengeTypeIds ?? [])
        .map((value) => String(value))
        .filter((value) => value !== challengeTypeId);
      (remaining.length ? shared : exclusive).push(String(item._id));
    }
    return { exclusive, shared };
  }

  private async resolve(configurationId: string) {
    const configuration = await this.configurations.findById(configurationId);
    if (!configuration) {
      throw new NotFoundException('Challenge configuration not found');
    }
    const [world, challengeType] = await Promise.all([
      this.worlds.findById(String(configuration.worldId)),
      this.challengeTypes.findById(String(configuration.challengeTypeId)),
    ]);
    if (!world) throw new NotFoundException('World not found');
    if (!challengeType) {
      throw new NotFoundException('Challenge type not found');
    }
    return { configuration, world, challengeType };
  }
}
