import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  ContentMediaType,
} from './world-content.constants';
import { WorldContentValidationError } from './world-content.errors';

/**
 * Bomb's authored bounds, restated here rather than imported.
 *
 * The values are deliberately identical to the legacy Bomb policy — these are
 * established Bomb rules, not new ones — but World Content keeps no import edge
 * into the legacy question module, so the numbers live in this domain and the
 * architecture guard stays honest.
 */
export const BOMB_MIN_ITEMS = 10;
export const BOMB_MAX_ITEMS = 15;
export const BOMB_MAX_ANSWERS = 10;
export const BOMB_MAX_ANSWER_LENGTH = 120;

/**
 * Bomb authored content, expressed in the canonical World Content model.
 *
 * A Bomb challenge is an ordered run of 10–15 picture rounds. Rather than
 * inventing a payload that nests items inside one document, each item is an
 * ordinary ContentItem — one image in `media.assets`, its accepted answers in
 * `answerPayload.acceptedAnswers` — and the challenge is the ordered selection
 * of them. That is exactly how "مين اقرب" and "بدليل واحد" already work with
 * three items, so Bomb needs no new media format, no new schema, and no
 * migration: only a different cardinality.
 *
 * Order is the order of the selection. `contentItemIds` is gameplay order.
 *
 * The rules themselves are unchanged from the legacy Bomb policy — the same
 * bounds, the same normalization, the same duplicate rejection — because those
 * are established Bomb behaviour, not something this adaptation gets to decide.
 */
export interface BombAuthoredItem {
  id: string;
  prompt?: { ar?: string; en?: string };
  media?: {
    type?: string;
    assets?: Array<{ url?: string; altText?: string }>;
  };
  answerPayload?: {
    mode?: string;
    acceptedAnswers?: string[];
  };
  status?: string;
}

export interface BombRuntimeItem {
  /** This item's own question, not the run's. */
  prompt: string;
  imageUrl: string;
  altText: string;
  acceptedAnswers: string[];
}

/** Every failure surfaces as a coded issue so the admin sees what to fix. */
function reject(code: string, message: string): never {
  throw new WorldContentValidationError([{ code, message }], message);
}

/** The single image a Bomb item shows, or nothing if it has none. */
function imageOf(
  item: BombAuthoredItem,
): { url: string; altText: string } | null {
  if (item.media?.type !== ContentMediaType.IMAGE) return null;
  const asset = item.media.assets?.[0];
  if (!asset?.url?.trim()) return null;
  return { url: asset.url.trim(), altText: asset.altText?.trim() ?? '' };
}

/** One coded reason an authored Bomb item cannot be played. */
export interface BombItemProblem {
  code: string;
  message: string;
}

/**
 * The **per-item** half of the Bomb contract, and the only home for it.
 *
 * Authoring validates one item at a time; a launch validates the ordered run.
 * Both ask this same function, which is what guarantees the invariant that
 * matters: an item the admin form accepted cannot later fail a launch because of
 * its own shape. Only the run-level rules — the 10–15 count and distinctness —
 * live in `buildBombRuntimeItems`, because a single item cannot satisfy them.
 *
 * Returns the runtime projection when the item is playable, so the launch path
 * derives its values from the same pass that validated them.
 */
export function readBombItem(
  item: BombAuthoredItem,
  position: number,
): { problems: BombItemProblem[]; value: BombRuntimeItem | null } {
  const problem = (code: string, message: string) => ({
    problems: [{ code, message }],
    value: null,
  });

  if (item.status && item.status !== ContentItemStatus.READY) {
    return problem(
      'BOMB_ITEM_NOT_READY',
      `Item ${position} is not ready and cannot be played.`,
    );
  }

  const image = imageOf(item);
  if (!image) {
    return problem(
      'BOMB_ITEM_MEDIA_REQUIRED',
      `Item ${position} needs one image; Bomb is played by looking at a picture.`,
    );
  }

  if (
    item.answerPayload?.mode &&
    item.answerPayload.mode !== ChallengeAnswerMode.MATCH
  ) {
    return problem(
      'BOMB_ITEM_ANSWER_MODE_INVALID',
      `Item ${position} must use a match answer; Bomb grades typed text.`,
    );
  }

  const authored = item.answerPayload?.acceptedAnswers ?? [];
  if (!authored.length || authored.length > BOMB_MAX_ANSWERS) {
    return problem(
      'BOMB_ITEM_ANSWERS_INVALID',
      `Item ${position} needs 1–${BOMB_MAX_ANSWERS} accepted answers.`,
    );
  }

  // Normalized here, once, so gameplay compares like with like. Two spellings
  // that normalize to the same string are a duplicate, not two answers.
  const seen = new Set<string>();
  const acceptedAnswers: string[] = [];
  for (const raw of authored) {
    const display = String(raw ?? '').trim();
    const normalized = normalizeAnswer(display);
    if (!normalized || display.length > BOMB_MAX_ANSWER_LENGTH) {
      return problem(
        'BOMB_ITEM_ANSWER_INVALID',
        `Item ${position} has an answer that is empty or longer than ${BOMB_MAX_ANSWER_LENGTH} characters.`,
      );
    }
    if (seen.has(normalized)) {
      return problem(
        'BOMB_ITEM_ANSWER_DUPLICATE',
        `Item ${position} repeats the same answer.`,
      );
    }
    seen.add(normalized);
    acceptedAnswers.push(display);
  }

  const prompt = item.prompt?.ar?.trim();
  if (!prompt) {
    return problem(
      'BOMB_ITEM_PROMPT_REQUIRED',
      `Item ${position} needs an Arabic prompt.`,
    );
  }

  // Exactly the four fields gameplay needs. Nothing else about the authored
  // ContentItem — ids, status, English text, metadata — reaches the runtime.
  return {
    problems: [],
    value: {
      prompt,
      imageUrl: image.url,
      altText: image.altText,
      acceptedAnswers,
    },
  };
}

/**
 * Validate an ordered Bomb selection and reduce it to the runtime item list.
 *
 * Returns the shape the existing Bomb plugin already expects, so the domain
 * plugin never learns what a ContentItem is — the adapter boundary lives here.
 */
export function buildBombRuntimeItems(
  items: BombAuthoredItem[],
): BombRuntimeItem[] {
  if (items.length < BOMB_MIN_ITEMS || items.length > BOMB_MAX_ITEMS) {
    reject(
      'BOMB_ITEM_COUNT_INVALID',
      `Bomb needs ${BOMB_MIN_ITEMS}–${BOMB_MAX_ITEMS} ordered items, received ${items.length}.`,
    );
  }

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    reject(
      'BOMB_ITEMS_NOT_DISTINCT',
      'A Bomb challenge cannot play the same item twice.',
    );
  }

  return items.map((item, index) => {
    const { problems, value } = readBombItem(item, index + 1);
    if (!value) reject(problems[0].code, problems[0].message);
    return value;
  });
}
