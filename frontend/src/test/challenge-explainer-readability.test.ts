import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

/**
 * Shared-screen readability for the challenge explainers.
 *
 * Measured on a 1920×1080 shared screen: the preview caption rendered at 11.5px
 * and the production (player) caption at 14px, and muted grey text failed AA
 * (4.15–4.42:1) on every tint and on `bg-muted`. These pin the corrections.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const components = "src/features/challenge-explainer/components";

describe("challenge explainer readability", () => {
  it("keeps muted text dark enough for AA on tints and muted surfaces", () => {
    // 45% lightness measured 4.15–4.42:1 there; 40% clears 4.5:1 on every
    // surface measured (white, cream, muted, success/error/gold tints).
    expect(read("src/app/globals.css")).toContain("--muted-foreground: 218 15% 40%;");
  });

  it("sets both compact step captions at body size on a shared screen", () => {
    const controls = read(`${components}/explainer-controls.tsx`);
    // The preview caption no longer shrinks to 0.72rem (11.5px).
    expect(controls).not.toMatch(/text-\[0\.72rem\]/);
    // Player (production dialog) and preview captions reach 16px from `sm`.
    const compactCaptions = controls.match(/"[^"]*text-sm[^"]*sm:text-base[^"]*"/g) ?? [];
    expect(compactCaptions.length).toBeGreaterThanOrEqual(2);
    // Each reserves its lines so steps do not jump.
    for (const classes of compactCaptions) expect(classes).toMatch(/\bmin-h-\[/);
  });

  it("writes team labels in navy and keeps the team on its border and tint", () => {
    const top5 = read(`${components}/top5-explainer.tsx`);
    const ryo = read(`${components}/ryo-explainer.tsx`);
    // A team hue is not guaranteed 4.5:1 on its own 12% tint (measured 3.75–3.95).
    expect(top5).not.toMatch(/teamIdentity\("team-[ab]"\)\.text/);
    expect(top5).toMatch(/teamIdentity\("team-b"\)\.border,\s*teamIdentity\("team-b"\)\.surface,\s*"text-foreground"/);
    expect(ryo).toMatch(/identity\.border,\s*identity\.surface,\s*\/\/[^\n]*\n\s*"text-foreground"/);
  });

  it("keeps result lines on success tints at body contrast", () => {
    expect(read(`${components}/closest-explainer.tsx`)).toMatch(/text-foreground">\s*\+1 في حصيلة التحدي الداخلية/);
    expect(read(`${components}/top5-explainer.tsx`)).not.toMatch(/text-sem-success sm:text-lg/);
  });
});
