import { GameplayObserverRegistry } from '../../live-game-sessions/application/gameplay-observer.registry';
import { LiveGameSessionSnapshot } from '../../live-game-sessions/application/live-game-session.snapshot';
import { LiveSessionActor } from '../../live-game-sessions/application/live-session-actor';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import { ScoringService } from '../../scoring/application/scoring.service';
import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { ConfiguredWorldOccurrence } from '../domain/configured-world-occurrence';
import { Match } from '../domain/match';
import {
  MATCH_SLOT_ORDER,
  MatchSlotLaunchability,
  MatchSlotStatus,
  MatchStage,
} from '../domain/match.constants';
import { MatchBoardPositionConfiguration } from '../domain/unified-match-board.policy';
import { LiveGameSessionRepository } from '../../live-game-sessions/domain/live-game-session.repository';
import { LiveSessionJoinAccessRepository } from '../../live-game-sessions/domain/live-session-join-access.repository';
import { MatchRepository } from '../persistence/match.repository';
import { ChallengeLauncherRegistry } from './challenge-launcher.registry';
import { MatchChallengeReadinessService } from './match-challenge-readiness.service';
import { MatchContentPool } from './match-content-pool.service';
import { MatchReconciliationService } from './match-reconciliation.service';
import { MatchSnapshotComposer } from './match-snapshot.composer';
import { MatchWorldCatalog } from './match-world.catalog';

const RYO = 'read-your-opponent';

describe('MatchSnapshotComposer', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const scoring = new ScoringService(new ScoringRuleRegistry());

  const snapshot = (): LiveGameSessionSnapshot =>
    ({ sessionId: 'live-session-1' }) as LiveGameSessionSnapshot;

  /** The canonical RYO mechanic has a launcher; every other slot does not. */
  const catalog = () =>
    ({
      launchabilityFor: (slot: { challengeTypeSlug?: string }) =>
        slot?.challengeTypeSlug === RYO
          ? MatchSlotLaunchability.LAUNCHABLE
          : MatchSlotLaunchability.CONFIGURED_BUT_UNIMPLEMENTED,
    }) as unknown as MatchWorldCatalog;

  const composerFor = (match: Match | null) => {
    const repository: MatchRepository = {
      create: () => Promise.resolve(),
      findById: () => Promise.resolve(match),
      findActiveBySessionId: () => Promise.resolve(match),
      findLatestBySessionId: () => Promise.resolve(match),
      save: () => Promise.resolve(),
    };
    const runtimes = {
      create: () => Promise.resolve(),
      findById: () => Promise.resolve(null),
      // No runtime in flight, so read-side convergence has nothing to reconcile.
      findBySessionId: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      findSessionIdsWithLiveRuntimes: () => Promise.resolve([]),
    };
    // Scope names only; content eligibility is proven in its own tests.
    const contentPool = {
      listSelectableScopes: () =>
        Promise.resolve([
          { scopeId: 's1', name: 'كأس العالم', readyContentItemCount: 40 },
          {
            scopeId: 's2',
            name: 'الدوري الإنجليزي',
            readyContentItemCount: 30,
          },
          { scopeId: 's3', name: 'الدوري السعودي', readyContentItemCount: 22 },
          { scopeId: 's4', name: 'أبطال أوروبا', readyContentItemCount: 18 },
        ]),
    } as unknown as MatchContentPool;
    const reconciliation = {
      ensureReconciled: () =>
        Promise.resolve({ outcome: 'no_current_challenge' as const }),
    };
    return new MatchSnapshotComposer(
      new GameplayObserverRegistry(),
      repository,
      catalog(),
      runtimes,
      reconciliation as unknown as MatchReconciliationService,
      contentPool,
      launchers(),
      new MatchChallengeReadinessService(),
      // Two connected players per team, which satisfies every readiness range the
      // registered mechanics declare.
      {
        findById: () =>
          Promise.resolve({
            serialize: () => ({
              teams: [
                { id: 'team-alpha', name: 'ألفا', active: true },
                { id: 'team-beta', name: 'بيتا', active: true },
              ],
              participants: [
                phone('p1', 'team-alpha'),
                phone('p2', 'team-alpha'),
                phone('p3', 'team-beta'),
                phone('p4', 'team-beta'),
              ],
            }),
          }),
      } as unknown as LiveGameSessionRepository,
      {
        findCurrentBySessionId: () => Promise.resolve(null),
      } as unknown as LiveSessionJoinAccessRepository,
    );
  };

  const phone = (id: string, teamId: string) => ({
    id,
    displayName: id,
    role: 'team-player',
    teamId,
    connected: true,
  });

  /**
   * Only the canonical RYO mechanic has a launcher, and it declares that it needs
   * phones — which is where the projection's `requiresPhones` comes from.
   */
  const launchers = () => {
    const registry = new ChallengeLauncherRegistry();
    registry.register({
      key: RYO,
      launchRequirements: { contentItemCount: 3, requiresPhones: true },
      supports: (input) => input.challengeTypeSlug === RYO,
      validateLaunch: () => Promise.resolve(),
      launch: () => Promise.resolve({ runtimeId: 'runtime-1' }),
      detectTerminal: () => false,
      buildCompletionSummary: () => ({ challengeKey: RYO, details: {} }),
    });
    return registry;
  };

  /** The example configuration: World 1, World 2, World 1 again. */
  const occurrences = (): ConfiguredWorldOccurrence[] => [
    {
      occurrenceIndex: 0,
      worldId: 'world-1',
      selectedScopeIds: ['s1', 's2', 's3', 's4'],
    },
    {
      occurrenceIndex: 1,
      worldId: 'world-2',
      selectedScopeIds: ['s1', 's2', 's3', 's4'],
    },
    {
      occurrenceIndex: 2,
      worldId: 'world-1',
      selectedScopeIds: ['s5', 's6', 's7', 's8'],
    },
  ];

  const boardPositions = (
    configured: ConfiguredWorldOccurrence[] = occurrences(),
  ): MatchBoardPositionConfiguration[] =>
    configured.flatMap((occurrence) =>
      MATCH_SLOT_ORDER.map((slotKey) => ({
        occurrenceIndex: occurrence.occurrenceIndex,
        worldId: occurrence.worldId,
        slotKey,
        challengeTypeId: `type-${slotKey}`,
        challengeTypeSlug:
          slotKey === WorldChallengeSlotKey.SLOT_2 ? RYO : `other-${slotKey}`,
        displayName: 'اقرأ خصمك',
      })),
    );

  /** A fully configured Match, created the only way a Match is created now. */
  const unifiedMatch = (
    options: {
      winnerTeamId?: string;
      configured?: ConfiguredWorldOccurrence[];
      positions?: MatchBoardPositionConfiguration[];
    } = {},
  ): Match => {
    const configured = options.configured ?? occurrences();
    return Match.createUnified({
      liveSessionId: 'live-session-1',
      teams: [
        { id: 'team-alpha', name: 'ألفا' },
        { id: 'team-beta', name: 'بيتا' },
      ],
      occurrences: configured,
      boardPositions: options.positions ?? boardPositions(configured),
      coinToss: {
        winnerTeamId: options.winnerTeamId ?? 'team-alpha',
        roll: 0,
        resolvedAt: now,
      },
      now,
    });
  };

  const controller: LiveSessionActor = { kind: 'user', actorId: 'host-1' };
  const player: LiveSessionActor = {
    kind: 'participant',
    actorId: 'participant-1',
    sessionId: 'live-session-1',
    participantId: 'participant-1',
    role: 'team-player',
    credentialVersion: 1,
  };

  it('leaves a session without a Match exactly as it was', async () => {
    const value = snapshot();
    await composerFor(null).enrich(value, controller);

    expect(value.match).toBeUndefined();
  });

  it('projects the stage with the presentation the clients must not invent', async () => {
    const value = snapshot();
    await composerFor(unifiedMatch()).enrich(value, controller);

    expect(value.match?.stage).toEqual({
      key: MatchStage.BOARD,
      enteredAt: now.toISOString(),
      minimumDisplayDurationMs: 0,
      audioCue: 'board-enter',
      animationCue: 'board-reveal',
    });
    // Every Match is unified; the projection always carries the preconfigured contract.
    expect(value.match?.unified.board.totalPositionCount).toBe(12);
  });

  it('reports an unimplemented board position instead of hiding it', async () => {
    const value = snapshot();
    await composerFor(unifiedMatch()).enrich(value, controller);

    const positions = value.match!.unified!.board.positions;
    expect(
      positions.find((position) => position.positionKey === '0#slot_1'),
    ).toMatchObject({
      launchability: MatchSlotLaunchability.CONFIGURED_BUT_UNIMPLEMENTED,
      status: MatchSlotStatus.AVAILABLE,
      unavailableReason: 'launcher_not_implemented',
    });
    expect(
      positions.find((position) => position.positionKey === '0#slot_2'),
    ).toMatchObject({
      launchability: MatchSlotLaunchability.LAUNCHABLE,
      status: MatchSlotStatus.AVAILABLE,
      challengeName: 'اقرأ خصمك',
    });
  });

  it('gives Match commands to the controller and none to a participant', async () => {
    const match = unifiedMatch();
    const hostView = snapshot();
    const playerView = snapshot();
    await composerFor(match).enrich(hostView, controller);
    await composerFor(match).enrich(playerView, player);

    expect(hostView.match?.availableActions).toEqual([
      'match:launch-challenge',
      'match:cancel',
    ]);
    expect(playerView.match?.availableActions).toEqual([]);
  });

  it('publishes team totals but never the ScoreEvents behind them', async () => {
    const match = unifiedMatch();
    match.launchChallenge({
      commandId: 'launch',
      now,
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      challengeKey: RYO,
      runtimeId: 'runtime-1',
      contentItemIds: ['a', 'b', 'c'],
      launchability: MatchSlotLaunchability.LAUNCHABLE,
    });
    match.completeChallenge({
      commandId: 'complete',
      now,
      runtimeId: 'runtime-1',
      events: scoring.restoreEvents([
        {
          id: 'event-1',
          matchId: 'live-session-1',
          teamId: 'team-alpha',
          challengeSessionId: 'runtime-1',
          scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
          delta: -4,
          reason: 'STEAL_WRONG',
          createdAt: now.toISOString(),
        },
      ]),
    });
    const value = snapshot();
    await composerFor(match).enrich(value, player);

    // Signed totals stay signed; the display total clamps for the scoreboard.
    expect(value.match?.scoring.matchTotals).toEqual([
      { teamId: 'team-alpha', signedTotal: -4, displayTotal: 0 },
      { teamId: 'team-beta', signedTotal: 0, displayTotal: 0 },
    ]);
    const serialized = JSON.stringify(value.match);
    expect(serialized).not.toContain('scoringRuleId');
    expect(serialized).not.toContain('STEAL_WRONG');
    expect(serialized).not.toContain('event-1');
  });

  describe('a preconfigured Match', () => {
    it('publishes its setup mode, three occurrences, and twelve positions', async () => {
      const value = snapshot();
      await composerFor(unifiedMatch({ winnerTeamId: 'team-beta' })).enrich(
        value,
        controller,
      );

      expect(value.match?.setupMode).toBe('unified_preconfigured');
      expect(value.match?.stage.key).toBe(MatchStage.BOARD);
      expect(value.match?.unified?.selectingTeamId).toBe('team-beta');
      expect(value.match?.unified?.occurrences).toHaveLength(3);
      expect(
        value.match?.unified?.occurrences.map(
          (occurrence) => occurrence.selectedScopeIds.length,
        ),
      ).toEqual([4, 4, 4]);
      expect(value.match?.unified?.board.totalPositionCount).toBe(12);
      expect(value.match?.unified?.board.positions).toHaveLength(12);
      expect(value.match?.unified?.board.completedPositionCount).toBe(0);
    });

    it('keys positions by occurrence and slot, never by World', async () => {
      const value = snapshot();
      await composerFor(unifiedMatch()).enrich(value, controller);

      const positions = value.match!.unified!.board.positions;
      expect(
        new Set(positions.map((position) => position.positionKey)).size,
      ).toBe(12);
      expect(positions[0].positionKey).toBe('0#slot_1');
      // The repeated World keeps its own pool at its own positions.
      const repeated = positions.filter(
        (position) => position.occurrenceIndex === 2,
      );
      expect(repeated).toHaveLength(4);
      expect(value.match!.unified!.occurrences[2].selectedScopeIds).toEqual([
        's5',
        's6',
        's7',
        's8',
      ]);
      expect(value.match!.unified!.occurrences[0].selectedScopeIds).toEqual([
        's1',
        's2',
        's3',
        's4',
      ]);
    });

    it('reports launchability per position and leaves out the legacy sections', async () => {
      const value = snapshot();
      await composerFor(unifiedMatch()).enrich(value, controller);

      const positions = value.match!.unified!.board.positions;
      expect(
        positions
          .filter(
            (position) => position.slotKey === WorldChallengeSlotKey.SLOT_2,
          )
          .map((position) => position.launchability),
      ).toEqual([
        MatchSlotLaunchability.LAUNCHABLE,
        MatchSlotLaunchability.LAUNCHABLE,
        MatchSlotLaunchability.LAUNCHABLE,
      ]);
      expect(
        positions
          .filter(
            (position) => position.slotKey === WorldChallengeSlotKey.SLOT_1,
          )
          .map((position) => position.launchability),
      ).toEqual([
        MatchSlotLaunchability.CONFIGURED_BUT_UNIMPLEMENTED,
        MatchSlotLaunchability.CONFIGURED_BUT_UNIMPLEMENTED,
        MatchSlotLaunchability.CONFIGURED_BUT_UNIMPLEMENTED,
      ]);
      // The same slot appears across all three occurrences; each position
      // reports its own launchability and status.
      expect(value.match?.unified.board.positions).toHaveLength(12);
    });

    it('marks only the completed position and counts it once', async () => {
      const match = unifiedMatch();
      match.launchChallenge({
        commandId: 'launch',
        now,
        occurrenceIndex: 2,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        challengeKey: RYO,
        runtimeId: 'runtime-1',
        contentItemIds: ['a'],
        launchability: MatchSlotLaunchability.LAUNCHABLE,
      });
      match.completeChallenge({
        commandId: 'complete',
        now,
        runtimeId: 'runtime-1',
        events: scoring.restoreEvents([
          {
            id: 'event-1',
            matchId: 'live-session-1',
            teamId: 'team-alpha',
            challengeSessionId: 'runtime-1',
            scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
            delta: 2,
            reason: 'TRUST_CORRECT',
            createdAt: now.toISOString(),
          },
        ]),
      });

      const value = snapshot();
      await composerFor(match).enrich(value, controller);

      const board = value.match!.unified!.board;
      expect(board.completedPositionCount).toBe(1);
      const completed = board.positions.filter(
        (position) => position.status === MatchSlotStatus.COMPLETED,
      );
      expect(completed.map((position) => position.positionKey)).toEqual([
        '2#slot_2',
      ]);
      expect(completed[0].scoreSummary).toHaveLength(2);
      // Occurrence 0's identically-slotted position is untouched.
      expect(
        board.positions.find((position) => position.positionKey === '0#slot_2')
          ?.status,
      ).toBe(MatchSlotStatus.AVAILABLE);
      // Only the occurrence that played it carries the subtotal.
      expect(
        value.match!.unified!.occurrences[2].subtotals.find(
          (score) => score.teamId === 'team-alpha',
        )?.signedTotal,
      ).toBe(2);
      expect(
        value.match!.unified!.occurrences[0].subtotals.find(
          (score) => score.teamId === 'team-alpha',
        )?.signedTotal,
      ).toBe(0);
      const serialized = JSON.stringify(value.match);
      expect(serialized).not.toContain('TRUST_CORRECT');
      expect(serialized).not.toContain('scoringRuleId');
      expect(serialized).not.toContain('contentItemIds');
    });
  });
});
