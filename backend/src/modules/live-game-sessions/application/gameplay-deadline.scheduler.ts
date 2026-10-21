import { randomUUID } from 'crypto';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import {
  isTerminalRuntimeStatus,
  type GameplayRuntimeState,
} from '../domain/gameplay-runtime';
import {
  GameplayDeadlineDeclaration,
  PresentationTimeoutPolicy,
} from '../domain/gameplay-mode.plugin';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import {
  GameplayObserverRegistry,
  GameplayTerminalObserver,
} from './gameplay-observer.registry';
import { GameplayDeadlineSynchronizer } from './gameplay-deadline.port';

/**
 * A pending server deadline, how it is resolved, and which exact deadline it is.
 *
 * Two shapes exist because mechanics express a deadline in two places:
 *
 * - `mode-command` — the deadline lives outside the interaction and a mode
 *   command resolves it. The mechanic declares this on its plugin
 *   (`GameplayDeadlineDeclaration`); nothing here switches on a mode key.
 * - `interaction` — the deadline lives on the open interaction's prompt and is
 *   resolved by the ordinary interaction resolution path. Deliberately not
 *   declared and not keyed by mode: any mechanic that publishes
 *   `prompt.deadlineAt` is telling clients to run a countdown, and a countdown
 *   the server does not also enforce is the freeze this branch exists to
 *   prevent. "اقرأ خصمك" is enforced entirely by this branch.
 *
 * `key` is the deadline's identity, not just its instant. A timer carries the
 * key it was armed for and refuses to act unless the state it wakes up to still
 * presents the same one, which is what makes a timer belonging to a finished
 * item harmless to the item that replaced it.
 */
type PendingDeadline = { key: string; deadlineAt: string } & (
  | { kind: 'mode-command'; commandType: string }
  | { kind: 'presentation-activation'; generation?: number }
  | {
      kind: 'interaction';
      roundId: string;
      interactionRevision: number;
      interactionStatus: string;
    }
);

/**
 * Interaction states a deadline can still resolve. The terminal three
 * (`resolved`, `cancelled`, `expired`) are excluded, so a deadline that fires
 * after the players already settled the item does nothing.
 */
const OPEN_INTERACTION_STATUSES = new Set([
  'prepared',
  'open',
  'closed',
  'adjudicating',
]);

/**
 * How long a prepared presentation may wait for its surfaces before the server
 * activates it anyway.
 *
 * A fair-start barrier arms no gameplay deadline while it waits — that is the
 * whole point, and it is why a surface that never acknowledges used to freeze
 * the challenge with no timer watching it. This bounds that wait.
 *
 * Forced activation is the *generous* outcome, never the punitive one: it runs
 * the mechanic's own `activatePresentation`, which re-anchors the window to the
 * activation instant, so the room still gets its full playable time. The cost of
 * the timeout is a clip that may not have finished buffering, not a lost window.
 */
export const PRESENTATION_ACTIVATION_TIMEOUT_SECONDS = Number(
  process.env.PRESENTATION_ACTIVATION_TIMEOUT_SECONDS ?? 12,
);

/**
 * The same bound for the INITIAL barrier, and deliberately a longer one.
 *
 * M3 bounded only the recurring checkpoint. The initial barrier — every
 * `requiresPresentationActivation` mechanic's first screen, and اقرأ خصمك's
 * first item — still returned no deadline at all, so a shared screen that never
 * arrived froze the challenge exactly as before. This closes that.
 *
 * Longer because the wait is a different thing: a recurring barrier interrupts
 * a session already running on warm clients, while this one covers a cold open
 * — three devices loading an app for the first time. Twelve seconds is generous
 * mid-challenge and tight at launch.
 */
export const PRESENTATION_INITIAL_TIMEOUT_SECONDS = Number(
  process.env.PRESENTATION_INITIAL_TIMEOUT_SECONDS ?? 45,
);

/**
 * The active team's remaining Bomb clock, as an absolute instant.
 *
 * Bomb is the one mechanic whose deadline is not written on the runtime: it
 * burns the *session's* team clock, so the instant has to be derived from the
 * clock that is currently running. Its plugin says so by declaring
 * `source: 'session-clock'`.
 */
function sessionClockDeadline(
  session: ClockBearingSession | undefined,
): string | undefined {
  const state = session?.serialize();
  if (!state || state.status !== 'active') return undefined;
  const team = state.teams.find(
    (candidate) => candidate.id === state.activeTeamId,
  );
  if (!team?.clock.running || !team.clock.startedAt) return undefined;
  // Absolute, not "now + remaining". A deadline recomputed against the clock
  // moves every time it is read, and the staleness guard would then reject its
  // own timer as belonging to a different deadline — so it would never fire.
  const startedAt = new Date(team.clock.startedAt).getTime();
  const budgetMs = Math.max(0, team.clock.allocatedMs - team.clock.consumedMs);
  return new Date(startedAt + budgetMs).toISOString();
}

/** Only the shape this module reads, so the scheduler stays decoupled. */
interface ClockBearingSession {
  serialize(): {
    status: string;
    activeTeamId?: string;
    teams: Array<{
      id: string;
      clock: {
        running: boolean;
        startedAt?: Date | string;
        allocatedMs: number;
        consumedMs: number;
      };
    }>;
  };
}

/**
 * The single derivation of "what deadline, if any, does committed state carry".
 *
 * Pure, and the only place that answers the question — the timer that is armed,
 * the check the timer makes when it wakes, and restart recovery all read this
 * one function, so they cannot disagree about whether a deadline exists.
 */
export function pendingDeadline(
  state: GameplayRuntimeState | undefined,
  declaration?: GameplayDeadlineDeclaration,
  session?: ClockBearingSession,
  options: {
    /**
     * Whether the mechanic holds a multi-surface barrier
     * (`requiredPresentationSurfaces`). اقرأ خصمك carries no deadline
     * declaration at all — its clock lives on the interaction — so the initial
     * gate cannot be derived from the declaration alone.
     */
    multiSurface?: boolean;
  } = {},
): PendingDeadline | undefined {
  const multiSurface = options.multiSurface === true;
  const round = state?.activeRound;
  if (!state || !round || round.status !== 'active') return undefined;
  if (isTerminalRuntimeStatus(state.status)) return undefined;
  const identity = `${state.id}|${round.id}`;

  // Fair-start: an opted-in mechanic arms no deadline until the runtime has
  // recorded its one-time presentation activation, so client cold-start never
  // burns gameplay time. This runs before source dispatch because Bomb's
  // deadline lives on the session clock rather than runtime state.
  //
  // Bounded since M3.1 — but strictly additively. M3 watched only the recurring
  // checkpoint; the initial barrier returned no deadline at all, so a shared
  // screen that never arrived froze the challenge exactly as before.
  //
  // The condition is deliberately "awaiting AND nothing is already running".
  // A runtime that never recorded an activation but already holds an open,
  // deadlined interaction is *playing*, not waiting — a legacy document from
  // before activation was persisted looks exactly like that, and arming a
  // barrier over it would take away the gameplay deadline it still needs. So
  // this only ever arms where nothing was armed before.
  const liveInteraction = round.interaction;
  // The legacy guard, and it is needed for exactly one shape of mechanic.
  //
  // A mechanic that DECLARES `requiresPresentationActivation` already armed
  // nothing before activation — that suppression predates M3.1 — so bounding
  // its wait is purely additive and no guard is required. It also writes its
  // deadline into runtime state while still awaiting, so reading that field as
  // "already running" would wrongly disarm the bound.
  //
  // اقرأ خصمك is the exception: it declares no deadline at all and previously
  // fell through to the interaction branch. A runtime of its shape that never
  // recorded an activation but already holds an open, deadlined interaction is
  // *playing* — a document from before activation was persisted looks exactly
  // like that — and arming a barrier over it would take away the gameplay
  // deadline it still needs.
  const legacyInteractionRunning = Boolean(
    !declaration?.requiresPresentationActivation &&
    liveInteraction &&
    OPEN_INTERACTION_STATUSES.has(liveInteraction.status) &&
    liveInteraction.prompt.deadlineAt,
  );
  const awaitingInitial =
    !state.presentationActivatedAt &&
    !legacyInteractionRunning &&
    (declaration?.requiresPresentationActivation === true || multiSurface);
  if (awaitingInitial) {
    // A recorded failure is a *stopped* barrier, not a running one. Re-arming
    // against it would re-fire the same timeout against a clip that is still
    // missing; the host's retry is what restarts the wait.
    if (state.presentationFailure) return undefined;
    const startedAt = state.activeRound?.startedAt ?? state.startedAt;
    if (startedAt) {
      const deadlineAt = new Date(
        new Date(startedAt).getTime() +
          PRESENTATION_INITIAL_TIMEOUT_SECONDS * 1000,
      ).toISOString();
      return {
        kind: 'presentation-activation',
        key: `${identity}|presentation|initial|${deadlineAt}`,
        deadlineAt,
      };
    }
  }

  // The pre-existing suppression, unchanged: a declaring mechanic arms no
  // gameplay deadline until it has recorded its one-time activation.
  if (
    declaration?.requiresPresentationActivation &&
    !state.presentationActivatedAt
  ) {
    return undefined;
  }

  // Recurring fair-start: while a recurring presentation is prepared, content is
  // hidden again and no *gameplay* deadline may arm — mirroring the initial gate
  // above, and preventing a stale deadline from arming during the awaiting
  // window. What arms instead is the bounded activation deadline: the barrier is
  // now watched by a timer, so a surface that never acknowledges stops being a
  // frozen challenge and becomes a late one.
  if (state.currentPresentation?.status === 'prepared') {
    // As above: a failed barrier is stopped, and only a host retry restarts it.
    if (state.presentationFailure) return undefined;
    const checkpoint = state.currentPresentation;
    const deadlineAt = new Date(
      new Date(checkpoint.preparedAt).getTime() +
        PRESENTATION_ACTIVATION_TIMEOUT_SECONDS * 1000,
    ).toISOString();
    return {
      kind: 'presentation-activation',
      // The generation is the identity. A later generation is a different
      // barrier, and a timer armed for the one before it must not act on it.
      key: `${identity}|presentation|${checkpoint.generation}|${deadlineAt}`,
      deadlineAt,
      generation: checkpoint.generation,
    };
  }

  // The mechanic's own declaration wins when it has one, which preserves the
  // existing precedence for a mechanic that carries both kinds of deadline.
  if (declaration?.source === 'session-clock') {
    const deadlineAt = sessionClockDeadline(session);
    return deadlineAt
      ? {
          kind: 'mode-command',
          key: `${identity}|mode|${declaration.commandType}|${deadlineAt}`,
          deadlineAt,
          commandType: declaration.commandType,
        }
      : undefined;
  }
  if (
    declaration?.source === 'runtime-state' &&
    typeof state.runtimeState.deadlineAt === 'string' &&
    state.runtimeState.deadlineAt
  ) {
    // Which command expires *this* phase. A mechanic with a single window
    // answers `commandType` for every phase it lists; one with several — an
    // answer window followed by a placement window — maps the extras by phase.
    // Either way exactly one command is armed at a time, from this one place.
    const phase = String(state.runtimeState.phase);
    const phaseCommand = declaration.commandTypeByPhase?.[phase];
    const commandType = phaseCommand
      ? phaseCommand
      : declaration.activePhases.includes(phase)
        ? declaration.commandType
        : undefined;
    if (!commandType) return undefined;
    const deadlineAt = state.runtimeState.deadlineAt;
    return {
      kind: 'mode-command',
      key: `${identity}|mode|${commandType}|${deadlineAt}`,
      deadlineAt,
      commandType,
    };
  }

  const interaction = round.interaction;
  if (
    interaction &&
    OPEN_INTERACTION_STATUSES.has(interaction.status) &&
    interaction.prompt.deadlineAt
  ) {
    const deadlineAt = new Date(interaction.prompt.deadlineAt).toISOString();
    return {
      kind: 'interaction',
      // The interaction id, not its revision: a submission arriving before the
      // deadline bumps the revision without replacing the deadline, and a timer
      // that disowned itself on every submission would leave the item unguarded.
      // A *new* item is a new interaction id, which is what this rejects.
      key: `${identity}|interaction|${interaction.id}|${deadlineAt}`,
      deadlineAt,
      roundId: round.id,
      interactionRevision: interaction.revision,
      interactionStatus: interaction.status,
    };
  }
  return undefined;
}

import { SubmitGameplayCommand } from './submit-gameplay-command.use-case';
import { GameplayInteractionUseCases } from './gameplay-interaction.use-cases';
import { PresentationReady } from './gameplay-runtime.lifecycle';

/**
 * The single owner of gameplay deadline timers.
 *
 * It is a *reconciler*, not a service that callers drive: it is told only that a
 * session's state changed and it converges this process's timers to whatever the
 * committed state now says. That inversion is the fix for the class of bug where
 * authoritative state carried a deadline that no timer was watching — a mechanic
 * writes its deadline and is done, and no use case has to remember to arm
 * anything.
 *
 * It converges from exactly three places, all of them lifecycle boundaries
 * rather than mechanic code:
 *
 * - every committed runtime mutation, as a registered terminal observer;
 * - every committed session command, through `GameplayDeadlineSynchronizer`
 *   (Bomb's clock is session state, so a turn starting is a deadline appearing);
 * - process start, which rebuilds every live session's timer from persistence.
 */
@Injectable()
export class GameplayDeadlineScheduler
  implements
    GameplayDeadlineSynchronizer,
    GameplayTerminalObserver,
    OnModuleInit,
    OnModuleDestroy,
    OnApplicationBootstrap
{
  readonly name = 'gameplay-deadline-scheduler';
  private readonly logger = new Logger(GameplayDeadlineScheduler.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /** The deadline key each armed timer belongs to, for cheap idempotence. */
  private readonly armed = new Map<string, string>();
  /**
   * Consecutive failures per session. A deadline already in the past re-arms
   * with a ~0ms delay, so an error that repeats — a stale revision that never
   * settles, a mode that cannot resolve — would otherwise spin against Mongo
   * as fast as the event loop allows.
   */
  private readonly failures = new Map<string, number>();
  /**
   * The last deadline this process resolved, per session, with the runtime
   * revision it was resolved at. Re-arming after a resolution is what picks up
   * the next item's clock, but if the runtime has not moved then the same
   * deadline is still pending and arming it again would resolve it again, for
   * ever. Requiring the revision to have advanced makes that impossible.
   */
  private readonly lastResolved = new Map<
    string,
    { key: string; revision: number }
  >();
  /**
   * The newest runtime revision this scheduler has converged, per session.
   *
   * Only ever used to refuse a stale shortcut: a post-commit hint older than
   * this means another commit has already been converged, so that hint is not
   * current and the caller reads persistence instead. Cleared by `forget`
   * alongside the rest of the per-session bookkeeping.
   */
  private readonly applied = new Map<string, number>();
  /** Set on shutdown so nothing armed earlier can still reach persistence. */
  private stopped = false;
  private static readonly MAX_RETRIES = 5;
  private static readonly RETRY_BACKOFF_MS = 250;

  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly modes: GameplayModeRegistry,
    private readonly observers: GameplayObserverRegistry,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Subscribe to every committed runtime mutation.
   *
   * This is the wiring that makes the guarantee hold without mechanic-specific
   * code: `notifyRuntimeMutated` already runs after every runtime write that
   * gameplay performs, so a mechanic that opens an item with a deadline gets a
   * timer as a consequence of committing, not as a consequence of remembering.
   */
  onModuleInit(): void {
    this.stopped = false;
    this.observers.registerTerminalObserver(this);
  }

  /** Committed runtime mutation — converge. Failures here never fail gameplay. */
  async onRuntimeMutated(input: {
    sessionId: string;
    runtimeId?: string;
    runtimeState?: GameplayRuntimeState;
  }): Promise<void> {
    await this.synchronize(input.sessionId, input.runtimeState);
  }

  /**
   * Converge this process's timer for one session with its committed state.
   *
   * Idempotent in both directions: state with a deadline leaves exactly one
   * armed timer for it, state without one leaves none.
   *
   * `committed` is an optional shortcut, not a second source of truth. It is
   * only ever the state a commit just wrote — see `usableCommitted` for the two
   * conditions under which it is trusted — and it feeds the same
   * `pendingDeadline` every other path uses. Without it, or when it cannot be
   * shown to be current, this reads persistence exactly as it always did, which
   * is what keeps bootstrap and recovery honest.
   */
  async synchronize(
    sessionId: string,
    committed?: GameplayRuntimeState,
  ): Promise<void> {
    // A timer that survives shutdown must not touch a closed connection. This
    // is the same reasoning as the staleness key, one level up: convergence is
    // only meaningful while this process is still the one running the game.
    if (this.stopped) return;
    const usable = this.usableCommitted(sessionId, committed);
    if (usable) {
      const declaration = this.declarationFor(usable);
      // The session is loaded only when the deadline is actually derived from
      // it. `session-clock` (Bomb) burns the session's team clock and cannot be
      // answered without it; every other declaration, and every interaction
      // deadline, reads nothing but the runtime.
      //
      // The existence check the persistence path gets for free is not lost
      // here: this branch runs only after a command committed against this
      // session, which is itself proof the session was there.
      const session =
        declaration?.source === 'session-clock'
          ? await this.sessions.findById(sessionId)
          : undefined;
      this.converge(
        sessionId,
        usable,
        pendingDeadline(usable, declaration, session as never, {
          multiSurface: this.isMultiSurface(usable),
        }),
      );
      return;
    }
    const session = await this.sessions.findById(sessionId);
    const runtime = await this.runtimes.findBySessionId(sessionId);
    const state = runtime?.serialize();
    const pending =
      state && session
        ? pendingDeadline(state, this.declarationFor(state), session as never, {
            multiSurface: this.isMultiSurface(state),
          })
        : undefined;
    this.converge(sessionId, session && runtime ? state : undefined, pending);
  }

  /**
   * Whether a supplied committed state may stand in for a read.
   *
   * Two commands can commit against one session with their post-commit
   * observers interleaved, so "this state was committed" does not by itself mean
   * "this state is current". A hint older than a revision this scheduler has
   * already converged is therefore refused, and the caller falls back to
   * persistence — never worse than the behaviour before this existed.
   *
   * The remaining window is bounded and self-healing: an observer that runs
   * after a newer commit but before that newer commit's own observer can arm the
   * older deadline, and the newer observer — already in flight on the awaited
   * path that committed it — immediately converges over it. The armed-key check
   * in `expire` is the second line: a timer that wakes to state presenting a
   * different key does nothing.
   */
  private usableCommitted(
    sessionId: string,
    committed?: GameplayRuntimeState,
  ): GameplayRuntimeState | undefined {
    if (!committed) return undefined;
    const applied = this.applied.get(sessionId);
    if (applied !== undefined && committed.revision < applied) return undefined;
    return committed;
  }

  /**
   * Arm, re-arm or drop this session's timer for the deadline just derived.
   *
   * Shared by both paths above so there is exactly one place that decides what
   * a timer does, whichever way the state reached it.
   */
  private converge(
    sessionId: string,
    state: GameplayRuntimeState | undefined,
    pending: PendingDeadline | undefined,
  ): void {
    if (!state || !pending) {
      // No deadline in authoritative state means no timer may survive, which is
      // the half of the invariant that keeps a resolved item from being expired.
      //
      // `forget` rather than `clear`, because this is also where a session
      // stops needing to be remembered at all. A challenge that finished, a
      // runtime that went terminal, a session that no longer exists — all
      // arrive here, and the bookkeeping that guards *re-resolving* a deadline
      // is meaningless once there is no deadline. Leaving it behind was a slow
      // leak: `lastResolved` gained an entry for every session that ever timed
      // an item out and never lost one for the whole life of the process.
      //
      // Deliberately not a cleanup call bolted onto session completion: the
      // owner of a timer's existence is the same convergence that created it,
      // exactly as in the arming path.
      this.forget(sessionId);
      return;
    }
    this.applied.set(sessionId, state.revision);
    const resolved = this.lastResolved.get(sessionId);
    if (
      resolved &&
      resolved.key === pending.key &&
      resolved.revision === state.revision
    ) {
      // Already resolved this exact deadline and nothing moved. Arming again
      // would just re-resolve it.
      this.clear(sessionId);
      return;
    }
    if (this.armed.get(sessionId) === pending.key && this.timers.has(sessionId))
      return;
    this.clear(sessionId);
    const delay = Math.max(0, Date.parse(pending.deadlineAt) - Date.now());
    this.armed.set(sessionId, pending.key);
    this.timers.set(
      sessionId,
      setTimeout(() => {
        void this.expire(sessionId, pending.key);
      }, delay + 25),
    );
  }

  /**
   * Kept as the public name the start-of-challenge paths and tests already use.
   * It is exactly `synchronize`; there has never been a reason for a caller to
   * describe the deadline it wants.
   */
  schedule(sessionId: string): Promise<void> {
    return this.synchronize(sessionId);
  }

  /**
   * Rebuild every in-flight deadline after a restart.
   *
   * The timers only ever lived in this process's memory, so a redeploy, a crash
   * or a free-tier instance waking from sleep silently dropped them all and the
   * challenges they belonged to hung until somebody abandoned the game. Nothing
   * re-armed them, which is why a lost timer was permanent.
   *
   * It converges through the same `synchronize` every runtime mutation uses, so
   * a recovered timer and a freshly armed one are the same timer by
   * construction.
   */
  async onApplicationBootstrap(): Promise<void> {
    // Booting is the opposite of shutting down, and a process that comes back
    // must converge again — including in a redeploy simulation, where destroy
    // and bootstrap happen against the same instance.
    this.stopped = false;
    try {
      const sessionIds = await this.runtimes.findSessionIdsWithLiveRuntimes();
      if (!sessionIds.length) return;
      // allSettled, not all: one unreadable runtime must not stop every other
      // session from getting its clock back.
      const results = await Promise.allSettled(
        sessionIds.map((id) => this.synchronize(id)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      this.logger.log(
        `Rearmed gameplay deadlines for ${sessionIds.length - failed} of ${sessionIds.length} live session(s) after startup`,
      );
      if (failed) {
        this.logger.error(`${failed} session(s) could not be rearmed`);
      }
    } catch (error) {
      // Never block boot on this. A failure here costs timers, not the API.
      this.logger.error(
        `Could not rearm gameplay deadlines at startup: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  onModuleDestroy(): void {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.armed.clear();
    this.failures.clear();
    this.lastResolved.clear();
    this.applied.clear();
  }

  private declarationFor(
    state: GameplayRuntimeState,
  ): GameplayDeadlineDeclaration | undefined {
    try {
      return this.modes.resolve(state.modeKey, state.modeVersion).deadline;
    } catch {
      // An unregistered plugin cannot be expired by us; the runtime would fail
      // to restore on its own path and say so there.
      return undefined;
    }
  }

  /**
   * What this mechanic wants when its held presentation runs out of time.
   *
   * `activate` unless the plugin says otherwise, which is deliberately the
   * pre-existing behaviour: a mechanic that never opts in is unaffected by this
   * whole mechanism, and an unregistered or throwing plugin falls back to the
   * same safe answer rather than stranding a session.
   */
  /** Whether this mechanic holds a multi-surface barrier, safely. */
  private isMultiSurface(state: GameplayRuntimeState): boolean {
    try {
      return (
        this.modes.resolve(state.modeKey, state.modeVersion)
          .requiredPresentationSurfaces !== undefined
      );
    } catch {
      return false;
    }
  }

  private timeoutPolicyFor(
    state: GameplayRuntimeState,
  ): PresentationTimeoutPolicy {
    try {
      const plugin = this.modes.resolve(state.modeKey, state.modeVersion);
      return (
        plugin.presentationTimeoutPolicy?.({
          runtimeState: state.runtimeState,
          roundState: state.activeRound?.modeState ?? {},
        }) ?? 'activate'
      );
    } catch {
      return 'activate';
    }
  }

  private async expire(sessionId: string, expectedKey: string): Promise<void> {
    this.timers.delete(sessionId);
    this.armed.delete(sessionId);
    try {
      const session = await this.sessions.findById(sessionId);
      const runtime = await this.runtimes.findBySessionId(sessionId);
      const state = runtime?.serialize();
      const pending = state
        ? pendingDeadline(state, this.declarationFor(state), session as never, {
            multiSurface: this.isMultiSurface(state),
          })
        : undefined;
      const round = state?.activeRound;
      // The identity check that makes a stale timer harmless. A deadline that
      // moved on — a new item, a new round, a new runtime, an answer that
      // resolved this one — presents a different key, and this timer belongs to
      // none of them. The plugin's own terminal state stays the authority.
      if (
        !session ||
        !runtime ||
        !round ||
        !pending ||
        pending.key !== expectedKey
      ) {
        return;
      }
      const actor = {
        kind: 'user' as const,
        actorId: session.controllerActorId,
      };
      if (pending.kind === 'presentation-activation') {
        // The barrier expired. What that means is the mechanic's call, and the
        // two answers are genuinely different outcomes rather than two routes
        // to the same one.
        const presentation = this.moduleRef.get(PresentationReady, {
          strict: false,
        });
        const policy = this.timeoutPolicyFor(state!);
        await presentation.execute({
          sessionId,
          actor,
          commandId: randomUUID(),
          expectedSessionRevision: session.revision,
          expectedRuntimeRevision: runtime.revision,
          ...(pending.generation !== undefined
            ? { presentationGeneration: pending.generation }
            : {}),
          // `activate`: the room loses its buffering, not its question — the
          // mechanic's own hook still re-anchors a full window.
          // `fail`: the clock stays stopped and the host is told why. Forcing
          // a ten-second blind window onto a clip nobody can hear would not be
          // a degraded question, it would be an unanswerable one.
          ...(policy === 'fail'
            ? { presentationOutcome: 'readiness-timeout' as const }
            : { forcePresentationActivation: true }),
        });
        this.logger.warn(
          `Presentation ${pending.generation ?? 'initial'} for ${sessionId} was not acknowledged in time; policy=${policy}`,
        );
      } else if (pending.kind === 'interaction') {
        // The ordinary resolution path, run by the server instead of the host.
        // It calls the plugin's own `createOutcome`, so an unanswered item is
        // scored by the mechanic's authored rules for a missing submission
        // rather than by anything this scheduler decides.
        const interactions = this.moduleRef.get(GameplayInteractionUseCases, {
          strict: false,
        });
        // Close before resolving. `resolve` only accepts a closed or
        // adjudicating interaction — an open one still belongs to the players —
        // and the normal auto-resolve path closes first for the same reason.
        // Skipping this step made every timeout fail with
        // "Cannot perform this action while interaction is open".
        if (pending.interactionStatus === 'open') {
          await interactions.close({
            sessionId,
            roundId: pending.roundId,
            actor,
            commandId: randomUUID(),
            expectedSessionRevision: session.revision,
            expectedRuntimeRevision: runtime.revision,
            expectedInteractionRevision: pending.interactionRevision,
          });
        }
        // Closing advanced both revisions, so resolution reads the current
        // state rather than the one this timer was armed against.
        const closed = await this.runtimes.findBySessionId(sessionId);
        const closedSession = await this.sessions.findById(sessionId);
        if (!closed || !closedSession) return;
        const closedRound = closed.serialize().activeRound;
        if (!closedRound?.interaction) return;
        await interactions.resolve({
          sessionId,
          roundId: closedRound.id,
          actor,
          commandId: randomUUID(),
          expectedSessionRevision: closedSession.revision,
          expectedRuntimeRevision: closed.revision,
          expectedInteractionRevision: closedRound.interaction.revision,
        });
      } else {
        const submit = this.moduleRef.get(SubmitGameplayCommand, {
          strict: false,
        });
        await submit.execute({
          sessionId,
          actor,
          commandId: randomUUID(),
          expectedSessionRevision: session.revision,
          expectedRuntimeRevision: runtime.revision,
          roundId: round.id,
          commandType: pending.commandType,
          payload: {},
        });
      }
      this.failures.delete(sessionId);
      this.lastResolved.set(sessionId, {
        key: pending.key,
        revision: runtime.revision,
      });
      // The mechanic may have opened the next item's interaction inside that
      // resolution. Its own commit already converged us through the observer;
      // this makes the recovery path self-sufficient too.
      await this.synchronize(sessionId);
    } catch (error) {
      const attempts = (this.failures.get(sessionId) ?? 0) + 1;
      this.failures.set(sessionId, attempts);
      const message = error instanceof Error ? error.message : String(error);
      if (attempts > GameplayDeadlineScheduler.MAX_RETRIES) {
        // Stop retrying, but say so loudly. A deadline that cannot resolve is
        // a frozen challenge for the players in it, and silence here is what
        // makes that look like the game itself hanging.
        this.failures.delete(sessionId);
        this.logger.error(
          `Gameplay deadline for ${sessionId} failed ${attempts} times and will not be retried: ${message}`,
        );
        return;
      }
      this.logger.warn(
        `Gameplay deadline retry ${attempts} for ${sessionId}: ${message}`,
      );
      const retry = setTimeout(() => {
        // Every other entry point catches for itself — the observer registry
        // logs and swallows, the session-command boundary wraps its call. A
        // timer callback has no caller to catch it, so an unhandled rejection
        // here would take the process down with it.
        void this.synchronize(sessionId).catch((retryError: unknown) =>
          this.logger.error(
            `Gameplay deadline retry for ${sessionId} could not converge: ${
              retryError instanceof Error
                ? retryError.message
                : String(retryError)
            }`,
          ),
        );
      }, GameplayDeadlineScheduler.RETRY_BACKOFF_MS * attempts);
      retry.unref?.();
      // Tracked like any other timer so `clear` and shutdown can cancel it;
      // an untracked retry is a timer that outlives the session it belonged to.
      this.timers.set(sessionId, retry);
    }
  }

  private clear(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.timers.delete(sessionId);
    this.armed.delete(sessionId);
  }

  /**
   * The deadline this process currently has a timer for, if any.
   *
   * Read-only introspection. It exists so "is a deadline actually being
   * watched?" is answerable — by an operator looking at a stuck game, and by
   * the tests that hold the lifecycle to its guarantee without reaching into
   * private state or arming anything themselves.
   */
  armedKeyFor(sessionId: string): string | undefined {
    return this.armed.get(sessionId);
  }

  /**
   * Every session this process still holds anything for, across all of its
   * bookkeeping.
   *
   * Read-only introspection, for the same reason as `armedKeyFor`: "is this
   * scheduler still carrying sessions that finished hours ago?" should be
   * answerable — by an operator reading a memory graph, and by the tests that
   * hold cleanup to its guarantee — without reaching into private maps.
   */
  retainedSessionIds(): string[] {
    return [
      ...new Set([
        ...this.timers.keys(),
        ...this.armed.keys(),
        ...this.failures.keys(),
        ...this.lastResolved.keys(),
      ]),
    ];
  }

  /** Forget a finished session so the maps do not grow without bound. */
  forget(sessionId: string): void {
    this.clear(sessionId);
    this.failures.delete(sessionId);
    this.lastResolved.delete(sessionId);
    this.applied.delete(sessionId);
  }
}
