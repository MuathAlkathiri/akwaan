import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { PlayerInstructions } from '../../world-content/domain/world-content.types';
import { ConfiguredWorldOccurrence } from './configured-world-occurrence';
import { MatchBoardPositionKey } from './match-board-position-key';
import {
  MATCH_SLOT_ORDER,
  MATCH_UNIFIED_BOARD_POSITION_COUNT,
  MatchSlotStatus,
} from './match.constants';
import { MatchDomainError } from './match.errors';

/**
 * The configuration of one of the twelve board positions, captured when the Match
 * is created.
 *
 * The mechanic identity is stored rather than re-read from World Content on every
 * load: a World edited mid-match must not silently change what a Match is playing,
 * and a reload must rebuild exactly the board that was persisted.
 */
export interface MatchBoardPositionConfiguration {
  occurrenceIndex: number;
  worldId: string;
  /**
   * The World's name as it was when the Match was configured. Captured for the
   * same reason the mechanic is: a World renamed mid-match must not change what a
   * Match says it is playing. Absent on Matches created before it was captured.
   */
  worldName?: string;
  slotKey: WorldChallengeSlotKey;
  challengeTypeId: string;
  challengeTypeSlug: string;
  displayName: string;
  description?: string;
  instructions?: string;
  playerInstructions?: PlayerInstructions;
}

/** A configured position merged with the progress the Match owns for it. */
export interface UnifiedMatchBoardPosition extends MatchBoardPositionConfiguration {
  /** `occurrenceIndex + slotKey`; never `worldId + slotKey`. */
  positionKey: string;
  /** The Scope pool this position — and only this position — draws from. */
  selectedScopeIds: string[];
  status: MatchSlotStatus;
  runtimeId?: string;
  completedAt?: Date;
}

/** The mechanic identity a World contributes to one board position. */
export interface UnifiedBoardSlotDefinition {
  slotKey: WorldChallengeSlotKey;
  challengeTypeId: string;
  challengeTypeSlug: string;
  displayName: string;
  description?: string;
  instructions?: string;
  playerInstructions?: PlayerInstructions;
}

/** The World facts a Match captures once, at configuration time. */
export interface UnifiedBoardWorldDefinition {
  worldId: string;
  name: string;
}

/**
 * The board of a unified Match: all twelve positions, playable in any order.
 *
 * Nothing here consults a "current" occurrence. Which position may be launched is
 * decided by that position's own status, and which team may launch it is decided
 * by `selectingTeamId` — never by how far a sequence has progressed.
 */
export class UnifiedMatchBoardPolicy {
  /**
   * Builds the twelve configured positions, in board order, from the three
   * configured occurrences and each World's four board slots.
   */
  buildPositions(
    occurrences: readonly ConfiguredWorldOccurrence[],
    slotsByOccurrenceIndex: ReadonlyMap<
      number,
      readonly UnifiedBoardSlotDefinition[]
    >,
    worldsById: ReadonlyMap<string, UnifiedBoardWorldDefinition> = new Map(),
  ): MatchBoardPositionConfiguration[] {
    const positions: MatchBoardPositionConfiguration[] = [];
    for (const occurrence of occurrences) {
      const slots =
        slotsByOccurrenceIndex.get(occurrence.occurrenceIndex) ?? [];
      if (slots.length !== MATCH_SLOT_ORDER.length) {
        throw new MatchDomainError(
          'UNIFIED_BOARD_SLOT_COUNT_INVALID',
          `World occurrence ${occurrence.occurrenceIndex} contributes ${slots.length} board positions instead of ${MATCH_SLOT_ORDER.length}`,
        );
      }
      for (const slotKey of MATCH_SLOT_ORDER) {
        const slot = slots.find((candidate) => candidate.slotKey === slotKey);
        if (!slot) {
          throw new MatchDomainError(
            'UNIFIED_BOARD_SLOT_MISSING',
            `World occurrence ${occurrence.occurrenceIndex} has no mechanic in the ${slotKey} position`,
          );
        }
        const world = worldsById.get(occurrence.worldId);
        positions.push({
          occurrenceIndex: occurrence.occurrenceIndex,
          worldId: occurrence.worldId,
          ...(world ? { worldName: world.name } : {}),
          slotKey,
          challengeTypeId: slot.challengeTypeId,
          challengeTypeSlug: slot.challengeTypeSlug,
          displayName: slot.displayName,
          ...(slot.description ? { description: slot.description } : {}),
          ...(slot.instructions ? { instructions: slot.instructions } : {}),
          ...(slot.playerInstructions
            ? { playerInstructions: slot.playerInstructions }
            : {}),
        });
      }
    }
    if (positions.length !== MATCH_UNIFIED_BOARD_POSITION_COUNT) {
      throw new MatchDomainError(
        'UNIFIED_BOARD_POSITION_COUNT_INVALID',
        `A unified match board has exactly ${MATCH_UNIFIED_BOARD_POSITION_COUNT} positions, built ${positions.length}`,
      );
    }
    return positions;
  }

  /**
   * Every configured position is required for V1: a Match completes when all
   * twelve are done, and no position is optional or skippable.
   */
  requiredPositionKeys(
    positions: readonly MatchBoardPositionConfiguration[],
  ): string[] {
    return positions.map((position) => this.keyOf(position).value);
  }

  isComplete(positions: readonly UnifiedMatchBoardPosition[]): boolean {
    return (
      positions.length === MATCH_UNIFIED_BOARD_POSITION_COUNT &&
      positions.every(
        (position) => position.status === MatchSlotStatus.COMPLETED,
      )
    );
  }

  completedCount(positions: readonly UnifiedMatchBoardPosition[]): number {
    return positions.filter(
      (position) => position.status === MatchSlotStatus.COMPLETED,
    ).length;
  }

  /**
   * Board selection alternates: the coin-toss winner selects the first position,
   * the opponent the next, and so on for all twelve. One rule, one place.
   */
  nextSelectingTeamId(teamIds: readonly string[], current: string): string {
    const other = teamIds.find((teamId) => teamId !== current);
    return other ?? current;
  }

  keyOf(position: {
    occurrenceIndex: number;
    slotKey: WorldChallengeSlotKey;
  }): MatchBoardPositionKey {
    return MatchBoardPositionKey.of(position.occurrenceIndex, position.slotKey);
  }
}

export const unifiedMatchBoardPolicy = new UnifiedMatchBoardPolicy();
