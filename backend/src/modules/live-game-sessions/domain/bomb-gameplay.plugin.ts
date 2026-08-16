import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  GameplayCommandPayload,
  GameplayModePlugin,
  GameplayModeState,
  GameplayPluginContext,
  GameplayCommandResult,
} from './gameplay-mode.plugin';
import { LiveSessionDomainError } from './live-session.errors';

interface BombRuntimeQuestion {
  id: string;
  prompt: string;
  items: Array<{
    id: string;
    /**
     * The item's own prompt. Optional so legacy Bomb questions — which carry a
     * single prompt for the whole run — keep working unchanged; the canonical
     * ContentItem path supplies one per item.
     */
    prompt?: string;
    imageUrl: string;
    altText?: string;
    acceptedAnswers: string[];
  }>;
}

function questions(state: GameplayModeState): BombRuntimeQuestion[] {
  if (typeof state.questionsJson !== 'string') return [];
  try {
    const value: unknown = JSON.parse(state.questionsJson);
    if (!Array.isArray(value)) return [];
    return value as BombRuntimeQuestion[];
  } catch {
    return [];
  }
}

function validateRuntime(state: GameplayModeState): GameplayModeState {
  const list = questions(state);
  if (
    state.phase !== 'ready' ||
    typeof state.questionIndex !== 'number' ||
    state.questionIndex < 0 ||
    list.length < 1
  ) {
    throw new LiveSessionDomainError(
      'INVALID_BOMB_RUNTIME_STATE',
      'Bomb runtime requires at least one prepared question',
    );
  }
  return {
    phase: 'ready',
    questionIndex: Math.trunc(state.questionIndex),
    questionsJson: JSON.stringify(list),
    // The challenge verdict, written once at completion. It has to live on the
    // runtime rather than the round: completing a round keeps only a summary
    // (id, sequence, reason) and discards the round body, so a winner recorded
    // there would vanish before the Match could read it.
    ...(typeof state.resultJson === 'string'
      ? { resultJson: state.resultJson }
      : {}),
  };
}

function validateRound(state: GameplayModeState): GameplayModeState {
  const requiredStrings = ['phase', 'questionId', 'prompt', 'imageUrl'];
  if (
    requiredStrings.some((key) => typeof state[key] !== 'string') ||
    typeof state.itemIndex !== 'number' ||
    typeof state.itemCount !== 'number' ||
    typeof state.answersJson !== 'string'
  ) {
    throw new LiveSessionDomainError(
      'INVALID_BOMB_ROUND_STATE',
      'Bomb round state is incomplete',
    );
  }
  return {
    // How the round ended, once it has. `clock-expired` is what tells the
    // completion step to award the other team rather than compare clocks.
    ...(typeof state.endedBy === 'string' ? { endedBy: state.endedBy } : {}),
    phase: state.phase,
    questionId: state.questionId,
    prompt: state.prompt,
    itemIndex: Math.trunc(state.itemIndex),
    itemCount: Math.trunc(state.itemCount),
    imageUrl: state.imageUrl,
    altText: typeof state.altText === 'string' ? state.altText : '',
    answersJson: state.answersJson,
  };
}

function initialRound(context: GameplayPluginContext): GameplayModeState {
  const runtime = context.runtimeState
    ? validateRuntime(context.runtimeState)
    : undefined;
  const list = runtime ? questions(runtime) : [];
  const index = Number(runtime?.questionIndex ?? 0) % list.length;
  const question = list[index];
  const item = question?.items[0];
  if (!question || !item) {
    throw new LiveSessionDomainError(
      'BOMB_QUESTION_UNAVAILABLE',
      'No prepared Bomb question is available for this round',
    );
  }
  return validateRound({
    phase: 'presenting',
    questionId: question.id,
    // Per-item where authored, falling back to the question-level prompt so a
    // legacy Bomb run behaves exactly as before.
    prompt: item.prompt ?? question.prompt,
    itemIndex: 0,
    itemCount: question.items.length,
    imageUrl: item.imageUrl,
    altText: item.altText ?? '',
    answersJson: JSON.stringify(item.acceptedAnswers),
  });
}

function advance(
  runtimeState: GameplayModeState,
  roundState: GameplayModeState,
) {
  const runtime = validateRuntime(runtimeState);
  const round = validateRound(roundState);
  const list = questions(runtime);
  const question = list.find((candidate) => candidate.id === round.questionId);
  const nextIndex = Number(round.itemIndex) + 1;
  const item = question?.items[nextIndex];
  if (!question || !item) {
    return {
      runtimeState: validateRuntime({
        ...runtime,
        questionIndex: (Number(runtime.questionIndex) + 1) % list.length,
      }),
      roundState: validateRound({
        ...round,
        phase: 'completed',
        itemIndex: Number(round.itemCount),
        imageUrl: '',
        altText: '',
        answersJson: '[]',
      }),
    };
  }
  return {
    runtimeState: runtime,
    roundState: validateRound({
      ...round,
      itemIndex: nextIndex,
      // The prompt travels with the item, so advancing changes the question
      // being asked and not just the picture.
      prompt: item.prompt ?? round.prompt,
      imageUrl: item.imageUrl,
      altText: item.altText ?? '',
      answersJson: JSON.stringify(item.acceptedAnswers),
    }),
  };
}

function emptyPayload(payload: GameplayCommandPayload) {
  if (Object.keys(payload).length) {
    throw new LiveSessionDomainError(
      'INVALID_GAMEPLAY_COMMAND',
      'This Bomb command does not accept a payload',
    );
  }
  return {};
}

/** Stable runtime key. Persisted state and tests depend on it. */
export const BOMB_MODE_KEY = 'bomb';

export const BOMB_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: BOMB_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  // Bomb is the one mechanic whose clock is the *session's* team clock rather
  // than anything on its own runtime, so it names the source instead of a phase.
  deadline: { source: 'session-clock', commandType: 'expire-team' },
  createInitialRuntimeState: (context) =>
    validateRuntime(context.initialState ?? {}),
  createInitialRoundState: initialRound,
  validateRuntimeState: validateRuntime,
  validateRoundState: validateRound,
  command(type) {
    if (type === 'submit-answer') {
      return {
        type,
        authorization: 'active-participant',
        allowedRoundStatuses: ['active'],
        validatePayload(payload) {
          if (
            Object.keys(payload).length !== 1 ||
            typeof payload.answer !== 'string' ||
            !payload.answer.trim()
          ) {
            throw new LiveSessionDomainError(
              'INVALID_BOMB_ANSWER',
              'Bomb submission requires a non-empty text answer',
            );
          }
          return { answer: payload.answer.trim() };
        },
      };
    }
    if (type === 'skip') {
      return {
        type,
        authorization: 'active-participant',
        allowedRoundStatuses: ['active'],
        validatePayload: emptyPayload,
      };
    }
    if (type === 'expire-team') {
      return {
        type,
        authorization: 'controller-or-active-participant',
        allowedRoundStatuses: ['active'],
        validatePayload: emptyPayload,
      };
    }
    return undefined;
  },
  handleCommand(_context, command): GameplayCommandResult {
    const round = validateRound(command.roundState);
    if (round.phase !== 'presenting') {
      throw new LiveSessionDomainError(
        'BOMB_ROUND_COMPLETE',
        'This Bomb question has no remaining items',
      );
    }
    if (command.type === 'expire-team') {
      // Bomb is a board Challenge, not a whole game: a spent clock ends this
      // challenge and hands the win to the other team, while the live session
      // stays active so the Match can score it and open the board again.
      // The winning team is resolved at completion, where the session — and
      // therefore who was active when the clock ran out — is known.
      return {
        runtimeState: command.runtimeState,
        roundState: validateRound({
          ...round,
          phase: 'completed',
          endedBy: 'clock-expired',
        }),
        eventType: 'bomb-clock-expired',
        eventPayload: { itemIndex: round.itemIndex },
        effects: [
          { type: 'emit-runtime-event', eventType: 'bomb-clock-expired' },
        ],
      };
    }
    const next = advance(command.runtimeState, round);
    if (command.type === 'skip') {
      return {
        ...next,
        eventType: 'bomb-item-skipped',
        eventPayload: { itemIndex: next.roundState.itemIndex },
        effects: [
          { type: 'adjust-active-team-time', deltaMs: -5_000 },
          { type: 'emit-runtime-event', eventType: 'bomb-item-skipped' },
        ],
      };
    }
    const accepted = JSON.parse(String(round.answersJson)) as string[];
    const correct = accepted
      .map(normalizeAnswer)
      .includes(normalizeAnswer(String(command.payload.answer)));
    return {
      runtimeState: correct ? next.runtimeState : command.runtimeState,
      roundState: correct ? next.roundState : round,
      eventType: correct ? 'bomb-answer-correct' : 'bomb-answer-incorrect',
      eventPayload: { correct, itemIndex: round.itemIndex },
      effects: correct
        ? [
            {
              type: 'switch-active-team',
              teamId: '',
              reason: 'bomb-answer-correct',
            },
          ]
        : [{ type: 'emit-runtime-event', eventType: 'bomb-answer-incorrect' }],
    };
  },
  projectRuntimeState(state) {
    const valid = validateRuntime(state);
    return {
      phase: valid.phase,
      questionIndex: valid.questionIndex,
      questionCount: questions(valid).length,
      // Safe to project: the verdict is public once the challenge is over, and
      // it carries no answers.
      ...(valid.resultJson ? { resultJson: valid.resultJson } : {}),
    };
  },
  projectRoundState(state) {
    const valid = validateRound(state);
    return {
      ...(valid.endedBy ? { endedBy: valid.endedBy } : {}),
      phase: valid.phase,
      questionId: valid.questionId,
      prompt: valid.prompt,
      itemIndex: valid.itemIndex,
      itemCount: valid.itemCount,
      imageUrl: valid.imageUrl,
      altText: valid.altText,
    };
  },
};
