import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("keeps team identity off the preflight surfaces", () => {
  const source = readFileSync(
    "src/features/live-game-session/match/components/challenge-preflight.tsx",
    "utf8",
  );
  expect(source).toContain(".dot");
  expect(source).not.toMatch(/\.surface|\.solid|bg-team-[12]-/);
});
