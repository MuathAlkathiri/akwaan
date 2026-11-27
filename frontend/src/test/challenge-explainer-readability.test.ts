import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("keeps captions and playback controls outside the scaled scene", () => {
  const template = readFileSync(
    "src/features/challenge-explainer/scene-template.tsx",
    "utf8",
  );
  expect(template.indexOf("styles.caption")).toBeGreaterThan(
    template.indexOf("</ScaledSurface>"),
  );
  expect(template.indexOf("styles.controls")).toBeGreaterThan(
    template.indexOf("styles.caption"),
  );
});
