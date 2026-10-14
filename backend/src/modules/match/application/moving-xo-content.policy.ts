import { ConfigService } from '@nestjs/config';
import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import { MovingXoQuestion } from '../../live-game-sessions/domain/moving-xo-gameplay.plugin';
import {
  FORWARD_PUZZLE_SCOPE_SLUGS,
  MOVING_XO_AUTHORING_ANSWER_MODES,
  VISUAL_PUZZLE_SCOPE_SLUGS,
} from '../../world-content/domain/world-content.constants';
import { MatchSelectableContentItem } from './challenge-launcher.registry';

export const MOVING_XO_DEFAULT_MIN_USABLE_ITEMS = 24;
export const MOVING_XO_MIN_USABLE_ITEMS_CONFIG_KEY =
  'MOVING_XO_MIN_USABLE_ITEMS';
export const MOVING_XO_MAX_DRAW_RECOVERY_ATTEMPTS = 24;

export type MovingXoRuntimeContentIssueCode =
  | 'MOVING_XO_ITEM_MISSING'
  | 'MOVING_XO_ITEM_NO_LONGER_ELIGIBLE'
  | 'MOVING_XO_SCOPE_NOT_FORWARD'
  | 'MOVING_XO_PROMPT_INVALID'
  | 'MOVING_XO_ANSWER_MODE_UNSUPPORTED'
  | 'MOVING_XO_MULTIPLE_CHOICE_INVALID'
  | 'MOVING_XO_MATCH_ANSWER_INVALID'
  | 'MOVING_XO_MATCH_ANSWER_NUMERIC'
  | 'MOVING_XO_MEDIA_INVALID'
  | 'PUZZLE_SCOPE_REQUIRES_MEDIA';

export type MovingXoRuntimeContentResult =
  | { ok: true; question: MovingXoQuestion }
  | { ok: false; code: MovingXoRuntimeContentIssueCode };

interface MovingXoRuntimeContentCandidate {
  id: string;
  scopeId: string;
  scopeSlug?: string;
  prompt?: unknown;
  answerPayload?: unknown;
  media?: unknown;
}

export function movingXoMinimumUsableItems(config: ConfigService): number {
  const configured = config.get<string | number>(
    MOVING_XO_MIN_USABLE_ITEMS_CONFIG_KEY,
  );
  if (configured === undefined || configured === null || configured === '') {
    return MOVING_XO_DEFAULT_MIN_USABLE_ITEMS;
  }
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `${MOVING_XO_MIN_USABLE_ITEMS_CONFIG_KEY} must be a positive integer`,
    );
  }
  return parsed;
}

export function isMovingXoPlayableItem(
  item: MatchSelectableContentItem,
): boolean {
  return readMovingXoQuestion(item).ok;
}

/**
 * One runtime-safe parser shared by inventory counting and post-reservation
 * hydration. A READY row is data, not proof: legacy or raced writes still have
 * to produce a complete, non-leaking question before gameplay can use it.
 */
export function readMovingXoQuestion(
  item: MovingXoRuntimeContentCandidate,
): MovingXoRuntimeContentResult {
  if (
    !item.scopeSlug ||
    !(FORWARD_PUZZLE_SCOPE_SLUGS as readonly string[]).includes(item.scopeSlug)
  ) {
    return { ok: false, code: 'MOVING_XO_SCOPE_NOT_FORWARD' };
  }

  const prompt = asRecord(item.prompt);
  if (typeof prompt.ar !== 'string' || !prompt.ar.trim()) {
    return { ok: false, code: 'MOVING_XO_PROMPT_INVALID' };
  }

  const media = readMedia(item.media);
  if (!media.valid) return { ok: false, code: 'MOVING_XO_MEDIA_INVALID' };
  if (
    (VISUAL_PUZZLE_SCOPE_SLUGS as readonly string[]).includes(item.scopeSlug) &&
    (!media.value ||
      media.value.type === 'none' ||
      !media.value.assets.some((asset) => asset.url.trim()))
  ) {
    return { ok: false, code: 'PUZZLE_SCOPE_REQUIRES_MEDIA' };
  }

  const payload = asRecord(item.answerPayload);
  if (
    !(MOVING_XO_AUTHORING_ANSWER_MODES as readonly string[]).includes(
      String(payload.mode),
    )
  ) {
    return { ok: false, code: 'MOVING_XO_ANSWER_MODE_UNSUPPORTED' };
  }
  const base = {
    contentItemId: item.id,
    scopeId: item.scopeId,
    prompt,
    ...(media.value ? { media: media.value } : {}),
  };
  if (payload.mode === 'multiple_choice') {
    if (!Array.isArray(payload.options) || payload.options.length < 2) {
      return { ok: false, code: 'MOVING_XO_MULTIPLE_CHOICE_INVALID' };
    }
    const options = payload.options.map(asRecord);
    const ids = options.map((option) =>
      typeof option.id === 'string' ? option.id.trim() : '',
    );
    const labelsValid = options.every((option) => {
      const label = asRecord(option.label);
      return typeof label.ar === 'string' && Boolean(label.ar.trim());
    });
    if (
      ids.some((id) => !id) ||
      new Set(ids).size !== ids.length ||
      !labelsValid ||
      typeof payload.correctOptionId !== 'string' ||
      !ids.includes(payload.correctOptionId)
    ) {
      return { ok: false, code: 'MOVING_XO_MULTIPLE_CHOICE_INVALID' };
    }
    return {
      ok: true,
      question: {
        ...base,
        answerMode: 'multiple_choice',
        options: payload.options as Array<Record<string, unknown>>,
        correctOptionId: payload.correctOptionId,
      },
    };
  }

  if (payload.mode === 'match') {
    if (
      !Array.isArray(payload.acceptedAnswers) ||
      !payload.acceptedAnswers.length
    ) {
      return { ok: false, code: 'MOVING_XO_MATCH_ANSWER_INVALID' };
    }
    const acceptedAnswers = payload.acceptedAnswers.filter(
      (answer): answer is string => typeof answer === 'string',
    );
    if (
      acceptedAnswers.length !== payload.acceptedAnswers.length ||
      acceptedAnswers.some((answer) => !normalizeAnswer(answer)) ||
      new Set(acceptedAnswers.map(normalizeAnswer)).size !==
        acceptedAnswers.length
    ) {
      return { ok: false, code: 'MOVING_XO_MATCH_ANSWER_INVALID' };
    }
    if (acceptedAnswers.some((answer) => /\p{Nd}/u.test(answer))) {
      return { ok: false, code: 'MOVING_XO_MATCH_ANSWER_NUMERIC' };
    }
    return {
      ok: true,
      question: {
        ...base,
        answerMode: 'match',
        acceptedAnswers,
      },
    };
  }

  // Exhaustive for the canonical V1 mode list above.
  return { ok: false, code: 'MOVING_XO_ANSWER_MODE_UNSUPPORTED' };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && 'toObject' in value) {
    const toObject = (value as { toObject?: unknown }).toObject;
    if (typeof toObject === 'function') {
      return (toObject as () => Record<string, unknown>).call(value);
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readMedia(value: unknown): {
  valid: boolean;
  value?: {
    type: 'none' | 'image' | 'audio' | 'video';
    assets: Array<{ url: string; altText?: string }>;
  };
} {
  if (value === undefined || value === null) return { valid: true };
  const media = asRecord(value);
  if (!['none', 'image', 'audio', 'video'].includes(String(media.type))) {
    return { valid: false };
  }
  if (!Array.isArray(media.assets)) return { valid: false };
  const assets = media.assets.map(asRecord);
  if (
    media.type !== 'none' &&
    (!assets.length ||
      assets.some(
        (asset) => typeof asset.url !== 'string' || !asset.url.trim(),
      ))
  ) {
    return { valid: false };
  }
  return {
    valid: true,
    value: {
      type: media.type as 'none' | 'image' | 'audio' | 'video',
      assets: assets.flatMap((asset) =>
        typeof asset.url === 'string'
          ? [
              {
                url: asset.url,
                ...(typeof asset.altText === 'string'
                  ? { altText: asset.altText }
                  : {}),
              },
            ]
          : [],
      ),
    },
  };
}
