import { Injectable } from '@nestjs/common';
import { BoardSlot } from '../../world-content/domain/board-definition.policy';
import { WorldContentStatus } from '../../world-content/domain/world-content.constants';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { WorldReadinessService } from '../../world-content/application/world-readiness.service';
import {
  MATCH_SLOT_ORDER,
  MatchSlotLaunchability,
} from '../domain/match.constants';
import { MatchDomainError } from '../domain/match.errors';
import { ChallengeLauncherRegistry } from './challenge-launcher.registry';

export interface MatchSelectableWorld {
  worldId: string;
  name: string;
  boardReady: boolean;
  hasRelationalChallenge: boolean;
  slotKeys: WorldChallengeSlotKey[];
}

export interface MatchWorldBoard {
  worldId: string;
  name: string;
  boardReady: boolean;
  slots: BoardSlot[];
}

/**
 * The Match's read-only view of World Content.
 *
 * Board composition, readiness, and mechanic identity all stay in world-content;
 * this only translates them into what the Match needs: which Worlds may be chosen,
 * which board positions a chosen World schedules, and whether the mechanic in a
 * position is actually implemented.
 */
@Injectable()
export class MatchWorldCatalog {
  constructor(
    private readonly readiness: WorldReadinessService,
    private readonly launchers: ChallengeLauncherRegistry,
  ) {}

  /** Every World a Match may pick: active, with a valid board. */
  async listSelectableWorlds(): Promise<MatchSelectableWorld[]> {
    const evaluated = await this.readiness.evaluateAllWorlds();
    return evaluated
      .filter(
        ({ world, report }) =>
          world.status === WorldContentStatus.ACTIVE && report.boardReady,
      )
      .map(({ world, report }) => ({
        worldId: world.id,
        name: world.name,
        boardReady: report.boardReady,
        hasRelationalChallenge: report.hasRelationalChallenge,
        slotKeys: this.orderSlotKeys(report.board.slots),
      }));
  }

  async describeWorld(worldId: string): Promise<MatchWorldBoard> {
    const report = await this.readiness.evaluateWorld(worldId);
    const evaluated = await this.readiness.evaluateAllWorlds();
    const world = evaluated.find(
      (candidate) => candidate.world.id === worldId,
    )?.world;
    if (!world) {
      throw new MatchDomainError('MATCH_WORLD_NOT_FOUND', 'World not found');
    }
    return {
      worldId,
      name: world.name,
      boardReady: report.boardReady,
      slots: report.board.slots,
    };
  }

  /**
   * The board positions one occurrence of a World will play, in board order.
   * A World must be active and its board valid before a Match may schedule it.
   */
  async scheduleFor(worldId: string): Promise<{
    worldName: string;
    slotKeys: WorldChallengeSlotKey[];
    slots: BoardSlot[];
  }> {
    const report = await this.readiness.evaluateWorld(worldId);
    const evaluated = await this.readiness.evaluateAllWorlds();
    const world = evaluated.find(
      (candidate) => candidate.world.id === worldId,
    )?.world;
    if (!world) {
      throw new MatchDomainError('MATCH_WORLD_NOT_FOUND', 'World not found');
    }
    if (world.status !== WorldContentStatus.ACTIVE) {
      throw new MatchDomainError(
        'MATCH_WORLD_NOT_ACTIVE',
        'Only an active World can be selected for a match',
      );
    }
    if (!report.boardReady) {
      throw new MatchDomainError(
        'MATCH_WORLD_BOARD_NOT_READY',
        'The selected World does not have a valid board',
      );
    }
    return {
      worldName: world.name,
      slotKeys: this.orderSlotKeys(report.board.slots),
      slots: report.board.slots,
    };
  }

  /**
   * A configured position whose mechanic has no launcher is reported, never
   * hidden and never auto-completed.
   *
   * Takes anything that names a mechanic, so a live World board slot and a
   * Match-persisted board position are judged by exactly the same rule.
   */
  launchabilityFor(
    slot: Pick<BoardSlot, 'challengeTypeSlug'> | undefined,
  ): MatchSlotLaunchability {
    if (!slot) return MatchSlotLaunchability.UNAVAILABLE;
    return this.launchers.find({ challengeTypeSlug: slot.challengeTypeSlug })
      ? MatchSlotLaunchability.LAUNCHABLE
      : MatchSlotLaunchability.CONFIGURED_BUT_UNIMPLEMENTED;
  }

  private orderSlotKeys(slots: BoardSlot[]): WorldChallengeSlotKey[] {
    return [...slots]
      .sort(
        (left, right) =>
          MATCH_SLOT_ORDER.indexOf(left.slotKey) -
          MATCH_SLOT_ORDER.indexOf(right.slotKey),
      )
      .map((slot) => slot.slotKey);
  }
}
