import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { isJourneyPath } from "@/components/layout";
import {
  WorldCard,
  isSelectableScope,
  playableWorlds,
  selectFeaturedWorlds,
  worldCardDisplayName,
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

describe("scope browsability", () => {
  it("offers a Scope that has at least one usable board position", () => {
    const usable = slot("slot_1", "read-your-opponent", "اقرأ خصمك", 0);
    expect(isSelectableScope(scope("s-1", [usable]))).toBe(true);
  });

  it("hides a Scope that can supply no board position at all", () => {
    expect(isSelectableScope(scope("s-2", []))).toBe(false);
  });

  it("never judges a Scope by which mechanic its positions are configured with", () => {
    // Whether a mechanic can be launched is the Match's answer, not this module's:
    // an unimplemented mechanic still makes the Scope browsable.
    const unimplemented = slot("slot_3", "same-wavelength", "نفس الموجة", 2);
    expect(isSelectableScope(scope("s-3", [unimplemented]))).toBe(true);
  });
});

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
  it("presents canonical World naming without changing stored names", () => {
    expect(worldCardDisplayName("كرة القدم")).toBe("عالم كرة القدم");
    expect(worldCardDisplayName("عالم الأنمي")).toBe("عالم الأنمي");
  });

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
    // Arabic agreement: 3-10 takes the plural, so "5 نطاقات" not "5 نطاق".
    expect(screen.getByText("نطاقات")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("تحدّيات")).toBeTruthy();
    expect(screen.getByText("كل ما يخص كرة القدم")).toBeTruthy();
    // Content items are an authoring concern and never reach a player card.
    expect(document.body.textContent).not.toContain("320");
    expect(document.body.textContent).not.toContain("سؤال");
  });

  it("uses one banner frame and does not render a floating letter badge", () => {
    render(
      <WorldCard
        featured
        world={world({
          name: "كرة القدم",
          banner: { url: "/uploads/football.webp" },
        })}
      />,
    );

    expect(screen.getByTestId("world-card-media")).toHaveClass("aspect-[3/2]");
    expect(screen.queryByText("ك")).not.toBeInTheDocument();
  });
});

describe("journey screens in the app shell", () => {
  it("renders every journey screen edge to edge", () => {
    expect(isJourneyPath("/")).toBe(true);
    expect(isJourneyPath("/worlds/w-1")).toBe(true);
  });

  it("leaves the rest of the application in the normal shell", () => {
    expect(isJourneyPath("/games")).toBe(false);
    expect(isJourneyPath("/games/categories")).toBe(false);
    expect(isJourneyPath("/admin/worlds")).toBe(false);
  });
});
