import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { GameplayAuthorization } from './gameplay-authorization';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import {
  GameplayCommandPayload,
  GameplaySessionEffect,
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
import { BombExpirationScheduler } from './bomb-expiration.scheduler';

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
    @Inject(forwardRef(() => BombExpirationScheduler))
    private readonly expiration: BombExpirationScheduler,
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
      const handled = plugin.handleCommand(
        {
          sessionId: session.id,
          runtimeId: runtime.id,
          roundId: round.id,
          activeTeamId: round.activeTeamId,
          activeParticipantId: round.activeParticipantId,
          runtimeState: runtimeState.runtimeState,
        },
        {
          type: command.commandType,
          payload,
          runtimeState: runtimeState.runtimeState,
          roundState: round.modeState,
        },
      );
      const previousSessionRevision = session.revision;
      const sessionChanged = this.applyEffects(handled.effects, session, now);
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
        activeParticipantId: this.activeRepresentative(session.serialize()),
      });
      const terminal = this.completeBombIfTerminal(
        session,
        runtime,
        command,
        now,
      );
      if (sessionChanged) {
        await context.saveSession(session, previousSessionRevision);
      }
      await context.saveRuntime(runtime, previousRuntimeRevision);
      return { session, runtime, now, terminal };
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
    if (!result.terminal) {
      await this.expiration.schedule(command.sessionId);
    }
    this.logger.log({
      event: 'gameplay_command_accepted',
      sessionId: command.sessionId,
      runtimeId: result.runtime.id,
      modeKey: result.runtime.modeKey,
      commandType: command.commandType,
      commandId: command.commandId,
      actorId: command.actor.actorId,
    });
    return snapshot;
  }

  private completeBombIfTerminal(
    session: LiveGameSession,
    runtime: import('../domain/gameplay-runtime').GameplayRuntime,
    command: GameplayRuntimeCommand,
    now: Date,
  ): boolean {
    if (runtime.modeKey !== 'bomb') return false;
    let state = session.serialize();
    const runtimeState = runtime.serialize();
    const round = runtimeState.activeRound;
    const itemsCompleted = round?.modeState.phase === 'completed';
    if (state.status === 'active' && itemsCompleted) {
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
      const winner = [...state.teams]
        .filter((team) => team.active)
        .sort((left, right) => remaining(right.id) - remaining(left.id))[0];
      session.finish('items_completed', winner?.id, undefined, now);
      session.completeCommand(`${command.commandId}:terminal`, now);
      state = session.serialize();
    }
    if (state.status !== 'finished' || !round) return false;
    runtime.completeRound({
      roundId: round.id,
      commandId: `${command.commandId}:round-complete`,
      actorId: command.actor.actorId,
      reason:
        state.result?.reason === 'bomb-clock-expired'
          ? 'time_expired'
          : 'items_completed',
      now,
    });
    runtime.complete(
      `${command.commandId}:runtime-complete`,
      command.actor.actorId,
      now,
    );
    return true;
  }

  private applyEffects(
    effects: GameplaySessionEffect[],
    session: LiveGameSession,
    now: Date,
  ): boolean {
    let changed = false;
    for (const effect of effects) {
      if (effect.type === 'emit-runtime-event') continue;
      changed = true;
      if (effect.type === 'switch-active-team') {
        session.switchTurn(effect.teamId || undefined, effect.reason, now);
      } else if (effect.type === 'adjust-active-team-time') {
        const loserId = session.serialize().activeTeamId;
        const remaining = session.adjustActiveTeamTime(effect.deltaMs, now);
        if (remaining === 0) {
          session.finish(
            'bomb-clock-expired',
            this.otherTeam(session.serialize(), loserId),
            undefined,
            now,
          );
        }
      } else if (effect.type === 'stop-active-turn') {
        session.endTurn(effect.reason, now);
      } else if (effect.type === 'finish-live-session') {
        const loserId = session.serialize().activeTeamId;
        session.finish(
          effect.reason,
          this.otherTeam(session.serialize(), loserId),
          undefined,
          now,
        );
      } else if (effect.type === 'start-team-turn') {
        session.startTurn(effect.teamId, effect.reason, now);
      } else if (effect.type === 'pause-active-turn') {
        session.pauseTurn(now);
      } else if (effect.type === 'resume-active-turn') {
        session.resumeTurn(now);
      }
    }
    return changed;
  }

  private assertClockExpired(state: LiveGameSessionState, now: Date): void {
    const active = state.teams.find((team) => team.id === state.activeTeamId);
    const elapsed =
      active?.clock.running && active.clock.startedAt
        ? Math.max(0, now.getTime() - active.clock.startedAt.getTime())
        : 0;
    const remaining = active
      ? Math.max(
          0,
          active.clock.allocatedMs - active.clock.consumedMs - elapsed,
        )
      : 0;
    if (remaining > 0) {
      throw new LiveSessionDomainError(
        'BOMB_CLOCK_NOT_EXPIRED',
        'The active team clock has not expired',
      );
    }
  }

  private otherTeam(
    state: LiveGameSessionState,
    excluded?: string,
  ): string | undefined {
    return state.teams.find((team) => team.active && team.id !== excluded)?.id;
  }

  private activeRepresentative(
    state: LiveGameSessionState,
  ): string | undefined {
    return state.participants.find(
      (participant) =>
        participant.role === 'team-player' &&
        participant.teamId === state.activeTeamId &&
        participant.ready &&
        participant.connected &&
        !participant.removedAt,
    )?.id;
  }
}
