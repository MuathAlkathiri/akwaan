import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { isJourneyPath } from "@/components/layout";
import {
  WorldCard,
  buildOccurrenceBoard,
  countAvailable,
  isPlayableMechanic,
  playableWorlds,
  selectFeaturedWorlds,
} from "@/features/worlds";
import type {
  PlayableBoardSlot,
  PlayableScope,
  PlayableWorld,
} from "@/features/worlds/types";

function world(overrides: Partial<PlayableWorld> = {}): PlayableWorld {
  return {
    id: overrides.slug ?? "world-1",
    name: "عالم",
    slug: "world",
    sortOrder: 0,
    scopeCount: 3,
    challengeConfigurationCount: 4,
    ...overrides,
  };
}

function slot(
  slotKey: string,
  challengeTypeSlug: string,
  displayName: string,
  sortOrder = 0,
): PlayableBoardSlot {
  return {
    slotKey,
    challengeTypeId: `type-${challengeTypeSlug}`,
    challengeTypeSlug,
    family: "ryo",
    displayName,
    answerMode: "ryo",
    itemStructure: "discrete_triple",
    scoringRuleId: "ryo.payoff-matrix",
    sortOrder,
  };
}

/** A one-Scope pool: the occurrence board is built from the pool, not a Scope. */
function pool(usable: PlayableBoardSlot[]): PlayableScope[] {
  return [scope("scope-1", usable)];
}

function scope(id: string, usable: PlayableBoardSlot[]): PlayableScope {
  return {
    id,
    worldId: "world-1",
    name: "كأس العالم",
    slug: "world-cup",
    sortOrder: 0,
    readyContentItemCount: 112,
    usableSlots: usable,
  };
}

describe("featured world selection", () => {
  const catalogue = [
    world({ slug: "anime", name: "أنمي", sortOrder: 3 }),
    world({ slug: "history", name: "تاريخ", sortOrder: 1 }),
    world({ slug: "football", name: "كرة القدم", sortOrder: 2 }),
    world({ slug: "video-games", name: "ألعاب الفيديو", sortOrder: 4 }),
  ];

  it("leads with Football, Anime, then Video Games", () => {
    expect(selectFeaturedWorlds(catalogue).map((entry) => entry.slug)).toEqual([
      "football",
      "anime",
      "video-games",
    ]);
  });

  it("matches a World by its Arabic name when the slug differs", () => {
    const arabic = [
      world({ slug: "w-1", name: "كرة القدم العالمية" }),
      world({ slug: "w-2", name: "أنمي" }),
    ];
    // Football leads the row, so the football World comes first whichever
    // order the catalogue happens to arrive in.
    expect(selectFeaturedWorlds(arabic).map((entry) => entry.slug)).toEqual([
      "w-1",
      "w-2",
    ]);
  });

  it("fills the row from the remaining Worlds and never repeats one", () => {
    const sparse = [
      world({ slug: "football", name: "كرة القدم" }),
      world({ slug: "history", name: "تاريخ", sortOrder: 1 }),
      world({ slug: "space", name: "فضاء", sortOrder: 2 }),
    ];
    const featured = selectFeaturedWorlds(sparse);
    expect(featured).toHaveLength(3);
    expect(new Set(featured.map((entry) => entry.id)).size).toBe(3);
    expect(featured[0].slug).toBe("football");
  });

  it("never offers a World that is not active", () => {
    const mixed = [world({ slug: "anime", name: "أنمي" })];
    expect(playableWorlds(mixed).map((entry) => entry.slug)).toEqual(["anime"]);
  });

  it("orders the full grid by the admin's sort order", () => {
    expect(playableWorlds(catalogue).map((entry) => entry.slug)).toEqual([
      "history",
      "football",
      "anime",
      "video-games",
    ]);
  });
});

describe("world card", () => {
  it("is an entrance into the World, not into its content", () => {
    render(
      <WorldCard
        world={world({ slug: "football", name: "كرة القدم", id: "w-football" })}
      />,
    );

    const link = screen.getByRole("link", { name: /كرة القدم/ });
    expect(link.getAttribute("href")).toBe("/worlds/w-football");
  });

  it("carries only the counts a player chooses by", () => {
    render(
      <WorldCard
        world={world({
          scopeCount: 5,
          challengeConfigurationCount: 4,
          description: "كل ما يخص كرة القدم",
        })}
      />,
    );

    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("نطاق")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("تحدٍّ")).toBeTruthy();
    expect(screen.getByText("كل ما يخص كرة القدم")).toBeTruthy();
    // Content items are an authoring concern and never reach a player card.
    expect(document.body.textContent).not.toContain("320");
    expect(document.body.textContent).not.toContain("سؤال");
  });
});

describe("occurrence board composition", () => {
  const ryo = slot("slot_1", "read-your-opponent", "اقرأ خصمك", 0);
  const top10 = slot("slot_2", "top-10", "أفضل 10", 1);
  const relational = slot("slot_3", "same-wavelength", "نفس الموجة", 2);
  const excluded = slot("slot_4", "top-10", "أفضل 10 مستبعد", 3);

  it("marks implemented mechanics available and the rest locked", () => {
    const board = buildOccurrenceBoard(
      pool([ryo, top10, relational, excluded]),
    );

    expect(
      board.map((entry) => [entry.slot.slotKey, entry.availability]),
    ).toEqual([
      ["slot_1", "available"],
      ["slot_2", "available"],
      ["slot_3", "locked"],
      ["slot_4", "available"],
    ]);
    expect(countAvailable(board)).toBe(3);
  });

  it("explains why a locked challenge is locked", () => {
    const board = buildOccurrenceBoard(pool([relational]));
    expect(board[0].lockedReason).toBe("قريباً");
  });

  it("keeps a position open when any Scope in the pool can supply it", () => {
    // One Scope cannot play Top 10; another can, so the position stays open.
    const board = buildOccurrenceBoard([
      scope("s1", [ryo]),
      scope("s2", [ryo, top10]),
    ]);

    expect(
      board.map((entry) => [entry.slot.slotKey, entry.availability]),
    ).toEqual([
      ["slot_1", "available"],
      ["slot_2", "available"],
    ]);
  });

  it("shows a completed challenge as completed without removing it", () => {
    const board = buildOccurrenceBoard(pool([ryo, top10]), ["slot_1"]);

    expect(board).toHaveLength(2);
    expect(board[0].availability).toBe("completed");
    // The rest of the board stays selectable after one challenge finishes.
    expect(board[1].availability).toBe("available");
  });

  it("keeps every configured position on the board, in board order only", () => {
    const board = buildOccurrenceBoard(
      pool([top10, ryo, excluded, relational]),
    );
    expect(board.map((entry) => entry.slot.slotKey)).toEqual([
      "slot_1",
      "slot_2",
      "slot_3",
      "slot_4",
    ]);
  });

  it("knows which mechanics can actually be launched", () => {
    expect(isPlayableMechanic("read-your-opponent")).toBe(true);
    expect(isPlayableMechanic("top-10")).toBe(true);
    expect(isPlayableMechanic("distributed-information")).toBe(true);
    expect(isPlayableMechanic("same-wavelength")).toBe(false);
  });

  it("shows ركّبها as available when its usable slot is returned", () => {
    const distributed = slot("slot_4", "distributed-information", "ركّبها", 3);
    expect(buildOccurrenceBoard(pool([distributed]))[0]).toMatchObject({
      availability: "available",
      slot: { displayName: "ركّبها" },
    });
  });

  it("returns nothing for a pool with no compatibility yet", () => {
    expect(buildOccurrenceBoard([])).toEqual([]);
  });
});

describe("journey screens in the app shell", () => {
  it("renders every journey screen edge to edge", () => {
    expect(isJourneyPath("/")).toBe(true);
    expect(isJourneyPath("/worlds/w-1")).toBe(true);
    expect(isJourneyPath("/worlds/w-1/scopes/s-1")).toBe(true);
    expect(isJourneyPath("/worlds/w-1/scopes/s-1/board")).toBe(true);
  });

  it("leaves the rest of the application in the normal shell", () => {
    expect(isJourneyPath("/games")).toBe(false);
    expect(isJourneyPath("/games/categories")).toBe(false);
    expect(isJourneyPath("/admin/worlds")).toBe(false);
  });
});
