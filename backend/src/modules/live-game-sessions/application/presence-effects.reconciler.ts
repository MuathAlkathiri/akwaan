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
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import { LiveGameSessionSnapshotMapper } from './live-game-session.snapshot';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from './live-session-transition.publisher';
import { BombCountdownScheduler } from './bomb-countdown.scheduler';
import { ReassignTeamActions } from './reassign-team-actions.use-case';
import { WithdrawPresentationReadiness } from './withdraw-presentation-readiness.use-case';
import { LiveSessionDomainError } from '../domain/live-session.errors';

/**
 * The verdict of one reconciliation pass over a session.
 *
 * - `ok`: every effect was reconciled.
 * - `transient`: something failed that a later pass may succeed at — database
 *   or network errors, timeouts, lost revision races, or anything not proven
 *   permanent. Retried with backoff.
 * - `permanent`: the session's persisted runtime or session cannot be
 *   restored at all, so no pass can succeed until that document changes.
 */
export type ReconcileOutcome =
  | { status: 'ok' }
  | { status: 'transient' }
  | { status: 'permanent'; code: string; message: string };

/**
 * Codes a restore can never mean "invalid persisted state": they describe a
 * race or an absence, which time can change. Listed so a refactor that ever
 * surfaced one through a load is still never mistaken for corruption.
 */
const NON_PERMANENT_CODES = new Set([
  'CONCURRENT_UPDATE',
  'STALE_REVISION',
  'STALE_RUNTIME_REVISION',
  'SESSION_NOT_FOUND',
  'GAMEPLAY_RUNTIME_NOT_FOUND',
]);

/**
 * Brings a session's gameplay into line with its current presence.
 *
 * Every effect is derived from persisted state, not from "a connection was just
 * removed": an action held by a participant who is not connected moves on,
 * readiness held by a connection that is no longer present is withdrawn, and a
 * Bomb countdown with no ready, connected representative is cancelled. Each is
 * a state transition saved under the expected revision, so concurrent or
 * repeated runs converge: the loser of a race re-reads and finds nothing left
 * to do. That is what makes it safe to run after a sweep, after a crash
 * between a removal and its effects, and periodically as a backstop. It does
 * not claim exactly-once execution; it claims at most one effective transition
 * per state change.
 */
@Injectable()
export class PresenceEffectsReconciler {
  private readonly logger = new Logger(PresenceEffectsReconciler.name);

  constructor(
    @Inject(PARTICIPANT_PRESENCE)
    private readonly presence: ParticipantPresence,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly snapshots: LiveGameSessionSnapshotMapper,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
    private readonly countdown: BombCountdownScheduler,
    private readonly reassignTeamActions: ReassignTeamActions,
    private readonly withdrawReadiness: WithdrawPresentationReadiness,
  ) {}

  /**
   * Reconciles every presence-derived effect for one session. Each part is
   * contained, so one failing never skips the others. A failure is then
   * classified (see `classifyFailure`) so the caller can retry what may yet
   * succeed and stop retrying what provably cannot.
   */
  async forSession(sessionId: string): Promise<ReconcileOutcome> {
    const results = [
      await this.contain('team_action_reassignment', sessionId, () =>
        this.reassignTeamActions.forSession(sessionId),
      ),
      await this.contain('presentation_readiness', sessionId, () =>
        this.withdrawAbsentReadiness(sessionId),
      ),
      await this.contain('bomb_countdown', sessionId, () =>
        this.cancelUnreadyBombCountdown(sessionId),
      ),
    ];
    if (results.every(Boolean)) return { status: 'ok' };
    return this.classifyFailure(sessionId);
  }

  /**
   * Decides whether a failed pass can ever succeed, from evidence rather than
   * from the error it happened to throw.
   *
   * A domain error alone proves nothing: revision races and "not found" are
   * domain errors too. So the session's persisted state is re-read through the
   * same restore every effect uses. Restoring is a pure function of the stored
   * document and the plugin code, so a domain error *from the restore itself*
   * is deterministic: every later pass would fail identically until the
   * document changes. Anything else — the probe succeeding (the failure lay
   * elsewhere), or the probe failing on the database — stays transient.
   */
  async classifyFailure(sessionId: string): Promise<ReconcileOutcome> {
    try {
      await this.runtimes.findBySessionId(sessionId);
      await this.sessions.findById(sessionId);
      return { status: 'transient' };
    } catch (error) {
      if (
        error instanceof LiveSessionDomainError &&
        !NON_PERMANENT_CODES.has(error.code)
      ) {
        return {
          status: 'permanent',
          code: error.code,
          message: error.message,
        };
      }
      return { status: 'transient' };
    }
  }

  /** Readiness held by a connection no longer present in presence. */
  async withdrawAbsentReadiness(sessionId: string): Promise<number> {
    const runtime = await this.runtimes.findBySessionId(sessionId);
    if (!runtime) return 0;
    const state = runtime.serialize();
    const held = new Set<string>([
      ...(state.presentationReady ?? []).map((entry) => entry.connectionId),
      ...(state.currentPresentation?.readiness ?? []).map(
        (entry) => entry.connectionId,
      ),
    ]);
    if (!held.size) return 0;
    const live = await this.presence.connectionIds(sessionId);
    let withdrawn = 0;
    for (const connectionId of held) {
      if (live.has(connectionId)) continue;
      await this.withdrawReadiness.forConnection(sessionId, connectionId);
      withdrawn += 1;
    }
    return withdrawn;
  }

  /**
   * A Bomb session that is `ready` while some active team has no ready,
   * connected representative cancels its countdown. Saved under the expected
   * revision: a concurrent cancel makes this save fail, and the retry finds the
   * session no longer `ready`, so the countdown is cancelled and published once.
   */
  async cancelUnreadyBombCountdown(sessionId: string): Promise<boolean> {
    const session = await this.sessions.findById(sessionId);
    if (!session) return false;
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
    const now = this.clock.now();
    if (
      state.modeKey !== 'bomb' ||
      state.status !== 'ready' ||
      representativesReady ||
      // An expired session refuses every command; there is no countdown left
      // that anyone could start, and cancelling would only throw.
      now.getTime() >= new Date(state.expiresAt).getTime()
    ) {
      return false;
    }
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
    return true;
  }

  private async contain(
    effect: string,
    sessionId: string,
    work: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await work();
      return true;
    } catch (error) {
      this.logger.error({
        event: `presence_reconcile_${effect}_failed`,
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
