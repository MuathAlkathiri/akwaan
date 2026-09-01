import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  ContentMediaType,
  LAQATHA_CLAIM_SECONDS,
  LAQATHA_ITEM_COUNT,
  LAQATHA_REVEAL_SECONDS,
  LAQATHA_SLUG,
  LAQATHA_VALUES,
} from '../../world-content/domain/world-content.constants';
import {
  ContentItemMedia,
  LocalizedText,
} from '../../world-content/domain/world-content.types';
import {
  GameplayCommandPayload,
  GameplayCommandResult,
  GameplayModePlugin,
  GameplayModeState,
  GameplayPluginContext,
} from './gameplay-mode.plugin';
import { InteractionActorProjection } from './gameplay-interaction.plugin';
import { LiveSessionDomainError } from './live-session.errors';

export const LAQATHA_MODE_KEY = LAQATHA_SLUG;
export { LAQATHA_ITEM_COUNT, LAQATHA_VALUES };

/**
 * The five distinct phases of one movie question. `preparing` carries no clock
 * and hides content — it is the state a fresh generation sits in until Fair-Start
 * activation re-anchors the reveal clock. `revealing` runs the 3-second clue
 * clock; `claiming` runs the 5-second answer window; `resolved` shows the reveal
 * before the host advances; `completed` is terminal.
 */
export type LaqathaPhase =
  'preparing' | 'revealing' | 'claiming' | 'resolved' | 'completed';

const LAQATHA_PHASES: readonly LaqathaPhase[] = [
  'preparing',
  'revealing',
  'claiming',
  'resolved',
  'completed',
];

export interface LaqathaRuntimeClue {
  order: number;
  value: number;
  text?: LocalizedText | null;
  media?: ContentItemMedia | null;
}

export interface LaqathaRuntimeQuestion {
  contentItemId: string;
  /** Canonical movie title, surfaced only in the post-resolution reveal. */
  title: string;
  prompt?: LocalizedText | null;
  clues: LaqathaRuntimeClue[];
  /** Server-only grading truth; never projected while the question is live. */
  acceptedAnswers: string[];
}

export interface LaqathaQuestionResult {
  questionIndex: number;
  contentItemId: string;
  title: string;
  winnerTeamId: string | null;
  /** The clue number (1..5) the winning team claimed on, or null when no winner. */
  solvedAtClue: number | null;
  points: Record<string, number>;
  failedTeamIds: string[];
  resolvedAt: string;
}

export interface LaqathaChallengeResult {
  winnerTeamId: string | null;
  tie: boolean;
  points: Record<string, number>;
}

function fail(message: string): never {
  throw new LiveSessionDomainError('INVALID_LAQATHA_STATE', message);
}

function parse<T>(value: unknown, label: string): T {
  if (typeof value !== 'string') return fail(`${label} is missing`);
  try {
    return JSON.parse(value) as T;
  } catch {
    return fail(`${label} is invalid`);
  }
}

const questionsOf = (s: GameplayModeState) =>
  parse<LaqathaRuntimeQuestion[]>(s.questionsJson, 'questions');
const teamsOf = (s: GameplayModeState) =>
  parse<string[]>(s.teamIdsJson, 'teams');
const failedOf = (s: GameplayModeState) =>
  parse<string[]>(s.failedTeamIdsJson ?? '[]', 'failed teams');
const resultsOf = (s: GameplayModeState) =>
  parse<LaqathaQuestionResult[]>(s.resultsJson ?? '[]', 'results');
const currentQuestion = (s: GameplayModeState) =>
  questionsOf(s)[Number(s.currentQuestionIndex)];

/** Reward for the currently revealed clue count: clue 1 → 5, … clue 5 → 1. */
const rewardForCount = (revealedClueCount: number) =>
  LAQATHA_VALUES[revealedClueCount - 1];

/** A clue is playable when it carries Arabic text or a real media asset. */
function clueHasContent(clue: LaqathaRuntimeClue): boolean {
  if (clue.text?.ar?.trim()) return true;
  const media = clue.media;
  return Boolean(
    media &&
    media.type !== ContentMediaType.NONE &&
    media.assets?.some((asset) => asset.url?.trim()),
  );
}

export function validateLaqathaQuestion(
  question: LaqathaRuntimeQuestion,
): LaqathaRuntimeQuestion {
  if (
    !question.contentItemId ||
    !question.title?.trim() ||
    question.clues.length !== LAQATHA_VALUES.length ||
    question.clues.some(
      (clue, index) =>
        clue.order !== index + 1 ||
        clue.value !== LAQATHA_VALUES[index] ||
        !clueHasContent(clue),
    ) ||
    !question.acceptedAnswers.length ||
    question.acceptedAnswers.some((answer) => !normalizeAnswer(answer))
  ) {
    throw new LiveSessionDomainError(
      'LAQATHA_CONTENT_INVALID',
      'القطها needs five ordered clues valued 5 to 1, a title, and accepted answers',
    );
  }
  return question;
}

function validate(state: GameplayModeState): GameplayModeState {
  const questions = questionsOf(state);
  const teams = teamsOf(state);
  if (
    questions.length !== LAQATHA_ITEM_COUNT ||
    new Set(questions.map((q) => q.contentItemId)).size !==
      LAQATHA_ITEM_COUNT ||
    teams.length !== 2 ||
    new Set(teams).size !== 2 ||
    !LAQATHA_PHASES.includes(String(state.phase) as LaqathaPhase) ||
    !Number.isInteger(state.currentQuestionIndex) ||
    Number(state.currentQuestionIndex) < 0 ||
    Number(state.currentQuestionIndex) >= LAQATHA_ITEM_COUNT ||
    !Number.isInteger(state.revealedClueCount) ||
    Number(state.revealedClueCount) < 1 ||
    Number(state.revealedClueCount) > LAQATHA_VALUES.length
  ) {
    return fail('القطها runtime shape is invalid');
  }
  questions.forEach(validateLaqathaQuestion);
  failedOf(state);
  resultsOf(state);
  return state;
}

const submitterTeam = (context: GameplayPluginContext, teams: string[]) => {
  const participant = context.eligibleParticipants?.find(
    (p) => p.participantId === context.submitterParticipantId,
  );
  const teamId = participant?.teamId;
  if (!participant || !teamId || !teams.includes(teamId)) {
    throw new LiveSessionDomainError(
      'LAQATHA_FORBIDDEN',
      'Only an eligible competing player may act',
    );
  }
  return teamId;
};

const answerPayload = (payload: GameplayCommandPayload) => {
  if (
    Object.keys(payload).length !== 1 ||
    typeof payload.answer !== 'string' ||
    !payload.answer.trim()
  ) {
    throw new LiveSessionDomainError(
      'INVALID_LAQATHA_SUBMISSION',
      'Submit one non-empty movie title',
    );
  }
  return { answer: payload.answer.trim() };
};

const noPayload = (payload: GameplayCommandPayload) => {
  if (Object.keys(payload).length) {
    throw new LiveSessionDomainError(
      'INVALID_LAQATHA_COMMAND',
      'This command accepts no payload',
    );
  }
  return {};
};

const challengeResult = (state: GameplayModeState): LaqathaChallengeResult => {
  const teams = teamsOf(state);
  const points = Object.fromEntries(teams.map((teamId) => [teamId, 0]));
  for (const entry of resultsOf(state)) {
    for (const teamId of teams) {
      points[teamId] += entry.points[teamId] ?? 0;
    }
  }
  const [first, second] = teams;
  const tie = points[first] === points[second];
  return {
    winnerTeamId: tie ? null : points[first] > points[second] ? first : second,
    tie,
    points,
  };
};

const result = (
  runtimeState: GameplayModeState,
  eventType: string,
  eventPayload: GameplayModeState = {},
  prepareNextPresentation = false,
): GameplayCommandResult => ({
  runtimeState: validate(runtimeState),
  roundState: {
    phase: runtimeState.phase,
    questionIndex: runtimeState.currentQuestionIndex,
  },
  eventType,
  eventPayload,
  effects: [],
  prepareNextPresentation,
});

/**
 * Records a resolved question (won or unclaimed) and moves to the `resolved`
 * phase where the reveal is shown until the host advances.
 */
function resolveQuestion(
  state: GameplayModeState,
  now: Date,
  winnerTeamId: string | null,
  reward: number,
  solvedAtClue: number | null,
  eventType: string,
): GameplayCommandResult {
  const teams = teamsOf(state);
  const question = currentQuestion(state);
  const failed = failedOf(state);
  const points = Object.fromEntries(
    teams.map((teamId) => [teamId, teamId === winnerTeamId ? reward : 0]),
  );
  const questionResult: LaqathaQuestionResult = {
    questionIndex: Number(state.currentQuestionIndex),
    contentItemId: question.contentItemId,
    title: question.title,
    winnerTeamId,
    solvedAtClue,
    points,
    failedTeamIds: failed,
    resolvedAt: now.toISOString(),
  };
  return result(
    {
      ...state,
      phase: 'resolved',
      claimOwnerTeamId: null,
      frozenReward: null,
      revealRemainingMs: null,
      resultsJson: JSON.stringify([...resultsOf(state), questionResult]),
      deadlineAt: null,
    },
    eventType,
    { questionIndex: state.currentQuestionIndex },
  );
}

/**
 * The claim owner just used its attempt (a wrong answer or a lapsed 5-second
 * window). Lock that team out. If the opponent can still play, resume the clue
 * clock with the *exact* remaining interval that was frozen at claim time — the
 * opponent must never lose clue/reward time because a rival spent five seconds
 * typing. If both teams are out, the question ends with no winner.
 */
function failClaim(
  state: GameplayModeState,
  now: Date,
  eventType: string,
): GameplayCommandResult {
  const teams = teamsOf(state);
  const owner = String(state.claimOwnerTeamId ?? '');
  const failed = [...new Set([...failedOf(state), owner])];
  const opponent = teams.find((teamId) => teamId !== owner);
  if (opponent && !failed.includes(opponent)) {
    const remaining = Math.max(0, Number(state.revealRemainingMs) || 0);
    return result(
      {
        ...state,
        phase: 'revealing',
        claimOwnerTeamId: null,
        frozenReward: null,
        revealRemainingMs: null,
        failedTeamIdsJson: JSON.stringify(failed),
        // Resume the same clue clock exactly where it froze, never a fresh 3s.
        deadlineAt: new Date(now.getTime() + remaining).toISOString(),
      },
      eventType,
      { teamId: owner },
    );
  }
  return resolveQuestion(
    { ...state, failedTeamIdsJson: JSON.stringify(failed) },
    now,
    null,
    0,
    null,
    'laqatha-question-unclaimed',
  );
}

function safeClue(clue: LaqathaRuntimeClue) {
  const media = clue.media;
  const hasMedia = Boolean(
    media &&
    media.type !== ContentMediaType.NONE &&
    Array.isArray(media.assets) &&
    media.assets.length,
  );
  const modality =
    hasMedia && media
      ? media.type === ContentMediaType.IMAGE
        ? 'image'
        : media.type === ContentMediaType.AUDIO
          ? 'audio'
          : 'text'
      : 'text';
  return {
    order: clue.order,
    value: clue.value,
    modality,
    ...(clue.text ? { text: clue.text } : {}),
    ...(hasMedia && media
      ? {
          media: {
            type: media.type,
            // Only the player-facing url + alt text; path/filename/mimetype/size
            // (which can carry answer-bearing names) never reach a client.
            assets: media.assets.map((asset) => ({
              url: asset.url,
              ...(asset.altText ? { altText: asset.altText } : {}),
            })),
          },
        }
      : {}),
  };
}

/**
 * The shared, non-secret projection. Only clues revealed so far are serialized —
 * future clue text and media stay server-side, so nothing unrevealed is
 * inspectable in browser dev tools. The accepted answers and the canonical movie
 * title are withheld until the question resolves.
 */
function publicState(
  state: GameplayModeState,
  actor?: InteractionActorProjection,
): GameplayModeState {
  const valid = validate(state);
  const question = currentQuestion(valid);
  const teams = teamsOf(valid);
  const phase = String(valid.phase);
  const revealedClueCount = Number(valid.revealedClueCount);
  const resolved = phase === 'resolved' || phase === 'completed';
  const failed = failedOf(valid);
  const latest = resultsOf(valid).at(-1);
  const projected: GameplayModeState = {
    phase: valid.phase,
    currentQuestionIndex: valid.currentQuestionIndex,
    questionCount: LAQATHA_ITEM_COUNT,
    revealedClueCount,
    currentReward:
      phase === 'claiming'
        ? Number(valid.frozenReward)
        : rewardForCount(revealedClueCount),
    cluesJson: JSON.stringify(
      question.clues.slice(0, revealedClueCount).map(safeClue),
    ),
    claimOwnerTeamId: valid.claimOwnerTeamId ?? null,
    failedTeamIdsJson: JSON.stringify(failed),
    teamIdsJson: JSON.stringify(teams),
    deadlineAt: valid.deadlineAt ?? null,
    ...(resolved && latest
      ? {
          revealJson: JSON.stringify({
            title: latest.title,
            winnerTeamId: latest.winnerTeamId,
            solvedAtClue: latest.solvedAtClue,
            points: latest.points,
            failedTeamIds: latest.failedTeamIds,
            // The full clue ladder is safe to show once the answer is out.
            clues: question.clues.map(safeClue),
          }),
        }
      : {}),
    ...(phase === 'completed' && valid.resultJson
      ? { resultJson: valid.resultJson }
      : {}),
    resultsJson: JSON.stringify(
      resultsOf(valid).map((entry) =>
        resolved || entry.questionIndex < Number(valid.currentQuestionIndex)
          ? entry
          : { questionIndex: entry.questionIndex },
      ),
    ),
  };
  const teamId = actor?.teamId;
  if (!teamId) return projected;
  // Phones are input surfaces, not presentation-bearing media surfaces: the
  // shared board loads the clue media. A phone learns only whether its team may
  // claim or submit now.
  return {
    ...projected,
    cluesJson: '[]',
    actorTeamId: teamId,
    canClaim: phase === 'revealing' && !failed.includes(teamId),
    canSubmit: phase === 'claiming' && valid.claimOwnerTeamId === teamId,
    attemptUsed: failed.includes(teamId),
  };
}

export const LAQATHA_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: LAQATHA_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  deadline: {
    source: 'runtime-state',
    commandType: 'expire-laqatha-phase',
    // One timer at a time: the repeating 3s clue reveal and the one-shot 5s
    // claim window are sequential phases, never concurrent, so they share one
    // declaration and the scheduler holds whichever `deadlineAt` is live.
    activePhases: ['revealing', 'claiming'],
    requiresPresentationActivation: true,
  },
  // Only the shared board renders clue media and the authoritative clock. Phones
  // are «جاوب»/answer controls, so an idle handset must not stall the room.
  requiredPresentationSurfaces: () => [{ capability: 'shared' }],
  createInitialRuntimeState: (context) => validate(context.initialState ?? {}),
  createInitialRoundState: (context) => ({
    phase: context.initialState?.phase ?? 'preparing',
    questionIndex: context.initialState?.currentQuestionIndex ?? 0,
  }),
  validateRuntimeState: validate,
  validateRoundState: (s) => s,
  command: (type) => {
    if (type === 'claim-laqatha')
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    if (type === 'submit-laqatha')
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: answerPayload,
      };
    if (type === 'advance-laqatha')
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    if (type === 'expire-laqatha-phase')
      return {
        type,
        authorization: 'internal',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    return undefined;
  },
  // Re-anchor the reveal clock to activation time, for the initial launch and for
  // every recurring generation alike. A question sits in `preparing` (no clock,
  // hidden content) until every required surface is ready; activation reveals
  // clue 1 and starts the 3-second cadence from `now`.
  activatePresentation: (state, now) =>
    String((state as { phase?: unknown }).phase) === 'preparing'
      ? validate({
          ...state,
          phase: 'revealing',
          revealedClueCount: 1,
          deadlineAt: new Date(
            now.getTime() + LAQATHA_REVEAL_SECONDS * 1000,
          ).toISOString(),
        })
      : state,
  handleCommand: (context, command) => {
    const state = validate(command.runtimeState);
    const teams = teamsOf(state);
    const phase = String(state.phase);
    const now = context.now ?? fail('Server command time is missing');

    if (command.type === 'claim-laqatha') {
      const teamId = submitterTeam(context, teams);
      if (phase !== 'revealing') {
        throw new LiveSessionDomainError(
          'LAQATHA_CLAIM_CLOSED',
          'The claim race is closed',
        );
      }
      if (failedOf(state).includes(teamId)) {
        throw new LiveSessionDomainError(
          'LAQATHA_ATTEMPT_USED',
          'This team already used its attempt for this movie',
        );
      }
      const revealedClueCount = Number(state.revealedClueCount);
      const remaining =
        typeof state.deadlineAt === 'string'
          ? Math.max(0, Date.parse(state.deadlineAt) - now.getTime())
          : 0;
      return result(
        {
          ...state,
          phase: 'claiming',
          claimOwnerTeamId: teamId,
          // Freeze the exact remaining clue interval and the current reward.
          revealRemainingMs: remaining,
          frozenReward: rewardForCount(revealedClueCount),
          deadlineAt: new Date(
            now.getTime() + LAQATHA_CLAIM_SECONDS * 1000,
          ).toISOString(),
        },
        'laqatha-claimed',
        { teamId },
      );
    }

    if (command.type === 'submit-laqatha') {
      const teamId = submitterTeam(context, teams);
      if (phase !== 'claiming' || state.claimOwnerTeamId !== teamId) {
        throw new LiveSessionDomainError(
          'LAQATHA_SUBMIT_FORBIDDEN',
          'Only the claiming team may submit within its window',
        );
      }
      const question = currentQuestion(state);
      const answer = String(command.payload.answer);
      const correct = question.acceptedAnswers.some(
        (accepted) => normalizeAnswer(accepted) === normalizeAnswer(answer),
      );
      if (correct) {
        return resolveQuestion(
          state,
          now,
          teamId,
          Number(state.frozenReward),
          Number(state.revealedClueCount),
          'laqatha-answer-correct',
        );
      }
      return failClaim(state, now, 'laqatha-answer-wrong');
    }

    if (command.type === 'expire-laqatha-phase') {
      if (
        (phase !== 'revealing' && phase !== 'claiming') ||
        typeof state.deadlineAt !== 'string' ||
        now.getTime() < Date.parse(state.deadlineAt)
      ) {
        throw new LiveSessionDomainError(
          'LAQATHA_NOT_EXPIRED',
          'The القطها deadline has not elapsed',
        );
      }
      if (phase === 'claiming') {
        // A lapsed answer window counts exactly like a wrong answer.
        return failClaim(state, now, 'laqatha-claim-timeout');
      }
      const revealedClueCount = Number(state.revealedClueCount);
      if (revealedClueCount < LAQATHA_VALUES.length) {
        const next = revealedClueCount + 1;
        return result(
          {
            ...state,
            revealedClueCount: next,
            deadlineAt: new Date(
              now.getTime() + LAQATHA_REVEAL_SECONDS * 1000,
            ).toISOString(),
          },
          'laqatha-clue-revealed',
          { clueNumber: next },
        );
      }
      // The final clue's window lapsed with no claim: no winner.
      return resolveQuestion(
        state,
        now,
        null,
        0,
        null,
        'laqatha-question-unclaimed',
      );
    }

    if (command.type === 'advance-laqatha') {
      if (phase !== 'resolved') {
        throw new LiveSessionDomainError(
          'LAQATHA_NOT_RESOLVED',
          'Resolve this movie question first',
        );
      }
      const next = Number(state.currentQuestionIndex) + 1;
      if (next >= LAQATHA_ITEM_COUNT) {
        return result(
          {
            ...state,
            phase: 'completed',
            deadlineAt: null,
            resultJson: JSON.stringify(challengeResult(state)),
          },
          'laqatha-completed',
        );
      }
      // Open a fresh Fair-Start generation for the next movie question: it sits
      // in `preparing` (hidden, no clock) until the surfaces re-acknowledge, then
      // `activatePresentation` reveals clue 1 and starts the clock from `now`.
      return result(
        {
          ...state,
          phase: 'preparing',
          currentQuestionIndex: next,
          revealedClueCount: 1,
          claimOwnerTeamId: null,
          frozenReward: null,
          revealRemainingMs: null,
          failedTeamIdsJson: '[]',
          deadlineAt: null,
        },
        'laqatha-question-prepared',
        { questionIndex: next },
        true,
      );
    }

    throw new LiveSessionDomainError(
      'LAQATHA_COMMAND_UNKNOWN',
      'Unsupported القطها command',
    );
  },
  projectRuntimeState: (state) => publicState(state),
  projectRuntimeStateForActor: (state, actor) => publicState(state, actor),
  projectRoundState: (s) => s,
  presentedContentItemIds: ({ runtimeState }) =>
    questionsOf(runtimeState)
      .slice(0, Number(runtimeState.currentQuestionIndex) + 1)
      .map((q) => q.contentItemId),
};
