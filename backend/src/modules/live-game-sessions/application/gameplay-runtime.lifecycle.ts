import { Injectable } from '@nestjs/common';
import { LiveSessionDomainError } from '../domain/live-session.errors';
import {
  GameplayRuntimeCommand,
  GameplayRuntimeExecutor,
} from './gameplay-runtime.executor';
import {
  findEligibleTeamParticipant,
  isEligibleTeamParticipant,
  type TeamParticipantEligibilityCandidate,
} from '../domain/team-participant-eligibility';

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
