import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { MatchDomainError } from './match.errors';

const SEPARATOR = '#';

/**
 * The identity of one board position: `occurrenceIndex` plus `slotKey`.
 *
 * Never `worldId` plus `slotKey`. A Match may play the same World at more than
 * one position, and those occurrences are independent — sharing a worldId must
 * never make two positions collapse into one. This is the only place the
 * composite string is built or read, so no module hand-rolls its own format.
 */
export class MatchBoardPositionKey {
  private constructor(
    readonly occurrenceIndex: number,
    readonly slotKey: WorldChallengeSlotKey,
  ) {}

  static of(
    occurrenceIndex: number,
    slotKey: WorldChallengeSlotKey,
  ): MatchBoardPositionKey {
    if (!Number.isInteger(occurrenceIndex) || occurrenceIndex < 0) {
      throw new MatchDomainError(
        'MATCH_BOARD_POSITION_KEY_INVALID',
        `"${occurrenceIndex}" is not a World occurrence index`,
      );
    }
    return new MatchBoardPositionKey(occurrenceIndex, slotKey);
  }

  static parse(value: string): MatchBoardPositionKey {
    const [index, slotKey] = value.split(SEPARATOR);
    const occurrenceIndex = Number(index);
    if (
      !Object.values(WorldChallengeSlotKey).includes(
        slotKey as WorldChallengeSlotKey,
      ) ||
      !Number.isInteger(occurrenceIndex)
    ) {
      throw new MatchDomainError(
        'MATCH_BOARD_POSITION_KEY_INVALID',
        `"${value}" is not a board position key`,
      );
    }
    return MatchBoardPositionKey.of(
      occurrenceIndex,
      slotKey as WorldChallengeSlotKey,
    );
  }

  /** Stable, sortable, and safe to use as a map key or a client-visible id. */
  get value(): string {
    return `${this.occurrenceIndex}${SEPARATOR}${this.slotKey}`;
  }

  equals(other: MatchBoardPositionKey): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
