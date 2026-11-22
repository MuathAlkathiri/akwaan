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
  EligibleParticipant,
  parseTeamActionAssignments,
  reassignUnavailableActions,
  retargetRotationCaptain,
  serializeTeamActionAssignments,
  TeamActionAssignment,
  TeamActionAssignmentState,
} from '../domain/team-action-assignment';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import { LiveGameSessionSnapshotMapper } from './live-game-session.snapshot';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from './live-session-transition.publisher';
import { LiveSessionConcurrencyError } from '../domain/live-session.errors';
import { eligibleParticipantsOf } from './start-top5.use-case';
import { BOMB_MODE_KEY } from '../domain/bomb-gameplay.plugin';

/**
 * Why a run is happening.
 *
 * Both causes need the identical, fiddly aftermath — mirroring the new holder
 * into the round's `activeParticipantId`, `assignmentSequence` and the ryo
 * answerer/decider fields, guarding the write on the runtime revision, and
 * republishing — so they share one path and differ only in what they compute.
 * Duplicating that aftermath for the host's case is how the two would drift.
 */
type ReassignmentPlan =
  | { kind: 'absence' }
  | { kind: 'captain'; teamId: string; captainId: string | undefined };

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
    return this.run(sessionId, { kind: 'absence' });
  }

  /**
   * Moves a team's armband mid-challenge at the host's request.
   *
   * The host has already named the captain on the session; this makes it true
   * of the challenge actually being played, which is the half that a frozen
   * team needs. Unlike the absence path this does not wait for anyone to look
   * disconnected: the host said so, so it takes effect at once.
   */
  async retargetCaptain(
    sessionId: string,
    teamId: string,
    captainId: string | undefined,
  ): Promise<TeamActionAssignment[]> {
    return this.run(sessionId, { kind: 'captain', teamId, captainId });
  }

  private async run(
    sessionId: string,
    plan: ReassignmentPlan,
  ): Promise<TeamActionAssignment[]> {
    for (
      let attempt = 1;
      attempt <= ReassignTeamActions.MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.attempt(sessionId, plan);
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

  private async attempt(
    sessionId: string,
    plan: ReassignmentPlan,
  ): Promise<TeamActionAssignment[]> {
    const runtime = await this.runtimes.findBySessionId(sessionId);
    const session = await this.sessions.findById(sessionId);
    if (!runtime || !session) return [];
    const state = runtime.serialize();
    if (
      state.modeKey === BOMB_MODE_KEY &&
      state.activeRound?.status === 'active'
    ) {
      const sessionState = session.serialize();
      const teamId = state.activeRound.activeTeamId;
      const current = state.activeRound.activeParticipantId;
      const eligible = eligibleParticipantsOf(sessionState).filter(
        (participant) => participant.teamId === teamId && participant.connected,
      );
      // The host's change concerns one team; the other is mid-answer.
      if (plan.kind === 'captain' && plan.teamId !== teamId) return [];
      // Absence only acts on somebody who is actually gone. The host does not
      // have to wait for that: they said so, so it takes effect now.
      if (
        plan.kind === 'absence' &&
        eligible.some((participant) => participant.participantId === current)
      ) {
        return [];
      }
      const replacement =
        plan.kind === 'captain'
          ? (eligible.find(
              (participant) => participant.participantId === plan.captainId,
            ) ?? eligible[0])
          : eligible[0];
      if (!replacement || !teamId) return [];
      // Already where the host wants it.
      if (replacement.participantId === current) return [];
      const previousRevision = runtime.revision;
      const now = this.clock.now();
      runtime.applyModeState({
        commandId: randomUUID(),
        actorId: 'system',
        runtimeState: state.runtimeState,
        roundState: state.activeRound.modeState,
        eventType: 'bomb-active-participant-reassigned',
        eventPayload: { participantId: replacement.participantId },
        now,
        sessionRevision: session.revision,
        activeTeamId: teamId,
        activeParticipantId: replacement.participantId,
      });
      await this.runtimes.save(runtime, previousRevision);
      this.publisher.publish(
        'live-session:state-changed',
        this.snapshots.toSnapshot(session, session.controllerActorId, now),
        { reason: 'bomb-active-participant-reassigned' },
      );
      return [
        {
          teamId,
          participantId: replacement.participantId,
          action: 'bomb.answer',
          openedAt: now.toISOString(),
          sequence: runtime.revision,
        },
      ];
    }
    // Only a mechanic that opted in, and only while it is actually running.
    if (
      typeof state.runtimeState.teamActionJson !== 'string' ||
      state.activeRound?.status !== 'active'
    ) {
      return [];
    }
    const participants = eligibleParticipantsOf(session.serialize());
    const reassigned = this.recompute(
      parseTeamActionAssignments(state.runtimeState.teamActionJson),
      participants,
      plan,
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

  /**
   * The one line the two causes actually disagree about.
   *
   * Absence moves only what an absent player is holding, and leaves a
   * connected holder alone. A captain retarget moves what the named team is
   * holding whether or not its holder is connected — that is the point of an
   * override.
   */
  private recompute(
    assignments: TeamActionAssignmentState,
    participants: readonly EligibleParticipant[],
    plan: ReassignmentPlan,
  ): { state: TeamActionAssignmentState; changed: TeamActionAssignment[] } {
    const now = this.clock.now();
    if (plan.kind === 'captain') {
      return retargetRotationCaptain(assignments, {
        teamId: plan.teamId,
        captainId: plan.captainId,
        participants,
        now,
      });
    }
    return reassignUnavailableActions(assignments, participants, now);
  }
}
