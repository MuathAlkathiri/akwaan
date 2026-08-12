import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  defaultTeamColorId,
  hueDistance,
  MINIMUM_INTER_TEAM_HUE_DISTANCE,
  MINIMUM_RESERVED_HUE_DISTANCE,
  MINIMUM_TEXT_CONTRAST,
  RESERVED_COLORS,
  resolveTeamColor,
  TEAM_COLORS,
  teamColorPool,
  teamColorViolations,
  teamPairViolations,
  THEME_BACKGROUNDS,
} from "@/lib/team-palette";

/**
 * The palette rules, verified rather than eyeballed.
 *
 * A palette edit fails silently: nothing throws, the game simply stops being
 * readable across a room, or a team colour starts meaning "correct". These are the
 * assertions that make such an edit fail loudly instead.
 */
describe("team colour pools", () => {
  it("gives each team its own pool, so no pair of picks can collide", () => {
    expect(teamColorPool(0).every((color) => color.pool === "cool")).toBe(true);
    expect(teamColorPool(1).every((color) => color.pool === "warm")).toBe(true);
    expect(teamColorPool(0).length).toBeGreaterThanOrEqual(3);
    expect(teamColorPool(1).length).toBeGreaterThanOrEqual(3);
  });

  it("keeps every selectable colour clear of the reserved meanings and legible in both themes", () => {
    const problems = TEAM_COLORS.flatMap(teamColorViolations);
    expect(problems).toEqual([]);
  });

  it("keeps any legal pair of picks at least 60° apart", () => {
    const problems = teamColorPool(0).flatMap((first) =>
      teamColorPool(1).flatMap((second) => teamPairViolations(first, second)),
    );
    expect(problems).toEqual([]);
  });

  it("excludes the yellow and olive families, which fail on cream and collide with gold", () => {
    // 20–140° is the amber-through-olive arc: yellows cannot reach 4.5:1 against a
    // cream background at any usable saturation, and olives sit between reserved
    // gold and reserved success.
    for (const color of TEAM_COLORS) {
      const inYellowOliveArc = color.base.hue >= 20 && color.base.hue <= 140;
      expect(inYellowOliveArc, `${color.id} is in the yellow/olive arc`).toBe(false);
    }
  });

  it("refuses a pick from the other team's pool rather than honouring it", () => {
    // A stale draft naming the other team's colour would put both teams in one
    // hue arc, which is the single thing the pools exist to prevent.
    expect(resolveTeamColor(0, "magenta").id).toBe(defaultTeamColorId(0));
    expect(resolveTeamColor(1, "indigo").id).toBe(defaultTeamColorId(1));
    expect(resolveTeamColor(0, "azure").id).toBe("azure");
  });
});

describe("reserved colours", () => {
  it("separates error from the team reds by lightness rather than hue", () => {
    // This is what frees the warm end of the spectrum for teams at all: error is a
    // deep crimson, so a *light* rose can share its hue and still not be mistaken
    // for it. The pool is expected to actually use that freedom — a warm pool with
    // no colour near the error hue would mean the arc was abandoned instead.
    const shareErrorHue = TEAM_COLORS.filter(
      (color) =>
        hueDistance(color.base.hue, RESERVED_COLORS.error.hue) <
        MINIMUM_RESERVED_HUE_DISTANCE,
    );
    expect(shareErrorHue.length).toBeGreaterThan(0);
    for (const red of shareErrorHue) {
      expect(
        red.base.lightness - RESERVED_COLORS.error.lightness,
        `${red.id} is as dark as --sem-error`,
      ).toBeGreaterThanOrEqual(10);
    }
  });

  it("keeps the reveal's own text legible on the reveal", () => {
    // A reveal *covers* the room rather than sitting in it, so the pairing that
    // has to clear 4.5:1 is the reveal colour against the text printed on it —
    // not the reveal against a background it hides. This is also why the two
    // tokens do not change between themes.
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const foreground = css.match(
      /--sem-reveal-foreground:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/,
    );
    expect(foreground).not.toBeNull();
    const [, hue, saturation, lightness] = foreground!.map(Number);
    const onReveal = { hue, saturation, lightness };
    for (const role of ["success", "error"] as const) {
      expect(
        contrastRatio(RESERVED_COLORS[role], onReveal),
        `--sem-${role} against its own foreground`,
      ).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
    }
  });
});

/**
 * The palette is written twice — once as numbers here, once as CSS custom
 * properties — because CSS cannot import TypeScript. That is tolerable only while
 * something checks the two agree.
 */
describe("the token layer matches the palette module", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const declaration = (token: string, scope: "root" | "dark") => {
    const block = scope === "root" ? css.split(".dark")[0] : css.slice(css.indexOf(".dark {"));
    const match = block.match(
      new RegExp(`${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`),
    );
    expect(match, `${token} missing from the ${scope} scope`).not.toBeNull();
    const [, hue, saturation, lightness] = match!.map(Number);
    return { hue, saturation, lightness };
  };

  it("emits base, on-light, on-dark and tint for both teams", () => {
    for (const slot of [1, 2]) {
      for (const suffix of ["base", "on-light", "on-dark"]) {
        expect(css).toContain(`--team-${slot}-${suffix}:`);
      }
      // The tint is an alpha of the base, so it is written as a colour, not a
      // triplet — hard-coding a fourth hue is how a tint drifts off its team.
      expect(css).toMatch(
        new RegExp(`--team-${slot}-tint:\\s*hsl\\(var\\(--team-${slot}-base\\)`),
      );
    }
  });

  it("uses the default pool colours for the two teams", () => {
    const first = resolveTeamColor(0, undefined);
    const second = resolveTeamColor(1, undefined);
    expect(declaration("--team-1-base", "root")).toEqual(first.base);
    expect(declaration("--team-2-base", "root")).toEqual(second.base);
    expect(declaration("--team-1-on-light", "root")).toEqual(first.onLight);
    expect(declaration("--team-2-on-light", "root")).toEqual(second.onLight);
    expect(declaration("--team-1-on-dark", "root")).toEqual(first.onDark);
    expect(declaration("--team-2-on-dark", "root")).toEqual(second.onDark);
  });

  it("declares the reserved semantic colours once, under their reserved names", () => {
    expect(declaration("--sem-success", "root")).toEqual(RESERVED_COLORS.success);
    expect(declaration("--sem-error", "root")).toEqual(RESERVED_COLORS.error);
    expect(declaration("--brand-gold", "root")).toEqual(RESERVED_COLORS.gold);
    // shadcn's primitives keep working by aliasing, not by holding a second value.
    expect(css).toMatch(/--success:\s*var\(--sem-success\)/);
    expect(css).toMatch(/--destructive:\s*var\(--sem-error\)/);
  });

  it("uses the dark room the palette was verified against", () => {
    expect(declaration("--background", "dark")).toEqual(THEME_BACKGROUNDS.dark);
  });

  it("keeps the reserved hue distance true of the tokens actually shipped", () => {
    for (const slot of [1, 2]) {
      const base = declaration(`--team-${slot}-base`, "root");
      for (const role of ["success", "gold"] as const) {
        expect(
          hueDistance(base.hue, RESERVED_COLORS[role].hue),
        ).toBeGreaterThanOrEqual(MINIMUM_RESERVED_HUE_DISTANCE);
      }
    }
    expect(
      hueDistance(
        declaration("--team-1-base", "root").hue,
        declaration("--team-2-base", "root").hue,
      ),
    ).toBeGreaterThanOrEqual(MINIMUM_INTER_TEAM_HUE_DISTANCE);
  });
});
