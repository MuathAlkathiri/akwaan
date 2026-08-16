import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  isolatedTestDatabaseUri,
  resetTestDatabase,
} from '../helpers/test-database';
import { MatchConvergenceSweeper } from '../../src/modules/match/application/match-convergence.sweeper';
import { MatchReconciliationService } from '../../src/modules/match/application/match-reconciliation.service';
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../../src/modules/match/persistence/match.repository';
import { MatchTransitionNotifier } from '../../src/modules/match/application/match-transition.notifier';
import {
  MATCH_SLOT_ORDER,
  MATCH_UNIFIED_BOARD_POSITION_COUNT,
  MatchSlotStatus,
  MatchStage,
  MatchStatus,
} from '../../src/modules/match/domain/match.constants';
import { WorldChallengeSlotKey } from '../../src/modules/world-content/domain/world-content.constants';
import { BOMB_MODE_KEY } from '../../src/modules/live-game-sessions/domain/bomb-gameplay.plugin';
import { CLOSEST_MODE_KEY } from '../../src/modules/live-game-sessions/domain/closest-gameplay.plugin';

/**
 * Durable runtime → Match convergence, against real Mongo.
 *
 * The window this closes: a gameplay runtime commits its terminal state inside
 * a transaction, and the Match learns about it afterwards, through an observer.
 * That ordering is correct — a Match write must never be able to roll back
 * gameplay that already happened — but between the two the obligation lived
 * only in a promise. A crash there left a runtime marked complete and a Match
 * still holding the challenge open, for ever.
 *
 * These tests do not simulate that with a spy on the bridge and a hopeful
 * assertion. They persist exactly the state a crash in that window leaves
 * behind, then drive the real bootstrap path and require the Match to converge.
 */
describe('durable match convergence integration', () => {
  let app: INestApplication;
  let database: Connection;
  let matches: MatchRepository;
  let sweeper: MatchConvergenceSweeper;
  let reconciliation: MatchReconciliationService;
  const published: Array<{ matchId: string; reason: string }> = [];

  const uid = (prefix: string) =>
    `${prefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`;

  beforeAll(async () => {
    database = await connectTestDatabase('match-convergence');
    await resetTestDatabase(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('match-convergence') },
    });
    matches = app.get<MatchRepository>(MATCH_REPOSITORY);
    sweeper = app.get(MatchConvergenceSweeper);
    reconciliation = app.get(MatchReconciliationService);
    // Watch what clients would be told, without a socket server.
    jest
      .spyOn(app.get(MatchTransitionNotifier), 'publish')
      .mockImplementation((match: { id: string }, reason: string) => {
        published.push({ matchId: match.id, reason });
      });
  }, 120_000);

  afterAll(async () => {
    app?.get(MatchConvergenceSweeper).onModuleDestroy();
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  beforeEach(() => {
    published.length = 0;
  });

  /**
   * Exactly the state a crash between the runtime commit and the Match write
   * leaves behind: a terminal runtime, and a Match still naming it.
   *
   * Written straight to Mongo rather than driven through HTTP because the
   * point is the *persisted shape*, and a crash does not go through HTTP.
   */
  const strandedChallenge = async (
    options: {
      mechanic?: string;
      winnerTeamId?: string | null;
      boardPositions?: number;
      completedPositions?: number;
      runtimeStatus?: 'completed' | 'cancelled';
    } = {},
  ) => {
    const mechanic = options.mechanic ?? BOMB_MODE_KEY;
    const positions =
      options.boardPositions ?? MATCH_UNIFIED_BOARD_POSITION_COUNT;
    const alreadyDone = options.completedPositions ?? 0;
    const runtimeStatus = options.runtimeStatus ?? 'completed';
    const matchId = uid('match');
    const sessionId = uid('session');
    const runtimeId = uid('runtime');
    const teams = [
      { id: `${matchId}-team-a`, name: 'A' },
      { id: `${matchId}-team-b`, name: 'B' },
    ];
    const winnerTeamId =
      options.winnerTeamId === undefined ? teams[0].id : options.winnerTeamId;
    const now = new Date();

    // The board: `positions` slots across occurrences, the first one bound to
    // the runtime and in progress, `alreadyDone` of the rest already completed.
    const slotFor = (index: number) => MATCH_SLOT_ORDER[index % 4];
    const occurrences = [0, 1, 2].map((occurrenceIndex) => ({
      index: occurrenceIndex,
      worldId: `world-${occurrenceIndex}`,
      selectedScopeIds: ['s1', 's2', 's3', 's4'],
      scheduledSlotKeys: [] as WorldChallengeSlotKey[],
      slots: {} as Record<string, Record<string, unknown>>,
    }));
    const configuredBoardPositions: Array<Record<string, unknown>> = [];
    for (let index = 0; index < positions; index += 1) {
      const occurrenceIndex = Math.floor(index / 4);
      const slotKey = slotFor(index);
      const occurrence = occurrences[occurrenceIndex];
      occurrence.scheduledSlotKeys.push(slotKey);
      occurrence.slots[slotKey] =
        index === 0
          ? {
              status: MatchSlotStatus.IN_PROGRESS,
              challengeKey: mechanic,
              runtimeId,
              contentItemIds: ['item-1'],
              startedAt: now,
            }
          : index <= alreadyDone
            ? {
                status: MatchSlotStatus.COMPLETED,
                challengeKey: mechanic,
                runtimeId: `${runtimeId}-old-${index}`,
                contentItemIds: [],
                startedAt: now,
                completedAt: now,
                scoreEventIds: [],
              }
            : { status: MatchSlotStatus.AVAILABLE };
      configuredBoardPositions.push({
        occurrenceIndex,
        slotKey,
        worldId: `world-${occurrenceIndex}`,
        worldName: 'World',
        challengeTypeId: `type-${mechanic}`,
        challengeTypeSlug: mechanic,
        displayName: mechanic,
      });
    }

    await database.collection('matches').insertOne({
      matchId,
      liveSessionId: sessionId,
      setupMode: 'unified_preconfigured',
      status: MatchStatus.ACTIVE,
      stage: MatchStage.CHALLENGE,
      stageEnteredAt: now,
      revision: 4,
      processedCommandIds: [],
      teams,
      teamDoubles: teams.map((team) => ({
        teamId: team.id,
        status: 'available',
      })),
      coinToss: { winnerTeamId: teams[0].id, roll: 0, resolvedAt: now },
      selections: [],
      occurrences,
      configuredBoardPositions,
      selectingTeamId: teams[0].id,
      currentChallenge: {
        occurrenceIndex: 0,
        slotKey: slotFor(0),
        challengeKey: mechanic,
        runtimeId,
        contentItemIds: ['item-1'],
        startedAt: now,
        doubledTeamIds: [],
      },
      scoreEvents: [],
      challengeResults: [],
      createdAt: now,
      startedAt: now,
    });

    // The terminal runtime the Match is still waiting on.
    await database.collection('gameplay_runtimes').insertOne({
      runtimeId,
      sessionId,
      modeKey: mechanic,
      modeVersion: 1,
      status: runtimeStatus,
      revision: 12,
      expiresAt: new Date(Date.now() + 3_600_000),
      createdAt: now,
      completedAt: now,
      state: {
        id: runtimeId,
        sessionId,
        modeKey: mechanic,
        modeVersion: 1,
        stateSchemaVersion: 1,
        status: runtimeStatus,
        revision: 12,
        runtimeState:
          mechanic === BOMB_MODE_KEY
            ? {
                phase: 'ready',
                questionIndex: 0,
                questionsJson: '[]',
                resultJson: JSON.stringify({
                  winnerTeamId,
                  endedBy: 'clock-expired',
                }),
              }
            : {
                phase: 'completed',
                resultsJson: JSON.stringify([]),
                winnerTeamId,
              },
        completedRounds: [
          {
            id: 'round-1',
            sequence: 1,
            completedAt: now,
            completionReason: 'test',
          },
        ],
        processedCommandIds: [],
        transitions: [],
        events: [],
        createdAt: now,
        ...(runtimeStatus === 'completed'
          ? { completedAt: now }
          : { cancelledAt: now }),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    return { matchId, sessionId, runtimeId, teams, winnerTeamId };
  };

  const storedMatch = async (matchId: string) =>
    database.collection('matches').findOne({ matchId });

  const scoreFor = async (matchId: string, teamId: string) => {
    const match = (await matches.findById(matchId))!;
    return match.teamScore(teamId).signedTotal;
  };

  it('E — a challenge stranded by a crash converges at bootstrap, with no client action', async () => {
    // The mandatory recovery test. Nothing here touches the reconciler
    // directly: the real bootstrap hook is what has to find this.
    const { matchId, winnerTeamId } = await strandedChallenge();

    const before = (await storedMatch(matchId))!;
    expect(before.currentChallenge).toBeTruthy();
    expect(before.challengeResults).toHaveLength(0);

    await sweeper.onApplicationBootstrap();

    const after = (await storedMatch(matchId))!;
    expect(after.currentChallenge).toBeFalsy();
    expect(after.challengeResults).toHaveLength(1);
    expect(after.stage).toBe(MatchStage.CHALLENGE_RESULT);
    expect(await scoreFor(matchId, winnerTeamId!)).toBe(1);
  }, 120_000);

  it('releases a cancelled runtime stranded by a crash without score or result', async () => {
    const { matchId, runtimeId } = await strandedChallenge({
      runtimeStatus: 'cancelled',
    });

    await sweeper.onApplicationBootstrap();

    const after = (await storedMatch(matchId))!;
    expect(after.currentChallenge).toBeFalsy();
    expect(after.stage).toBe(MatchStage.BOARD);
    expect(after.challengeResults).toHaveLength(0);
    expect(after.scoreEvents).toHaveLength(0);
    expect(after.occurrences[0].slots.slot_1).toMatchObject({
      status: MatchSlotStatus.AVAILABLE,
    });
    expect(after.occurrences[0].slots.slot_1.runtimeId).toBeUndefined();
    expect(
      (await matches.findAwaitingConvergence()).some(
        (entry) => entry.runtimeId === runtimeId,
      ),
    ).toBe(false);
    expect(
      published.some(
        (entry) =>
          entry.matchId === matchId && entry.reason === 'challenge-aborted',
      ),
    ).toBe(true);
  }, 120_000);

  it('E — clients are told about a recovered convergence through the normal channel', async () => {
    // Recovery that nobody hears about is only half a fix: an active client
    // must not have to refresh to see a Match that converged behind it.
    const { matchId } = await strandedChallenge();

    await sweeper.sweep('manual');

    expect(published.some((entry) => entry.matchId === matchId)).toBe(true);
  }, 120_000);

  it('B/F — delivering the same obligation repeatedly has one effect', async () => {
    // Covers duplicate delivery and the crash-after-Match-commit window in one
    // shape, because in this architecture they are the same shape: the
    // obligation is discharged by the same write that applies the result, so a
    // redelivery always meets an already-converged Match.
    const { matchId, runtimeId, sessionId, winnerTeamId } =
      await strandedChallenge();
    const runtime = await database
      .collection('gameplay_runtimes')
      .findOne({ runtimeId });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await reconciliation.onRuntimeMutated({
        sessionId,
        runtimeId,
        runtimeState: runtime!.state as never,
      });
    }
    await sweeper.sweep('manual');

    const after = (await storedMatch(matchId))!;
    expect(after.challengeResults).toHaveLength(1);
    expect(after.scoreEvents).toHaveLength(1);
    expect(await scoreFor(matchId, winnerTeamId!)).toBe(1);
  }, 120_000);

  it('G — a Match that already converged is a no-op at bootstrap', async () => {
    const { matchId } = await strandedChallenge();
    await sweeper.sweep('manual');
    const converged = (await storedMatch(matchId))!;

    published.length = 0;
    await sweeper.onApplicationBootstrap();

    const after = (await storedMatch(matchId))!;
    expect(after.revision).toBe(converged.revision);
    expect(after.challengeResults).toHaveLength(1);
    // Nothing to announce, because nothing changed.
    expect(published.some((entry) => entry.matchId === matchId)).toBe(false);
  }, 120_000);

  it('C/D — an obligation survives a failed convergence and lands on retry', async () => {
    // The durability property stated directly: a convergence that fails must
    // leave the obligation exactly where it was.
    // Fails for the whole sweep, not just one attempt: the reconciler already
    // retries twice internally for revision conflicts, and that fast retry is
    // not the durability guarantee — surviving to the *next* sweep is.
    const { matchId, winnerTeamId } = await strandedChallenge();
    const save = jest
      .spyOn(matches, 'save')
      .mockRejectedValue(new Error('mongo unavailable'));

    await sweeper.sweep('manual');

    // Still owed: the Match document is unchanged and still names the runtime.
    const stranded = (await storedMatch(matchId))!;
    expect(stranded.currentChallenge).toBeTruthy();
    expect(stranded.challengeResults).toHaveLength(0);

    save.mockRestore();
    await sweeper.sweep('manual');

    const after = (await storedMatch(matchId))!;
    expect(after.currentChallenge).toBeFalsy();
    expect(after.challengeResults).toHaveLength(1);
    expect(await scoreFor(matchId, winnerTeamId!)).toBe(1);
  }, 120_000);

  it('H — the contract is mechanic-agnostic, not Bomb-shaped', async () => {
    // Two materially different mechanics: Bomb reports its verdict in
    // `resultJson` and is terminal by runtime status; Closest is terminal by
    // its own `phase`. Both must reach the Match the same way.
    const bomb = await strandedChallenge({ mechanic: BOMB_MODE_KEY });
    const closest = await strandedChallenge({ mechanic: CLOSEST_MODE_KEY });

    await sweeper.onApplicationBootstrap();

    for (const scenario of [bomb, closest]) {
      const after = (await storedMatch(scenario.matchId))!;
      expect(after.currentChallenge).toBeFalsy();
      expect(after.challengeResults).toHaveLength(1);
    }
  }, 120_000);

  it('J — a non-final challenge leaves the Match active with its board open', async () => {
    const { matchId } = await strandedChallenge({
      boardPositions: MATCH_UNIFIED_BOARD_POSITION_COUNT,
      completedPositions: 0,
    });

    await sweeper.sweep('manual');

    const after = (await storedMatch(matchId))!;
    expect(after.status).toBe(MatchStatus.ACTIVE);
    expect(after.stage).toBe(MatchStage.CHALLENGE_RESULT);
    expect(after.currentChallenge).toBeFalsy();
  }, 120_000);

  it('I — the final challenge still completes the Match exactly once', async () => {
    // Every other position already done, so acknowledging this result is the
    // last thing the Match is waiting for.
    const { matchId } = await strandedChallenge({
      completedPositions: MATCH_UNIFIED_BOARD_POSITION_COUNT - 1,
    });

    await sweeper.sweep('manual');
    const match = (await matches.findById(matchId))!;
    match.continueFromChallengeResult({
      commandId: uid('cmd'),
      now: new Date(),
    });
    await matches.save(match, match.revision - 1);

    const after = (await storedMatch(matchId))!;
    expect(after.status).toBe(MatchStatus.COMPLETED);
    expect(after.stage).toBe(MatchStage.MATCH_COMPLETE);
    expect(after.challengeResults).toHaveLength(1);

    // A further sweep must not reopen or re-score a finished Match.
    await sweeper.onApplicationBootstrap();
    const settled = (await storedMatch(matchId))!;
    expect(settled.status).toBe(MatchStatus.COMPLETED);
    expect(settled.scoreEvents).toHaveLength(1);
  }, 120_000);

  it('the obligation query only reports Matches still holding a challenge', async () => {
    // The durable fact the whole design rests on: `currentChallenge` is the
    // obligation record, and clearing it is how convergence acknowledges
    // itself. If that stopped being true, everything above would be luck.
    const { matchId, runtimeId } = await strandedChallenge();

    const before = await matches.findAwaitingConvergence();
    expect(
      before.some(
        (entry) => entry.matchId === matchId && entry.runtimeId === runtimeId,
      ),
    ).toBe(true);

    await sweeper.sweep('manual');

    const after = await matches.findAwaitingConvergence();
    expect(after.some((entry) => entry.matchId === matchId)).toBe(false);
  }, 120_000);
});
