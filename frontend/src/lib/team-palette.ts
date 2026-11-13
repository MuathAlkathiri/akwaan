/**
 * The team colour palette, and the rules that keep it legible.
 *
 * Two responsibilities live here and nowhere else:
 *
 *  1. **Which colours a team may be.** Each team picks from its own pool — one
 *     cool, one warm. The split is not decoration: it guarantees hue separation
 *     between the two teams by construction, so no pair of picks can ever be
 *     confusable, and it keeps both teams distinguishable under the common forms
 *     of colour vision deficiency.
 *
 *  2. **Which colours a team may never be.** Success, error and brand gold are
 *     *reserved*. A green team makes a reveal unreadable — at the moment an answer
 *     resolves, a green element has to mean "correct", not "team one". Gold means
 *     system chrome (the timer). A team colour that sits near any of the three
 *     borrows a meaning it does not own.
 *
 * The constraints are asserted in code rather than trusted to the eye, because the
 * failure mode of a palette edit is silent: nothing breaks, the game simply stops
 * being readable across a room. See `src/test/team-palette.test.ts`.
 *
 * This module is the only place a team colour is written as a number. The screens
 * read `src/lib/team-identity.ts`, which resolves to CSS tokens.
 */

/** A colour in the HSL triplet form the token layer speaks. */
export interface Hsl {
  hue: number;
  saturation: number;
  lightness: number;
}

/**
 * Colours that carry a fixed meaning, and are therefore never selectable.
 *
 * `error` is deliberately deep rather than a bright red: separating error from the
 * team reds by *lightness* instead of hue is what frees the warm end of the
 * spectrum for teams at all.
 */
export const RESERVED_COLORS = {
  /**
   * Full-surface "correct" reveal only — never persistent chrome.
   *
   * Darker than a typical mint on purpose: at the mint end it cannot carry legible
   * text and it cannot be told from the cream room, so it fails in both directions.
   */
  success: { hue: 160, saturation: 69, lightness: 29 },
  /** Full-surface "wrong" reveal only — never persistent chrome. */
  error: { hue: 351, saturation: 63, lightness: 38 },
  /** Timer, system chrome and brand. */
  gold: { hue: 40, saturation: 57, lightness: 63 },
} as const satisfies Record<string, Hsl>;

/** The two backgrounds every team colour has to stay legible against. */
export const THEME_BACKGROUNDS = {
  /** The warm off-white room. */
  light: { hue: 43, saturation: 38, lightness: 95 },
  /** The shared screen's default: dark enough for a 40-minute session on a TV. */
  dark: { hue: 236, saturation: 42, lightness: 7 },
} as const satisfies Record<string, Hsl>;

export type TeamPoolKey = "cool" | "warm";

export interface TeamColor {
  /** Stable identifier — this is what a host's pick is stored as. */
  id: string;
  /** The pool this colour belongs to, and therefore which team may pick it. */
  pool: TeamPoolKey;
  /** Arabic label for the picker. */
  label: string;
  /** The chosen hue: solid fills, bars, dots, borders. */
  base: Hsl;
  /** Darkened, for text and icons on the light room. */
  onLight: Hsl;
  /** Lightened, for text and icons on the dark room. */
  onDark: Hsl;
}

/**
 * The pools.
 *
 * `onLight` / `onDark` are not guesses: each is the nearest lightness to the base
 * that clears 4.5:1 against its background, computed once and pinned by test. The
 * base itself is left as chosen so a team's fills stay the colour the host picked.
 *
 * **Coral / orange is absent on purpose.** Every orange sits within ~25° of brand
 * gold, so an orange team bar and the gold timer read as the same colour across a
 * room. The warm pool therefore lives in the magenta-to-rose arc, which clears
 * gold by 50°+ and clears the deep error crimson by lightness.
 */
export const TEAM_COLORS: readonly TeamColor[] = [
  {
    id: "indigo",
    pool: "cool",
    label: "نيلي",
    base: { hue: 232, saturation: 53, lightness: 50 },
    onLight: { hue: 232, saturation: 53, lightness: 50 },
    onDark: { hue: 232, saturation: 53, lightness: 72 },
  },
  {
    id: "azure",
    pool: "cool",
    label: "أزرق سماوي",
    base: { hue: 205, saturation: 70, lightness: 48 },
    onLight: { hue: 205, saturation: 70, lightness: 40 },
    onDark: { hue: 205, saturation: 70, lightness: 60 },
  },
  {
    id: "violet",
    pool: "cool",
    label: "بنفسجي",
    base: { hue: 254, saturation: 84, lightness: 64 },
    onLight: { hue: 254, saturation: 84, lightness: 58 },
    onDark: { hue: 254, saturation: 84, lightness: 74 },
  },
  {
    id: "magenta",
    pool: "warm",
    label: "أرجواني",
    base: { hue: 324, saturation: 58, lightness: 50 },
    onLight: { hue: 324, saturation: 58, lightness: 48 },
    onDark: { hue: 324, saturation: 58, lightness: 68 },
  },
  {
    id: "pink",
    pool: "warm",
    label: "زهري",
    base: { hue: 332, saturation: 84, lightness: 64 },
    onLight: { hue: 332, saturation: 84, lightness: 45 },
    onDark: { hue: 332, saturation: 84, lightness: 70 },
  },
  {
    id: "rose",
    pool: "warm",
    label: "وردي داكن",
    base: { hue: 347, saturation: 72, lightness: 59 },
    onLight: { hue: 347, saturation: 72, lightness: 48 },
    onDark: { hue: 347, saturation: 72, lightness: 68 },
  },
];

/**
 * Which pool a team draws from, by its position in the Match's own team list.
 *
 * Team order is server-ordered and stable for the life of a Match, so a refresh
 * cannot swap the pools either.
 */
export const TEAM_POOL_ORDER: readonly TeamPoolKey[] = ["cool", "warm"];

/** The colours the team at this position may choose between. */
export function teamColorPool(teamIndex: number): readonly TeamColor[] {
  const pool = TEAM_POOL_ORDER[teamIndex % TEAM_POOL_ORDER.length];
  return TEAM_COLORS.filter((color) => color.pool === pool);
}

/** The colour a team gets when the host has not picked one. */
export function defaultTeamColorId(teamIndex: number): string {
  return teamColorPool(teamIndex)[0].id;
}

/**
 * The colour a stored pick resolves to.
 *
 * A pick from the wrong pool — a stale draft, a hand-edited store — falls back to
 * the position's default rather than being honoured: honouring it could put both
 * teams in the same hue arc, which is the one thing the pools exist to prevent.
 */
export function resolveTeamColor(
  teamIndex: number,
  colorId: string | undefined,
): TeamColor {
  const pool = teamColorPool(teamIndex);
  return pool.find((color) => color.id === colorId) ?? pool[0];
}

export function teamColorById(colorId: string): TeamColor | undefined {
  return TEAM_COLORS.find((color) => color.id === colorId);
}

/**
 * The host's picks, as the CSS custom properties every component already reads.
 *
 * This is the whole application mechanism: one element near the root of a Match
 * carries these variables, and `--team-1-tint`, `--team-1-text`, `--team-1-fill` and
 * every utility built on them resolve to the chosen hue on that client. No component
 * learns which colour was picked, and no component holds a hex.
 *
 * `text` and `fill` are deliberately *not* set here — they are theme resolutions of
 * `on-light` / `on-dark` declared in the token layer, so setting the two source
 * variables is what lets the same pick render correctly in both rooms.
 */
export function teamColorVariables(
  teams: ReadonlyArray<{ colorId?: string }>,
): Record<string, string> {
  const variables: Record<string, string> = {};
  TEAM_POOL_ORDER.forEach((_pool, index) => {
    const color = resolveTeamColor(index, teams[index]?.colorId);
    const slot = index + 1;
    variables[`--team-${slot}-base`] = triplet(color.base);
    variables[`--team-${slot}-on-light`] = triplet(color.onLight);
    variables[`--team-${slot}-on-dark`] = triplet(color.onDark);
  });
  return variables;
}

/** The `H S% L%` form the token layer stores, so `hsl(var(--token) / a)` works. */
function triplet({ hue, saturation, lightness }: Hsl): string {
  return `${hue} ${saturation}% ${lightness}%`;
}

/* ── Colour maths ──────────────────────────────────────────────────────────
   Small, exact, and used by the constraint tests as well as the picker. There is
   no second copy of this in the codebase; add one and the palette can drift from
   the rule that is supposed to police it.                                     */

/** The shorter way round the colour wheel, in degrees. */
export function hueDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

export function hslToRgb({ hue, saturation, lightness }: Hsl): [number, number, number] {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [channel(0) * 255, channel(8) * 255, channel(4) * 255];
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two colours. */
export function contrastRatio(a: Hsl, b: Hsl): number {
  const first = relativeLuminance(hslToRgb(a));
  const second = relativeLuminance(hslToRgb(b));
  return (
    (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
  );
}

/* ── The hard constraints ─────────────────────────────────────────────────── */

/** Text and icons must clear this against the background they sit on. */
export const MINIMUM_TEXT_CONTRAST = 4.5;
/** A team colour this close to success or gold borrows a meaning it does not own. */
export const MINIMUM_RESERVED_HUE_DISTANCE = 40;
/** Two teams closer than this are not reliably tellable apart across a room. */
export const MINIMUM_INTER_TEAM_HUE_DISTANCE = 60;
/**
 * Error is separated from the team reds by lightness, not hue, so a warm team
 * colour clears it on *either* axis.
 */
export const MINIMUM_ERROR_HUE_DISTANCE = 18;
export const MINIMUM_ERROR_LIGHTNESS_DISTANCE = 18;

/** Every way a candidate team colour can be wrong, in plain Arabic-free terms. */
export function teamColorViolations(color: TeamColor): string[] {
  const problems: string[] = [];
  for (const role of ["success", "gold"] as const) {
    const distance = hueDistance(color.base.hue, RESERVED_COLORS[role].hue);
    if (distance < MINIMUM_RESERVED_HUE_DISTANCE) {
      problems.push(
        `${color.id} is ${distance.toFixed(0)}° from --sem-${role === "gold" ? "brand-gold" : role}, under the ${MINIMUM_RESERVED_HUE_DISTANCE}° reserve`,
      );
    }
  }
  const errorHue = hueDistance(color.base.hue, RESERVED_COLORS.error.hue);
  const errorLightness = Math.abs(
    color.base.lightness - RESERVED_COLORS.error.lightness,
  );
  if (
    errorHue < MINIMUM_ERROR_HUE_DISTANCE &&
    errorLightness < MINIMUM_ERROR_LIGHTNESS_DISTANCE
  ) {
    problems.push(
      `${color.id} is confusable with --sem-error on both hue and lightness`,
    );
  }
  const onLight = contrastRatio(color.onLight, THEME_BACKGROUNDS.light);
  if (onLight < MINIMUM_TEXT_CONTRAST) {
    problems.push(
      `${color.id} on-light is ${onLight.toFixed(2)}:1 on the light room`,
    );
  }
  const onDark = contrastRatio(color.onDark, THEME_BACKGROUNDS.dark);
  if (onDark < MINIMUM_TEXT_CONTRAST) {
    problems.push(
      `${color.id} on-dark is ${onDark.toFixed(2)}:1 on the dark room`,
    );
  }
  return problems;
}

/** Whether a pair of picks keeps the two teams tellable apart. */
export function teamPairViolations(first: TeamColor, second: TeamColor): string[] {
  const distance = hueDistance(first.base.hue, second.base.hue);
  return distance < MINIMUM_INTER_TEAM_HUE_DISTANCE
    ? [
        `${first.id} and ${second.id} are ${distance.toFixed(0)}° apart, under the ${MINIMUM_INTER_TEAM_HUE_DISTANCE}° minimum`,
      ]
    : [];
}
