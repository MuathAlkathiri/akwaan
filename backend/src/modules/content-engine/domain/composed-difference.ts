import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { pick, seededRandom, shuffled } from './composed-kit';
import { findDrawnThingsDirectory } from './drawn-things';

/**
 * وش الفرق؟ — القنبلة in اكتشف الخطأ.
 *
 * Two copies of one illustrated scene, with one thing taken out of one of
 * them; the player types the thing. The scene is drawn by an image model,
 * which the composer cannot do: this file only says *what* is drawn and what
 * the answer is. `DifferenceSceneService` draws it, takes the thing out, and
 * keeps the two pictures identical everywhere but there.
 *
 * Scenes and every name a player may type are `difference-scenes.txt`,
 * reviewed by the owner. The answer is always a thing that was in the
 * drawing request, never something a model chose.
 */
export const DIFFERENCE_VARIANTS = ['went-missing', 'showed-up'] as const;
export type DifferenceVariant = (typeof DIFFERENCE_VARIANTS)[number];

export interface DifferenceThing {
  key: string;
  /** As the image model is asked for it: «a red bucket on the sand». */
  english: string;
  answers: string[];
}

export interface DifferenceScene {
  key: string;
  english: string;
  things: DifferenceThing[];
}

/** What the image model is asked to draw, and which picture loses what. */
export interface DifferenceRequest {
  sceneKey: string;
  thingKey: string;
  /** The whole scene, every listed thing in it once. */
  drawPrompt: string;
  /** Take the one thing out; nothing else. */
  editPrompt: string;
  /** For the check that looks at both pictures. */
  thingEnglish: string;
  /** `went-missing`: the second picture lacks it; `showed-up`: the first. */
  missingFrom: 'first' | 'second';
}

export const DIFFERENCE_STYLE =
  "Flat 2D cartoon illustration for a family puzzle game: bright friendly colours, clean dark outlines, children's picture-book style, square picture, every object clearly separate and fully visible. No text, letters, numbers or logos anywhere. No known characters or brands. People modestly dressed.";

let scenes: DifferenceScene[] | undefined;

export function differenceScenes(): DifferenceScene[] {
  if (scenes) return scenes;
  const loaded: DifferenceScene[] = [];
  try {
    const directory = findDrawnThingsDirectory();
    const file = directory ? join(directory, 'difference-scenes.txt') : '';
    if (file && existsSync(file)) {
      for (const raw of readFileSync(file, 'utf8').split('\n')) {
        const line = raw.trim();
        if (line.startsWith('@')) {
          const [key, english] = line
            .slice(1)
            .split('|')
            .map((part) => part.trim());
          if (key && english) loaded.push({ key, english, things: [] });
        } else if (line.startsWith('-') && loaded.length) {
          const [key, english, names] = line
            .slice(1)
            .split('|')
            .map((part) => part.trim());
          const answers = (names ?? '')
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean);
          if (key && english && answers.length)
            loaded[loaded.length - 1].things.push({ key, english, answers });
        }
      }
    }
  } catch {
    // No catalogue on this host: the family has nothing to ask.
  }
  scenes = loaded.filter((scene) => scene.things.length > 0);
  return scenes;
}

/** Every scene and thing, as one deck. */
export const differenceDeck = (): Array<{
  scene: DifferenceScene;
  thing: DifferenceThing;
}> =>
  differenceScenes().flatMap((scene) =>
    scene.things.map((thing) => ({ scene, thing })),
  );

/**
 * The card a batch's item gets. The seed is «job:ordinal»: the job shuffles
 * the deck once and item n takes card n, so no two items of a batch share a
 * scene's thing — and, the deck being dealt scene by scene apart, rarely a
 * scene.
 */
export function dealtDifference(seed: string): {
  scene: DifferenceScene;
  thing: DifferenceThing;
} {
  const deck = differenceDeck();
  const match = /^(.*):(\d+)$/.exec(seed);
  if (!match) return pick(deck, seededRandom(`difference:${seed}`));
  // Scenes first, one card each, before any scene comes round again.
  const bySceneOrder = shuffled(
    differenceScenes(),
    seededRandom(`difference-deck:${match[1]}`),
  );
  const rounds: Array<{ scene: DifferenceScene; thing: DifferenceThing }> = [];
  const hands = bySceneOrder.map((scene) =>
    shuffled(
      scene.things,
      seededRandom(`difference-hand:${match[1]}:${scene.key}`),
    ),
  );
  const longest = Math.max(...hands.map((hand) => hand.length));
  for (let round = 0; round < longest; round += 1)
    bySceneOrder.forEach((scene, index) => {
      const thing = hands[index][round];
      if (thing) rounds.push({ scene, thing });
    });
  return rounds[Number(match[2]) % rounds.length];
}

export interface DifferenceItem {
  variantKey: DifferenceVariant;
  variant: string;
  prompt: string;
  acceptedAnswers: string[];
  answerKey: string;
  altText: string;
  concept: string;
  factualClaim: string;
  request: DifferenceRequest;
}

export function composeDifference(
  seed: string,
  variantKey: string,
): DifferenceItem {
  const { scene, thing } = dealtDifference(seed);
  const chosen = (
    (DIFFERENCE_VARIANTS as readonly string[]).includes(variantKey)
      ? variantKey
      : 'went-missing'
  ) as DifferenceVariant;
  const missingFrom = chosen === 'went-missing' ? 'second' : 'first';
  const listed = scene.things.map((other) => other.english).join('; ');
  return {
    variantKey: chosen,
    variant: `${chosen}:${scene.key}:${thing.key}`,
    prompt:
      chosen === 'went-missing'
        ? 'فيه فرق واحد بين الصورتين. وش الشي اللي اختفى من الصورة الثانية؟'
        : 'فيه فرق واحد بين الصورتين. وش الشي اللي انضاف في الصورة الثانية؟',
    acceptedAnswers: thing.answers,
    answerKey: `difference:${scene.key}:${thing.key}`,
    altText: 'صورتين متطابقتين جنب بعض، بينهم فرق واحد',
    concept:
      'Compare two copies of one scene and name the one thing that is in only one of them.',
    factualClaim: `${thing.english} is in the ${missingFrom === 'second' ? 'first' : 'second'} picture only.`,
    request: {
      sceneKey: scene.key,
      thingKey: thing.key,
      drawPrompt: `${DIFFERENCE_STYLE}\n\nScene: ${scene.english}\n\nThe picture must clearly show each of these exactly once: ${listed}.`,
      editPrompt: `Remove ${thing.english} from this picture completely, and fill its place with whatever would naturally be behind it. Change nothing else at all: keep exactly the same composition, framing, people, colours, line style and every other object.`,
      thingEnglish: thing.english,
      missingFrom,
    },
  };
}
