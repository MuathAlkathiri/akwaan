import { describe, expect, it } from "vitest";
import { planSplit } from "@/features/live-game-session/plan-split";

const base = { firstTeamId: "t1", secondTeamId: "t2" };

const settle = (
  firstSide: string[],
  secondSide: string[],
  unplaced: string[],
) => {
  const moves = planSplit({ ...base, firstSide, secondSide, unplaced });
  const sides = new Map<string, string | undefined>();
  firstSide.forEach((id) => sides.set(id, "t1"));
  secondSide.forEach((id) => sides.set(id, "t2"));
  unplaced.forEach((id) => sides.set(id, undefined));
  moves.forEach((move) => sides.set(move.participantId, move.teamId));
  return {
    moves,
    first: [...sides].filter(([, team]) => team === "t1").map(([id]) => id),
    second: [...sides].filter(([, team]) => team === "t2").map(([id]) => id),
    homeless: [...sides].filter(([, team]) => !team).map(([id]) => id),
  };
};

describe("planSplit", () => {
  it("leaves an even room alone", () => {
    expect(planSplit({ ...base, firstSide: ["a", "b"], secondSide: ["c", "d"], unplaced: [] })).toEqual([]);
  });

  it("hands out everyone who never chose", () => {
    const result = settle([], [], ["a", "b", "c"]);
    expect(result.homeless).toEqual([]);
    expect(result.first).toHaveLength(2);
    expect(result.second).toHaveLength(1);
  });

  it("evens out a lopsided room", () => {
    const result = settle(["a", "b", "c", "d", "e"], ["f"], []);
    expect(result.first).toHaveLength(3);
    expect(result.second).toHaveLength(3);
  });

  it("moves as few people as it can, newest first", () => {
    // Four against nobody: two have to cross, and it is the two who joined last.
    const result = settle(["a", "b", "c", "d"], [], []);
    expect(result.moves.map((move) => move.participantId).sort()).toEqual(["c", "d"]);
    expect(result.first).toEqual(["a", "b"]);
  });

  it("fills a short side from the pool before touching anybody settled", () => {
    const result = settle(["a", "b"], [], ["c", "d"]);
    expect(result.moves.map((move) => move.participantId).sort()).toEqual(["c", "d"]);
    expect(result.first).toEqual(["a", "b"]);
    expect(result.second).toEqual(["c", "d"]);
  });

  it("gives the odd player to the first team, every time", () => {
    for (const run of [settle(["a"], [], ["b", "c"]), settle([], ["a"], ["b", "c"])]) {
      expect(run.first).toHaveLength(2);
      expect(run.second).toHaveLength(1);
    }
  });

  it("has nothing to do for an empty room", () => {
    expect(planSplit({ ...base, firstSide: [], secondSide: [], unplaced: [] })).toEqual([]);
  });

  it("never leaves the sides more than one apart", () => {
    for (let a = 0; a < 6; a += 1)
      for (let b = 0; b < 6; b += 1)
        for (let pool = 0; pool < 4; pool += 1) {
          const result = settle(
            Array.from({ length: a }, (_, i) => `a${i}`),
            Array.from({ length: b }, (_, i) => `b${i}`),
            Array.from({ length: pool }, (_, i) => `p${i}`),
          );
          expect(result.homeless).toEqual([]);
          expect(Math.abs(result.first.length - result.second.length)).toBeLessThanOrEqual(1);
        }
  });
});
