import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PARTICIPANT_PRESENCE,
  ParticipantPresence,
} from './participant-presence.port';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import { ReassignTeamActions } from './reassign-team-actions.use-case';
import { WithdrawPresentationReadiness } from './withdraw-presentation-readiness.use-case';
import { PresenceEffectsReconciler } from './presence-effects.reconciler';
import { PresenceOwnershipService } from './presence-ownership.service';

@Injectable()
export class UpdateParticipantPresence {
  private readonly logger = new Logger(UpdateParticipantPresence.name);

  constructor(
    @Inject(PARTICIPANT_PRESENCE)
    private readonly presence: ParticipantPresence,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly reassignTeamActions: ReassignTeamActions,
    private readonly withdrawReadiness: WithdrawPresentationReadiness,
    private readonly reconciler: PresenceEffectsReconciler,
    private readonly ownership: PresenceOwnershipService,
  ) {}

  async connected(
    sessionId: string,
    participantId: string,
    connectionId: string,
  ): Promise<boolean> {
    // A socket may only be owned by an instance whose lease is registered, so
    // a dead instance's entries are always attributable and sweepable.
    this.ownership.assertRegistered();
    const input = { sessionId, participantId, connectionId };
    let connected = await this.presence.connect({
      ...input,
      now: this.clock.now(),
    });
    if (!connected) {
      // At the device limit. If a slot is held by an instance that is provably
      // dead, free it and try once more; a live device is never displaced.
      const reclaimed = await this.ownership
        .reclaimDeadSlots(sessionId, participantId)
        .catch((error: unknown) => {
          this.logger.error({
            event: 'presence_slot_reclaim_failed',
            sessionId,
            participantId,
            message: error instanceof Error ? error.message : String(error),
          });
          return 0;
        });
      if (reclaimed > 0) {
        connected = await this.presence.connect({
          ...input,
          now: this.clock.now(),
        });
      }
    }
    if (connected) {
      this.logger.log({
        event: 'participant_connected',
        sessionId,
        participantId,
        connectionId,
      });
      // A team action may have been deliberately left with its absent holder
      // while the whole team was away. The first eligible return makes that
      // action playable immediately instead of waiting for the periodic scan.
      await this.reassignTeamActions.forSession(sessionId);
    }
    return connected;
  }

  async disconnected(
    sessionId: string,
    participantId: string,
    connectionId: string,
  ): Promise<void> {
    await this.presence.disconnect({
      sessionId,
      participantId,
      connectionId,
      now: this.clock.now(),
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
    // Fair-start: if this connection had acknowledged a required presentation
    // surface, that acknowledgement stops counting the moment it disconnects.
    // Contained for the same reason as the reassignment above — a failure here
    // must not skip the Bomb countdown cancellation below.
    try {
      await this.withdrawReadiness.forConnection(sessionId, connectionId);
    } catch (error) {
      this.logger.error({
        event: 'presentation_readiness_withdraw_failed',
        sessionId,
        participantId,
        connectionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    // Shared with the background reconciler, so a crash between the removal
    // above and these effects is recovered from state on a later pass.
    await this.reconciler.cancelUnreadyBombCountdown(sessionId);
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
