import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PARTICIPANT_PRESENCE,
  ParticipantPresence,
} from './participant-presence.port';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import { LiveGameSessionSnapshotMapper } from './live-game-session.snapshot';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from './live-session-transition.publisher';
import { BombCountdownScheduler } from './bomb-countdown.scheduler';
import { ReassignTeamActions } from './reassign-team-actions.use-case';

@Injectable()
export class UpdateParticipantPresence {
  private readonly logger = new Logger(UpdateParticipantPresence.name);

  constructor(
    @Inject(PARTICIPANT_PRESENCE)
    private readonly presence: ParticipantPresence,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    private readonly snapshots: LiveGameSessionSnapshotMapper,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
    private readonly countdown: BombCountdownScheduler,
    private readonly reassignTeamActions: ReassignTeamActions,
  ) {}

  async connected(
    sessionId: string,
    participantId: string,
    connectionId: string,
  ): Promise<boolean> {
    const connected = await this.presence.connect({
      sessionId,
      participantId,
      connectionId,
      now: this.clock.now(),
    });
    if (connected) {
      this.logger.log({
        event: 'participant_connected',
        sessionId,
        participantId,
        connectionId,
      });
    }
    return connected;
  }

  async disconnected(
    sessionId: string,
    participantId: string,
    connectionId: string,
  ): Promise<void> {
    const now = this.clock.now();
    await this.presence.disconnect({
      sessionId,
      participantId,
      connectionId,
      now,
    });
    // If this phone was the one holding a team action, the action moves on. A
    // challenge must not stall on somebody's wifi.
    //
    // Contained, because it is not the only thing this disconnect owes anyone:
    // an exception thrown here used to skip the Bomb countdown cancellation
    // below, so one unlucky reassignment left a countdown running for a team
    // that no longer had a ready player.
    try {
      await this.reassignTeamActions.forSession(sessionId);
    } catch (error) {
      this.logger.error({
        event: 'team_action_reassignment_failed',
        sessionId,
        participantId,
        connectionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const session = await this.sessions.findById(sessionId);
    if (session) {
      const state = session.serialize();
      const representativesReady = state.teams
        .filter((team) => team.active)
        .every((team) =>
          state.participants.some(
            (participant) =>
              participant.role === 'team-player' &&
              participant.teamId === team.id &&
              participant.ready &&
              participant.connected &&
              !participant.removedAt,
          ),
        );
      if (
        state.modeKey === 'bomb' &&
        state.status === 'ready' &&
        !representativesReady
      ) {
        const previousRevision = session.revision;
        session.cancelCountdown(now);
        session.completeCommand(randomUUID(), now);
        await this.sessions.save(session, previousRevision);
        this.countdown.cancel(sessionId);
        this.publisher.publish(
          'live-session:state-changed',
          this.snapshots.toSnapshot(session, session.controllerActorId, now),
          { reason: 'bomb-countdown-cancelled' },
        );
      }
    }
    this.logger.log({
      event: 'participant_disconnected',
      sessionId,
      participantId,
      connectionId,
    });
  }

  async heartbeat(sessionId: string, participantId: string): Promise<void> {
    await this.presence.touch(sessionId, participantId, this.clock.now());
  }
}
