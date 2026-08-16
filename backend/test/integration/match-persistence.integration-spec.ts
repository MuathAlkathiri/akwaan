import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  isolatedTestDatabaseUri,
  resetTestDatabase,
} from '../helpers/test-database';
import { Match } from '../../src/modules/match/domain/match';
import {
  MATCH_SLOT_ORDER,
  MatchSetupMode,
  MatchSlotLaunchability,
  MatchSlotStatus,
  MatchStage,
  MatchStatus,
} from '../../src/modules/match/domain/match.constants';
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../../src/modules/match/persistence/match.repository';
import { ScoringService } from '../../src/modules/scoring/application/scoring.service';
import { SCORING_RULE_IDS } from '../../src/modules/scoring/domain/scoring-rule';
import { WorldChallengeSlotKey } from '../../src/modules/world-content/domain/world-content.constants';

/**
 * Real MongoDB round trips for the Match aggregate.
 *
 * The point of these tests is that nothing about a Match is reconstructed by
 * guesswork: stage, occurrence-indexed board progress, processed command ids, and
 * signed ScoreEvents all survive a save/load unchanged, and two writers cannot
 * both win.
 */
describe('Match persistence integration', () => {
  let app: INestApplication;
  let database: Connection;
  let matches: MatchRepository;
  let scoring: ScoringService;

  const teams = [
    { id: 'team-alpha', name: 'ألفا' },
    { id: 'team-beta', name: 'بيتا' },
  ];

  beforeAll(async () => {
    database = await connectTestDatabase('match-persistence');
    await resetTestDatabase(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('match-persistence') },
    });
    matches = app.get<MatchRepository>(MATCH_REPOSITORY);
    scoring = app.get(ScoringService);
  });

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  afterEach(async () => {
    await database.collection('matches').deleteMany({});
  });

  const now = (offsetMs = 0) => new Date(1_760_000_000_000 + offsetMs);

  const ANIME = 'world-anime';
  const FOOTBALL = 'world-football';
  const pools: Record<number, string[]> = {
    0: ['naruto', 'bleach', 'one-piece', 'attack-on-titan'],
    1: ['world-cup', 'premier-league', 'saudi-league', 'ucl'],
    2: ['death-note', 'jujutsu', 'demon-slayer', 'hxh'],
  };

  const configuration = () => [
    { occurrenceIndex: 0, worldId: ANIME, selectedScopeIds: [...pools[0]] },
    { occurrenceIndex: 1, worldId: FOOTBALL, selectedScopeIds: [...pools[1]] },
    // The same World again, from a different four Scopes.
    { occurrenceIndex: 2, worldId: ANIME, selectedScopeIds: [...pools[2]] },
  ];

  /** A unified Match: the only kind this system plays. */
  const unified = () =>
    Match.createUnified({
      liveSessionId: `session-${Math.random()}`,
      teams,
      occurrences: configuration(),
      boardPositions: configuration().flatMap((occurrence) =>
        MATCH_SLOT_ORDER.map((slotKey, index) => ({
          occurrenceIndex: occurrence.occurrenceIndex,
          worldId: occurrence.worldId,
          slotKey,
          challengeTypeId: `${occurrence.worldId}-type-${index}`,
          challengeTypeSlug: `${occurrence.worldId}-mechanic-${index}`,
          displayName: `${occurrence.worldId} ${slotKey}`,
        })),
      ),
      coinToss: { winnerTeamId: teams[1].id, roll: 1, resolvedAt: now() },
      now: now(),
    });

  /** Launches and completes one board position with a signed delta. */
  const play = (
    match: Match,
    occurrenceIndex: number,
    slotKey: WorldChallengeSlotKey,
    runtimeId: string,
    delta: number,
  ) => {
    match.launchChallenge({
      commandId: `launch-${runtimeId}`,
      now: now(30),
      occurrenceIndex,
      slotKey,
      challengeKey: 'read-your-opponent',
      runtimeId,
      contentItemIds: [`${runtimeId}-a`, `${runtimeId}-b`, `${runtimeId}-c`],
      launchability: MatchSlotLaunchability.LAUNCHABLE,
    });
    match.completeChallenge({
      commandId: `complete-${runtimeId}`,
      now: now(31),
      runtimeId,
      events: [event({ delta, challengeSessionId: runtimeId })],
    });
    // A finished challenge stops on its result; playing a position through
    // means acknowledging that result too.
    match.continueFromChallengeResult({
      commandId: `continue-${runtimeId}`,
      now: now(32),
    });
  };

  const event = (
    overrides: {
      teamId?: string;
      delta?: number;
      challengeSessionId?: string;
      matchId?: string;
    } = {},
  ) =>
    scoring.restoreEvents([
      {
        id: `event-${overrides.teamId ?? 'a'}-${overrides.delta ?? 1}-${
          overrides.challengeSessionId ?? 'runtime-1'
        }`,
        matchId: overrides.matchId ?? 'original-live-session',
        teamId: overrides.teamId ?? teams[0].id,
        challengeSessionId: overrides.challengeSessionId ?? 'runtime-1',
        scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
        delta: overrides.delta ?? 1,
        reason: 'STEAL_WRONG',
        createdAt: now(10).toISOString(),
      },
    ])[0];

  it('creates and loads a Match without changing anything about it', async () => {
    const match = unified();
    await matches.create(match);

    const loaded = await matches.findById(match.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.serialize()).toEqual(match.serialize());
    expect(loaded!.stage).toBe(MatchStage.BOARD);
    // The occurrence's content pool is part of the authoritative state.
    expect(loaded!.selectedScopeIds(0)).toEqual(pools[0]);
    expect(loaded!.hasCompleteScopeSelection(0)).toBe(true);
    expect(loaded!.status).toBe(MatchStatus.ACTIVE);
  });

  it('finds the Match wrapping a live session, and only while it is playable', async () => {
    const match = unified();
    await matches.create(match);

    const active = await matches.findActiveBySessionId(match.liveSessionId);
    expect(active?.id).toBe(match.id);

    const revision = match.revision;
    match.cancel({ commandId: 'cmd-cancel', now: now(9) });
    await matches.save(match, revision);

    expect(await matches.findActiveBySessionId(match.liveSessionId)).toBeNull();
    // A cancelled or finished Match is still readable for the result screen.
    expect(
      (await matches.findLatestBySessionId(match.liveSessionId))?.status,
    ).toBe(MatchStatus.CANCELLED);
  });

  it('refuses a save whose expected revision has moved on', async () => {
    const match = unified();
    await matches.create(match);
    const stale = (await matches.findById(match.id))!;
    const fresh = (await matches.findById(match.id))!;

    const revision = fresh.revision;
    fresh.launchChallenge({
      commandId: 'cmd-launch-fresh',
      now: now(20),
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      challengeKey: 'read-your-opponent',
      runtimeId: 'runtime-1',
      contentItemIds: ['item-1', 'item-2', 'item-3'],
      launchability: MatchSlotLaunchability.LAUNCHABLE,
    });
    await matches.save(fresh, revision);

    stale.launchChallenge({
      commandId: 'cmd-launch-stale',
      now: now(21),
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_3,
      challengeKey: 'read-your-opponent',
      runtimeId: 'runtime-2',
      contentItemIds: ['item-4', 'item-5', 'item-6'],
      launchability: MatchSlotLaunchability.LAUNCHABLE,
    });
    await expect(matches.save(stale, revision)).rejects.toMatchObject({
      response: { code: 'MATCH_CONCURRENT_MODIFICATION' },
    });

    const stored = (await matches.findById(match.id))!;
    expect(stored.currentChallenge?.runtimeId).toBe('runtime-1');
  });

  it('round-trips a Match in the middle of a challenge', async () => {
    const match = unified();
    const revision = match.revision;
    match.launchChallenge({
      commandId: 'cmd-launch',
      now: now(20),
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      challengeKey: 'read-your-opponent',
      runtimeId: 'runtime-1',
      contentItemIds: ['item-1', 'item-2', 'item-3'],
      launchability: MatchSlotLaunchability.LAUNCHABLE,
    });
    await matches.create(match);
    expect(revision).toBeLessThan(match.revision);

    const loaded = (await matches.findById(match.id))!;
    expect(loaded.stage).toBe(MatchStage.CHALLENGE);
    expect(loaded.currentChallenge).toEqual({
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      challengeKey: 'read-your-opponent',
      runtimeId: 'runtime-1',
      contentItemIds: ['item-1', 'item-2', 'item-3'],
      startedAt: now(20),
      doubledTeamIds: [],
    });
    expect(loaded.occurrences[0].slots[WorldChallengeSlotKey.SLOT_2]).toEqual({
      status: MatchSlotStatus.IN_PROGRESS,
      challengeKey: 'read-your-opponent',
      runtimeId: 'runtime-1',
      contentItemIds: ['item-1', 'item-2', 'item-3'],
      startedAt: now(20),
    });
  });

  it('round-trips a completed Match, keeping every occurrence independent', async () => {
    const match = unified();
    play(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-1', 2);
    play(match, 0, WorldChallengeSlotKey.SLOT_3, 'runtime-2', 3);
    play(match, 1, WorldChallengeSlotKey.SLOT_2, 'runtime-3', 5);
    play(match, 2, WorldChallengeSlotKey.SLOT_2, 'runtime-4', 7);
    // Complete the remaining eight positions so the Match finishes.
    for (const occurrenceIndex of [0, 1, 2]) {
      for (const slotKey of MATCH_SLOT_ORDER) {
        const positionKey = `${occurrenceIndex}#${slotKey}`;
        const already = match
          .unifiedBoard()
          .find((position) => position.positionKey === positionKey);
        if (already?.status !== MatchSlotStatus.COMPLETED) {
          play(match, occurrenceIndex, slotKey, `fill-${positionKey}`, 1);
        }
      }
    }

    expect(match.status).toBe(MatchStatus.COMPLETED);
    await matches.create(match);

    const loaded = (await matches.findById(match.id))!;
    expect(loaded.stage).toBe(MatchStage.MATCH_COMPLETE);
    expect(loaded.result()).toEqual(match.result());
    // Each occurrence kept its own pool, including the repeated World.
    expect(loaded.selectedScopeIds(0)).toEqual(pools[0]);
    expect(loaded.selectedScopeIds(2)).toEqual(pools[2]);
    expect(loaded.selectedScopeIds(0)).not.toEqual(loaded.selectedScopeIds(2));

    // The two Anime occurrences carry different subtotals.
    expect(loaded.worldSubtotals(0)).not.toEqual(loaded.worldSubtotals(2));
    expect(
      loaded.worldSubtotals(0).find((score) => score.teamId === teams[0].id)
        ?.signedTotal,
    ).toBe(7);
    expect(
      loaded.worldSubtotals(2).find((score) => score.teamId === teams[0].id)
        ?.signedTotal,
    ).toBe(10);
  });

  it('preserves a signed negative ScoreEvent and its original matchId', async () => {
    const match = unified();
    match.launchChallenge({
      commandId: 'cmd-launch',
      now: now(20),
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      challengeKey: 'read-your-opponent',
      runtimeId: 'runtime-1',
      contentItemIds: ['item-1', 'item-2', 'item-3'],
      launchability: MatchSlotLaunchability.LAUNCHABLE,
    });
    match.completeChallenge({
      commandId: 'cmd-complete',
      now: now(21),
      runtimeId: 'runtime-1',
      events: [
        event({ delta: -2, matchId: 'the-session-that-scored' }),
        event({ teamId: teams[1].id, delta: 1 }),
      ],
    });
    await matches.create(match);

    const loaded = (await matches.findById(match.id))!;
    const stored = loaded.serialize().scoreEvents;
    const negative = stored.find((candidate) => candidate.delta === -2);
    expect(negative).toBeDefined();
    // Provenance is history: the Match never rewrites it to its own id.
    expect(negative!.matchId).toBe('the-session-that-scored');
    expect(negative!.challengeSessionId).toBe('runtime-1');
    // The signed total stays negative while the display total clamps.
    expect(loaded.teamScore(teams[0].id)).toEqual({
      teamId: teams[0].id,
      signedTotal: -2,
      displayTotal: 0,
    });
  });

  it('persists processed command ids so a replayed command changes nothing', async () => {
    const match = unified();
    await matches.create(match);

    const first = (await matches.findById(match.id))!;
    const revision = first.revision;
    first.launchChallenge({
      commandId: 'cmd-launch-once',
      now: now(20),
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      challengeKey: 'read-your-opponent',
      runtimeId: 'runtime-1',
      contentItemIds: ['item-1', 'item-2', 'item-3'],
      launchability: MatchSlotLaunchability.LAUNCHABLE,
    });
    await matches.save(first, revision);

    const reloaded = (await matches.findById(match.id))!;
    expect(reloaded.isDuplicate('cmd-launch-once')).toBe(true);
    const before = reloaded.serialize();
    reloaded.launchChallenge({
      commandId: 'cmd-launch-once',
      now: now(22),
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_3,
      challengeKey: 'read-your-opponent',
      runtimeId: 'runtime-2',
      contentItemIds: ['item-4', 'item-5', 'item-6'],
      launchability: MatchSlotLaunchability.LAUNCHABLE,
    });
    expect(reloaded.serialize()).toEqual(before);
  });

  /**
   * The preconfigured contract has to survive Mongo unchanged, because a unified
   * Match keeps nothing in a client: the twelve positions, their mechanics, the
   * three Scope pools, and whose turn it is are all authoritative state.
   */
  describe('a unified preconfigured Match', () => {
    it('reloads at the board with an identical twelve-position board', async () => {
      const match = unified();
      await matches.create(match);

      const loaded = (await matches.findById(match.id))!;
      expect(loaded.serialize()).toEqual(match.serialize());
      expect(loaded.setupMode).toBe(MatchSetupMode.UNIFIED_PRECONFIGURED);
      expect(loaded.stage).toBe(MatchStage.BOARD);
      expect(loaded.status).toBe(MatchStatus.ACTIVE);
      expect(loaded.selectingTeamId).toBe(teams[1].id);
      expect(loaded.unifiedBoard()).toEqual(match.unifiedBoard());
      expect(loaded.unifiedBoard()).toHaveLength(12);
      // Each occurrence reloads with its own pool, including the repeated World.
      expect(loaded.selectedScopeIds(0)).toEqual(pools[0]);
      expect(loaded.selectedScopeIds(1)).toEqual(pools[1]);
      expect(loaded.selectedScopeIds(2)).toEqual(pools[2]);
    });

    it('reloads a partly played board position by position', async () => {
      const match = unified();
      const playedFirst = 'runtime-occurrence-2';
      // Occurrence 2 before occurrence 0, which is the point of the redesign.
      match.launchChallenge({
        commandId: 'launch-2',
        now: now(10),
        occurrenceIndex: 2,
        slotKey: WorldChallengeSlotKey.SLOT_3,
        challengeKey: 'read-your-opponent',
        runtimeId: playedFirst,
        contentItemIds: ['x1', 'x2', 'x3'],
        launchability: MatchSlotLaunchability.LAUNCHABLE,
      });
      match.completeChallenge({
        commandId: 'complete-2',
        now: now(11),
        runtimeId: playedFirst,
        events: [event({ delta: 3, challengeSessionId: playedFirst })],
      });
      match.continueFromChallengeResult({
        commandId: 'continue-2',
        now: now(11),
      });
      match.launchChallenge({
        commandId: 'launch-0',
        now: now(12),
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_1,
        challengeKey: 'read-your-opponent',
        runtimeId: 'runtime-occurrence-0',
        contentItemIds: ['y1', 'y2', 'y3'],
        launchability: MatchSlotLaunchability.LAUNCHABLE,
        selectingTeamId: match.selectingTeamId,
      });
      await matches.create(match);

      const loaded = (await matches.findById(match.id))!;
      expect(loaded.serialize()).toEqual(match.serialize());
      expect(loaded.stage).toBe(MatchStage.CHALLENGE);
      expect(loaded.currentChallenge).toEqual({
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_1,
        challengeKey: 'read-your-opponent',
        runtimeId: 'runtime-occurrence-0',
        contentItemIds: ['y1', 'y2', 'y3'],
        startedAt: now(12),
        doubledTeamIds: [],
      });
      const board = loaded.unifiedBoard();
      const status = (positionKey: string) =>
        board.find((position) => position.positionKey === positionKey)?.status;
      expect(status('2#slot_3')).toBe(MatchSlotStatus.COMPLETED);
      expect(status('0#slot_1')).toBe(MatchSlotStatus.IN_PROGRESS);
      // Every other position is still exactly as it was configured.
      expect(
        board.filter(
          (position) => position.status === MatchSlotStatus.AVAILABLE,
        ),
      ).toHaveLength(10);
      // The completed score belongs to occurrence 2 alone.
      expect(
        loaded.worldSubtotals(2).find((score) => score.teamId === teams[0].id)
          ?.signedTotal,
      ).toBe(3);
      expect(
        loaded.worldSubtotals(0).find((score) => score.teamId === teams[0].id)
          ?.signedTotal,
      ).toBe(0);
    });

    it('treats a stored Match with no setup mode as the only mode there is', async () => {
      const match = unified();
      await matches.create(match);
      // Exactly how every Match written before the unified redesign looks.
      await database
        .collection('matches')
        .updateOne({ matchId: match.id }, { $unset: { setupMode: '' } });

      const loaded = (await matches.findById(match.id))!;
      expect(loaded.setupMode).toBe(MatchSetupMode.UNIFIED_PRECONFIGURED);
      expect(loaded.stage).toBe(MatchStage.BOARD);
      expect(loaded.serialize()).toEqual(match.serialize());
      // The absent setup mode changes nothing about how it plays.
      expect(() =>
        loaded.launchChallenge({
          commandId: 'unified-launch',
          now: now(30),
          occurrenceIndex: 0,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          challengeKey: 'read-your-opponent',
          runtimeId: 'runtime-unified',
          contentItemIds: ['a', 'b', 'c'],
          launchability: MatchSlotLaunchability.LAUNCHABLE,
        }),
      ).not.toThrow();
    });
  });

  it('rejects a stored Match whose ScoreEvents were tampered with', async () => {
    const match = unified();
    await matches.create(match);
    await database
      .collection('matches')
      .updateOne(
        { matchId: match.id },
        { $set: { scoreEvents: [{ id: 'forged', delta: 9_999 }] } },
      );

    await expect(matches.findById(match.id)).rejects.toMatchObject({
      response: { code: 'MALFORMED_SCORE_EVENT' },
    });
  });
});
