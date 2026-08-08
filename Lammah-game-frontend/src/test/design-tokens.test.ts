import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { teamIdentity, TEAM_TONE_ORDER } from "@/lib/team-identity";

/**
 * The design tokens exist, and Tailwind can actually see them.
 *
 * Two failures this pins, both of which shipped once:
 *
 *  - Team utility classes are written *only* in `src/lib/team-identity.ts`. That
 *    directory was missing from Tailwind's `content` globs, so every class was
 *    emitted into the markup and never into the CSS: team colour resolved to
 *    transparent everywhere, silently, with no build error.
 *
 *  - The retired purple identity must stay retired. A token file is the one
 *    place it could quietly come back.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Tailwind can see every file that writes utility classes", () => {
  it("includes the semantic layer in its content globs", () => {
    const config = read("tailwind.config.ts");
    expect(config).toMatch(/\.\/src\/lib\/\*\*/);
  });

  it("declares every team utility the identity layer emits", () => {
    const config = read("tailwind.config.ts");
    for (const tone of TEAM_TONE_ORDER) {
      const identity = teamIdentity(tone);
      // Each class maps to a token the config actually defines.
      for (const className of [
        identity.surface,
        identity.border,
        identity.text,
        identity.dot,
        identity.ring,
      ]) {
        const token = className.replace(/^(bg|text|border|ring)-/, "");
        const [, , key] = token.split("-");
        expect(config).toContain(`team-${tone}${key ? `-${key}` : ""}`);
      }
    }
  });
});

describe("the retired identity stays retired", () => {
  it("defines no purple anywhere in the token set", () => {
    const css = read("src/app/globals.css");
    // The old canvas, header and glow values.
    for (const retired of ["#130d27", "#211a38", "#110b25", "139, 92, 246"]) {
      expect(css).not.toContain(retired);
    }
    // Purple hues live around 260-290; the palette is navy, green and coral.
    const hues = [...css.matchAll(/--[a-z-]+:\s*(\d+)\s+\d+%\s+\d+%/g)].map(
      (match) => Number(match[1]),
    );
    expect(hues.filter((hue) => hue >= 255 && hue <= 300)).toEqual([]);
  });

  it("keeps the app background warm rather than pure white", () => {
    const css = read("src/app/globals.css");
    const background = css.match(/--background:\s*(\d+)\s+(\d+)%\s+(\d+)%/);
    expect(background).not.toBeNull();
    const [, hue, saturation, lightness] = background!.map(Number);
    // A warm hue with real saturation, just below white.
    expect(hue).toBeGreaterThanOrEqual(20);
    expect(hue).toBeLessThanOrEqual(60);
    expect(saturation).toBeGreaterThan(10);
    expect(lightness).toBeGreaterThanOrEqual(92);
    expect(lightness).toBeLessThan(100);
  });

  it("keeps team surfaces distinguishable from the room", () => {
    const css = read("src/app/globals.css");
    const lightnessOf = (token: string) =>
      Number(css.match(new RegExp(`${token}:\\s*\\d+\\s+\\d+%\\s+(\\d+)%`))![1]);
    const room = lightnessOf("--background");
    // A team surface that sits within a couple of points of the room reads as
    // plain white, which is exactly how the first pass looked.
    for (const token of ["--team-green-surface", "--team-coral-surface"]) {
      expect(room - lightnessOf(token)).toBeGreaterThanOrEqual(4);
    }
  });
});
