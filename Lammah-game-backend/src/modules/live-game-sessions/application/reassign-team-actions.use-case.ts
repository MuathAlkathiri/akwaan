import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import {
  parseTeamActionAssignments,
  reassignUnavailableActions,
  serializeTeamActionAssignments,
  TeamActionAssignment,
} from '../domain/team-action-assignment';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import { LiveGameSessionSnapshotMapper } from './live-game-session.snapshot';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from './live-session-transition.publisher';
import { eligibleParticipantsOf } from './start-top5.use-case';

/**
 * Keeps a team-authoritative mechanic playable when its assigned player leaves.
 *
 * One phone dropping out must never freeze a challenge. When the participant who
 * currently holds a team action is no longer connected, the action moves to the
 * next eligible player in that team's *existing* rotation, is persisted, and is
 * republished. The rotation itself is untouched: the player who left keeps their
 * place, so when they come back they simply become eligible again on a future
 * turn rather than interrupting whoever is acting now.
 *
 * Mechanic-agnostic on purpose. Anything that persists `teamActionJson` gets this
 * behaviour; anything that does not is left completely alone.
 */
@Injectable()
export class ReassignTeamActions {
  private readonly logger = new Logger(ReassignTeamActions.name);

  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly snapshots: LiveGameSessionSnapshotMapper,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
  ) {}

  async forSession(sessionId: string): Promise<TeamActionAssignment[]> {
    const runtime = await this.runtimes.findBySessionId(sessionId);
    const session = await this.sessions.findById(sessionId);
    if (!runtime || !session) return [];
    const state = runtime.serialize();
    // Only a mechanic that opted in, and only while it is actually running.
    if (
      typeof state.runtimeState.teamActionJson !== 'string' ||
      state.activeRound?.status !== 'active'
    ) {
      return [];
    }
    const participants = eligibleParticipantsOf(session.serialize());
    const reassigned = reassignUnavailableActions(
      parseTeamActionAssignments(state.runtimeState.teamActionJson),
      participants,
    );
    if (!reassigned.changed.length) return [];

    const now = this.clock.now();
    const previousRevision = runtime.revision;
    // The round's `activeParticipantId` is what `active-participant`
    // authorisation reads, so a handoff has to land there too — otherwise the
    // player who left would still be the only one the server would accept.
    const holder =
      reassigned.changed.find(
        (assignment) => assignment.teamId === state.activeRound?.activeTeamId,
      ) ?? reassigned.changed[0];
    runtime.applyModeState({
      commandId: randomUUID(),
      actorId: 'system',
      runtimeState: {
        ...state.runtimeState,
        teamActionJson: serializeTeamActionAssignments(reassigned.state),
      },
      roundState: {
        ...state.activeRound.modeState,
        ...(state.activeRound.modeState.activeParticipantId !== undefined
          ? { activeParticipantId: holder.participantId }
          : {}),
        ...(state.activeRound.modeState.assignmentSequence !== undefined
          ? { assignmentSequence: holder.sequence }
          : {}),
        ...(state.activeRound.modeState.answererParticipantId !== undefined
          ? {
              answererParticipantId:
                reassigned.state.assignments.find(
                  (assignment) => assignment.action === 'ryo.answer',
                )?.participantId ??
                state.activeRound.modeState.answererParticipantId,
            }
          : {}),
        ...(state.activeRound.modeState.deciderParticipantId !== undefined
          ? {
              deciderParticipantId:
                reassigned.state.assignments.find(
                  (assignment) => assignment.action === 'ryo.decision',
                )?.participantId ??
                state.activeRound.modeState.deciderParticipantId,
            }
          : {}),
      },
      eventType: 'team-action-reassigned',
      eventPayload: {
        reassignedCount: reassigned.changed.length,
        participantId: holder.participantId,
      },
      now,
      sessionRevision: session.revision,
      activeTeamId: state.activeRound.activeTeamId,
      activeParticipantId: holder.participantId,
    });
    await this.runtimes.save(runtime, previousRevision);
    this.publisher.publish(
      'live-session:state-changed',
      this.snapshots.toSnapshot(session, session.controllerActorId, now),
      { reason: 'team-action-reassigned' },
    );
    this.logger.log({
      event: 'team_action_reassigned',
      sessionId,
      runtimeId: runtime.id,
      modeKey: runtime.modeKey,
      assignments: reassigned.changed.map((assignment) => ({
        action: assignment.action,
        teamId: assignment.teamId,
        participantId: assignment.participantId,
        sequence: assignment.sequence,
      })),
    });
    return reassigned.changed;
  }
}
