import { createHash } from 'crypto';
import { BombFamily, isComposedBombFamily } from './composed-bomb';
import { ClosestFamily, isComposedClosestFamily } from './composed-closest';
import {
  ComposedPuzzleFamily,
  isComposedPuzzleFamily,
} from './composed-puzzles';

/**
 * Pictures the engine draws itself (roadmap: "مركّب الصور").
 *
 * A composed family has no author. The picture, the slider and the answer are
 * all produced here from one seed, so the answer is correct by construction:
 * the same number that sets the drawing sets `correctValue`. Nothing is asked
 * of a model, and nothing a model returned is trusted for these items.
 *
 * Everything in this file is pure — a string in, a description out — so the
 * geometry can be tested without an image library. Turning the SVG into the
 * PNG a ContentItem can hold is `SvgRasterizer`'s job.
 */
export const COMPOSED_VISUAL_FAMILIES = [
  'battery-level',
  'copy-the-mark',
  'colour-recall',
] as const;

export type ComposedVisualFamily = (typeof COMPOSED_VISUAL_FAMILIES)[number];

export const isComposedVisualFamily = (
  familyKey: string | null | undefined,
): familyKey is ComposedVisualFamily =>
  (COMPOSED_VISUAL_FAMILIES as readonly string[]).includes(familyKey ?? '');

/** Every family the engine draws, whichever way it is answered. */
export type ComposedFamily =
  ComposedVisualFamily | ComposedPuzzleFamily | ClosestFamily | BombFamily;

export const isComposedFamily = (
  familyKey: string | null | undefined,
): familyKey is ComposedFamily =>
  isComposedVisualFamily(familyKey) ||
  isComposedPuzzleFamily(familyKey) ||
  isComposedClosestFamily(familyKey) ||
  isComposedBombFamily(familyKey);

export const COMPOSED_VISUAL_WIDTH = 1200;
export const COMPOSED_VISUAL_HEIGHT = 675;

/** The line every composed item is answered on: a share of the whole. */
export const COMPOSED_SCALE_MIN = 0;
export const COMPOSED_SCALE_MAX = 100;

/**
 * Values a composed answer may take.
 *
 * The middle fifth is excluded for the reason the screen blocks it on every
 * between-anchors item — a mark left in the centre must not win — and the two
 * ends are excluded because an almost-empty or almost-full drawing is read at
 * a glance.
 */
export const COMPOSED_VALUES: readonly number[] = [
  ...Array.from({ length: 31 }, (_, index) => 8 + index), // 8..38
  ...Array.from({ length: 31 }, (_, index) => 62 + index), // 62..92
];

const PALETTE = {
  paper: '#F6F1E7',
  ink: '#1B1F3B',
  muted: '#C9C2B4',
  green: '#2FA866',
  amber: '#E3A224',
  red: '#D8493F',
  gold: '#E8B33A',
} as const;

export interface ComposedVisual {
  familyKey: ComposedVisualFamily;
  /** The share drawn, and therefore the answer. */
  value: number;
  /** Which drawing of the family this is. */
  variant: string;
  prompt: string;
  /** The slider the item is answered on, whole. */
  slider: Record<string, unknown>;
  altText: string;
  concept: string;
  factualClaim: string;
  svg: string;
}

/** Deterministic bytes from a seed: the same seed always draws the same item. */
function seedBytes(seed: string): Buffer {
  return createHash('sha256').update(seed).digest();
}

export function pickComposedValue(seed: string): number {
  const bytes = seedBytes(`${seed}:value`);
  return COMPOSED_VALUES[bytes.readUInt32BE(0) % COMPOSED_VALUES.length];
}

function pickVariant<T extends string>(
  seed: string,
  variants: readonly T[],
): T {
  return variants[
    seedBytes(`${seed}:variant`).readUInt32BE(0) % variants.length
  ];
}

const svgFrame = (body: string): string =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${COMPOSED_VISUAL_WIDTH}" height="${COMPOSED_VISUAL_HEIGHT}" viewBox="0 0 ${COMPOSED_VISUAL_WIDTH} ${COMPOSED_VISUAL_HEIGHT}">`,
    `<rect width="${COMPOSED_VISUAL_WIDTH}" height="${COMPOSED_VISUAL_HEIGHT}" fill="${PALETTE.paper}"/>`,
    body,
    '</svg>',
  ].join('');

const round = (value: number): number => Math.round(value * 100) / 100;

/** The colour a phone shows at that charge. A cue, never the answer. */
export function batteryColour(value: number): string {
  if (value < 20) return PALETTE.red;
  if (value < 50) return PALETTE.amber;
  return PALETTE.green;
}

export const BATTERY_VARIANTS = ['horizontal', 'vertical'] as const;

/**
 * A battery with no number on it.
 *
 * The charge is drawn as one solid block, never as segments: counted cells
 * would turn an estimate into arithmetic.
 */
export function batterySvg(
  value: number,
  variant: (typeof BATTERY_VARIANTS)[number],
): string {
  const stroke = 18;
  const inset = 16;
  const colour = batteryColour(value);
  if (variant === 'vertical') {
    const width = 250;
    const height = 470;
    const x = (COMPOSED_VISUAL_WIDTH - width) / 2;
    const y = 130;
    const innerHeight = height - 2 * (stroke / 2 + inset);
    const fill = round((innerHeight * value) / 100);
    const innerX = x + stroke / 2 + inset;
    const innerBottom = y + height - stroke / 2 - inset;
    return svgFrame(
      [
        `<rect x="${x + width / 2 - 55}" y="${y - 42}" width="110" height="50" rx="14" fill="${PALETTE.ink}"/>`,
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="38" fill="#FFFFFF" stroke="${PALETTE.ink}" stroke-width="${stroke}"/>`,
        `<rect data-role="charge" x="${innerX}" y="${round(innerBottom - fill)}" width="${width - 2 * (stroke / 2 + inset)}" height="${fill}" rx="14" fill="${colour}"/>`,
      ].join(''),
    );
  }
  const width = 760;
  const height = 300;
  const x = (COMPOSED_VISUAL_WIDTH - width) / 2 - 25;
  const y = (COMPOSED_VISUAL_HEIGHT - height) / 2;
  const innerWidth = width - 2 * (stroke / 2 + inset);
  const fill = round((innerWidth * value) / 100);
  return svgFrame(
    [
      `<rect x="${x + width - 8}" y="${y + height / 2 - 60}" width="50" height="120" rx="14" fill="${PALETTE.ink}"/>`,
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="44" fill="#FFFFFF" stroke="${PALETTE.ink}" stroke-width="${stroke}"/>`,
      `<rect data-role="charge" x="${x + stroke / 2 + inset}" y="${y + stroke / 2 + inset}" width="${fill}" height="${height - 2 * (stroke / 2 + inset)}" rx="16" fill="${colour}"/>`,
    ].join(''),
  );
}

export const MARK_VARIANTS = ['pin', 'dot'] as const;

/** Where the drawn line starts and how long it is, so tests can read it back. */
export const MARK_LINE = { x: 150, y: 360, length: 900 } as const;

/**
 * A plain line with one mark on it.
 *
 * No ticks and no midpoint: anything to count against would make it a ruler.
 */
export function markSvg(
  value: number,
  variant: (typeof MARK_VARIANTS)[number],
): string {
  const { x, y, length } = MARK_LINE;
  const markX = round(x + (length * value) / 100);
  const mark =
    variant === 'pin'
      ? `<path data-role="mark" data-x="${markX}" d="M ${markX} ${y - 14} l -44 -96 a 48 48 0 1 1 88 0 z" fill="${PALETTE.red}" stroke="${PALETTE.ink}" stroke-width="8" stroke-linejoin="round"/>`
      : `<circle data-role="mark" data-x="${markX}" cx="${markX}" cy="${y}" r="38" fill="${PALETTE.gold}" stroke="${PALETTE.ink}" stroke-width="10"/>`;
  return svgFrame(
    [
      `<line x1="${x}" y1="${y}" x2="${x + length}" y2="${y}" stroke="${PALETTE.ink}" stroke-width="16" stroke-linecap="round"/>`,
      `<line x1="${x}" y1="${y - 46}" x2="${x}" y2="${y + 46}" stroke="${PALETTE.ink}" stroke-width="16" stroke-linecap="round"/>`,
      `<line x1="${x + length}" y1="${y - 46}" x2="${x + length}" y2="${y + 46}" stroke="${PALETTE.ink}" stroke-width="16" stroke-linecap="round"/>`,
      mark,
    ].join(''),
  );
}

const shareSlider = (
  leftAnchor: string,
  rightAnchor: string,
): Record<string, unknown> => ({
  mode: 'between-anchors',
  min: COMPOSED_SCALE_MIN,
  max: COMPOSED_SCALE_MAX,
  step: 1,
  leftAnchor,
  rightAnchor,
});

// ---------------------------------------------------------------------------
// «تذكّر اللون»
// ---------------------------------------------------------------------------

/**
 * The saturation and lightness every hue is shown at.
 *
 * These are the phone's own numbers (`closest-colour.ts`): the colour drawn
 * here and the colour under the player's thumb at the same hue are one
 * colour, or the question has no right answer.
 */
export const COLOUR_SATURATION = 85;
export const COLOUR_LIGHTNESS = 50;

/** Hues an answer may take: every fifth degree round the wheel. */
export const COLOUR_HUE_STEP = 5;
export const COLOUR_HUES: readonly number[] = Array.from(
  { length: 360 / COLOUR_HUE_STEP },
  (_, index) => index * COLOUR_HUE_STEP,
);

/** How far apart, the short way round, two colours in one picture must be. */
export const COLOUR_MIN_SEPARATION = 90;

export const COLOUR_REVEAL_SECONDS = { single: 3, trio: 5 } as const;

/** hsl → #rrggbb, by the CSS definition, so a renderer needs no hsl support. */
export function hueHex(hue: number): string {
  const h = (((hue % 360) + 360) % 360) / 360;
  const s = COLOUR_SATURATION / 100;
  const l = COLOUR_LIGHTNESS / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    const wrapped = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    const value =
      wrapped < 1 / 6
        ? p + (q - p) * 6 * wrapped
        : wrapped < 1 / 2
          ? q
          : wrapped < 2 / 3
            ? p + (q - p) * (2 / 3 - wrapped) * 6
            : p;
    return Math.round(value * 255);
  };
  return `#${[channel(h + 1 / 3), channel(h), channel(h - 1 / 3)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Degrees between two hues, the short way round. */
export function hueSeparation(a: number, b: number): number {
  const around = Math.abs(a - b) % 360;
  return Math.min(around, 360 - around);
}

const OUTLINE = `stroke="${PALETTE.ink}" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"`;

/**
 * Things anyone can name at a glance, drawn in a 300×300 box about the
 * origin. Each is one flat colour with an ink outline — nothing that could be
 * mistaken for a character or a brand.
 */
export const COLOUR_OBJECTS: ReadonlyArray<{
  key: string;
  /** With the article, as it reads after «وش كان لون». */
  name: string;
  draw: (fill: string) => string;
}> = [
  {
    key: 'balloon',
    name: 'البالون',
    draw: (fill) =>
      `<path d="M0 88 q-26 30 6 58 q-30 26 -2 4" fill="none" ${OUTLINE}/>` +
      `<path d="M-16 92 l32 0 l-16 -22 z" fill="${fill}" ${OUTLINE}/>` +
      `<ellipse cx="0" cy="-34" rx="96" ry="112" fill="${fill}" ${OUTLINE}/>`,
  },
  {
    key: 'mug',
    name: 'الكوب',
    draw: (fill) =>
      `<path d="M64 -52 h28 a52 52 0 0 1 0 104 h-28" fill="none" ${OUTLINE}/>` +
      `<rect x="-104" y="-104" width="170" height="208" rx="24" fill="${fill}" ${OUTLINE}/>`,
  },
  {
    key: 'tshirt',
    name: 'التيشيرت',
    draw: (fill) =>
      `<path d="M-58 -118 q58 44 116 0 l84 58 l-42 52 l-30 -24 v162 h-140 v-162 l-30 24 l-42 -52 z" fill="${fill}" ${OUTLINE}/>`,
  },
  {
    key: 'umbrella',
    name: 'المظلة',
    draw: (fill) =>
      `<path d="M0 -20 v124 a22 22 0 0 0 44 0" fill="none" ${OUTLINE}/>` +
      `<path d="M-140 -10 a140 124 0 0 1 280 0 z" fill="${fill}" ${OUTLINE}/>`,
  },
  {
    key: 'gift',
    name: 'الهدية',
    draw: (fill) =>
      `<rect x="-108" y="-44" width="216" height="172" rx="10" fill="${fill}" ${OUTLINE}/>` +
      `<rect x="-124" y="-92" width="248" height="56" rx="10" fill="${fill}" ${OUTLINE}/>` +
      `<rect x="-17" y="-92" width="34" height="220" fill="#FFFFFF" ${OUTLINE}/>` +
      `<path d="M0 -92 q-70 -64 -78 -18 q4 30 78 18 q74 12 78 -18 q-8 -46 -78 18" fill="#FFFFFF" ${OUTLINE}/>`,
  },
  {
    key: 'kite',
    name: 'الطيارة الورقية',
    draw: (fill) =>
      `<path d="M0 118 q-34 26 -6 52 q30 22 -8 48" fill="none" ${OUTLINE}/>` +
      `<path d="M0 -140 l104 110 l-104 148 l-104 -148 z" fill="${fill}" ${OUTLINE}/>` +
      `<path d="M0 -140 v258 M-104 -30 h208" fill="none" ${OUTLINE}/>`,
  },
  {
    key: 'cap',
    name: 'الكاب',
    draw: (fill) =>
      `<rect x="64" y="42" width="136" height="38" rx="19" fill="${fill}" ${OUTLINE}/>` +
      `<path d="M-124 60 a124 124 0 0 1 248 0 z" fill="${fill}" ${OUTLINE}/>` +
      `<circle cx="0" cy="-64" r="12" fill="${PALETTE.ink}"/>`,
  },
  {
    key: 'ball',
    name: 'الكورة',
    draw: (fill) =>
      `<circle cx="0" cy="0" r="122" fill="${fill}" ${OUTLINE}/>` +
      `<path d="M-116 -38 q116 60 232 0 M-116 38 q116 -60 232 0" fill="none" ${OUTLINE}/>`,
  },
];

export const COLOUR_VARIANTS = ['single', 'trio'] as const;

export interface ColourScene {
  variant: (typeof COLOUR_VARIANTS)[number];
  /** Every thing in the picture, left to right, with its hue. */
  objects: Array<{ key: string; name: string; hue: number }>;
  /** Index into `objects` of the one asked about. */
  asked: number;
}

/** Decide what is drawn: which things, which colours, which one is asked. */
export function colourScene(seed: string): ColourScene {
  const bytes = seedBytes(`colour-recall:${seed}`);
  const variant = COLOUR_VARIANTS[bytes[0] % COLOUR_VARIANTS.length];
  const hue = COLOUR_HUES[bytes.readUInt16BE(1) % COLOUR_HUES.length];
  const first = bytes[3] % COLOUR_OBJECTS.length;
  if (variant === 'single') {
    const object = COLOUR_OBJECTS[first];
    return {
      variant,
      objects: [{ key: object.key, name: object.name, hue }],
      asked: 0,
    };
  }
  // Three different things, and three colours no two of which a player
  // could confuse: each at least a quarter of the wheel from the others.
  const second =
    (first + 1 + (bytes[4] % (COLOUR_OBJECTS.length - 1))) %
    COLOUR_OBJECTS.length;
  let third = bytes[5] % COLOUR_OBJECTS.length;
  while (third === first || third === second) {
    third = (third + 1) % COLOUR_OBJECTS.length;
  }
  const secondOffset = 90 + (bytes[6] % 11) * COLOUR_HUE_STEP; // 90..140
  const thirdOffset = 230 + (bytes[7] % 9) * COLOUR_HUE_STEP; // 230..270
  const picks = [
    { index: first, hue },
    { index: second, hue: (hue + secondOffset) % 360 },
    { index: third, hue: (hue + thirdOffset) % 360 },
  ];
  // Position must not tell which is asked: rotate the row by the seed.
  const rotation = bytes[8] % 3;
  const row = [0, 1, 2].map((slot) => picks[(slot + rotation) % 3]);
  return {
    variant,
    objects: row.map(({ index, hue: objectHue }) => ({
      key: COLOUR_OBJECTS[index].key,
      name: COLOUR_OBJECTS[index].name,
      hue: objectHue,
    })),
    asked: bytes[9] % 3,
  };
}

export function colourSceneSvg(scene: ColourScene): string {
  const placements =
    scene.objects.length === 1
      ? [{ x: 600, y: 330, scale: 1.55 }]
      : [
          { x: 215, y: 330, scale: 1.05 },
          { x: 600, y: 330, scale: 1.05 },
          { x: 985, y: 330, scale: 1.05 },
        ];
  return svgFrame(
    scene.objects
      .map((object, index) => {
        const { x, y, scale } = placements[index];
        const shape = COLOUR_OBJECTS.find((entry) => entry.key === object.key);
        return `<g data-object="${object.key}" data-hue="${object.hue}" transform="translate(${x} ${y}) scale(${scale})">${shape?.draw(hueHex(object.hue)) ?? ''}</g>`;
      })
      .join(''),
  );
}

function composeColourRecall(seed: string): ComposedVisual {
  const scene = colourScene(seed);
  const asked = scene.objects[scene.asked];
  return {
    familyKey: 'colour-recall',
    value: asked.hue,
    variant: `${scene.variant}:${scene.objects.map((object) => object.key).join('+')}:${asked.key}`,
    prompt: `وش كان لون ${asked.name}؟`,
    slider: {
      mode: 'colour-hue',
      min: 0,
      max: 360,
      step: 1,
      revealSeconds: COLOUR_REVEAL_SECONDS[scene.variant],
    },
    altText:
      scene.objects.length === 1
        ? 'رسمة لشيء واحد بلون واحد'
        : 'رسمة لثلاثة أشياء، كل واحد بلون',
    concept:
      scene.objects.length === 1
        ? 'Remember the exact colour of one drawn thing after it turns grey.'
        : 'Remember which of three colours belonged to one named thing after the picture turns grey.',
    factualClaim: `The ${asked.key} is drawn at hue ${asked.hue}° (${hueHex(asked.hue)}).`,
    svg: colourSceneSvg(scene),
  };
}

/**
 * Compose one item of a family from a seed.
 *
 * `seed` should identify the slot (job and ordinal), so a recovered job
 * redraws the same items instead of a new batch.
 */
export function composeVisual(
  familyKey: ComposedVisualFamily,
  seed: string,
): ComposedVisual {
  if (familyKey === 'colour-recall') return composeColourRecall(seed);
  const value = pickComposedValue(`${familyKey}:${seed}`);
  if (familyKey === 'battery-level') {
    const variant = pickVariant(`${familyKey}:${seed}`, BATTERY_VARIANTS);
    return {
      familyKey,
      value,
      variant,
      prompt: 'كم نسبة شحن هذا الجوال؟',
      slider: shareSlider('فاضية', 'مليانة'),
      altText: 'بطارية جوال مشحونة جزئيًا بدون رقم',
      concept:
        'Estimate a phone battery level from its drawing, with no number shown.',
      factualClaim: `The battery is drawn ${value}% full.`,
      svg: batterySvg(value, variant),
    };
  }
  const variant = pickVariant(`${familyKey}:${seed}`, MARK_VARIANTS);
  return {
    familyKey,
    value,
    variant,
    prompt: 'حط مؤشرك في نفس مكان العلامة على الخط.',
    slider: shareSlider('أول الخط', 'آخر الخط'),
    altText: 'خط أفقي عليه علامة واحدة',
    concept: 'Copy the position of a mark on a line onto the slider.',
    factualClaim: `The mark is drawn ${value}% of the way along the line.`,
    svg: markSvg(value, variant),
  };
}
