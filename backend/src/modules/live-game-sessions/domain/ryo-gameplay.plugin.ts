import {
  GameplayCommandPayload,
  GameplayModePlugin,
  GameplayModeState,
} from './gameplay-mode.plugin';
import { GameplayPromptState } from './gameplay-interaction';
import { InteractionActorProjection } from './gameplay-interaction.plugin';
import { LiveSessionDomainError } from './live-session.errors';
import {
  assignNextTeamAction,
  assignmentFor,
  EligibleParticipant,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
  TeamActionAssignmentState,
} from './team-action-assignment';
import { toSafeQuestionMedia } from './safe-question-media';
import { ContentItemMedia } from '../../world-content/domain/world-content.types';

export const RYO_MODE_KEY = 'read-your-opponent';
export const RYO_TIMER_SECONDS = 25;

/**
 * Shortest gap between two accepted audio replays, in seconds.
 *
 * Anti-spam only, and a balance value rather than a contract: a shared clip
 * that can be restarted on every keypress is a weapon, not a convenience. The
 * cooldown is shared by everyone who may ask — both teams and the host — so
 * the table gets one replay per window, not one each.
 */
export const RYO_REPLAY_COOLDOWN_SECONDS = Number(
  process.env.RYO_REPLAY_COOLDOWN_SECONDS ?? 2,
);

/** The `SafeQuestionMedia.type` value that denotes playable audio. */
const AUDIO_MEDIA_KIND = 'audio';

/** Replay is a presentation signal; these are the only fields it writes. */
interface RyoReplayState {
  /** Monotonic per item, so a client can drop a duplicate or stale signal. */
  audioReplaySequence: number;
  /** When the accepted replay was authorised. The cooldown reads this. */
  audioReplayAt: string;
  /** The item the signal belongs to. */
  audioReplayItemIndex: number;
}

/**
 * Whether this item's question carries playable audio.
 *
 * Read from the same `items` projection the surfaces render, which already
 * passed through `toSafeQuestionMedia` — so a text-only item is refused here
 * without the command ever learning anything about the answer.
 */
export function ryoItemHasAudio(
  runtimeState: GameplayModeState,
  itemIndex: number,
): boolean {
  try {
    const items = parse<{ media?: { type?: string; url?: string } }[]>(
      runtimeState.itemsJson,
      'items',
    );
    const media = items[itemIndex]?.media;
    // Compared against a named constant rather than a quoted literal: the mode
    // registry guard scans plugin sources for `type === '...'` to find command
    // declarations, and a media-kind check written that way reads as one.
    return media?.type === AUDIO_MEDIA_KIND && Boolean(media.url);
  } catch {
    return false;
  }
}

/**
 * The audio URL of one item, for the shared screen to buffer before the clock
 * starts.
 *
 * This is the *only* thing projected through the readiness barrier, and only to
 * the shared surface. A barrier that hides the clip it is asking the screen to
 * be ready for is readiness in name only: the screen would acknowledge, the
 * deadline would anchor, and the buffering would start afterwards — which is
 * exactly the unfairness the barrier exists to remove. No prompt, no options,
 * no answer travels with it.
 */
export function ryoItemAudioUrl(
  runtimeState: GameplayModeState,
  itemIndex: number,
): string | undefined {
  if (!ryoItemHasAudio(runtimeState, itemIndex)) return undefined;
  try {
    const items = parse<{ media?: { url?: string } }[]>(
      runtimeState.itemsJson,
      'items',
    );
    const url = items[itemIndex]?.media?.url;
    return typeof url === 'string' && url ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The two authoritative team actions one RYO item opens, simultaneously.
 *
 * Both are live at once and neither can see the other — that blind simultaneity
 * is the mechanic. What changed is only *who* on each team may act: one named
 * answerer and one named decision-maker, instead of whoever's phone was fastest.
 */
export const RYO_ANSWER_ACTION = 'ryo.answer';
export const RYO_DECISION_ACTION = 'ryo.decision';

/**
 * Opens the next item's two actions and advances both teams' rotations.
 *
 * Every team acts exactly once per item, so both rotations move on every item:
 * with two players per team that produces A1/B1, then A2/B2, then A1/B1 again.
 */
export function openRyoItemAssignments(input: {
  state: TeamActionAssignmentState;
  answeringTeamId: string;
  opposingTeamId: string;
  participants: readonly EligibleParticipant[];
}): {
  state: TeamActionAssignmentState;
  answererParticipantId: string;
  deciderParticipantId: string;
} {
  const answer = assignNextTeamAction(input.state, {
    teamId: input.answeringTeamId,
    action: RYO_ANSWER_ACTION,
    participants: input.participants,
  });
  const decision = assignNextTeamAction(answer.state, {
    teamId: input.opposingTeamId,
    action: RYO_DECISION_ACTION,
    participants: input.participants,
  });
  return {
    state: decision.state,
    answererParticipantId: answer.assignment.participantId,
    deciderParticipantId: decision.assignment.participantId,
  };
}

export function ryoAssignments(
  state: GameplayModeState,
): TeamActionAssignmentState {
  return parseTeamActionAssignments(state.teamActionJson);
}

export function withRyoAssignments(
  state: GameplayModeState,
  assignments: TeamActionAssignmentState,
): GameplayModeState {
  return {
    ...state,
    teamActionJson: serializeTeamActionAssignments(assignments),
  };
}

export function ryoAssignedParticipants(state: GameplayModeState): {
  answererParticipantId: string;
  deciderParticipantId: string;
} {
  const assignments = ryoAssignments(state);
  return {
    answererParticipantId:
      assignmentFor(assignments, RYO_ANSWER_ACTION)?.participantId ?? '',
    deciderParticipantId:
      assignmentFor(assignments, RYO_DECISION_ACTION)?.participantId ?? '',
  };
}

export function ryoAnsweringTeam(
  teamIds: string[],
  startingTeamId: string,
  itemIndex: number,
): string {
  return teamIds[(teamIds.indexOf(startingTeamId) + itemIndex) % 2];
}

/**
 * The authored text of a chosen option, not its id.
 *
 * Falls back to the id only when the option can no longer be found — a recap
 * that says something odd is still better than one that says nothing at all.
 */
function optionLabel(item: { options?: unknown }, optionId: string): string {
  const options = Array.isArray(item.options) ? item.options : [];
  const match = options.find(
    (option): option is { id: string; label?: unknown } =>
      !!option &&
      typeof option === 'object' &&
      String((option as { id?: unknown }).id) === optionId,
  );
  const label = match?.label;
  if (typeof label === 'string' && label.trim()) return label.trim();
  if (label && typeof label === 'object') {
    const authored = label as Record<string, unknown>;
    for (const value of [
      authored.ar,
      authored.en,
      ...Object.values(authored),
    ]) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return optionId;
}

function parse<T>(value: unknown, label: string): T {
  if (typeof value !== 'string')
    throw new LiveSessionDomainError(
      'INVALID_RYO_STATE',
      `${label} is missing`,
    );
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new LiveSessionDomainError(
      'INVALID_RYO_STATE',
      `${label} is invalid`,
    );
  }
}

export function advanceRyoChallengeState(
  state: GameplayModeState,
  scoreEvent: Record<string, unknown>,
  result: GameplayModeState,
): GameplayModeState {
  const events = parse<Record<string, unknown>[]>(
    state.scoreEventsJson ?? '[]',
    'score events',
  );
  const results = parse<GameplayModeState[]>(
    state.resultsJson ?? '[]',
    'results',
  );
  events.push(scoreEvent);
  results.push({ ...result, scoreEventJson: JSON.stringify(scoreEvent) });
  const currentItemIndex = Number(state.currentItemIndex ?? 0) + 1;
  return validateRuntime({
    ...state,
    currentItemIndex,
    scoreEventsJson: JSON.stringify(events),
    resultsJson: JSON.stringify(results),
    phase: currentItemIndex === 3 ? 'completed' : 'between_items',
  });
}

function validateRuntime(state: GameplayModeState): GameplayModeState {
  const items = parse<unknown[]>(state.itemsJson, 'items');
  const teams = parse<string[]>(state.teamIdsJson, 'teams');
  if (
    items.length !== 3 ||
    teams.length !== 2 ||
    new Set(teams).size !== 2 ||
    typeof state.startingTeamId !== 'string'
  ) {
    throw new LiveSessionDomainError(
      'INVALID_RYO_STATE',
      'RYO requires exactly three items and two distinct teams',
    );
  }
  // Without a readable rotation nobody is authorised, so the runtime is invalid
  // rather than open to whoever submits first.
  parseTeamActionAssignments(state.teamActionJson);
  return {
    ...state,
    itemsJson: JSON.stringify(items),
    teamIdsJson: JSON.stringify(teams),
  };
}

function validateRound(state: GameplayModeState): GameplayModeState {
  if (
    !['collecting', 'resolved', 'completed'].includes(String(state.phase)) ||
    typeof state.itemIndex !== 'number' ||
    typeof state.answeringTeamId !== 'string' ||
    typeof state.opposingTeamId !== 'string'
  ) {
    throw new LiveSessionDomainError(
      'INVALID_RYO_STATE',
      'RYO round ownership is incomplete',
    );
  }
  return state;
}

function submission(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (
    payload.kind === 'decision' &&
    (payload.decision === 'steal' || payload.decision === 'trust')
  )
    return { kind: 'decision', decision: payload.decision };
  if (
    payload.kind === 'answer' &&
    payload.mode === 'multiple_choice' &&
    typeof payload.optionId === 'string' &&
    payload.optionId
  )
    return {
      kind: 'answer',
      mode: 'multiple_choice',
      optionId: payload.optionId,
    };
  if (
    payload.kind === 'answer' &&
    payload.mode === 'closest' &&
    typeof payload.value === 'number' &&
    Number.isFinite(payload.value)
  )
    return { kind: 'answer', mode: 'closest', value: payload.value };
  throw new LiveSessionDomainError(
    'INVALID_RYO_SUBMISSION',
    'Choose a valid answer or opponent decision',
  );
}

/**
 * Both halves of the RYO authority check, in the order that produces the most
 * honest refusal: wrong team first, then right team but not the assigned player.
 * A hidden button is never the security boundary — this is.
 */
function actorSubmission(
  payload: GameplayCommandPayload,
  actor: InteractionActorProjection,
  prompt: GameplayPromptState,
  runtimeState: GameplayModeState,
) {
  const valid = submission(payload);
  const answering = prompt.internalPayload.answeringTeamId;
  const opposing = prompt.internalPayload.opposingTeamId;
  if (
    (valid.kind === 'answer' && actor.teamId !== answering) ||
    (valid.kind === 'decision' && actor.teamId !== opposing)
  ) {
    throw new LiveSessionDomainError(
      'RYO_WRONG_SIDE',
      'This action is not available to your team',
    );
  }
  // From the runtime, not the prompt: a disconnect handoff moves the assignment
  // while the item is still open, and the prompt still names whoever left.
  const current = ryoAssignedParticipants(runtimeState);
  const assigned =
    valid.kind === 'answer'
      ? current.answererParticipantId
      : current.deciderParticipantId;
  if (assigned && actor.participantId !== assigned) {
    throw new LiveSessionDomainError(
      'RYO_NOT_ASSIGNED_PARTICIPANT',
      'Only the assigned player may take this action for the team',
    );
  }
  return valid;
}

export const RYO_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: RYO_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  // No `deadline` declaration on purpose: "اقرأ خصمك" puts its clock on the
  // interaction prompt (`RYO_TIMER_SECONDS`), and every interaction deadline is
  // enforced by the reducer without being declared.
  createInitialRuntimeState: (context) =>
    validateRuntime(context.initialState ?? {}),
  createInitialRoundState(context) {
    const runtime = validateRuntime(context.runtimeState ?? {});
    const teams = parse<string[]>(runtime.teamIdsJson, 'teams');
    const itemIndex = Number(runtime.currentItemIndex ?? 0);
    const starting = String(runtime.startingTeamId);
    const answeringTeamId = ryoAnsweringTeam(teams, starting, itemIndex);
    return validateRound({
      phase: 'collecting',
      itemIndex,
      answeringTeamId,
      opposingTeamId: teams.find((id) => id !== answeringTeamId) ?? '',
    });
  },
  validateRuntimeState: validateRuntime,
  validateRoundState: validateRound,
  /**
   * One mode command, and only one.
   *
   * Answers and decisions are *interaction submissions*, not mode commands —
   * they are collected blind and resolved together. Replay is neither: it
   * changes nothing that is scored, so putting it on the mode-command path
   * keeps the submission set exactly as it was.
   */
  command: (type) =>
    type === 'request-ryo-replay'
      ? {
          type,
          authorization: 'controller-or-connected-player',
          allowedRoundStatuses: ['active'],
          validatePayload: (payload) => {
            const value = payload as { itemIndex?: unknown };
            if (
              typeof value?.itemIndex !== 'number' ||
              !Number.isInteger(value.itemIndex) ||
              value.itemIndex < 0
            ) {
              throw new LiveSessionDomainError(
                'INVALID_GAMEPLAY_COMMAND',
                'A replay request must name the item it is replaying',
              );
            }
            return { itemIndex: value.itemIndex };
          },
        }
      : undefined,
  /**
   * Authorise one replay of the current clip.
   *
   * Writes three presentation fields and nothing else. It does not touch
   * `phase`, `itemIndex`, team ownership, submissions, the score or any clock,
   * and it never calls the activation path — a replay is a message to the
   * shared screen, not a lifecycle event.
   */
  handleCommand(context, command) {
    if (command.type !== 'request-ryo-replay') {
      throw new LiveSessionDomainError(
        'MODE_COMMAND_UNAVAILABLE',
        'RYO uses blind interaction submissions',
      );
    }
    // Read the phase before `validateRound`, which only admits the phases a
    // *resolution* can occur in. An `intro` or `between_items` round is a
    // legitimate state to ask from and an illegitimate one to replay in, so it
    // deserves the specific refusal rather than a shape error.
    const round = (command.roundState ?? {}) as GameplayModeState;
    const requested = (command.payload as { itemIndex: number }).itemIndex;
    const itemIndex = Number(round.itemIndex);
    const now = context.now ?? new Date();

    // An item still behind its readiness barrier is not being presented, so
    // there is nothing to replay. Accepting one would also burn the shared
    // cooldown before the question had opened, leaving the first real request
    // refused.
    if (
      context.awaitingPresentationActivation ||
      round.phase !== 'collecting'
    ) {
      throw new LiveSessionDomainError(
        'RYO_REPLAY_UNAVAILABLE',
        'Audio replay is only available while the item is open',
      );
    }
    if (requested !== itemIndex) {
      // A request that arrived after the question moved on would otherwise
      // restart the *next* clip.
      throw new LiveSessionDomainError(
        'RYO_REPLAY_STALE_ITEM',
        'The replay request targets an item that is no longer active',
      );
    }
    const runtimeState = validateRuntime(command.runtimeState ?? {});
    if (!ryoItemHasAudio(runtimeState, itemIndex)) {
      throw new LiveSessionDomainError(
        'RYO_REPLAY_NO_AUDIO',
        'This question has no audio to replay',
      );
    }
    if (
      context.interactionDeadlineAt &&
      now.getTime() >= context.interactionDeadlineAt.getTime()
    ) {
      throw new LiveSessionDomainError(
        'RYO_REPLAY_WINDOW_CLOSED',
        'The answering window has closed',
      );
    }

    const previousAt = round.audioReplayAt
      ? Date.parse(String(round.audioReplayAt))
      : undefined;
    const sameItem = Number(round.audioReplayItemIndex) === itemIndex;
    if (
      sameItem &&
      previousAt !== undefined &&
      Number.isFinite(previousAt) &&
      now.getTime() - previousAt < RYO_REPLAY_COOLDOWN_SECONDS * 1000
    ) {
      // Rejected before anything is written, so a refused request mutates no
      // state and broadcasts nothing.
      throw new LiveSessionDomainError(
        'RYO_REPLAY_COOLDOWN',
        'The clip was replayed a moment ago; wait before asking again',
      );
    }

    const replay: RyoReplayState = {
      audioReplaySequence:
        (sameItem ? Number(round.audioReplaySequence ?? 0) : 0) + 1,
      audioReplayAt: now.toISOString(),
      audioReplayItemIndex: itemIndex,
    };
    return {
      // Validated only once the replay is authorised, so the shape contract is
      // still enforced on everything that is written back.
      runtimeState,
      roundState: validateRound({ ...round, ...replay }),
      eventType: 'ryo-audio-replay',
      // Presentation identity and ordering only: which item, and which replay
      // of it. No answer, no media metadata, no participant identity.
      eventPayload: { ...replay },
      effects: [],
    };
  },
  /**
   * The prompts a team has actually been shown.
   *
   * Keyed on the **round's** `itemIndex` rather than the runtime's
   * `currentItemIndex`: the runtime counter increments the moment an item
   * resolves, so between items it already names an item nobody has seen. The
   * round is the item in play.
   *
   * Burned at presentation, not at reveal — once the prompt has been read, the
   * item is spent whatever happens next. Both teams see one prompt, and the
   * private halves of an RYO decision are two views of one ContentItem, so this
   * is one exposure.
   */
  presentedContentItemIds({ runtimeState, roundState }) {
    if (typeof runtimeState.itemsJson !== 'string') return [];
    let items: Array<{ id?: unknown }> = [];
    try {
      const parsed: unknown = JSON.parse(runtimeState.itemsJson);
      if (!Array.isArray(parsed)) return [];
      items = parsed as Array<{ id?: unknown }>;
    } catch {
      return [];
    }
    const index = Number(roundState.itemIndex);
    if (!Number.isInteger(index) || index < 0) return [];
    return items
      .slice(0, Math.min(index + 1, items.length))
      .map((item) => String(item?.id ?? ''))
      .filter(Boolean);
  },
  projectRuntimeState(state) {
    const valid = validateRuntime(state);
    return {
      challengeId: valid.challengeId,
      worldId: valid.worldId,
      slotKey: valid.slotKey,
      currentItemIndex: valid.currentItemIndex ?? 0,
      startingTeamId: valid.startingTeamId,
      phase: valid.phase ?? 'intro',
      scoreEventsJson: valid.scoreEventsJson ?? '[]',
      resultsJson: valid.resultsJson ?? '[]',
      // The cooldown the server actually enforces, published so a client can
      // show how long is left without hardcoding a second copy of the rule.
      // The authority is still `handleCommand`: this only lets the UI agree
      // with it, and a client that ignores it is refused exactly as before.
      audioReplayCooldownSeconds: RYO_REPLAY_COOLDOWN_SECONDS,
      // Who is authoritative right now, from the same state the submission
      // check reads. The prompt carries these too, but a prompt is a snapshot:
      // after a disconnect handoff it still names whoever left, so a phone that
      // trusted it would show its controls to the wrong player.
      ...ryoAssignedParticipants(valid),
    };
  },
  projectRoundState: validateRound,
  /**
   * Fair-start: the three surfaces that must acknowledge before RYO presents.
   *
   * The shared screen (controller), the assigned answerer, and the assigned
   * decider all have to be mounted and ready, or the first item would burn its
   * clock while one surface was still cold-starting. Only the *capability* is
   * safe to project; the participant bindings stay server-side and are derived
   * from the current assignments (which a disconnect handoff may have changed).
   *
   * Scope boundary: only the *initial* RYO item holds this barrier. Once the
   * runtime has activated, subsequent items keep the canonical RYO lifecycle —
   * prepare and open immediately with a deadline — so this barrier applies only
   * while `presentationActivatedAt` is still absent.
   */
  requiredPresentationSurfaces({ runtimeState }) {
    const current = ryoAssignedParticipants(validateRuntime(runtimeState));
    if (!current.answererParticipantId || !current.deciderParticipantId) {
      return undefined;
    }
    return [
      { capability: 'shared' },
      {
        capability: 'answering',
        participantId: current.answererParticipantId,
      },
      {
        capability: 'decision',
        participantId: current.deciderParticipantId,
      },
    ];
  },
  /**
   * What a timed-out barrier means for اقرأ خصمك: it depends on the item.
   *
   * A text item has everything it needs in the snapshot that opens it, so a
   * late surface costs the room nothing but its own loading and activating is
   * right. An audio item does not: the question *is* the clip. Starting a
   * ten-second blind window on audio nobody can hear is not a harder question,
   * it is an unanswerable one — and both teams are scored on it, so it is also
   * unfair in a way that cannot be undone afterwards. So the clock stays
   * stopped and the host is shown why.
   */
  presentationTimeoutPolicy({ runtimeState }) {
    try {
      const index = Number(validateRuntime(runtimeState).currentItemIndex ?? 0);
      return ryoItemHasAudio(runtimeState, index) ? 'fail' : 'activate';
    } catch {
      // An unreadable runtime is not a reason to refuse to start; the mechanic's
      // own validation will refuse it on its own path and say so properly.
      return 'activate';
    }
  },
  /**
   * At activation, open the held first item and anchor its clock to now.
   *
   * The first interaction was prepared without being opened and without a
   * deadline, so the barrier held it. Activation re-presents it: open it and set
   * `visibleFrom`/`deadlineAt` to activation time + the configured window. The
   * runtime applies this in the same authoritative transaction as
   * `presentationActivatedAt`, so the playable window starts exactly at
   * activation.
   */
  activatePresentation(_state, now) {
    return {
      runtimeState: _state,
      interaction: {
        status: 'open',
        visibleFrom: now,
        deadlineAt: new Date(now.getTime() + RYO_TIMER_SECONDS * 1000),
      },
    };
  },
  interaction: {
    submissionAuthorization: 'connected-player',
    submissionPolicy: 'one-per-participant',
    preparePrompt(context, input, now) {
      const item = parse<Record<string, unknown>>(input.itemJson, 'item');
      if (
        typeof context.activeTeamId !== 'string' ||
        typeof input.opposingTeamId !== 'string' ||
        typeof input.answererParticipantId !== 'string' ||
        typeof input.deciderParticipantId !== 'string'
      )
        throw new LiveSessionDomainError(
          'INVALID_RYO_PROMPT',
          'RYO team ownership and participant assignment are missing',
        );
      return {
        type: 'ryo.item',
        schemaVersion: 1,
        publicPayload: {
          itemJson: JSON.stringify({
            id: item.id,
            prompt: item.prompt,
            // Player-facing shape only: never the raw ContentItem media object
            // (which can carry storage path/filename/mimetype/size).
            media: toSafeQuestionMedia(
              item.media as ContentItemMedia | null | undefined,
            ),
            answerMode: item.answerMode,
            options: item.options ?? null,
          }),
          answeringTeamId: context.activeTeamId,
          opposingTeamId: input.opposingTeamId,
          // Public, and deliberately so: a teammate has to know who to talk to,
          // and neither id says anything about what the other side chose.
          answererParticipantId: input.answererParticipantId,
          deciderParticipantId: input.deciderParticipantId,
        },
        participantPayload: {},
        hostPayload: {},
        internalPayload: {
          itemJson: JSON.stringify(item),
          answeringTeamId: context.activeTeamId,
          opposingTeamId: input.opposingTeamId,
          answererParticipantId: input.answererParticipantId,
          deciderParticipantId: input.deciderParticipantId,
        },
        visibility: 'public',
        metadata: {},
        // Fair-start: while every required surface is still mounting, the first
        // item's deadline is deliberately withheld. The interaction is held in
        // `prepared` with no clock; activation opens it and re-anchors the
        // deadline to activation time, so a slow cold-start on any surface never
        // burns RYO's playable window. Once activated, subsequent items keep the
        // canonical deadline (now + RYO_TIMER_SECONDS).
        visibleFrom: context.awaitingPresentationActivation ? undefined : now,
        deadlineAt: context.awaitingPresentationActivation
          ? undefined
          : new Date(now.getTime() + RYO_TIMER_SECONDS * 1000),
      };
    },
    validatePrompt: (prompt) => prompt,
    validateSubmission: submission,
    validateSubmissionForActor: actorSubmission,
    shouldAutoResolve(submissions) {
      const accepted = submissions.filter(
        (s) => s.status === 'pending-adjudication',
      );
      return (
        accepted.some((s) => s.payload.kind === 'answer') &&
        accepted.some((s) => s.payload.kind === 'decision')
      );
    },
    projectPrompt(prompt, actor, runtimeState) {
      const result = { ...prompt.publicPayload };
      // Only the shared screen plays the clip, so only the shared screen needs
      // its URL. Every phone was receiving it inside `itemJson` and rendering
      // nothing with it — a filename like `umm-kulthum-enta-omri.mp3` sitting in
      // the devtools of the very players being asked to name it. The *presence*
      // of audio still travels, because a phone needs it to offer «إعادة
      // المقطع»; the address does not.
      if (!actor.controller && typeof result.itemJson === 'string') {
        try {
          const item = JSON.parse(result.itemJson) as {
            media?: { type?: string; url?: string; altText?: unknown } | null;
          };
          if (item.media?.type === AUDIO_MEDIA_KIND) {
            // `altText` goes with it. No surface renders a caption for audio —
            // `MarhalaQuestionAudio` takes a URL and nothing else — so on a
            // phone it is pure leak surface, and «أم كلثوم — أنت عمري» as alt
            // text is the answer written out in full.
            result.itemJson = JSON.stringify({
              ...item,
              media: { type: AUDIO_MEDIA_KIND },
            });
          }
        } catch {
          // A prompt whose item will not parse is left exactly as it was: this
          // is a redaction, and it is not this function's job to decide that an
          // unreadable prompt should become no prompt.
        }
      }
      if (actor.teamId === prompt.internalPayload.answeringTeamId)
        result.actorRole = 'answering';
      else if (actor.teamId === prompt.internalPayload.opposingTeamId)
        result.actorRole = 'opposing';
      else result.actorRole = 'spectator';
      // From the runtime when it is available, which is what the submission
      // check reads: after a disconnect handoff the prompt still names whoever
      // left, and a phone trusting it would offer controls to the wrong player.
      const current = runtimeState
        ? ryoAssignedParticipants(runtimeState)
        : {
            answererParticipantId: String(
              prompt.internalPayload.answererParticipantId ?? '',
            ),
            deciderParticipantId: String(
              prompt.internalPayload.deciderParticipantId ?? '',
            ),
          };
      result.answererParticipantId = current.answererParticipantId;
      result.deciderParticipantId = current.deciderParticipantId;
      // A convenience for rendering only. The server refuses an unassigned
      // submission whatever this says.
      result.isAssignedActor =
        actor.participantId === current.answererParticipantId ||
        actor.participantId === current.deciderParticipantId;
      return result;
    },
    /**
     * That a side has locked in is public. Everything else about it is not.
     *
     * The drama of this mechanic is watching the opponent commit before you do, so
     * every actor sees that a submission exists and its `kind` — which follows from
     * the two sides' roles, and those are already on the screen. The choice itself
     * (`decision`, `optionId`, `value`) is never projected to *anyone*, not even its
     * own author: it reaches a client for the first time inside the simultaneous
     * outcome.
     *
     * Only *live* submissions are projected. A withdrawn or superseded one is dropped
     * entirely rather than published with its status, for two reasons that are the
     * same reason: it does not represent a lock, and publishing it would leak that a
     * side committed and then changed its mind. In a game built on reading your
     * opponent, hesitation is exactly the kind of tell that must stay private — and
     * with one live submission per participant, dropping them also means the count of
     * public entries can never be read as indecision.
     */
    projectSubmission(value) {
      if (value.status === 'withdrawn' || value.status === 'superseded') {
        return undefined;
      }
      return { status: value.status, kind: value.payload.kind };
    },
    createOutcome(submissions, _now, prompt) {
      const answer = submissions.find((s) => s.payload.kind === 'answer');
      const decision = submissions.find((s) => s.payload.kind === 'decision');
      const item = parse<Record<string, unknown>>(
        prompt?.internalPayload.itemJson,
        'item',
      );
      const answerPayload = answer?.payload;
      const correct =
        answerPayload?.mode === 'multiple_choice'
          ? answerPayload.optionId === item.correctOptionId
          : answerPayload?.mode === 'closest' &&
              typeof answerPayload.value === 'number' &&
              typeof item.correctValue === 'number'
            ? Math.abs(answerPayload.value - item.correctValue) <=
              Number(item.acceptedTolerance ?? 0)
            : false;
      const selectedAnswer =
        answerPayload?.mode === 'multiple_choice'
          ? answerPayload.optionId
          : answerPayload?.mode === 'closest'
            ? answerPayload.value
            : null;
      const correctAnswer =
        item.answerMode === 'multiple_choice'
          ? item.correctOptionId
          : item.correctValue;
      // What a recap *shows*. A multiple-choice answer is stored as an option id
      // because that is what grading compares, but "أجاب: option-1" is an
      // internal key read out to a room. The authored label is the answer.
      const selectedAnswerText =
        answerPayload?.mode === 'multiple_choice'
          ? optionLabel(item, String(answerPayload.optionId ?? ''))
          : String(selectedAnswer ?? '');
      const correctAnswerText =
        item.answerMode === 'multiple_choice'
          ? optionLabel(item, String(item.correctOptionId ?? ''))
          : String(correctAnswer ?? '');
      const opponentDecision = decision?.payload.decision ?? 'trust';
      const answererParticipantId = String(
        prompt?.internalPayload.answererParticipantId ?? '',
      );
      const deciderParticipantId = String(
        prompt?.internalPayload.deciderParticipantId ?? '',
      );
      return {
        outcome: {
          type: 'ryo.result',
          schemaVersion: 1,
          publicPayload: {
            selectedAnswer: selectedAnswerText || null,
            correctAnswer: correctAnswerText,
            correct,
            decision: opponentDecision,
            itemIndex: Number(item.itemIndex ?? 0),
            // The prompt is already public on the shared screen; carrying it into
            // the record is what lets a recap be read without the runtime.
            promptText:
              typeof item.prompt === 'object' && item.prompt
                ? String((item.prompt as { ar?: string }).ar ?? '')
                : String(item.prompt ?? ''),
            answeringTeamId: String(
              prompt?.internalPayload.answeringTeamId ?? '',
            ),
            opposingTeamId: String(
              prompt?.internalPayload.opposingTeamId ?? '',
            ),
            answererParticipantId,
            deciderParticipantId,
          },
          teamPayload: {},
          participantPayload: {},
          hostPayload: {},
          privatePayload: {
            scoringInputJson: JSON.stringify({
              answeringTeamId: prompt?.internalPayload.answeringTeamId,
              opposingTeamId: prompt?.internalPayload.opposingTeamId,
              contentItemId: item.id,
              itemIndex: item.itemIndex,
              selectedAnswer,
              correctAnswer,
              decision: String(opponentDecision).toUpperCase(),
              correct,
            }),
          },
          completionReason: 'automatic',
          selectedSubmissionIds: submissions.map((s) => s.id),
        },
        effects: [],
      };
    },
    validateOutcome: (outcome) => outcome,
    projectOutcome: (outcome) => outcome.publicPayload,
  },
};
