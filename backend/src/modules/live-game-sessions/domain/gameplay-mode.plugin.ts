import { LiveSessionDomainError } from './live-session.errors';
import {
  canSeeVisibility,
  GameplayInteractionPlugin,
  InteractionActorProjection,
} from './gameplay-interaction.plugin';
import { EligibleParticipant } from './team-action-assignment';

export type GameplayStateValue = string | number | boolean | null;
export type GameplayModeState = Record<string, GameplayStateValue>;
export type GameplayCommandPayload = Record<string, GameplayStateValue>;

/**
 * The safe, capability-shaped identity of one presentation surface.
 *
 * This is what a client is ever told about its own role in a multi-surface
 * fair-start: a capability keyword, never participant ids, never team ids, never
 * an assignment. Everything sensitive stays server-side; the client only learns
 * which of its surfaces it must acknowledge.
 */
export type PresentationSurfaceCapability = 'shared' | 'answering' | 'decision';

/**
 * One surface that must acknowledge before a multi-surface mechanic activates.
 *
 * `capability` is the only thing projected to any client. `participantId` is a
 * server-side binding — the current answerer, the current decider — used to
 * confirm that the ack actually came from the right actor; it is derived from
 * committed state at the moment readiness is evaluated.
 */
export interface PresentationSurfaceRequirement {
  capability: PresentationSurfaceCapability;
  /** Server-derived binding for participant-bound surfaces. */
  participantId?: string;
}

export type GameplayAuthorizationRequirement =
  | 'controller'
  | 'connected-player'
  | 'active-team-player'
  | 'controller-or-active-team-player'
  | 'controller-or-active-participant'
  | 'active-participant'
  | 'observer-safe'
  | 'internal';

export type GameplaySessionEffect =
  | { type: 'start-team-turn'; teamId: string; reason: string }
  | { type: 'pause-active-turn' }
  | { type: 'resume-active-turn' }
  | { type: 'switch-active-team'; teamId: string; reason: string }
  | { type: 'stop-active-turn'; reason: string }
  | { type: 'finish-live-session'; reason: string }
  | { type: 'adjust-active-team-time'; deltaMs: number }
  | { type: 'emit-runtime-event'; eventType: string };

export interface GameplayPluginContext {
  sessionId: string;
  runtimeId: string;
  roundId?: string;
  activeTeamId?: string;
  activeParticipantId?: string;
  /**
   * The participant who actually issued this command, resolved from the
   * authenticated actor by the session layer. A turn-based mechanic reads
   * `activeParticipantId`; a simultaneous one needs to know who is speaking.
   */
  submitterParticipantId?: string;
  /**
   * Every player the session currently considers connected, as the assignment
   * layer sees them. Present for mechanics that hand one authoritative action to
   * one participant (see `team-action-assignment`); a mechanic that does not opt
   * in simply ignores it.
   */
  eligibleParticipants?: readonly EligibleParticipant[];
  initialState?: GameplayModeState;
  runtimeState?: GameplayModeState;
  /**
   * True while a multi-surface mechanic has not yet activated its first
   * presentation. A mechanic that holds its initial item's clock until every
   * required surface is ready reads this to omit its playable deadline so the
   * scheduler stays unarmed until activation re-anchors it.
   */
  awaitingPresentationActivation?: boolean;
  /** Server-owned command time; reducers must never consult the wall clock. */
  now?: Date;
  /**
   * Which presentation activation is running when `activatePresentation` is
   * invoked. `initial` (the default when omitted) is the one-time launch
   * activation whose truth is `presentationActivatedAt`; `recurring` is a later
   * `currentPresentation` generation. A plugin re-anchors its playable deadline
   * from `now` either way, but must read this — never `presentationActivatedAt` —
   * to tell a recurring activation from the initial one.
   */
  presentationKind?: 'initial' | 'recurring';
  /** The recurring presentation generation being activated (recurring only). */
  presentationGeneration?: number;
}

/**
 * Every mode command a plugin can answer to.
 *
 * `availableActions` has to ask each plugin about commands *by name* — the
 * plugin contract is a lookup, not an enumeration — so this list is what tells a
 * client which buttons it may show. A command missing from here is invisible:
 * the server would accept it, but no phone would ever be told it could send it,
 * which is exactly how Top 5's decision buttons disappeared once `assign-card`
 * became `decide-card`. `gameplay-mode.registry.spec.ts` keeps it complete.
 */
export const MODE_COMMAND_TYPES: readonly string[] = [
  // Neutral reference mode.
  'advance-phase',
  // Bomb.
  'submit-answer',
  'skip',
  'expire-team',
  // Top 5.
  'decide-card',
  'skip-card',
  // ركّبها.
  'submit-candidate',
  'expire-race',
  // مين أقرب.
  'submit-estimate',
  'advance-closest-item',
  'expire-closest-item',
  // بدليل واحد.
  'submit-one-clue-answer',
  'advance-one-clue-item',
  'expire-one-clue-stage',
  // الكومبو.
  'submit-combo-answer',
  'cash-out-combo',
  'continue-combo',
  'arm-combo-break',
  'advance-combo-run',
  'expire-combo-question',
  // المرحلة: a difficulty choice, the server-supplied question, the answer, the
  // clock, the turn, and the honest end when no content remains.
  'choose-marhala-difficulty',
  'open-marhala-question',
  'submit-marhala-answer',
  'expire-marhala-question',
  'advance-marhala-turn',
  'refresh-marhala-availability',
  'exhaust-marhala-content',
  // القطعة الدخيلة.
  'claim-odd-piece',
  'submit-odd-piece',
  'advance-odd-piece',
  'expire-odd-piece',
];

export interface GameplayCommandDefinition {
  type: string;
  authorization: GameplayAuthorizationRequirement;
  allowedRoundStatuses: Array<'active' | 'paused'>;
  validatePayload(payload: GameplayCommandPayload): GameplayCommandPayload;
}

/**
 * How a mechanic's own deadline is expired, declared by the mechanic itself.
 *
 * This exists so the deadline reducer is not a list of mode keys that somebody
 * has to remember to extend. A mechanic that keeps a clock says so here; the
 * lifecycle infrastructure reads the declaration and guarantees a timer. A
 * mechanic that has no clock declares nothing and is never armed.
 *
 * Interaction deadlines are deliberately *not* declared: any mechanic that
 * publishes `prompt.deadlineAt` is already telling clients to run a countdown,
 * and the reducer enforces every one of those without being told. Declare here
 * only when the deadline instant lives outside the interaction.
 */
export type GameplayDeadlineDeclaration =
  | {
      /** The instant lives on `runtimeState.deadlineAt` as an ISO string. */
      readonly source: 'runtime-state';
      /** The mode command that expires it. `command()` must answer to it. */
      readonly commandType: string;
      /**
       * The `runtimeState.phase` values in which the deadline is live. A
       * mechanic that keeps `deadlineAt` populated after the clock stops
       * mattering — "ركّبها" does — relies on this to stay unarmed.
       */
      readonly activePhases: readonly string[];
      /**
       * Opt into fair-start: the deadline stays unarmed until the runtime records
       * `presentationActivatedAt`, so slow client cold-start never burns gameplay
       * time. A mechanic that opts in must implement `activatePresentation` to
       * re-anchor its deadline to activation time.
       */
      readonly requiresPresentationActivation?: boolean;
    }
  | {
      /**
       * The instant is the active team's remaining session clock rather than
       * anything on the runtime. Bomb is the only mechanic that burns the
       * session's own clock, so it is the only one that answers this way.
       */
      readonly source: 'session-clock';
      readonly commandType: string;
      readonly requiresPresentationActivation?: boolean;
    };

export interface GameplayCommandResult {
  runtimeState: GameplayModeState;
  roundState: GameplayModeState;
  eventType: string;
  eventPayload: GameplayModeState;
  effects: GameplaySessionEffect[];
  /** Ask the aggregate to open a fresh recurring Fair-Start checkpoint. */
  prepareNextPresentation?: boolean;
  /**
   * Who is authoritative for the team action this command opened, when the
   * mechanic opted into single-participant team authority. The session layer
   * writes it onto the round, which is what `active-participant` authorisation
   * then reads — so the server, and only the server, decides who may act next.
   */
  assignment?: { teamId: string; participantId: string };
}

export interface GameplayPresentationActivationResult {
  runtimeState: GameplayModeState;
  effects?: readonly GameplaySessionEffect[];
  /**
   * Optional re-presentation of a prepared interaction at activation time.
   *
   * A multi-surface mechanic holds its first item's interaction in `prepared`
   * so that nothing can be submitted and no clock runs before every required
   * surface is ready. When activation fires, the mechanic asks to open it and
   * (re-)anchor its deadline to the activation instant. The runtime applies
   * this inside the same authoritative transaction as `presentationActivatedAt`,
   * so the playable window starts exactly at activation and never at launch.
   */
  interaction?: {
    status: 'open';
    deadlineAt?: Date;
    visibleFrom?: Date;
  };
}

export interface GameplayModePlugin {
  readonly key: string;
  readonly version: number;
  readonly stateSchemaVersion: number;
  createInitialRuntimeState(context: GameplayPluginContext): GameplayModeState;
  createInitialRoundState(context: GameplayPluginContext): GameplayModeState;
  validateRuntimeState(state: GameplayModeState): GameplayModeState;
  validateRoundState(state: GameplayModeState): GameplayModeState;
  command(type: string): GameplayCommandDefinition | undefined;
  handleCommand(
    context: GameplayPluginContext,
    command: {
      type: string;
      payload: GameplayCommandPayload;
      runtimeState: GameplayModeState;
      roundState: GameplayModeState;
    },
  ): GameplayCommandResult;
  projectRuntimeState(state: GameplayModeState): GameplayModeState;
  /**
   * The runtime as *this* actor may see it.
   *
   * Optional and additive: a mechanic where everyone sees the same thing keeps
   * using `projectRuntimeState`. A mechanic that hands each participant private
   * information implements this instead, so the split lives with the mechanic
   * that owns the secret rather than in a snapshot mapper.
   */
  projectRuntimeStateForActor?(
    state: GameplayModeState,
    actor: InteractionActorProjection,
  ): GameplayModeState;
  /**
   * Multi-surface fair-start requirement (optional, additive).
   *
   * A mechanic that needs *more than one* surface to have acknowledged before it
   * may present returns the current required set, derived from committed state
   * (who the current answerer/decider are, etc.). The gateway validates each ack
   * against this set and the runtime activates only once every surface has acked.
   *
   * A mechanic that omits this keeps today's single-surface contract: any
   * controller or actionable team-player acknowledgement activates it. Absence is
   * the safe default; nothing about existing mechanics changes.
   */
  requiredPresentationSurfaces?(context: {
    runtimeState: GameplayModeState;
    roundState: GameplayModeState;
  }): PresentationSurfaceRequirement[] | undefined;
  /**
   * Fair-start hook (optional, additive): return the mode runtime state after
   * presentation activation. Mechanics with runtime-owned clocks can re-anchor
   * their deadline to activation time; mechanics whose deadline lives on session
   * state can return canonical session effects to apply in the same transaction.
   */
  activatePresentation?(
    state: GameplayModeState,
    now: Date,
    context: GameplayPluginContext,
  ): GameplayModeState | GameplayPresentationActivationResult;
  projectRoundState(state: GameplayModeState): GameplayModeState;
  /**
   * Which content items this runtime has authoritatively **presented** so far.
   *
   * Optional and additive: a mechanic that does not answer simply never burns
   * content, which is the safe default.
   *
   * The distinction this exists to draw is that **selection is not exposure**. A
   * mechanic may draw, plan, or reserve far more content than a team reaches —
   * Combo plans eight questions for a run that may end at two, Bomb selects up to
   * fifteen items for a clock that may expire at seven. Only what a player was
   * actually shown may be spent. So this returns the *cumulative* presented set
   * for the state as committed, never the plan.
   *
   * Cumulative rather than incremental on purpose: re-reporting the same items is
   * harmless because the ledger is idempotent, and it means a write that failed on
   * an earlier mutation is repaired by the next one.
   *
   * `orderedContentItemIds` is the Match's own ordered binding for this
   * challenge, for mechanics whose runtime deliberately does not carry content
   * ids — Bomb strips them so the plugin never learns what a ContentItem is, and
   * answers by position instead.
   */
  presentedContentItemIds?(input: {
    runtimeState: GameplayModeState;
    roundState: GameplayModeState;
    orderedContentItemIds: readonly string[];
  }): string[];
  readonly interaction?: GameplayInteractionPlugin;
  /**
   * This mechanic's own deadline contract, when it keeps a clock outside its
   * interaction. Absent means "this mechanic has no runtime-owned deadline" —
   * which is a real answer, not an oversight, and `gameplay-deadline.wiring.spec`
   * makes every mechanic state it explicitly.
   */
  readonly deadline?: GameplayDeadlineDeclaration;
}

const phases = ['waiting', 'presenting', 'resolving', 'completed'] as const;
type ReferencePhase = (typeof phases)[number];

function validatePhaseState(state: GameplayModeState): GameplayModeState {
  if (
    Object.keys(state).length !== 1 ||
    typeof state.phase !== 'string' ||
    !phases.includes(state.phase as ReferencePhase)
  ) {
    throw new LiveSessionDomainError(
      'INVALID_MODE_STATE',
      'Reference mode state must contain one supported phase',
    );
  }
  return { phase: state.phase };
}

export const CORE_ROUND_RUNTIME_PLUGIN: GameplayModePlugin = {
  key: 'core-round-runtime',
  version: 1,
  stateSchemaVersion: 1,
  createInitialRuntimeState: () => ({ phase: 'waiting' }),
  createInitialRoundState: () => ({ phase: 'waiting' }),
  validateRuntimeState: validatePhaseState,
  validateRoundState: validatePhaseState,
  command: (type) =>
    type === 'advance-phase'
      ? {
          type,
          authorization: 'controller-or-active-team-player',
          allowedRoundStatuses: ['active'],
          validatePayload(payload) {
            if (Object.keys(payload).length > 0) {
              throw new LiveSessionDomainError(
                'INVALID_GAMEPLAY_COMMAND',
                'advance-phase does not accept a payload',
              );
            }
            return {};
          },
        }
      : undefined,
  handleCommand(context, command) {
    const state = validatePhaseState(command.roundState);
    const index = phases.indexOf(state.phase as ReferencePhase);
    if (index < 0 || index >= phases.length - 1) {
      throw new LiveSessionDomainError(
        'MODE_COMMAND_UNAVAILABLE',
        'The neutral phase cannot advance further',
      );
    }
    const phase = phases[index + 1];
    return {
      runtimeState: validatePhaseState({ phase }),
      roundState: validatePhaseState({ phase }),
      eventType: 'round-state-changed',
      eventPayload: { phase },
      effects: [
        { type: 'emit-runtime-event', eventType: 'neutral-phase-advanced' },
      ],
    };
  },
  projectRuntimeState: validatePhaseState,
  projectRoundState: validatePhaseState,
  interaction: {
    submissionAuthorization: 'active-team-player',
    submissionPolicy: 'one-per-participant',
    preparePrompt(context, input, now) {
      if (
        Object.keys(input).some((key) => !['deadlineMs'].includes(key)) ||
        (input.deadlineMs !== undefined &&
          (typeof input.deadlineMs !== 'number' ||
            input.deadlineMs < 1_000 ||
            input.deadlineMs > 3_600_000))
      ) {
        throw new LiveSessionDomainError(
          'INVALID_INTERACTION_PROMPT',
          'Neutral prompt accepts only a deadline between 1 second and 1 hour',
        );
      }
      return {
        type: 'development-signal',
        schemaVersion: 1,
        publicPayload: { message: 'Send a signal' },
        participantPayload: { message: 'Send a signal' },
        hostPayload: { message: 'Send a signal', development: true },
        internalPayload: { internalPolicy: 'neutral-signal' },
        visibility: 'public',
        metadata: { development: true },
        visibleFrom: now,
        deadlineAt:
          typeof input.deadlineMs === 'number'
            ? new Date(now.getTime() + input.deadlineMs)
            : undefined,
      };
    },
    validatePrompt(prompt) {
      if (
        prompt.type !== 'development-signal' ||
        prompt.schemaVersion !== 1 ||
        prompt.publicPayload.message !== 'Send a signal'
      ) {
        throw new LiveSessionDomainError(
          'INVALID_INTERACTION_PROMPT',
          'Neutral prompt is invalid',
        );
      }
      return prompt;
    },
    validateSubmission(payload) {
      if (Object.keys(payload).length !== 1 || payload.signal !== 'ready') {
        throw new LiveSessionDomainError(
          'INVALID_INTERACTION_SUBMISSION',
          'Neutral submission must contain signal ready',
        );
      }
      return { signal: 'ready' };
    },
    projectPrompt(prompt, actor) {
      if (!canSeeVisibility(prompt.visibility, actor, {}, 'open')) {
        return undefined;
      }
      if (actor.controller) return prompt.hostPayload;
      if (actor.participantId) return prompt.participantPayload;
      return prompt.publicPayload;
    },
    projectSubmission(submission, actor) {
      if (
        !canSeeVisibility(
          submission.resultVisibility,
          actor,
          submission,
          submission.status,
        )
      ) {
        return undefined;
      }
      return {
        signal: submission.payload.signal ?? null,
        status: submission.status,
      };
    },
    createOutcome(submissions) {
      const selected = submissions
        .filter((submission) => submission.status === 'accepted')
        .map((submission) => submission.id);
      return {
        outcome: {
          type: 'development-signal-result',
          schemaVersion: 1,
          publicPayload: { state: 'resolved' },
          teamPayload: { state: 'resolved' },
          participantPayload: { state: 'resolved' },
          hostPayload: { state: 'resolved', selectedCount: selected.length },
          privatePayload: { processed: true },
          completionReason: 'host-resolved',
          selectedSubmissionIds: selected,
        },
        effects: [
          {
            type: 'switch-active-team',
            teamId: '',
            reason: 'neutral-interaction-resolved',
          },
        ],
      };
    },
    validateOutcome(outcome) {
      if (
        outcome.type !== 'development-signal-result' ||
        outcome.schemaVersion !== 1 ||
        outcome.publicPayload.state !== 'resolved'
      ) {
        throw new LiveSessionDomainError(
          'INVALID_INTERACTION_OUTCOME',
          'Neutral outcome is invalid',
        );
      }
      return outcome;
    },
    projectOutcome(outcome, actor) {
      if (actor.controller) return outcome.hostPayload;
      if (actor.participantId) return outcome.participantPayload;
      return outcome.publicPayload;
    },
  },
};
