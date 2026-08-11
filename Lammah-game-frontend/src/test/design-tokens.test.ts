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
 *  - Brand colours and gameplay team colours must remain separate. A token
 *    file is the one place those responsibilities could quietly blur.
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

describe("the semantic typography experiment", () => {
  it("loads one display face and one body face through Next font variables", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("Noto_Kufi_Arabic");
    expect(layout).toContain("Readex_Pro");
    expect(layout).toContain('variable: "--font-display"');
    expect(layout).toContain('variable: "--font-body"');
  });

  it("maps headings to display and ordinary UI to body without changing scale", () => {
    const css = read("src/app/globals.css");
    const config = read("tailwind.config.ts");
    expect(config).toContain('display: ["var(--font-display)"');
    expect(config).toContain('body: ["var(--font-body)"');
    expect(css).toMatch(/h1,\s*\n\s*h2,\s*\n\s*h3\s*\{\s*\n\s*@apply font-display/);
    expect(css).toContain("@apply font-body");
    expect(css).toMatch(/\.akwaan-numeral\s*\{\s*\n\s*font-family: var\(--font-body\)/);
  });
});

describe("the canonical Akwaan brand asset", () => {
  it("uses the primary logo on active player-facing brand surfaces", () => {
    for (const path of [
      "src/components/layout/header.tsx",
      "src/features/live-game-session/match/components/match-shell.tsx",
      "src/features/live-game-session/components/player-join-page.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain('/brand/akwaan-logo.png');
      expect(source).not.toContain('/brand/lammah-logo.png');
    }
  });
});

describe("the retired identity stays retired", () => {
  it("does not restore the retired purple canvas or glow", () => {
    const css = read("src/app/globals.css");
    // The old canvas, header and glow values.
    for (const retired of ["#130d27", "#211a38", "#110b25", "139, 92, 246"]) {
      expect(css).not.toContain(retired);
    }
  });

  it("exposes the approved Akwaan palette without changing team semantics", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--brand-navy: 239 40% 17%");
    expect(css).toContain("--brand-purple: 247 100% 71%");
    expect(css).toContain("--brand-cyan: 188 49% 54%");
    expect(css).toContain("--brand-gold: 40 57% 63%");
    expect(css).toContain("--team-green: 152 55% 36%");
    expect(css).toContain("--team-coral: 348 72% 57%");
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
