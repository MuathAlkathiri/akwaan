import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  GameplayObserverRegistry,
  SessionSnapshotEnricher,
} from '../../live-game-sessions/application/gameplay-observer.registry';
import { LiveGameSessionSnapshot } from '../../live-game-sessions/application/live-game-session.snapshot';
import { LiveSessionActor } from '../../live-game-sessions/application/live-session-actor';
import {
  LiveSessionChallengeResult,
  LiveSessionConfiguredOccurrence,
  LiveSessionMatchProjection,
  LiveSessionMatchScope,
  LiveSessionMatchTeamScore,
  LiveSessionUnifiedBoardPosition,
  LiveSessionUnifiedMatchProjection,
  LiveSessionUnifiedPreflight,
} from '../../live-game-sessions/application/live-session-match.projection';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../../live-game-sessions/domain/live-game-session.repository';
import {
  LIVE_SESSION_JOIN_ACCESS_REPOSITORY,
  LiveSessionJoinAccessRepository,
} from '../../live-game-sessions/domain/live-session-join-access.repository';
import { Match } from '../domain/match';
import {
  MATCH_STAGE_PRESENTATION,
  MATCH_UNIFIED_BOARD_POSITION_COUNT,
  MatchSlotLaunchability,
  MatchSlotStatus,
  MatchStage,
  MatchStatus,
} from '../domain/match.constants';
import { unifiedMatchBoardPolicy } from '../domain/unified-match-board.policy';
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../persistence/match.repository';
import { ChallengeLauncherRegistry } from './challenge-launcher.registry';
import { MatchChallengeReadinessService } from './match-challenge-readiness.service';
import { MatchReconciliationService } from './match-reconciliation.service';
import { MatchContentPool } from './match-content-pool.service';
import { MatchWorldCatalog } from './match-world.catalog';

/**
 * Adds `snapshot.match` to the authoritative live-session snapshot.
 *
 * There is deliberately no second client protocol: the Match is one more
 * projection on the snapshot the clients already read, and `gameplay` keeps
 * describing the mechanic in progress. Nothing a client must not know is
 * included — no unresolved random World, no mechanic-private payload, and no
 * ScoreEvent internals beyond the totals a scoreboard needs.
 */
@Injectable()
export class MatchSnapshotComposer
  implements SessionSnapshotEnricher, OnModuleInit
{
  readonly name = 'match-projection';

  constructor(
    private readonly observers: GameplayObserverRegistry,
    @Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository,
    private readonly worlds: MatchWorldCatalog,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly reconciliation: MatchReconciliationService,
    private readonly contentPool: MatchContentPool,
    private readonly launchers: ChallengeLauncherRegistry,
    private readonly readinessService: MatchChallengeReadinessService,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_JOIN_ACCESS_REPOSITORY)
    private readonly joinAccess: LiveSessionJoinAccessRepository,
  ) {}

  onModuleInit(): void {
    this.observers.registerSnapshotEnricher(this);
  }

  async enrich(
    snapshot: LiveGameSessionSnapshot,
    actor: LiveSessionActor,
  ): Promise<void> {
    // Convergence point: a reconciliation deferred by a revision conflict is
    // retried here, before anyone is shown a stale Match.
    await this.reconciliation.ensureReconciled(
      snapshot.sessionId,
      (await this.runtimes.findBySessionId(snapshot.sessionId))?.serialize(),
    );
    const match = await this.matches.findLatestBySessionId(snapshot.sessionId);
    // A session without a Match keeps exactly the snapshot it had before.
    if (!match) return;
    snapshot.match = await this.project(match, actor);
  }

  private async project(
    match: Match,
    actor: LiveSessionActor,
  ): Promise<LiveSessionMatchProjection> {
    const presentation = MATCH_STAGE_PRESENTATION[match.stage];
    const isController = actor.kind === 'user';

    return {
      id: match.id,
      revision: match.revision,
      setupMode: match.setupMode,
      status: match.status,
      stage: {
        key: match.stage,
        enteredAt: match.serialize().stageEnteredAt.toISOString(),
        minimumDisplayDurationMs: presentation.minimumDisplayDurationMs,
        audioCue: presentation.audioCue,
        animationCue: presentation.animationCue,
      },
      coinToss: match.coinToss
        ? {
            status: 'resolved',
            winnerTeamId: match.coinToss.winnerTeamId,
            firstChooserTeamId: match.coinToss.winnerTeamId,
          }
        : { status: 'pending' },
      unified: await this.unified(match, actor),
      ...(match.currentChallenge
        ? {
            currentChallenge: {
              occurrenceIndex: match.currentChallenge.occurrenceIndex,
              slotKey: match.currentChallenge.slotKey,
              challengeKey: match.currentChallenge.challengeKey,
              runtimeId: match.currentChallenge.runtimeId,
              startedAt: match.currentChallenge.startedAt.toISOString(),
              doubledTeamIds: [...match.currentChallenge.doubledTeamIds],
            },
          }
        : {}),
      doubles: match.teamDoubles.map((token) => ({
        teamId: token.teamId,
        // Armed choices stay private until launch.
        status: token.status === 'armed' ? 'available' : token.status,
      })),
      scoring: {
        matchTotals: match.teams.map((team) => this.score(match, team.id)),
        // World subtotals ride on each occurrence of `unified`; the projection
        // has no single "current" occurrence to answer for.
        worldSubtotals: [],
      },
      standings: match.teams.map((team) => ({
        ...this.score(match, team.id),
        name: team.name,
      })),
      ...(match.pendingResult
        ? { challengeResult: this.challengeResult(match.pendingResult) }
        : {}),
      challengeHistory: match.challengeResults.map((result) =>
        this.challengeResult(result),
      ),
      ...(match.stage === MatchStage.MATCH_COMPLETE ||
      match.status === MatchStatus.COMPLETED
        ? { result: this.result(match) }
        : {}),
      availableActions: isController ? this.controllerActions(match) : [],
    };
  }

  /**
   * Public Scope summaries only: a name is what a player needs to recognise the
   * pool, and nothing about its content reaches a participant or a screen.
   */
  private async describeScopes(
    worldId: string,
    scopeIds: string[],
  ): Promise<Array<{ scopeId: string; name: string }>> {
    if (!scopeIds.length) return [];
    try {
      const selectable = await this.contentPool.listSelectableScopes(worldId);
      const byId = new Map(
        selectable.map((scope) => [scope.scopeId, scope.name]),
      );
      return scopeIds.map((scopeId) => ({
        scopeId,
        name: byId.get(scopeId) ?? '',
      }));
    } catch {
      // A World edited mid-match must not break an in-flight snapshot.
      return scopeIds.map((scopeId) => ({ scopeId, name: '' }));
    }
  }

  /**
   * The preconfigured Match: its three occurrences and all twelve board
   * positions, every one of them independently playable.
   *
   * The mechanic identity comes from the board the Match persisted at creation,
   * not from World Content as it stands now, so this projection is stable for the
   * life of the Match. Nothing authoring-only or ContentItem-private is exposed —
   * a position names its mechanic and its Scope pool, never its content.
   */
  private async unified(
    match: Match,
    actor: LiveSessionActor,
  ): Promise<LiveSessionUnifiedMatchProjection> {
    const positions = match.unifiedBoard();
    const preflight = await this.unifiedPreflight(match, actor);
    const occurrences: LiveSessionConfiguredOccurrence[] = [];
    // A repeated World is described once; its two occurrences still keep their own
    // pools, so only the name lookup is shared.
    const namesByWorld = new Map<string, LiveSessionMatchScope[]>();
    for (const occurrence of match.occurrences) {
      const known = namesByWorld.get(occurrence.worldId);
      const described =
        known ??
        (await this.describeScopes(
          occurrence.worldId,
          // Every Scope of the World, so a repeated World resolves names once.
          match.occurrences
            .filter((candidate) => candidate.worldId === occurrence.worldId)
            .flatMap((candidate) => candidate.selectedScopeIds),
        ));
      namesByWorld.set(occurrence.worldId, described);
      const byId = new Map(described.map((scope) => [scope.scopeId, scope]));
      const selectedScopes = occurrence.selectedScopeIds.map(
        (scopeId) => byId.get(scopeId) ?? { scopeId, name: '' },
      );
      occurrences.push({
        occurrenceIndex: occurrence.index,
        worldId: occurrence.worldId,
        ...(this.worldNameFor(match, occurrence.index)
          ? { worldName: this.worldNameFor(match, occurrence.index) }
          : {}),
        selectedScopeIds: [...occurrence.selectedScopeIds],
        selectedScopes,
        ...(occurrence.completedAt
          ? { completedAt: occurrence.completedAt.toISOString() }
          : {}),
        subtotals: match.worldSubtotals(occurrence.index),
      });
    }

    return {
      occurrences,
      board: {
        positions: positions.map((position) =>
          this.unifiedPosition(match, position),
        ),
        totalPositionCount: MATCH_UNIFIED_BOARD_POSITION_COUNT,
        completedPositionCount:
          unifiedMatchBoardPolicy.completedCount(positions),
      },
      ...(match.selectingTeamId
        ? { selectingTeamId: match.selectingTeamId }
        : {}),
      ...(preflight ? { preflight } : {}),
    };
  }

  /**
   * The prepared position and whether its phones are in the room.
   *
   * Everything here is derived from persisted Match state plus the live session, so
   * a refresh restores the same preflight. The readiness requirement comes from the
   * mechanic's launcher, and the counting is done by one shared service — the same
   * one the launch re-runs, so the button and the server cannot disagree.
   */
  private async unifiedPreflight(
    match: Match,
    actor: LiveSessionActor,
  ): Promise<LiveSessionUnifiedPreflight | undefined> {
    const pending = match.pendingChallenge;
    if (!pending) return undefined;
    const position = match
      .unifiedBoard()
      .find((candidate) => candidate.positionKey === pending.positionKey);
    const occurrence = match.occurrences.find(
      (candidate) => candidate.index === pending.occurrenceIndex,
    );
    const requirement =
      this.launchers.find({ challengeTypeSlug: pending.challengeTypeSlug })
        ?.launchRequirements.readiness ?? pending.readiness;
    const session = await this.sessions.findById(match.liveSessionId);
    const readiness =
      requirement && session
        ? this.readinessService.evaluate({
            session: session.serialize(),
            requirement,
          })
        : undefined;
    const join = pending.joinCode
      ? await this.joinFor(match.liveSessionId, pending.joinCode)
      : undefined;
    const ownAssignment =
      actor.kind === 'participant'
        ? pending.doubleAssignments?.assignments.find(
            (assignment) => assignment.participantId === actor.participantId,
          )
        : undefined;
    const ownToken = ownAssignment
      ? match.teamDoubles.find((token) => token.teamId === ownAssignment.teamId)
      : undefined;

    return {
      positionKey: pending.positionKey,
      occurrenceIndex: pending.occurrenceIndex,
      slotKey: pending.slotKey,
      worldId: occurrence?.worldId ?? position?.worldId ?? '',
      ...(position?.worldName ? { worldName: position.worldName } : {}),
      challengeTypeId: pending.challengeTypeId,
      challengeKey: pending.challengeTypeSlug,
      challengeName: position?.displayName ?? pending.challengeTypeSlug,
      ...(position?.description ? { description: position.description } : {}),
      ...(position?.instructions
        ? { instructions: position.instructions }
        : {}),
      requiresPhones: pending.requiresPhones,
      selectedScopes: occurrence
        ? await this.describeScopes(
            occurrence.worldId,
            occurrence.selectedScopeIds,
          )
        : [],
      ...(join ? { join } : {}),
      ...(requirement
        ? {
            requirement: {
              minParticipantsPerTeam: requirement.minParticipantsPerTeam,
              ...(requirement.maxParticipantsPerTeam !== undefined
                ? {
                    maxParticipantsPerTeam: requirement.maxParticipantsPerTeam,
                  }
                : {}),
              requiresBothTeams: requirement.requiresBothTeams,
            },
          }
        : {}),
      teams: readiness?.teams ?? [],
      allTeamsReady: readiness ? readiness.allTeamsReady : true,
      // A mechanic that needs no phones is ready the moment it is prepared.
      readyToLaunch: pending.requiresPhones
        ? Boolean(readiness?.allTeamsReady)
        : true,
      blockingReasons: readiness?.blockingReasons ?? [],
      ...(pending.selectingTeamId
        ? { selectingTeamId: pending.selectingTeamId }
        : {}),
      preparedAt: pending.preparedAt.toISOString(),
      ...(ownAssignment && ownToken && ownToken.status !== 'consumed'
        ? {
            doubleControl: {
              teamId: ownAssignment.teamId,
              status: ownToken.status as 'available' | 'armed',
              assignmentSequence: ownAssignment.sequence,
            },
          }
        : {}),
    };
  }

  /**
   * The join code the host is showing, and where it points.
   *
   * The code comes from the prepared challenge, so it is stable; the expiry is read
   * from the session's own join access. No controller token or private credential is
   * ever included.
   */
  private async joinFor(
    sessionId: string,
    joinCode: string,
  ): Promise<LiveSessionUnifiedPreflight['join']> {
    let expiresAt: string | undefined;
    try {
      const access = await this.joinAccess.findCurrentBySessionId(sessionId);
      const state = access?.serialize();
      if (state?.publicCode === joinCode && state.enabled) {
        expiresAt = state.expiresAt.toISOString();
      }
    } catch {
      // A missing or unreadable access must not break an in-flight snapshot; the
      // code itself is still what the phone needs.
    }
    return {
      joinCode,
      // A path, not an absolute URL: the client that renders the QR is the only
      // thing that knows its own public origin, and inventing a server-side base
      // URL would add configuration for no gain.
      joinPath: `/join/live-session/${encodeURIComponent(joinCode)}`,
      ...(expiresAt ? { expiresAt } : {}),
    };
  }

  private unifiedPosition(
    match: Match,
    position: ReturnType<Match['unifiedBoard']>[number],
  ): LiveSessionUnifiedBoardPosition {
    const occurrence = match.occurrences.find(
      (candidate) => candidate.index === position.occurrenceIndex,
    );
    const eventIds = new Set(
      occurrence?.slots[position.slotKey]?.scoreEventIds ?? [],
    );
    const launcher = this.launchers.find({
      challengeTypeSlug: position.challengeTypeSlug,
    });
    const launchability = this.worlds.launchabilityFor(position);
    return {
      positionKey: position.positionKey,
      occurrenceIndex: position.occurrenceIndex,
      worldId: position.worldId,
      ...(position.worldName ? { worldName: position.worldName } : {}),
      slotKey: position.slotKey,
      challengeTypeId: position.challengeTypeId,
      challengeKey: position.challengeTypeSlug,
      challengeName: position.displayName,
      ...(position.description ? { description: position.description } : {}),
      ...(position.instructions ? { instructions: position.instructions } : {}),
      // The mechanic's own launcher declares this; nothing infers it from a slug.
      requiresPhones: launcher?.launchRequirements.requiresPhones ?? false,
      launchability,
      status: position.status,
      ...(position.status === MatchSlotStatus.UNAVAILABLE ||
      launchability !== MatchSlotLaunchability.LAUNCHABLE
        ? {
            unavailableReason:
              position.status === MatchSlotStatus.UNAVAILABLE
                ? ('invalid_configuration' as const)
                : ('launcher_not_implemented' as const),
          }
        : {}),
      ...(position.runtimeId ? { runtimeId: position.runtimeId } : {}),
      ...(position.completedAt
        ? { completedAt: position.completedAt.toISOString() }
        : {}),
      ...(eventIds.size
        ? { scoreSummary: this.slotScores(match, eventIds) }
        : {}),
    };
  }

  /** The World name this Match captured for an occurrence, if it captured one. */
  private worldNameFor(
    match: Match,
    occurrenceIndex: number,
  ): string | undefined {
    return match
      .unifiedBoard()
      .find((position) => position.occurrenceIndex === occurrenceIndex)
      ?.worldName;
  }

  /** The recorded result, verbatim. Nothing is recomputed on the way out. */
  private challengeResult(
    result: import('../domain/match').MatchChallengeResult,
  ): LiveSessionChallengeResult {
    return {
      id: result.id,
      positionKey: result.positionKey,
      occurrenceIndex: result.occurrenceIndex,
      slotKey: result.slotKey,
      worldId: result.worldId,
      ...(result.worldName ? { worldName: result.worldName } : {}),
      challengeTypeId: result.challengeTypeId,
      challengeKey: result.challengeKey,
      ...(result.challengeName ? { challengeName: result.challengeName } : {}),
      selectedScopeIds: [...result.selectedScopeIds],
      winnerTeamId: result.winnerTeamId,
      matchPoints: result.matchPoints.map((entry) => ({ ...entry })),
      tie: result.tie,
      double: {
        consumedTeamIds: [...result.double.consumedTeamIds],
        appliedTeamId: result.double.appliedTeamId,
      },
      details: result.details,
      startedAt: result.startedAt.toISOString(),
      completedAt: result.completedAt.toISOString(),
    };
  }

  private score(match: Match, teamId: string): LiveSessionMatchTeamScore {
    const score = match.teamScore(teamId);
    return {
      teamId: score.teamId,
      signedTotal: score.signedTotal,
      displayTotal: score.displayTotal,
    };
  }

  private result(match: Match): LiveSessionMatchProjection['result'] {
    const result = match.result();
    return {
      teams: result.teams,
      winnerTeamId: result.winnerTeamId,
      tie: result.tie,
      worlds: result.worlds.map((world) => ({
        occurrenceIndex: world.occurrenceIndex,
        worldId: world.worldId,
        subtotals: world.subtotals,
        ...(world.completedAt
          ? { completedAt: world.completedAt.toISOString() }
          : {}),
      })),
    };
  }

  /** Per-slot totals only; individual ScoreEvents stay server-side. */
  private slotScores(
    match: Match,
    eventIds: Set<string>,
  ): LiveSessionMatchTeamScore[] {
    const events = match
      .serialize()
      .scoreEvents.filter((event) => eventIds.has(event.id));
    return match.teams.map((team) => {
      const signedTotal = events
        .filter((event) => event.teamId === team.id)
        .reduce((total, event) => total + event.delta, 0);
      return {
        teamId: team.id,
        signedTotal,
        displayTotal: Math.max(0, signedTotal),
      };
    });
  }

  /** What the controller may do next, derived from the stage. */
  private controllerActions(match: Match): string[] {
    if (match.status !== MatchStatus.ACTIVE) return [];
    switch (match.stage) {
      case MatchStage.BOARD:
        return ['match:launch-challenge', 'match:cancel'];
      case MatchStage.CHALLENGE:
        return ['match:cancel'];
      case MatchStage.CHALLENGE_RESULT:
        // One action, and it is the only way off this stage.
        return ['match:continue-from-result', 'match:cancel'];
      default:
        return [];
    }
  }
}
