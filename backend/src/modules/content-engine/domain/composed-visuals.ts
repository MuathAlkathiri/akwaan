import { createHash } from 'crypto';

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
] as const;

export type ComposedVisualFamily = (typeof COMPOSED_VISUAL_FAMILIES)[number];

export const isComposedVisualFamily = (
  familyKey: string | null | undefined,
): familyKey is ComposedVisualFamily =>
  (COMPOSED_VISUAL_FAMILIES as readonly string[]).includes(familyKey ?? '');

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
  leftAnchor: string;
  rightAnchor: string;
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
  const value = pickComposedValue(`${familyKey}:${seed}`);
  if (familyKey === 'battery-level') {
    const variant = pickVariant(`${familyKey}:${seed}`, BATTERY_VARIANTS);
    return {
      familyKey,
      value,
      variant,
      prompt: 'كم نسبة شحن هذا الجوال؟',
      leftAnchor: 'فاضية',
      rightAnchor: 'مليانة',
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
    leftAnchor: 'أول الخط',
    rightAnchor: 'آخر الخط',
    altText: 'خط أفقي عليه علامة واحدة',
    concept: 'Copy the position of a mark on a line onto the slider.',
    factualClaim: `The mark is drawn ${value}% of the way along the line.`,
    svg: markSvg(value, variant),
  };
}
