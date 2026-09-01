import { Inject, Injectable, Logger } from '@nestjs/common';
import { GameplayAuthorization } from './gameplay-authorization';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import {
  GameplayCommandPayload,
  GameplayCommandResult,
  GameplayModePlugin,
} from '../domain/gameplay-mode.plugin';
import {
  GameplayRuntimeNotFoundError,
  LiveSessionDomainError,
  LiveSessionForbiddenError,
  LiveSessionNotFoundError,
} from '../domain/live-session.errors';
import { GameplayRuntimeCommand } from './gameplay-runtime.executor';
import {
  GAMEPLAY_TRANSACTION_UNIT_OF_WORK,
  GameplayTransactionUnitOfWork,
} from './gameplay-transaction.unit-of-work';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import { LiveGameSessionSnapshotMapper } from './live-game-session.snapshot';
import { GameplayRuntimeSnapshotMapper } from './gameplay-runtime.snapshot';
import { actorSnapshotId } from './live-session-actor';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from './live-session-transition.publisher';
import {
  LiveGameSession,
  LiveGameSessionState,
} from '../domain/live-game-session';
import {
  PARENT_GAME_ACCESS,
  ParentGameAccess,
} from './parent-game-access.port';
import { ScoringService } from '../../scoring/application/scoring.service';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import {
  TOP5_MODE_KEY,
  Top5Ownership,
  Top5Result,
} from '../domain/top5-keep-or-give.plugin';
import { eligibleParticipantsOf } from './start-top5.use-case';
import { RAKKIBHA_MODE_KEY, RakkibhaResult } from '../domain/rakkibha.plugin';
import { GameplayObserverRegistry } from './gameplay-observer.registry';
import { BOMB_MODE_KEY } from '../domain/bomb-gameplay.plugin';
import { COMBO_MODE_KEY } from '../domain/combo-gameplay.plugin';
import { CLOSEST_MODE_KEY } from '../domain/closest-gameplay.plugin';
import { ONE_CLUE_MODE_KEY } from '../domain/one-clue-gameplay.plugin';
import { findEligibleTeamParticipant } from '../domain/team-participant-eligibility';
import { applyGameplaySessionEffects } from './gameplay-session-effects';
import { ODD_PIECE_MODE_KEY } from '../domain/odd-piece-gameplay.plugin';
import { LAQATHA_MODE_KEY } from '../domain/laqatha-gameplay.plugin';

/**
 * The authority behind `expire-team`, against the server clock and the
 * persisted team clock.
 *
 * Exported and pure because it *is* the deadline: whoever sends the command —
 * the scheduler, a host, a hand-crafted socket frame — has to pass this, so it
 * needs to be readable and testable on its own rather than buried in a private
 * method nothing can reach.
 *
 * Both refusals matter. A clock with time left is the obvious one. A session
 * where no team holds the turn is the subtle one: there is no clock to be past,
 * so "expired" is not a verdict anybody may claim. That case used to fall
 * through to `remaining = 0` and be accepted, which let an `expire-team` sent
 * after the host ended the turn decide a Bomb challenge at a moment of the
 * sender's choosing.
 *
 * A clock that is stopped but genuinely spent still expires: the deadline
 * really did pass, and only the ticking stopped.
 */
export function assertBombClockExpired(
  state: LiveGameSessionState,
  now: Date,
): void {
  const active = state.teams.find((team) => team.id === state.activeTeamId);
  if (!active) {
    throw new LiveSessionDomainError(
      'BOMB_NO_ACTIVE_TEAM',
      'No team holds the turn, so no clock can have expired',
    );
  }
  const elapsed =
    active.clock.running && active.clock.startedAt
      ? Math.max(0, now.getTime() - active.clock.startedAt.getTime())
      : 0;
  const remaining = Math.max(
    0,
    active.clock.allocatedMs - active.clock.consumedMs - elapsed,
  );
  if (remaining > 0) {
    throw new LiveSessionDomainError(
      'BOMB_CLOCK_NOT_EXPIRED',
      'The active team clock has not expired',
    );
  }
}

export function resolveGameplayCommandRepresentative(
  state: LiveGameSessionState,
  modeKey: string,
): string | undefined {
  if (!state.activeTeamId) return undefined;
  return findEligibleTeamParticipant(state.participants, {
    teamId: state.activeTeamId,
    requiresConnectedPresence: true,
    // Active Unified Match Bomb admits connected team players even though
    // lobby readiness is no longer mutable. Other legacy fallback paths keep
    // their explicit readiness contract.
    requiresReady: modeKey !== BOMB_MODE_KEY,
  })?.id;
}

@Injectable()
export class SubmitGameplayCommand {
  private readonly logger = new Logger(SubmitGameplayCommand.name);

  constructor(
    @Inject(GAMEPLAY_TRANSACTION_UNIT_OF_WORK)
    private readonly unitOfWork: GameplayTransactionUnitOfWork,
    private readonly modes: GameplayModeRegistry,
    private readonly authorization: GameplayAuthorization,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly sessionSnapshots: LiveGameSessionSnapshotMapper,
    private readonly gameplaySnapshots: GameplayRuntimeSnapshotMapper,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
    @Inject(PARENT_GAME_ACCESS)
    private readonly parentGames: ParentGameAccess,
    private readonly scoring: ScoringService,
    private readonly observers: GameplayObserverRegistry,
  ) {}

  async execute(
    command: GameplayRuntimeCommand & {
      roundId?: string;
      commandType: string;
      payload: GameplayCommandPayload;
    },
  ) {
    const result = await this.unitOfWork.execute(async (context) => {
      const session = await context.findSession(command.sessionId);
      if (!session) throw new LiveSessionNotFoundError(command.sessionId);
      const runtime = await context.findRuntime(command.sessionId);
      if (!runtime) throw new GameplayRuntimeNotFoundError(command.sessionId);
      if (
        command.actor.kind === 'participant' &&
        command.actor.sessionId !== command.sessionId
      ) {
        throw new LiveSessionForbiddenError();
      }
      const now = this.clock.now();
      if (runtime.isDuplicate(command.commandId)) {
        return { session, runtime, now };
      }
      session.assertRevision(command.expectedSessionRevision);
      runtime.assertRevision(command.expectedRuntimeRevision);
      const runtimeState = runtime.serialize();
      const round = runtimeState.activeRound;
      if (!round) {
        throw new LiveSessionDomainError(
          'GAMEPLAY_ROUND_NOT_FOUND',
          'No active round can receive a gameplay command',
        );
      }
      if (command.roundId && command.roundId !== round.id) {
        throw new LiveSessionDomainError(
          'GAMEPLAY_ROUND_MISMATCH',
          'The gameplay command targets a stale round',
        );
      }
      const plugin = this.modes.resolve(
        runtimeState.modeKey,
        runtimeState.modeVersion,
      );
      const definition = plugin.command(command.commandType);
      if (!definition) {
        throw new LiveSessionDomainError(
          'UNKNOWN_GAMEPLAY_COMMAND',
          `Gameplay command "${command.commandType}" is not supported`,
        );
      }
      this.authorization.assert(
        definition.authorization,
        command.actor,
        session.serialize(),
        runtimeState,
      );
      if (
        !definition.allowedRoundStatuses.includes(
          round.status as 'active' | 'paused',
        )
      ) {
        throw new LiveSessionDomainError(
          'MODE_COMMAND_UNAVAILABLE',
          'Mode command is unavailable in this round state',
        );
      }
      const payload = definition.validatePayload(command.payload);
      if (command.commandType === 'expire-team') {
        this.assertClockExpired(session.serialize(), now);
      }
      let handled = plugin.handleCommand(
        {
          sessionId: session.id,
          runtimeId: runtime.id,
          roundId: round.id,
          activeTeamId: round.activeTeamId,
          activeParticipantId: round.activeParticipantId,
          // Never taken from the payload: a mechanic that authorises by player
          // must be told who the authenticated submitter is.
          ...(command.actor.kind === 'participant'
            ? { submitterParticipantId: command.actor.participantId }
            : {}),
          // A mechanic with single-participant team authority needs the live
          // roster to hand its next action to somebody who is actually here.
          eligibleParticipants: eligibleParticipantsOf(session.serialize()),
          runtimeState: runtimeState.runtimeState,
          now,
        },
        {
          type: command.commandType,
          payload,
          runtimeState: runtimeState.runtimeState,
          roundState: round.modeState,
        },
      );
      if (
        runtime.modeKey === TOP5_MODE_KEY &&
        handled.roundState.phase === 'completed' &&
        !handled.runtimeState.scoreEventsJson
      ) {
        const top5 = JSON.parse(
          String(handled.runtimeState.resultJson),
        ) as Top5Result;
        const events = this.scoring.score(
          SCORING_RULE_IDS.TOP5_RESULT,
          {
            teamIds: JSON.parse(String(handled.runtimeState.teamIdsJson)) as [
              string,
              string,
            ],
            top5Counts: top5.top5Counts,
            trapCounts: top5.trapCounts,
            contentItemId: String(handled.runtimeState.contentItemId),
            startingTeamId: String(handled.runtimeState.startingTeamId),
            ownership: top5.ownership as Top5Ownership[],
          },
          {
            matchId: session.id,
            challengeSessionId: runtime.id,
            occurredAt: now,
          },
        );
        handled = {
          ...handled,
          runtimeState: {
            ...handled.runtimeState,
            scoreEventsJson: JSON.stringify(events),
          },
        };
      }
      if (
        runtime.modeKey === RAKKIBHA_MODE_KEY &&
        handled.runtimeState.phase === 'completed' &&
        !handled.runtimeState.scoreEventsJson
      ) {
        const result = JSON.parse(
          String(handled.runtimeState.resultJson),
        ) as RakkibhaResult;
        const events = this.scoring.score(
          SCORING_RULE_IDS.RAKKIBHA_RACE_RESULT,
          {
            teamIds: Object.keys(result.solved) as [string, string],
            winnerTeamId: result.winnerTeamId,
            tie: result.tie,
            reason: result.reason,
            solved: result.solved,
            wrongAttempts: result.wrongAttempts,
            elapsedMsAtLastProgress: result.elapsedMsAtLastProgress,
            contentItemIds: JSON.parse(
              String(handled.runtimeState.contentItemIdsJson ?? '[]'),
            ) as string[],
          },
          {
            matchId: session.id,
            challengeSessionId: runtime.id,
            occurredAt: now,
          },
        );
        handled = {
          ...handled,
          runtimeState: {
            ...handled.runtimeState,
            // A tie mints nothing, but the marker still records that scoring ran.
            scoreEventsJson: JSON.stringify(events),
          },
        };
      }
      const previousSessionRevision = session.revision;
      const sessionChanged = applyGameplaySessionEffects(
        handled.effects,
        session,
        now,
      );
      handled = this.resolveBombOnDrainedClock(
        runtime.modeKey,
        plugin,
        session,
        handled,
        round,
        now,
      );
      if (sessionChanged) session.completeCommand(command.commandId, now);
      const previousRuntimeRevision = runtime.revision;
      runtime.applyModeState({
        commandId: command.commandId,
        actorId: command.actor.actorId,
        runtimeState: handled.runtimeState,
        roundState: handled.roundState,
        eventType: handled.eventType,
        eventPayload: handled.eventPayload,
        now,
        sessionRevision: session.revision,
        activeTeamId: session.serialize().activeTeamId,
        // A mechanic that names its own next decision-maker wins over the
        // "first connected player on the active team" fallback: the fallback
        // exists for mechanics that have no such concept.
        activeParticipantId:
          handled.assignment?.participantId ??
          resolveGameplayCommandRepresentative(
            session.serialize(),
            runtime.modeKey,
          ),
      });
      if (handled.prepareNextPresentation) {
        runtime.prepareNextPresentation(
          `${command.commandId}:presentation`,
          command.actor.actorId,
          now,
        );
      }
      const terminal =
        this.completeBombIfTerminal(session, runtime, command, now) ||
        this.completeTop5IfTerminal(runtime, command, now) ||
        this.completeRakkibhaIfTerminal(runtime, command, now);
      const closestTerminal = this.completeClosestIfTerminal(
        runtime,
        command,
        now,
      );
      const oneClueTerminal = this.completeOneClueIfTerminal(
        runtime,
        command,
        now,
      );
      const comboTerminal = this.completeComboIfTerminal(runtime, command, now);
      const oddPieceTerminal = this.completeOddPieceIfTerminal(
        runtime,
        command,
        now,
      );
      const laqathaTerminal = this.completeLaqathaIfTerminal(
        runtime,
        command,
        now,
      );
      if (sessionChanged) {
        await context.saveSession(session, previousSessionRevision);
      }
      await context.saveRuntime(runtime, previousRuntimeRevision);
      return {
        session,
        runtime,
        now,
        terminal:
          terminal ||
          closestTerminal ||
          oneClueTerminal ||
          comboTerminal ||
          oddPieceTerminal ||
          laqathaTerminal,
      };
    });

    const terminalState = result.session.serialize();
    if (
      result.terminal &&
      terminalState.parentGameId &&
      terminalState.parentGameQuestionId &&
      terminalState.result?.winnerTeamId
    ) {
      const winnerTeamIndex = terminalState.teams.findIndex(
        (team) => team.id === terminalState.result?.winnerTeamId,
      );
      if (winnerTeamIndex >= 0) {
        await this.parentGames.finalizeBombQuestion(
          terminalState.parentGameId,
          terminalState.parentGameQuestionId,
          winnerTeamIndex,
        );
      }
    }

    const snapshot = this.sessionSnapshots.toSnapshot(
      result.session,
      actorSnapshotId(command.actor),
      result.now,
    );
    snapshot.availableActions = snapshot.availableActions.filter(
      (action) => action !== 'runtime:create',
    );
    snapshot.gameplay = this.gameplaySnapshots.toSnapshot(
      result.runtime,
      result.session,
      command.actor,
      result.now,
    );
    this.publisher.publishEvent(
      command.sessionId,
      'live-session:round-changed',
      {
        runtimeId: result.runtime.id,
        runtimeRevision: result.runtime.revision,
        sessionRevision: result.session.revision,
      },
    );
    // Mode commands are the path a Top 5 deck finishes on, so a layer above the
    // session learns about the terminal runtime here too.
    await this.observers.notifyRuntimeMutated({
      sessionId: command.sessionId,
      runtimeId: result.runtime.id,
      runtimeState: result.runtime.serialize(),
    });
    // No deadline wiring here. `notifyRuntimeMutated` above already converged
    // this session's timer against what was just committed — including clearing
    // it when the command was the one that resolved the deadline.
    this.logger.log({
      event: 'gameplay_command_accepted',
      sessionId: command.sessionId,
      runtimeId: result.runtime.id,
      modeKey: result.runtime.modeKey,
      commandType: command.commandType,
      commandId: command.commandId,
      actorId: command.actor.actorId,
    });
    return this.observers.enrichSnapshot(snapshot, command.actor);
  }

  /**
   * Close a Bomb challenge without closing the live session.
   *
   * Bomb used to end the whole session on a spent clock, which is what a
   * standalone game does. As a board Challenge it has to behave like every
   * other mechanic: finish its own runtime, record who won, and leave the
   * session active so the Match can award the point and open the board again.
   *
   * The internal rules are untouched. Items exhausted still means the team with
   * the most clock left wins; a spent clock still means the other team wins.
   * Only what happens *after* that verdict has changed.
   */
  private completeBombIfTerminal(
    session: LiveGameSession,
    runtime: import('../domain/gameplay-runtime').GameplayRuntime,
    command: GameplayRuntimeCommand,
    now: Date,
  ): boolean {
    if (runtime.modeKey !== BOMB_MODE_KEY) return false;
    const runtimeState = runtime.serialize();
    const round = runtimeState.activeRound;
    if (!round || round.modeState.phase !== 'completed') return false;

    const state = session.serialize();
    const winnerTeamId = this.bombWinner(state, round.modeState, now);
    const expired = round.modeState.endedBy === 'clock-expired';

    // Write the verdict onto the runtime while a round is still active —
    // `applyModeState` requires one, and completing the round discards its
    // body. This is the copy the Match launcher reads.
    runtime.applyModeState({
      commandId: `${command.commandId}:bomb-result`,
      actorId: command.actor.actorId,
      runtimeState: {
        ...runtime.serialize().runtimeState,
        resultJson: JSON.stringify({
          winnerTeamId: winnerTeamId ?? null,
          endedBy: expired ? 'clock-expired' : 'items-completed',
        }),
      },
      roundState: round.modeState,
      eventType: 'bomb-challenge-resolved',
      eventPayload: { endedBy: expired ? 'clock-expired' : 'items-completed' },
      now,
      sessionRevision: session.revision,
    });

    runtime.completeRound({
      roundId: round.id,
      commandId: `${command.commandId}:round-complete`,
      actorId: command.actor.actorId,
      reason: expired ? 'time_expired' : 'items_completed',
      now,
    });
    runtime.complete(
      `${command.commandId}:runtime-complete`,
      command.actor.actorId,
      now,
    );
    return true;
  }

  /**
   * Bomb's own verdict, unchanged from the legacy rules.
   *
   * A spent clock loses outright: whoever was active when it ran out hands the
   * challenge to the other team. Otherwise every item was played, and the team
   * with the most time left wins — equal clocks are a real tie.
   */
  private bombWinner(
    state: ReturnType<LiveGameSession['serialize']>,
    round: Record<string, unknown>,
    now: Date,
  ): string | null {
    const active = state.teams.filter((team) => team.active);
    if (round.endedBy === 'clock-expired') {
      const loserId = state.activeTeamId;
      return active.find((team) => team.id !== loserId)?.id ?? null;
    }
    const remaining = (teamId: string) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      if (!team) return 0;
      const elapsed =
        team.clock.running && team.clock.startedAt
          ? Math.max(0, now.getTime() - team.clock.startedAt.getTime())
          : 0;
      return Math.max(
        0,
        team.clock.allocatedMs - team.clock.consumedMs - elapsed,
      );
    };
    const ranked = [...active].sort(
      (left, right) => remaining(right.id) - remaining(left.id),
    );
    if (ranked.length < 2) return ranked[0]?.id ?? null;
    return remaining(ranked[0].id) === remaining(ranked[1].id)
      ? null
      : ranked[0].id;
  }

  /**
   * "ركّبها" resolves inside the plugin — first finisher or deadline — so the
   * runtime is closed as soon as its own state says the race is over.
   */
  private completeRakkibhaIfTerminal(
    runtime: import('../domain/gameplay-runtime').GameplayRuntime,
    command: GameplayRuntimeCommand,
    now: Date,
  ): boolean {
    if (runtime.modeKey !== RAKKIBHA_MODE_KEY) return false;
    const state = runtime.serialize();
    if (state.runtimeState.phase !== 'completed') return false;
    const round = state.activeRound;
    if (round) {
      runtime.completeRound({
        roundId: round.id,
        commandId: `${command.commandId}:round-complete`,
        actorId: command.actor.actorId,
        reason: 'rakkibha-resolved',
        result: {
          resultJson: state.runtimeState.resultJson,
          scoreEventsJson: state.runtimeState.scoreEventsJson,
        },
        now,
      });
    }
    runtime.complete(
      `${command.commandId}:runtime-complete`,
      command.actor.actorId,
      now,
    );
    return true;
  }

  private completeTop5IfTerminal(
    runtime: import('../domain/gameplay-runtime').GameplayRuntime,
    command: GameplayRuntimeCommand,
    now: Date,
  ): boolean {
    if (runtime.modeKey !== TOP5_MODE_KEY) return false;
    const state = runtime.serialize();
    const round = state.activeRound;
    if (!round || round.modeState.phase !== 'completed') return false;
    runtime.completeRound({
      roundId: round.id,
      commandId: `${command.commandId}:round-complete`,
      actorId: command.actor.actorId,
      reason: 'top5-completed',
      result: {
        resultJson: state.runtimeState.resultJson,
        scoreEventsJson: state.runtimeState.scoreEventsJson,
      },
      now,
    });
    runtime.complete(
      `${command.commandId}:runtime-complete`,
      command.actor.actorId,
      now,
    );
    return true;
  }

  private completeClosestIfTerminal(
    runtime: import('../domain/gameplay-runtime').GameplayRuntime,
    command: GameplayRuntimeCommand,
    now: Date,
  ): boolean {
    if (runtime.modeKey !== CLOSEST_MODE_KEY) return false;
    const state = runtime.serialize();
    if (state.runtimeState.phase !== 'completed') return false;
    const round = state.activeRound;
    if (round) {
      runtime.completeRound({
        roundId: round.id,
        commandId: `${command.commandId}:round-complete`,
        actorId: command.actor.actorId,
        reason: 'closest-three-items-completed',
        result: { resultsJson: state.runtimeState.resultsJson },
        now,
      });
    }
    runtime.complete(
      `${command.commandId}:runtime-complete`,
      command.actor.actorId,
      now,
    );
    return true;
  }

  /**
   * Finalize a Combo runtime once both Runs have banked.
   *
   * The mode phase reaching `completed` is the mechanic's own conclusion; the
   * runtime still has to be closed so the Match sees a terminal runtime and the
   * board can move on. Same shape as the other mechanics' hooks.
   */
  private completeComboIfTerminal(
    runtime: import('../domain/gameplay-runtime').GameplayRuntime,
    command: GameplayRuntimeCommand,
    now: Date,
  ): boolean {
    if (runtime.modeKey !== COMBO_MODE_KEY) return false;
    const state = runtime.serialize();
    if (state.runtimeState.phase !== 'completed') return false;
    const round = state.activeRound;
    if (round) {
      runtime.completeRound({
        roundId: round.id,
        commandId: `${command.commandId}:round-complete`,
        actorId: command.actor.actorId,
        reason: 'combo-both-runs-complete',
        result: { runResultsJson: state.runtimeState.runResultsJson },
        now,
      });
    }
    runtime.complete(
      `${command.commandId}:runtime-complete`,
      command.actor.actorId,
      now,
    );
    return true;
  }

  private completeOneClueIfTerminal(
    runtime: import('../domain/gameplay-runtime').GameplayRuntime,
    command: GameplayRuntimeCommand,
    now: Date,
  ): boolean {
    if (runtime.modeKey !== ONE_CLUE_MODE_KEY) return false;
    const state = runtime.serialize();
    if (state.runtimeState.phase !== 'completed') return false;
    const round = state.activeRound;
    if (round) {
      runtime.completeRound({
        roundId: round.id,
        commandId: `${command.commandId}:round-complete`,
        actorId: command.actor.actorId,
        reason: 'one-clue-three-items-completed',
        result: { resultsJson: state.runtimeState.resultsJson },
        now,
      });
    }
    runtime.complete(
      `${command.commandId}:runtime-complete`,
      command.actor.actorId,
      now,
    );
    return true;
  }

  private completeOddPieceIfTerminal(
    runtime: import('../domain/gameplay-runtime').GameplayRuntime,
    command: GameplayRuntimeCommand,
    now: Date,
  ): boolean {
    if (runtime.modeKey !== ODD_PIECE_MODE_KEY) return false;
    const state = runtime.serialize();
    if (state.runtimeState.phase !== 'completed') return false;
    const round = state.activeRound;
    if (round) {
      runtime.completeRound({
        roundId: round.id,
        commandId: `${command.commandId}:round-complete`,
        actorId: command.actor.actorId,
        reason: 'odd-piece-three-puzzles-completed',
        result: {
          resultJson: state.runtimeState.resultJson,
          resultsJson: state.runtimeState.resultsJson,
        },
        now,
      });
    }
    runtime.complete(
      `${command.commandId}:runtime-complete`,
      command.actor.actorId,
      now,
    );
    return true;
  }

  private completeLaqathaIfTerminal(
    runtime: import('../domain/gameplay-runtime').GameplayRuntime,
    command: GameplayRuntimeCommand,
    now: Date,
  ): boolean {
    if (runtime.modeKey !== LAQATHA_MODE_KEY) return false;
    const state = runtime.serialize();
    if (state.runtimeState.phase !== 'completed') return false;
    const round = state.activeRound;
    if (round) {
      runtime.completeRound({
        roundId: round.id,
        commandId: `${command.commandId}:round-complete`,
        actorId: command.actor.actorId,
        reason: 'laqatha-three-questions-completed',
        result: {
          resultJson: state.runtimeState.resultJson,
          resultsJson: state.runtimeState.resultsJson,
        },
        now,
      });
    }
    runtime.complete(
      `${command.commandId}:runtime-complete`,
      command.actor.actorId,
      now,
    );
    return true;
  }

  /**
   * Ends the Bomb *challenge* when a command spends the last of the clock.
   *
   * Bomb's skip costs the active team five seconds, and that penalty can be the
   * thing that empties their clock. A spent Bomb clock is a Bomb verdict — the
   * other team takes the challenge — and it used to be read as the end of the
   * whole live session instead, which finished the Match from inside one board
   * position and left every remaining challenge unplayable.
   *
   * The rule is not restated here. The mechanic's own `expire-team` reducer is
   * asked to produce the terminal round, so a clock emptied by a skip and a
   * clock emptied by the deadline scheduler resolve through one code path and
   * cannot disagree about the winner. Everything after this — the verdict, the
   * round completion, the runtime completion, the Match awarding the point and
   * reopening the board — is the ordinary terminal flow.
   */
  private resolveBombOnDrainedClock(
    modeKey: string,
    plugin: GameplayModePlugin,
    session: LiveGameSession,
    handled: GameplayCommandResult,
    round: { id: string; activeTeamId?: string; activeParticipantId?: string },
    now: Date,
  ): GameplayCommandResult {
    if (modeKey !== BOMB_MODE_KEY) return handled;
    // Only while the round is still asking a question. A command that already
    // exhausted the items has produced its own terminal state, and Bomb's
    // "most time left wins" rule reaches the same verdict there anyway.
    if (handled.roundState.phase !== 'presenting') return handled;
    if (!this.activeClockSpent(session.serialize(), now)) return handled;
    const expired = plugin.handleCommand(
      {
        sessionId: session.id,
        runtimeId: round.id,
        roundId: round.id,
        activeTeamId: round.activeTeamId,
        activeParticipantId: round.activeParticipantId,
        now,
      },
      {
        type: 'expire-team',
        payload: {},
        runtimeState: handled.runtimeState,
        roundState: handled.roundState,
      },
    );
    return {
      ...expired,
      // The originating command's own session effects were already applied;
      // expiry adds none of its own, and re-applying these would double the
      // clock penalty that caused this in the first place.
      effects: [],
    };
  }

  /** True when the team holding the turn has no clock left, by the server. */
  private activeClockSpent(state: LiveGameSessionState, now: Date): boolean {
    try {
      assertBombClockExpired(state, now);
      return true;
    } catch {
      return false;
    }
  }

  private assertClockExpired(state: LiveGameSessionState, now: Date): void {
    assertBombClockExpired(state, now);
  }
}
