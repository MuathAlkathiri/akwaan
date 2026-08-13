import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { MatchBoardPositionKey } from './match-board-position-key';
import { MatchDomainError } from './match.errors';

describe('MatchBoardPositionKey', () => {
  it('identifies a position by occurrence index and slot key', () => {
    const key = MatchBoardPositionKey.of(2, WorldChallengeSlotKey.SLOT_3);
    expect(key.value).toBe('2#slot_3');
    expect(key.occurrenceIndex).toBe(2);
    expect(key.slotKey).toBe(WorldChallengeSlotKey.SLOT_3);
  });

  it('keeps two occurrences of the same World apart', () => {
    // The whole reason worldId is not part of the key: these are different
    // positions even though the same World is played at both.
    const first = MatchBoardPositionKey.of(0, WorldChallengeSlotKey.SLOT_1);
    const repeated = MatchBoardPositionKey.of(2, WorldChallengeSlotKey.SLOT_1);
    expect(first.equals(repeated)).toBe(false);
    expect(first.value).not.toBe(repeated.value);
  });

  it('round-trips through its string form', () => {
    const key = MatchBoardPositionKey.of(1, WorldChallengeSlotKey.SLOT_4);
    expect(MatchBoardPositionKey.parse(key.value).equals(key)).toBe(true);
    expect(`${key}`).toBe(key.value);
  });

  it('refuses a value that is not a board position', () => {
    for (const value of ['', 'slot_1', '0#slot_9', 'x#slot_1', '0']) {
      expect(() => MatchBoardPositionKey.parse(value)).toThrow(
        MatchDomainError,
      );
    }
    expect(() =>
      MatchBoardPositionKey.of(-1, WorldChallengeSlotKey.SLOT_1),
    ).toThrow(MatchDomainError);
  });
});
