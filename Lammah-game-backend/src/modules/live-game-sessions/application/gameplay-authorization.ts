import { Injectable } from '@nestjs/common';
import {
  GameplayAuthorizationRequirement,
  GameplayModePlugin,
  MODE_COMMAND_TYPES,
} from '../domain/gameplay-mode.plugin';
import { GameplayRuntimeState } from '../domain/gameplay-runtime';
import { LiveGameSessionState } from '../domain/live-game-session';
import { LiveSessionForbiddenError } from '../domain/live-session.errors';
import { LiveSessionActor } from './live-session-actor';

@Injectable()
export class GameplayAuthorization {
  can(
    requirement: GameplayAuthorizationRequirement,
    actor: LiveSessionActor,
    session: LiveGameSessionState,
    runtime: GameplayRuntimeState,
  ): boolean {
    if (requirement === 'internal') return false;
    const controller =
      actor.kind === 'user' && session.controllerActorId === actor.actorId;
    if (requirement === 'controller') return controller;
    const participant =
      actor.kind === 'participant'
        ? session.participants.find(
            (candidate) =>
              candidate.id === actor.participantId &&
              !candidate.removedAt &&
              candidate.credentialVersion === actor.credentialVersion,
          )
        : session.participants.find(
            (candidate) =>
              candidate.actorId === actor.actorId && !candidate.removedAt,
          );
    if (requirement === 'observer-safe') {
      return controller || Boolean(participant);
    }
    const connectedPlayer =
      participant?.role === 'team-player' && participant.connected;
    if (requirement === 'connected-player') return connectedPlayer;
    const activeTeamPlayer =
      connectedPlayer &&
      Boolean(runtime.activeRound?.activeTeamId) &&
      participant.teamId === runtime.activeRound?.activeTeamId;
    if (requirement === 'active-team-player') return activeTeamPlayer;
    if (requirement === 'controller-or-active-team-player') {
      return controller || activeTeamPlayer;
    }
    const activeParticipant =
      connectedPlayer &&
      Boolean(runtime.activeRound?.activeParticipantId) &&
      participant.id === runtime.activeRound?.activeParticipantId;
    if (requirement === 'controller-or-active-participant') {
      return controller || activeParticipant;
    }
    return activeParticipant;
  }

  assert(
    requirement: GameplayAuthorizationRequirement,
    actor: LiveSessionActor,
    session: LiveGameSessionState,
    runtime: GameplayRuntimeState,
  ): void {
    if (!this.can(requirement, actor, session, runtime)) {
      throw new LiveSessionForbiddenError();
    }
  }

  availableActions(
    actor: LiveSessionActor,
    session: LiveGameSessionState,
    runtime: GameplayRuntimeState,
    plugin: GameplayModePlugin,
  ): string[] {
    const actions: string[] = [];
    const controller =
      actor.kind === 'user' && session.controllerActorId === actor.actorId;
    if (controller) {
      if (runtime.status === 'initialized') actions.push('runtime:start');
      if (['awaiting-round', 'between-rounds'].includes(runtime.status)) {
        actions.push('round:create', 'runtime:complete');
      }
      if (runtime.activeRound?.status === 'pending') {
        actions.push('round:start', 'round:cancel');
      }
      if (runtime.activeRound?.status === 'active') {
        actions.push('round:pause', 'round:complete', 'round:cancel');
      }
      if (runtime.activeRound?.status === 'paused') {
        actions.push('round:resume', 'round:complete', 'round:cancel');
      }
      if (!['completed', 'cancelled'].includes(runtime.status)) {
        actions.push('runtime:cancel');
      }
    }
    for (const commandType of MODE_COMMAND_TYPES) {
      const modeCommand = plugin.command(commandType);
      if (
        modeCommand &&
        runtime.activeRound &&
        modeCommand.allowedRoundStatuses.includes(
          runtime.activeRound.status as 'active' | 'paused',
        ) &&
        this.can(modeCommand.authorization, actor, session, runtime)
      ) {
        actions.push(`mode:${commandType}`);
      }
    }
    const interaction = runtime.activeRound?.interaction;
    if (plugin.interaction && runtime.activeRound?.status === 'active') {
      if (controller && !interaction) actions.push('interaction:prepare');
      if (controller && interaction?.status === 'prepared') {
        actions.push('interaction:open', 'interaction:cancel');
      }
      if (controller && interaction?.status === 'open') {
        actions.push(
          'interaction:close',
          'interaction:cancel',
          'submission:adjudicate',
        );
      }
      if (
        controller &&
        ['closed', 'adjudicating'].includes(interaction?.status ?? '')
      ) {
        actions.push(
          'interaction:resolve',
          'interaction:cancel',
          'submission:adjudicate',
        );
      }
      if (
        interaction?.status === 'open' &&
        this.can(
          plugin.interaction.submissionAuthorization,
          actor,
          session,
          runtime,
        )
      ) {
        const participantId =
          actor.kind === 'participant' ? actor.participantId : undefined;
        const alreadySubmitted =
          plugin.interaction.submissionPolicy === 'one-per-participant' &&
          interaction.submissions.some(
            (submission) =>
              submission.participantId === participantId &&
              !['withdrawn', 'superseded'].includes(submission.status),
          );
        if (!alreadySubmitted) actions.push('submission:create');
      }
    }
    return actions;
  }
}
