import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { ChallengeLauncherRegistry } from './challenge-launcher.registry';
import {
  ODD_PIECE_LAUNCHER_REQUIREMENTS,
  OddPieceChallengeLauncher,
} from './odd-piece-challenge.launcher';

describe('OddPieceChallengeLauncher', () => {
  const startOddPiece = { execute: jest.fn() };
  const runtimes = { findBySessionId: jest.fn() };
  const launcher = () =>
    new OddPieceChallengeLauncher(
      new ChallengeLauncherRegistry(),
      startOddPiece as never,
      runtimes as never,
    );

  beforeEach(() => jest.clearAllMocks());

  it('declares three phone-played, canonical Odd Piece items', () => {
    expect(ODD_PIECE_LAUNCHER_REQUIREMENTS.contentItemCount).toBe(3);
    expect(ODD_PIECE_LAUNCHER_REQUIREMENTS.requiresPhones).toBe(true);
    expect(
      ODD_PIECE_LAUNCHER_REQUIREMENTS.isPlayableItem({
        id: 'item',
        worldId: 'cars',
        scopeId: 'scope',
        answerMode: 'odd_piece',
        mechanicVariant: 'odd-piece',
      }),
    ).toBe(true);
  });

  it('launches through the canonical start use case', async () => {
    const context = {
      sessionId: 'session',
      actorId: 'controller',
      matchId: 'match',
      occurrenceIndex: 0,
      worldId: 'cars',
      slotKey: WorldChallengeSlotKey.SLOT_1,
      challengeTypeId: 'type',
      challengeTypeSlug: 'odd-piece',
      contentItemIds: ['one', 'two', 'three'],
    };
    runtimes.findBySessionId.mockResolvedValue({ id: 'runtime' });
    await expect(launcher().launch(context)).resolves.toEqual({
      runtimeId: 'runtime',
    });
    expect(startOddPiece.execute).toHaveBeenCalledWith({
      sessionId: 'session',
      actorId: 'controller',
      worldId: 'cars',
      slotKey: WorldChallengeSlotKey.SLOT_1,
      contentItemIds: ['one', 'two', 'three'],
    });
  });

  it('reports internal puzzle points while leaving Match scoring to challenge-win', () => {
    const runtime = {
      runtimeState: {
        phase: 'completed',
        resultJson: JSON.stringify({
          winnerTeamId: 'team-a',
          tie: false,
          points: { 'team-a': 2, 'team-b': 1 },
        }),
        resultsJson: JSON.stringify([
          {
            puzzleIndex: 0,
            contentItemId: 'one',
            winnerTeamId: 'team-a',
            attempts: [{ teamId: 'team-a', pieceId: 'd', correct: true }],
          },
        ]),
      },
    } as unknown as GameplayRuntimeState;
    expect(launcher().buildCompletionSummary(runtime)).toMatchObject({
      challengeKey: 'odd-piece',
      winnerTeamId: 'team-a',
      mechanicSummary: { 'team-a': 2, 'team-b': 1 },
      details: { points: { 'team-a': 2, 'team-b': 1 } },
    });
  });

  it('does not expose selected content before Fair-Start activation', () => {
    const runtime = {
      presentationActivatedAt: undefined,
      runtimeState: { currentPuzzleIndex: 0 },
    } as unknown as GameplayRuntimeState;
    expect(
      launcher().presentedContentItemIds({
        runtime,
        orderedContentItemIds: ['one', 'two', 'three'],
      }),
    ).toEqual([]);
  });
});
