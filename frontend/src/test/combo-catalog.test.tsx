import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentItemCard } from "@/features/world-management/components/content-items/content-item-card";
import {
  comboDifficultyCoverage,
  comboDifficultyLabel,
  comboStageOf,
  filterByComboDifficulty,
  hasComboContent,
  sortByComboDifficulty,
} from "@/features/world-management/services/combo-difficulty.presentation";
import type { ContentItem } from "@/features/world-management/types";

/**
 * "الصعوبة" in the authoring catalog.
 *
 * The rule these tests exist to hold is that Scope and difficulty are independent.
 * A Scope says what a question is about; the stage says how hard it is inside the
 * Run. ناروتو may hold all four difficulties at once, and nothing may infer one
 * dimension from the other.
 */

const NARUTO = "scope-naruto";
const AOT = "scope-aot";
const BLEACH = "scope-bleach";

const item = (id: string, scopeId: string, comboStage?: unknown): ContentItem =>
  ({
    id,
    scopeId,
    worldId: "world-anime",
    prompt: { ar: `سؤال ${id}` },
    compatibleChallengeTypeIds: ["ct-combo"],
    answerPayload: { mode: "match", acceptedAnswers: ["إجابة"] },
    ...(comboStage === undefined ? {} : { mechanicPayload: { comboStage } }),
    isReusableAcrossSessions: false,
    status: "ready",
    readiness: { readiness: "ready", blockers: [], warnings: [] },
    compatibleFamilies: ["signature"],
    isSessionReuseExempt: false,
  }) as unknown as ContentItem;

describe("الصعوبة on a catalog card", () => {
  const renderCard = (value: ContentItem) =>
    render(
      <ContentItemCard item={value} onEdit={() => {}} onDelete={() => {}} />,
    );

  it.each([
    [1, "متوسط"],
    [2, "متوسط صعب"],
    [3, "صعب"],
    [4, "صعب جدًا"],
  ])("shows stage %i as %s", (stage, label) => {
    renderCard(item("i", NARUTO, stage));
    expect(screen.getByTestId("combo-difficulty-badge")).toHaveTextContent(
      `الصعوبة: ${label}`,
    );
  });

  it("says nothing about difficulty for content that is not Combo's", () => {
    // An RYO or "ركّبها" item carries no stage and must not grow a difficulty.
    renderCard(item("i", NARUTO));
    expect(screen.queryByTestId("combo-difficulty-badge")).toBeNull();
    expect(screen.queryByText(/الصعوبة/)).toBeNull();
  });

  it("ignores a stage value the contract does not define", () => {
    for (const bad of [0, 5, -1, 2.5, "صعب", null]) {
      const { unmount } = renderCard(item("i", NARUTO, bad));
      expect(screen.queryByTestId("combo-difficulty-badge")).toBeNull();
      unmount();
    }
  });

  it("never leaks the internal vocabulary to an author", () => {
    renderCard(item("i", NARUTO, 2));
    const text = screen.getByTestId("combo-difficulty-badge").textContent ?? "";
    for (const leak of ["comboStage", "Stage", "stage", "mechanicPayload"]) {
      expect(text).not.toContain(leak);
    }
  });
});

describe("Scope and difficulty are independent dimensions", () => {
  it("lets one Scope hold every difficulty at once", () => {
    const naruto = [1, 2, 3, 4].map((stage) =>
      item(`naruto-${stage}`, NARUTO, stage),
    );
    expect(naruto.map(comboDifficultyLabel)).toEqual([
      "متوسط",
      "متوسط صعب",
      "صعب",
      "صعب جدًا",
    ]);
  });

  it("gives two items in the same Scope different difficulties", () => {
    render(
      <div>
        <ContentItemCard
          item={item("a", NARUTO, 1)}
          onEdit={() => {}}
          onDelete={() => {}}
        />
        <ContentItemCard
          item={item("b", NARUTO, 4)}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </div>,
    );
    const badges = screen.getAllByTestId("combo-difficulty-badge");
    expect(badges.map((badge) => badge.textContent)).toEqual([
      "الصعوبة: متوسط",
      "الصعوبة: صعب جدًا",
    ]);
  });

  it("gives the same difficulty to items in different Scopes", () => {
    // The mirror of the rule: difficulty does not identify a Scope either.
    expect(comboStageOf(item("a", NARUTO, 3))).toBe(3);
    expect(comboStageOf(item("b", AOT, 3))).toBe(3);
    expect(comboStageOf(item("c", BLEACH, 3))).toBe(3);
  });

  it("reads difficulty from the saved stage and from nothing else", () => {
    // Two items identical but for their Scope resolve to the same difficulty, and
    // two items identical but for their stage resolve to different ones. Scope
    // cannot be an input.
    expect(comboDifficultyLabel(item("a", NARUTO, 2))).toBe(
      comboDifficultyLabel(item("b", BLEACH, 2)),
    );
    expect(comboDifficultyLabel(item("a", NARUTO, 2))).not.toBe(
      comboDifficultyLabel(item("b", NARUTO, 3)),
    );
  });
});

describe("ordering by difficulty", () => {
  it("rises through متوسط → متوسط صعب → صعب → صعب جدًا", () => {
    const shuffled = [
      item("d", BLEACH, 4),
      item("b", NARUTO, 2),
      item("a", AOT, 1),
      item("c", NARUTO, 3),
    ];
    expect(sortByComboDifficulty(shuffled).map(comboDifficultyLabel)).toEqual([
      "متوسط",
      "متوسط صعب",
      "صعب",
      "صعب جدًا",
    ]);
  });

  it("reverses cleanly", () => {
    const items = [item("a", NARUTO, 1), item("b", NARUTO, 4)];
    expect(sortByComboDifficulty(items, "desc").map(comboStageOf)).toEqual([
      4, 1,
    ]);
  });

  it("does not order by Scope name, id, or position", () => {
    // ب before أ alphabetically-agnostic: the only key is the stage.
    const items = [item("z-last", AOT, 1), item("a-first", NARUTO, 4)];
    expect(sortByComboDifficulty(items).map((entry) => entry.id)).toEqual([
      "z-last",
      "a-first",
    ]);
  });

  it("settles non-Combo content after the ranked items", () => {
    const items = [item("plain", NARUTO), item("ranked", NARUTO, 2)];
    expect(sortByComboDifficulty(items).map((entry) => entry.id)).toEqual([
      "ranked",
      "plain",
    ]);
  });

  it("leaves the caller's array untouched", () => {
    const items = [item("b", NARUTO, 3), item("a", NARUTO, 1)];
    sortByComboDifficulty(items);
    expect(items.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("filtering by difficulty", () => {
  const catalog = [
    item("n1", NARUTO, 1),
    item("n3", NARUTO, 3),
    item("a1", AOT, 1),
    item("b4", BLEACH, 4),
    item("plain", NARUTO),
  ];

  it("keeps only the chosen difficulty", () => {
    expect(
      filterByComboDifficulty(catalog, 1).map((entry) => entry.id),
    ).toEqual(["n1", "a1"]);
    expect(
      filterByComboDifficulty(catalog, 4).map((entry) => entry.id),
    ).toEqual(["b4"]);
  });

  it("passes everything through on الكل", () => {
    expect(filterByComboDifficulty(catalog, "all")).toHaveLength(
      catalog.length,
    );
  });

  it("composes with a Scope selection without either one implying the other", () => {
    // Scope narrows server-side; difficulty filters what came back. Naruto+صعب is
    // one item, Naruto+متوسط is a different one, and AOT+متوسط is a third.
    const naruto = catalog.filter((entry) => entry.scopeId === NARUTO);
    expect(filterByComboDifficulty(naruto, 3).map((entry) => entry.id)).toEqual(
      ["n3"],
    );
    expect(filterByComboDifficulty(naruto, 1).map((entry) => entry.id)).toEqual(
      ["n1"],
    );
    const aot = catalog.filter((entry) => entry.scopeId === AOT);
    expect(filterByComboDifficulty(aot, 1).map((entry) => entry.id)).toEqual([
      "a1",
    ]);
    // And a combination with no content is empty rather than falling back.
    expect(filterByComboDifficulty(aot, 4)).toEqual([]);
  });

  it("excludes non-Combo content from every difficulty", () => {
    for (const stage of [1, 2, 3, 4] as const) {
      expect(
        filterByComboDifficulty(catalog, stage).map((entry) => entry.id),
      ).not.toContain("plain");
    }
  });
});

describe("difficulty coverage", () => {
  it("counts each difficulty and names it for the author", () => {
    const catalog = [
      ...Array.from({ length: 3 }, (_, i) => item(`s1-${i}`, NARUTO, 1)),
      ...Array.from({ length: 2 }, (_, i) => item(`s2-${i}`, AOT, 2)),
      item("s4", BLEACH, 4),
      item("plain", NARUTO),
    ];
    expect(comboDifficultyCoverage(catalog)).toEqual([
      { stage: 1, label: "متوسط", count: 3 },
      { stage: 2, label: "متوسط صعب", count: 2 },
      { stage: 3, label: "صعب", count: 0 },
      { stage: 4, label: "صعب جدًا", count: 1 },
    ]);
  });

  it("reports a shortage as zero rather than hiding the difficulty", () => {
    // The whole point: stage 3 having nothing must be visible, not absent.
    const coverage = comboDifficultyCoverage([item("only", NARUTO, 1)]);
    expect(coverage).toHaveLength(4);
    expect(coverage.find((entry) => entry.stage === 3)?.count).toBe(0);
  });
});

describe("worlds without Combo content", () => {
  it("reports no Combo content so the controls stay hidden", () => {
    expect(hasComboContent([item("a", NARUTO), item("b", AOT)])).toBe(false);
    expect(hasComboContent([])).toBe(false);
  });

  it("reports Combo content as soon as one item carries a stage", () => {
    expect(hasComboContent([item("a", NARUTO), item("b", AOT, 2)])).toBe(true);
  });
});
