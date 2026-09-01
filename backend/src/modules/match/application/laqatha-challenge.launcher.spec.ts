import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  ChallengeAnswerMode,
  WorldChallengeSlotKey,
} from '../../world-content/domain/world-content.constants';
import { ChallengeLauncherRegistry } from './challenge-launcher.registry';
import { LaqathaChallengeLauncher } from './laqatha-challenge.launcher';

describe('LaqathaChallengeLauncher', () => {
  const startLaqatha = { execute: jest.fn() };
  const runtimes = { findBySessionId: jest.fn() };
  const launcher = () =>
    new LaqathaChallengeLauncher(
      new ChallengeLauncherRegistry(),
      startLaqatha as never,
      runtimes as never,
    );

  beforeEach(() => jest.clearAllMocks());

  it('declares three phone-played MATCH-graded movie questions', () => {
    const requirements = launcher().launchRequirements;
    expect(requirements.contentItemCount).toBe(3);
    expect(requirements.requiresPhones).toBe(true);
    expect(
      requirements.isPlayableItem({
        id: 'item',
        worldId: 'movies',
        scopeId: 'scope',
        answerMode: ChallengeAnswerMode.MATCH,
      } as never),
    ).toBe(true);
  });

  it('rejects a launch that is not exactly three distinct items', async () => {
    await expect(
      launcher().validateLaunch({ contentItemIds: ['a', 'b'] } as never),
    ).rejects.toThrow(/three distinct/i);
    await expect(
      launcher().validateLaunch({
        contentItemIds: ['a', 'a', 'b'],
      } as never),
    ).rejects.toThrow(/three distinct/i);
  });

  it('launches through the canonical start use case', async () => {
    runtimes.findBySessionId.mockResolvedValue({ id: 'runtime' });
    await expect(
      launcher().launch({
        sessionId: 'session',
        actorId: 'controller',
        worldId: 'movies',
        slotKey: WorldChallengeSlotKey.SLOT_1,
        contentItemIds: ['one', 'two', 'three'],
      } as never),
    ).resolves.toEqual({ runtimeId: 'runtime' });
    expect(startLaqatha.execute).toHaveBeenCalledWith({
      sessionId: 'session',
      actorId: 'controller',
      worldId: 'movies',
      slotKey: WorldChallengeSlotKey.SLOT_1,
      contentItemIds: ['one', 'two', 'three'],
    });
  });

  it('accumulates the internal 5→1 totals and names the higher total as winner', () => {
    const runtime = {
      runtimeState: {
        phase: 'completed',
        teamIdsJson: JSON.stringify(['team-a', 'team-b']),
        resultsJson: JSON.stringify([
          { questionIndex: 0, points: { 'team-a': 5, 'team-b': 0 } },
          { questionIndex: 1, points: { 'team-a': 0, 'team-b': 3 } },
          { questionIndex: 2, points: { 'team-a': 0, 'team-b': 0 } },
        ]),
      },
    } as unknown as GameplayRuntimeState;
    expect(launcher().buildCompletionSummary(runtime)).toMatchObject({
      challengeKey: 'laqatha',
      winnerTeamId: 'team-a',
      mechanicSummary: { 'team-a': 5, 'team-b': 3 },
      details: { mechanicTotals: { 'team-a': 5, 'team-b': 3 }, tie: false },
    });
  });

  it('reports a tie (no Match point) when the internal totals are equal', () => {
    const runtime = {
      runtimeState: {
        phase: 'completed',
        teamIdsJson: JSON.stringify(['team-a', 'team-b']),
        resultsJson: JSON.stringify([
          { questionIndex: 0, points: { 'team-a': 4, 'team-b': 0 } },
          { questionIndex: 1, points: { 'team-a': 0, 'team-b': 4 } },
        ]),
      },
    } as unknown as GameplayRuntimeState;
    expect(launcher().buildCompletionSummary(runtime)).toMatchObject({
      winnerTeamId: null,
      details: { tie: true },
    });
  });

  it('does not expose selected content before Fair-Start activation', () => {
    const questionsJson = JSON.stringify([
      { contentItemId: 'one' },
      { contentItemId: 'two' },
      { contentItemId: 'three' },
    ]);
    const beforeActivation = {
      presentationActivatedAt: undefined,
      runtimeState: { questionsJson, currentQuestionIndex: 0 },
    } as unknown as GameplayRuntimeState;
    expect(
      launcher().presentedContentItemIds({
        runtime: beforeActivation,
        orderedContentItemIds: ['one', 'two', 'three'],
      }),
    ).toEqual([]);

    const afterActivation = {
      presentationActivatedAt: '2026-01-01T00:00:00.000Z',
      runtimeState: { questionsJson, currentQuestionIndex: 1 },
    } as unknown as GameplayRuntimeState;
    expect(
      launcher().presentedContentItemIds({
        runtime: afterActivation,
        orderedContentItemIds: ['one', 'two', 'three'],
      }),
    ).toEqual(['one', 'two']);
  });
});
