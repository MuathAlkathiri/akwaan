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
import { LiveSessionConcurrencyError } from '../domain/live-session.errors';
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
  /** Bounded: a handoff that keeps losing is a busy game, not a stuck one. */
  private static readonly MAX_ATTEMPTS = 3;

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

  /**
   * Hands every action held by an absent player to somebody who is here.
   *
   * Retried, because it competes with gameplay. The write is guarded on the
   * runtime revision exactly like a gameplay command, so it can never overwrite
   * a mutation that landed first — but losing that race used to mean the
   * handoff was simply dropped, leaving the action with the player who left and
   * nobody to take it. Each attempt re-reads runtime *and* presence, so a retry
   * decides against what is true now rather than replaying a stale verdict.
   *
   * Converges rather than insists: if the mutation that won the race already
   * reassigned the action — a resolution opening the next item does exactly
   * that — the recomputation finds nothing to change and this writes nothing.
   */
  async forSession(sessionId: string): Promise<TeamActionAssignment[]> {
    for (
      let attempt = 1;
      attempt <= ReassignTeamActions.MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.attempt(sessionId);
      } catch (error) {
        if (!(error instanceof LiveSessionConcurrencyError)) throw error;
        this.logger.warn({
          event: 'team_action_reassignment_retry',
          sessionId,
          attempt,
        });
      }
    }
    // Gameplay is moving fast enough that every attempt lost. The next command
    // or disconnect converges; saying so beats a silent drop.
    this.logger.error({
      event: 'team_action_reassignment_abandoned',
      sessionId,
      attempts: ReassignTeamActions.MAX_ATTEMPTS,
    });
    return [];
  }

  private async attempt(sessionId: string): Promise<TeamActionAssignment[]> {
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
