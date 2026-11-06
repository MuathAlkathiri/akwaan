import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

/**
 * Colour rules for the challenge explainers, which run on the shared screen.
 *
 * `semantic-colour-scope.test.ts` pins the Match surfaces; the explainers are a
 * separate scope with two failure modes that shipped once and were measured:
 *
 *  - Brand gold as readable text on the cream room measured 1.7–2.0:1. Gold stays
 *    an accent (tints, borders, icons) and never carries a sentence.
 *  - Correct/wrong feedback written in raw Tailwind greens drifted below AA
 *    (`emerald-600` measured 3.77:1) and away from the reserved semantic tokens.
 */
const dir = resolve(process.cwd(), "src/features/challenge-explainer/components");
const files = readdirSync(dir).filter((f) => f.endsWith("-explainer.tsx"));
const read = (file: string) => readFileSync(resolve(dir, file), "utf8");

describe("challenge explainer colour", () => {
  it("covers every mechanic explainer", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it("uses brand gold for text only on icons, never on a sentence", () => {
    for (const file of files) {
      read(file)
        .split("\n")
        .forEach((line, index) => {
          // `dark:text-brand-gold` is a dark-theme variant, not light-room text.
          if (/(^|[^:\w-])text-brand-gold\b/.test(line)) {
            expect(line, `${file}:${index + 1}`).toMatch(/\bsize-/);
          }
        });
    }
  });

  it("never writes correct feedback in the low-contrast emerald-600", () => {
    for (const file of files) {
      expect(read(file), file).not.toMatch(/\btext-emerald-600\b/);
    }
  });

  it("states a team's outcome with the semantic tokens", () => {
    const source = read("odd-piece-explainer.tsx");
    expect(source).toMatch(/lost && "text-destructive"/);
    expect(source).toMatch(/winner && "text-success\b/);
  });

  it("keeps Combo's tinted risk and outcome copy at body contrast", () => {
    const source = read("combo-explainer.tsx");
    // Muted grey and sem-success text both measured ~4.3:1 on the 10% semantic
    // tints; the tint and border carry the meaning, the text stays legible.
    expect(source).toMatch(/text-foreground">\s*اسحب \{points\}/);
    expect(source).toMatch(/text-foreground">\s*تضمن \{points\}/);
    expect(source).toMatch(/text-foreground">\s*ضاعت النقطتان/);
  });
});
