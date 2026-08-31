import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GameplayRuntimeNotFoundError,
  LiveSessionDomainError,
  LiveSessionForbiddenError,
  LiveSessionNotFoundError,
} from '../domain/live-session.errors';
import {
  GameplayRuntimeCommand,
  GameplayRuntimeExecutor,
} from './gameplay-runtime.executor';
import {
  findEligibleTeamParticipant,
  isEligibleTeamParticipant,
  type TeamParticipantEligibilityCandidate,
} from '../domain/team-participant-eligibility';
import {
  GAMEPLAY_TRANSACTION_UNIT_OF_WORK,
  GameplayTransactionUnitOfWork,
} from './gameplay-transaction.unit-of-work';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import { GameplayObserverRegistry } from './gameplay-observer.registry';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from './live-session-transition.publisher';
import {
  GAMEPLAY_DEADLINE_SYNCHRONIZER,
  GameplayDeadlineSynchronizer,
} from './gameplay-deadline.port';
import { applyGameplaySessionEffects } from './gameplay-session-effects';
import {
  PresentationSurfaceCapability,
  PresentationSurfaceRequirement,
} from '../domain/gameplay-mode.plugin';
import { LiveSessionActor } from './live-session-actor';

export function resolveGameplayRoundParticipant<
  T extends TeamParticipantEligibilityCandidate,
>(
  participants: readonly T[],
  input: {
    teamId: string;
    modeKey: string;
    explicitParticipantId?: string;
  },
): T | undefined {
  if (input.explicitParticipantId) {
    const explicit = participants.find(
      (candidate) => candidate.id === input.explicitParticipantId,
    );
    return explicit &&
      isEligibleTeamParticipant(explicit, {
        teamId: input.teamId,
        requiresConnectedPresence: input.modeKey === 'bomb',
      })
      ? explicit
      : undefined;
  }
  return findEligibleTeamParticipant(participants, {
    teamId: input.teamId,
    requiresConnectedPresence: true,
    // This fallback is the legacy readiness-driven selection path. Unified
    // Match Bomb supplies an explicit representative selected by preflight.
    requiresReady: true,
  });
}

@Injectable()
export class StartGameplayRuntime {
  constructor(private readonly executor: GameplayRuntimeExecutor) {}
  execute(command: GameplayRuntimeCommand) {
    return this.executor.execute(
      'live-session:runtime-changed',
      command,
      (session) => this.executor.assertController(session, command.actor),
      (session, runtime, now) => {
        if (session.serialize().status !== 'active') {
          throw new LiveSessionDomainError(
            'SESSION_NOT_ACTIVE',
            'Live session must remain active',
          );
        }
        runtime.start(command.commandId, command.actor.actorId, now);
      },
    );
  }
}

@Injectable()
export class CreateGameplayRound {
  constructor(private readonly executor: GameplayRuntimeExecutor) {}
  execute(
    command: GameplayRuntimeCommand & {
      activeTeamId?: string;
      activeParticipantId?: string;
    },
  ) {
    return this.executor.execute(
      'live-session:round-created',
      command,
      (session) => this.executor.assertController(session, command.actor),
      (session, runtime, now) => {
        const state = session.serialize();
        if (state.status !== 'active') {
          throw new LiveSessionDomainError(
            'SESSION_NOT_ACTIVE',
            'Live session must be active',
          );
        }
        if (
          command.activeTeamId &&
          !state.teams.some(
            (team) => team.id === command.activeTeamId && team.active,
          )
        ) {
          throw new LiveSessionDomainError(
            'UNKNOWN_TEAM',
            'Active team does not belong to this session',
          );
        }
        const activeTeamId =
          command.activeTeamId ?? state.activeTeamId ?? state.teams[0]?.id;
        const resolvedParticipant = resolveGameplayRoundParticipant(
          state.participants,
          {
            teamId: activeTeamId ?? '',
            modeKey: runtime.modeKey,
            ...(command.activeParticipantId
              ? { explicitParticipantId: command.activeParticipantId }
              : {}),
          },
        );
        if (command.activeParticipantId) {
          if (!resolvedParticipant) {
            throw new LiveSessionDomainError(
              'INVALID_ACTIVE_PARTICIPANT',
              'Active participant is not eligible for this round',
            );
          }
        }
        const activeParticipantId =
          command.activeParticipantId ?? resolvedParticipant?.id;
        if (runtime.modeKey === 'bomb' && !activeParticipantId) {
          throw new LiveSessionDomainError(
            'BOMB_REPRESENTATIVE_REQUIRED',
            'The active Bomb team requires a connected ready representative',
          );
        }
        runtime.createRound(
          {
            commandId: command.commandId,
            actorId: command.actor.actorId,
            activeTeamId,
            activeParticipantId,
          },
          now,
        );
      },
    );
  }
}

abstract class RoundMutation {
  constructor(protected readonly executor: GameplayRuntimeExecutor) {}

  protected run(
    event: string,
    command: GameplayRuntimeCommand & { roundId: string },
    mutate: (
      runtime: Parameters<Parameters<GameplayRuntimeExecutor['execute']>[3]>[1],
      now: Date,
    ) => void,
  ) {
    return this.executor.execute(
      event,
      command,
      (session) => this.executor.assertController(session, command.actor),
      (_session, runtime, now) => mutate(runtime, now),
    );
  }
}

@Injectable()
export class StartGameplayRound extends RoundMutation {
  constructor(executor: GameplayRuntimeExecutor) {
    super(executor);
  }
  execute(command: GameplayRuntimeCommand & { roundId: string }) {
    return this.run('live-session:round-started', command, (runtime, now) =>
      runtime.startRound(
        command.roundId,
        command.commandId,
        command.actor.actorId,
        now,
      ),
    );
  }
}

@Injectable()
export class PauseGameplayRound extends RoundMutation {
  constructor(executor: GameplayRuntimeExecutor) {
    super(executor);
  }
  execute(command: GameplayRuntimeCommand & { roundId: string }) {
    return this.run('live-session:round-paused', command, (runtime, now) =>
      runtime.pauseRound(
        command.roundId,
        command.commandId,
        command.actor.actorId,
        now,
      ),
    );
  }
}

@Injectable()
export class ResumeGameplayRound extends RoundMutation {
  constructor(executor: GameplayRuntimeExecutor) {
    super(executor);
  }
  execute(command: GameplayRuntimeCommand & { roundId: string }) {
    return this.run('live-session:round-resumed', command, (runtime, now) =>
      runtime.resumeRound(
        command.roundId,
        command.commandId,
        command.actor.actorId,
        now,
      ),
    );
  }
}

@Injectable()
export class CompleteGameplayRound extends RoundMutation {
  constructor(executor: GameplayRuntimeExecutor) {
    super(executor);
  }
  execute(
    command: GameplayRuntimeCommand & { roundId: string; reason: string },
  ) {
    return this.run('live-session:round-completed', command, (runtime, now) =>
      runtime.completeRound({
        roundId: command.roundId,
        commandId: command.commandId,
        actorId: command.actor.actorId,
        reason: command.reason,
        now,
      }),
    );
  }
}

@Injectable()
export class CancelGameplayRound extends RoundMutation {
  constructor(executor: GameplayRuntimeExecutor) {
    super(executor);
  }
  execute(command: GameplayRuntimeCommand & { roundId: string }) {
    return this.run('live-session:round-cancelled', command, (runtime, now) =>
      runtime.cancelRound(
        command.roundId,
        command.commandId,
        command.actor.actorId,
        now,
      ),
    );
  }
}

@Injectable()
export class CompleteGameplayRuntime {
  constructor(private readonly executor: GameplayRuntimeExecutor) {}
  execute(command: GameplayRuntimeCommand) {
    return this.executor.execute(
      'live-session:runtime-completed',
      command,
      (session) => this.executor.assertController(session, command.actor),
      (_session, runtime, now) =>
        runtime.complete(command.commandId, command.actor.actorId, now),
    );
  }
}

@Injectable()
export class CancelGameplayRuntime {
  constructor(private readonly executor: GameplayRuntimeExecutor) {}
  execute(command: GameplayRuntimeCommand) {
    return this.executor.execute(
      'live-session:runtime-cancelled',
      command,
      (session) => this.executor.assertController(session, command.actor),
      (_session, runtime, now) =>
        runtime.cancel(command.commandId, command.actor.actorId, now),
    );
  }
}

/**
 * Fair-start: a required presentation surface tells the server it has adopted this
 * exact runtime/revision and can present the gameplay. The server then performs the
 * one-time gameplay activation (re-anchoring the mechanic's deadline to *now*), so
 * no playable time was consumed while the client was cold-starting.
 *
 * Authorization is server-derived: only the session controller (the shared screen)
 * or an actionable team-player participant qualifies — never an observer or a
 * non-member. CAS + command-id idempotency (in the executor) make activation
 * commit at most once and make a stale/duplicate acknowledgement a safe no-op.
 */
@Injectable()
export class PresentationReady {
  private readonly logger = new Logger(PresentationReady.name);

  constructor(
    private readonly executor: GameplayRuntimeExecutor,
    @Inject(GAMEPLAY_TRANSACTION_UNIT_OF_WORK)
    private readonly unitOfWork: GameplayTransactionUnitOfWork,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly observers: GameplayObserverRegistry,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
    @Inject(GAMEPLAY_DEADLINE_SYNCHRONIZER)
    private readonly deadlines: GameplayDeadlineSynchronizer,
  ) {}

  async execute(command: GameplayRuntimeCommand) {
    const now = this.clock.now();
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
      const actor = command.actor;
      const isController =
        actor.kind === 'user' && session.controllerActorId === actor.actorId;
      const isTeamPlayer =
        actor.kind === 'participant' && actor.role === 'team-player';
      if (!isController && !isTeamPlayer) {
        throw new LiveSessionDomainError(
          'PRESENTATION_SURFACE_INVALID',
          'Only the shared screen or an actionable participant can activate the challenge',
        );
      }
      if (runtime.isDuplicate(command.commandId)) {
        this.logger.log({
          event: 'duplicate_gameplay_command_ignored',
          sessionId: command.sessionId,
          runtimeId: runtime.id,
          commandId: command.commandId,
          actorId: command.actor.actorId,
          revision: runtime.revision,
        });
        return {
          session,
          runtime,
          previousRuntimeRevision: runtime.revision,
          sessionChanged: false,
          runtimeChanged: false,
        };
      }
      session.assertRevision(command.expectedSessionRevision);
      runtime.assertRevision(command.expectedRuntimeRevision);
      const previousSessionRevision = session.revision;
      const previousRuntimeRevision = runtime.revision;

      // Multi-surface contract: a mechanic that declares required surfaces holds
      // activation until every surface has acknowledged readiness. Each ack is
      // validated against the actor's current binding and recorded against the
      // exact server-observed connection id. The last ack triggers activation,
      // which re-anchors the deadline through the mechanic's own hook.
      const required = runtime.requiredPresentationSurfaces();
      if (required && required.length > 0) {
        if (!command.connectionId) {
          throw new LiveSessionDomainError(
            'PRESENTATION_SURFACE_INVALID',
            'A multi-surface acknowledgement must come over a socket connection',
          );
        }
        const capability = this.resolveSurfaceCapability(
          actor,
          isController,
          required,
        );
        if (!capability) {
          throw new LiveSessionDomainError(
            'PRESENTATION_SURFACE_INVALID',
            'This connection is not an acknowledged required surface',
          );
        }
        runtime.recordSurfaceReady(
          capability,
          command.connectionId,
          command.commandId,
          actor.actorId,
          now,
        );
        let sessionChanged = false;
        if (runtime.areAllRequiredSurfacesReady()) {
          const effects = runtime.activatePresentation(
            command.commandId,
            actor.actorId,
            now,
          );
          sessionChanged = applyGameplaySessionEffects(effects, session, now);
        }
        if (sessionChanged) session.completeCommand(command.commandId, now);
        await context.saveRuntime(runtime, previousRuntimeRevision);
        if (sessionChanged) {
          await context.saveSession(session, previousSessionRevision);
        }
        return {
          session,
          runtime,
          previousRuntimeRevision,
          sessionChanged,
          runtimeChanged: true,
        };
      }

      // Single-surface default: any controller or actionable team-player ack
      // activates immediately (Combo/Bomb/Closest/OneClue/Rakkibha and friends).
      const effects = runtime.activatePresentation(
        command.commandId,
        command.actor.actorId,
        now,
      );
      const sessionChanged = applyGameplaySessionEffects(effects, session, now);
      if (sessionChanged) session.completeCommand(command.commandId, now);
      await context.saveRuntime(runtime, previousRuntimeRevision);
      if (sessionChanged) {
        await context.saveSession(session, previousSessionRevision);
      }
      return {
        session,
        runtime,
        previousRuntimeRevision,
        sessionChanged,
        runtimeChanged: true,
      };
    });

    if (result.runtimeChanged) {
      await this.observers.notifyRuntimeMutated({
        sessionId: command.sessionId,
        runtimeId: result.runtime.id,
        runtimeState: result.runtime.serialize(),
      });
    }
    const snapshot = await this.observers.enrichSnapshot(
      this.executor.snapshot(
        result.session,
        result.runtime,
        command.actor,
        now,
      ),
      command.actor,
    );
    if (result.runtimeChanged) {
      this.publisher.publishEvent(
        command.sessionId,
        'live-session:presentation-activated',
        {
          runtimeId: result.runtime.id,
          runtimeRevision: result.runtime.revision,
          sessionRevision: result.session.revision,
        },
      );
      this.logger.log({
        event: 'live-session:presentation-activated',
        sessionId: command.sessionId,
        runtimeId: result.runtime.id,
        modeKey: result.runtime.modeKey,
        modeVersion: result.runtime.modeVersion,
        commandId: command.commandId,
        actorId: command.actor.actorId,
        previousRevision: result.previousRuntimeRevision,
        revision: result.runtime.revision,
        sessionRevision: result.session.revision,
        clientTimestamp: command.clientTimestamp,
      });
    }
    if (result.sessionChanged) {
      await this.synchronizeDeadlines(command.sessionId);
    }
    return snapshot;
  }

  /**
   * Which required surface, if any, the acknowledging actor is currently bound
   * to. Server-derived and checked against committed assignment state: the shared
   * surface belongs to the session controller (a user actor); the participant
   * surfaces belong to whichever participant the runtime currently assigns to
   * answering / decision (a participant actor). A spectator, an observer, or a
   * player who has been reassigned away is refused.
   */
  private resolveSurfaceCapability(
    actor: LiveSessionActor,
    isController: boolean,
    required: PresentationSurfaceRequirement[],
  ): PresentationSurfaceCapability | undefined {
    if (isController) {
      const surface = required.find(
        (candidate) => candidate.capability === 'shared',
      );
      return surface ? 'shared' : undefined;
    }
    if (actor.kind === 'participant') {
      const surface = required.find(
        (candidate) => candidate.participantId === actor.participantId,
      );
      return surface
        ? (surface.capability as PresentationSurfaceCapability)
        : undefined;
    }
    return undefined;
  }

  private async synchronizeDeadlines(sessionId: string): Promise<void> {
    try {
      await this.deadlines.synchronize(sessionId);
    } catch (error) {
      this.logger.error({
        event: 'gameplay_deadline_synchronization_failed',
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
