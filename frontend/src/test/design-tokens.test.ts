import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { teamIdentity, TEAM_SLOT_ORDER } from "@/lib/team-identity";

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
    for (const slot of TEAM_SLOT_ORDER) {
      const identity = teamIdentity(slot);
      // Each class maps to a token the config actually defines. `solid` carries
      // two classes, so it is split before checking.
      const classes = [
        identity.surface,
        identity.border,
        identity.text,
        identity.dot,
        identity.ring,
        ...identity.solid.split(" "),
      ];
      for (const className of classes) {
        const token = className.replace(/^(bg|text|border|ring)-/, "");
        expect(token.startsWith(`team-${slot}-`)).toBe(true);
        // `team-1-fill-foreground` is declared as a quoted key.
        const key = token.slice(`team-${slot}-`.length);
        expect(config).toMatch(
          new RegExp(`"?${key}"?:\\s*"(hsl\\()?var\\(--team-${slot}-${key}\\)`),
        );
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
  });

  it("keeps hue names out of the team token layer", () => {
    // A team is slot 1 or slot 2 and its colour is the host's pick. A token named
    // after a hue cannot survive a recolour, and is how "the green team" got back
    // into the copy last time.
    const css = read("src/app/globals.css");
    for (const hue of ["--team-green", "--team-coral", "--team-pink"]) {
      expect(css).not.toContain(hue);
    }
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

  it("tints team surfaces from the team's own base rather than a fourth hue", () => {
    // A surface that sits within a couple of points of the room reads as plain
    // white, which is how the first pass looked; deriving it from the base as an
    // alpha keeps the step honest *and* keeps it on the team's own hue after a
    // recolour.
    const css = read("src/app/globals.css");
    for (const slot of [1, 2]) {
      expect(css).toMatch(
        new RegExp(`--team-${slot}-tint:\\s*hsl\\(var\\(--team-${slot}-base\\)\\s*/\\s*0\\.1`),
      );
    }
  });
});
