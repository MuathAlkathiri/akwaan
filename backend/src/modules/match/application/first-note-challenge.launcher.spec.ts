import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  ChallengeAnswerMode,
  WorldChallengeSlotKey,
} from '../../world-content/domain/world-content.constants';
import { ChallengeLauncherRegistry } from './challenge-launcher.registry';
import { FirstNoteChallengeLauncher } from './first-note-challenge.launcher';

describe('FirstNoteChallengeLauncher', () => {
  const start = { execute: jest.fn() };
  const runtimes = { findBySessionId: jest.fn() };
  const launcher = () =>
    new FirstNoteChallengeLauncher(
      new ChallengeLauncherRegistry(),
      start as never,
      runtimes as never,
    );

  beforeEach(() => jest.clearAllMocks());

  it('selects exactly three phone-played MATCH songs', () => {
    const requirements = launcher().launchRequirements;
    expect(requirements.contentItemCount).toBe(3);
    expect(requirements.requiresPhones).toBe(true);
    expect(
      requirements.isPlayableItem({
        answerMode: ChallengeAnswerMode.MATCH,
      } as never),
    ).toBe(true);
  });

  it('rejects shortage and duplicate selections', async () => {
    await expect(
      launcher().validateLaunch({ contentItemIds: ['a', 'b'] } as never),
    ).rejects.toThrow(/three distinct/i);
    await expect(
      launcher().validateLaunch({ contentItemIds: ['a', 'a', 'b'] } as never),
    ).rejects.toThrow(/three distinct/i);
  });

  it('launches through the canonical use case', async () => {
    runtimes.findBySessionId.mockResolvedValue({ id: 'runtime' });
    await expect(
      launcher().launch({
        sessionId: 'session',
        actorId: 'controller',
        worldId: 'music',
        slotKey: WorldChallengeSlotKey.SLOT_1,
        contentItemIds: ['one', 'two', 'three'],
      } as never),
    ).resolves.toEqual({ runtimeId: 'runtime' });
  });

  it('keeps selection unexposed until activation and only exposes reached songs', () => {
    const songsJson = JSON.stringify([
      { contentItemId: 'one' },
      { contentItemId: 'two' },
      { contentItemId: 'three' },
    ]);
    const before = {
      runtimeState: { songsJson, currentSongIndex: 0 },
    } as unknown as GameplayRuntimeState;
    expect(
      launcher().presentedContentItemIds({
        runtime: before,
        orderedContentItemIds: ['one', 'two', 'three'],
      }),
    ).toEqual([]);

    const active = {
      presentationActivatedAt: '2026-01-01T00:00:00.000Z',
      runtimeState: { songsJson, currentSongIndex: 1 },
    } as unknown as GameplayRuntimeState;
    expect(
      launcher().presentedContentItemIds({
        runtime: active,
        orderedContentItemIds: ['one', 'two', 'three'],
      }),
    ).toEqual(['one', 'two']);
  });

  it('uses internal totals to select the challenge winner and permits ties', () => {
    const runtime = (points: Array<Record<string, number>>) =>
      ({
        runtimeState: {
          phase: 'completed',
          teamIdsJson: JSON.stringify(['a', 'b']),
          resultsJson: JSON.stringify(
            points.map((value) => ({ points: value })),
          ),
        },
      }) as unknown as GameplayRuntimeState;
    expect(
      launcher().buildCompletionSummary(
        runtime([
          { a: 3, b: 0 },
          { a: 0, b: 1 },
        ]),
      ),
    ).toMatchObject({ winnerTeamId: 'a', details: { tie: false } });
    expect(
      launcher().buildCompletionSummary(
        runtime([
          { a: 1, b: 0 },
          { a: 0, b: 1 },
        ]),
      ),
    ).toMatchObject({ winnerTeamId: null, details: { tie: true } });
  });
});
