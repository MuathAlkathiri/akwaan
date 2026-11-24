/**
 * «تذكّر اللون» — a مين أقرب question whose answer is a colour.
 *
 * The value that travels is a hue in degrees. Everything a player sees is drawn
 * from that one number at a fixed saturation and lightness, so the swatch on the
 * phone, the marker on the reveal and the track itself can never disagree about
 * what "210" looks like.
 */
export const CLOSEST_COLOUR_MODE = "colour-hue" as const;

const SATURATION = 85;
const LIGHTNESS = 50;

/** The colour a hue stands for, wrapped onto the wheel. */
export function hueColour(hue: number): string {
  const wrapped = ((hue % 360) + 360) % 360;
  return `hsl(${Math.round(wrapped)} ${SATURATION}% ${LIGHTNESS}%)`;
}

/**
 * The slider's track: the whole wheel laid flat, red at both ends.
 *
 * Seven stops, not two — a two-stop gradient between the same red is a single
 * flat colour.
 */
export const HUE_TRACK = `linear-gradient(to right, ${[
  0, 60, 120, 180, 240, 300, 360,
]
  .map((hue) => hueColour(hue === 360 ? 0 : hue))
  .join(", ")})`;

/** Degrees between two hues, the short way round. */
export function hueDistance(a: number, b: number): number {
  const around = Math.abs(a - b) % 360;
  return Math.min(around, 360 - around);
}
