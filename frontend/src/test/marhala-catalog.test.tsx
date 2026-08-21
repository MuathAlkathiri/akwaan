import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  scopes: [] as Array<Record<string, unknown>>,
  lastFilters: undefined as unknown,
}));

vi.mock("@/components/ui/toast", () => ({ showToast: vi.fn() }));

vi.mock("@/features/world-management/hooks/use-world-content", () => ({
  useScopes: () => ({ data: mocks.scopes }),
  // Scope narrows server-side, exactly as the real endpoint does; difficulty is
  // never part of the query, so the two cannot be confused for one another.
  useContentItems: (filters: { scopeId?: string }) => {
    mocks.lastFilters = filters;
    return {
      data: filters.scopeId
        ? mocks.items.filter((item) => item.scopeId === filters.scopeId)
        : mocks.items,
      isLoading: false,
    };
  },
  useDeleteContentItem: () => ({ mutate: vi.fn(), isPending: false }),
  useWorldBoard: () => ({ data: { configurations: [] } }),
  useWorldContentMetadata: () => ({ data: { answerModeCompatibility: [] } }),
  useCreateContentItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateContentItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ContentItemCard } from "@/features/world-management/components/content-items/content-item-card";
import { ContentItemSection } from "@/features/world-management/components/content-items/content-item-section";
import {
  MARHALA_DIFFICULTY_DIMENSION as MARHALA,
  COMBO_DIFFICULTY_DIMENSION as COMBO,
  difficultyCoverage,
  difficultyDimensionsOf,
  difficultyLabelOf,
  filterByDifficulty,
  sortByDifficulty,
} from "@/features/world-management/services/mechanic-difficulty.presentation";
import type { ContentItem } from "@/features/world-management/types";

/**
 * "الصعوبة" of المرحلة content in the authoring catalog.
 *
 * The rule these hold is that Scope and difficulty are independent dimensions
 * that *compose*. GTA may hold all three bands at once; صعب spans every Scope;
 * and "GTA + صعب" is exactly the intersection, never a fallback to one of them.
 */

const GTA = "scope-gta";
const COD = "scope-cod";
const FIFA = "scope-fifa";

const item = (
  id: string,
  scopeId: string,
  marhalaDifficulty?: unknown,
  status: string = "ready",
): ContentItem =>
  ({
    id,
    scopeId,
    worldId: "world-video-games",
    prompt: { ar: `سؤال ${id}` },
    compatibleChallengeTypeIds: ["ct-marhala"],
    answerPayload: { mode: "match", acceptedAnswers: ["إجابة"] },
    ...(marhalaDifficulty === undefined
      ? {}
      : { mechanicPayload: { marhalaDifficulty } }),
    isReusableAcrossSessions: false,
    status,
    readiness: { readiness: "ready", blockers: [], warnings: [] },
    compatibleFamilies: ["signature"],
    isSessionReuseExempt: false,
  }) as unknown as ContentItem;

const comboItem = (id: string, scopeId: string, comboStage: number) =>
  ({
    ...item(id, scopeId),
    mechanicPayload: { comboStage },
  }) as ContentItem;

describe("الصعوبة on a المرحلة catalog card", () => {
  const renderCard = (value: ContentItem) =>
    render(
      <ContentItemCard item={value} onEdit={() => {}} onDelete={() => {}} />,
    );

  it.each([
    ["easy", "سهل"],
    ["medium", "متوسط"],
    ["hard", "صعب"],
  ])("shows %s as %s", (value, label) => {
    renderCard(item("i", GTA, value));
    expect(screen.getByTestId("marhala-difficulty-badge")).toHaveTextContent(
      `الصعوبة: ${label}`,
    );
  });

  it("says nothing about difficulty for content that authored none", () => {
    renderCard(item("i", GTA));
    expect(screen.queryByTestId("marhala-difficulty-badge")).toBeNull();
    expect(screen.queryByText(/الصعوبة/)).toBeNull();
  });

  it("ignores a stored value the contract does not define", () => {
    for (const bad of ["EASY", "صعب", "impossible", 2, null, {}]) {
      const { unmount } = renderCard(item("i", GTA, bad));
      expect(screen.queryByTestId("marhala-difficulty-badge")).toBeNull();
      unmount();
    }
  });

  it("never leaks the internal vocabulary to an author", () => {
    renderCard(item("i", GTA, "medium"));
    const text =
      screen.getByTestId("marhala-difficulty-badge").textContent ?? "";
    for (const leak of [
      "marhalaDifficulty",
      "mechanicPayload",
      "medium",
      "easy",
      "hard",
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  it("keeps difficulty as metadata beside the other badges", () => {
    // Not a large special card: the same badge row every mechanic's content uses.
    renderCard(item("i", GTA, "hard"));
    const badge = screen.getByTestId("marhala-difficulty-badge");
    expect(screen.getByText("سؤال i")).toBeInTheDocument();
    expect(badge.parentElement).toContainElement(
      screen.getByText("مطابقة نصية"),
    );
    // Same badge row, same weight as the answer mode and the status beside it.
    expect(badge.parentElement?.childElementCount).toBeGreaterThan(2);
  });
});

describe("Scope and difficulty are independent", () => {
  it("lets one Scope hold every band at once", () => {
    const gta = ["easy", "medium", "hard"].map((band, index) =>
      item(`gta-${index}`, GTA, band),
    );
    expect(gta.map((entry) => difficultyLabelOf(MARHALA, entry))).toEqual([
      "سهل",
      "متوسط",
      "صعب",
    ]);
  });

  it("gives the same band to items in different Scopes", () => {
    expect(MARHALA.read(item("a", GTA, "hard"))).toBe("hard");
    expect(MARHALA.read(item("b", COD, "hard"))).toBe("hard");
    expect(MARHALA.read(item("c", FIFA, "hard"))).toBe("hard");
  });

  it("reads the band from the saved value and from nothing else", () => {
    expect(difficultyLabelOf(MARHALA, item("a", GTA, "medium"))).toBe(
      difficultyLabelOf(MARHALA, item("b", FIFA, "medium")),
    );
    expect(difficultyLabelOf(MARHALA, item("a", GTA, "medium"))).not.toBe(
      difficultyLabelOf(MARHALA, item("b", GTA, "hard")),
    );
  });
});

describe("filtering by band", () => {
  const catalog = [
    item("g-easy", GTA, "easy"),
    item("g-hard", GTA, "hard"),
    item("c-easy", COD, "easy"),
    item("f-medium", FIFA, "medium"),
    item("plain", GTA),
  ];

  it.each([
    ["easy", ["g-easy", "c-easy"]],
    ["medium", ["f-medium"]],
    ["hard", ["g-hard"]],
  ] as const)("keeps only %s", (band, expected) => {
    expect(
      filterByDifficulty(MARHALA, catalog, band).map((entry) => entry.id),
    ).toEqual(expected);
  });

  it("passes everything through on الكل", () => {
    expect(filterByDifficulty(MARHALA, catalog, "all")).toHaveLength(
      catalog.length,
    );
  });

  it("composes with a Scope selection without either implying the other", () => {
    const gta = catalog.filter((entry) => entry.scopeId === GTA);
    expect(
      filterByDifficulty(MARHALA, gta, "hard").map((entry) => entry.id),
    ).toEqual(["g-hard"]);
    expect(
      filterByDifficulty(MARHALA, gta, "easy").map((entry) => entry.id),
    ).toEqual(["g-easy"]);
    // An intersection with no content is empty rather than falling back to one
    // dimension or the other.
    expect(filterByDifficulty(MARHALA, gta, "medium")).toEqual([]);
  });

  it("excludes content that authored no band from every band", () => {
    for (const band of ["easy", "medium", "hard"] as const) {
      expect(
        filterByDifficulty(MARHALA, catalog, band).map((entry) => entry.id),
      ).not.toContain("plain");
    }
  });

  it("never reads a Combo stage as a Marhala band", () => {
    const mixed = [comboItem("combo-3", GTA, 3), item("marhala", GTA, "hard")];
    expect(
      filterByDifficulty(MARHALA, mixed, "hard").map((entry) => entry.id),
    ).toEqual(["marhala"]);
    expect(
      filterByDifficulty(COMBO, mixed, 3).map((entry) => entry.id),
    ).toEqual(["combo-3"]);
  });
});

describe("ordering by band", () => {
  it("rises through سهل → متوسط → صعب", () => {
    const shuffled = [
      item("c", FIFA, "hard"),
      item("a", GTA, "easy"),
      item("b", COD, "medium"),
    ];
    expect(
      sortByDifficulty(MARHALA, shuffled).map((entry) =>
        difficultyLabelOf(MARHALA, entry),
      ),
    ).toEqual(["سهل", "متوسط", "صعب"]);
  });

  it("does not order by the Arabic label", () => {
    // Lexicographically صعب precedes سهل precedes متوسط, which is meaningless as a
    // difficulty order. The canonical order is the mechanic's own.
    const labels = sortByDifficulty(MARHALA, [
      item("a", GTA, "medium"),
      item("b", GTA, "hard"),
      item("c", GTA, "easy"),
    ]).map((entry) => difficultyLabelOf(MARHALA, entry));
    expect(labels).toEqual(["سهل", "متوسط", "صعب"]);
    expect(labels).not.toEqual([...labels].sort());
  });

  it("reverses cleanly", () => {
    expect(
      sortByDifficulty(
        MARHALA,
        [item("a", GTA, "easy"), item("b", GTA, "hard")],
        "desc",
      ).map((entry) => MARHALA.read(entry)),
    ).toEqual(["hard", "easy"]);
  });

  it("settles content with no band after the ranked items", () => {
    expect(
      sortByDifficulty(MARHALA, [
        item("plain", GTA),
        item("ranked", GTA, "medium"),
      ]).map((entry) => entry.id),
    ).toEqual(["ranked", "plain"]);
  });

  it("does not order by Scope name, id, or position", () => {
    expect(
      sortByDifficulty(MARHALA, [
        item("z-last", COD, "easy"),
        item("a-first", GTA, "hard"),
      ]).map((entry) => entry.id),
    ).toEqual(["z-last", "a-first"]);
  });

  it("leaves the caller's array untouched", () => {
    const items = [item("b", GTA, "hard"), item("a", GTA, "easy")];
    sortByDifficulty(MARHALA, items);
    expect(items.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("band coverage", () => {
  it("counts what a game could draw today, and what is only drafted", () => {
    const catalog = [
      item("e1", GTA, "easy"),
      item("e2", COD, "easy"),
      item("m1", GTA, "medium", "draft"),
      item("h1", FIFA, "hard"),
      item("plain", GTA),
    ];
    expect(difficultyCoverage(MARHALA, catalog)).toEqual([
      { value: "easy", label: "سهل", count: 2, ready: 2 },
      { value: "medium", label: "متوسط", count: 1, ready: 0 },
      { value: "hard", label: "صعب", count: 1, ready: 1 },
    ]);
  });

  it("reports a shortage as zero rather than hiding the band", () => {
    const coverage = difficultyCoverage(MARHALA, [item("only", GTA, "easy")]);
    expect(coverage).toHaveLength(3);
    expect(coverage.find((entry) => entry.value === "hard")).toEqual({
      value: "hard",
      label: "صعب",
      count: 0,
      ready: 0,
    });
  });
});

describe("which mechanics get catalog controls", () => {
  it("offers المرحلة's controls only once its content is present", () => {
    expect(difficultyDimensionsOf([item("plain", GTA)])).toEqual([]);
    expect(
      difficultyDimensionsOf([item("a", GTA, "hard")]).map(
        (dimension) => dimension.key,
      ),
    ).toEqual(["marhala"]);
  });

  it("does not count a broken stored value as المرحلة content", () => {
    // An item whose band the contract does not define is unplayable and belongs to
    // no band, so it must not make the catalog offer controls for content that is
    // not really there.
    for (const bad of ["EASY", "صعب", "impossible", 2, null]) {
      expect(difficultyDimensionsOf([item("i", GTA, bad)])).toEqual([]);
    }
  });

  it("offers each mechanic its own controls when both are present", () => {
    expect(
      difficultyDimensionsOf([
        comboItem("c", GTA, 1),
        item("m", GTA, "easy"),
      ]).map((dimension) => dimension.key),
    ).toEqual(["combo", "marhala"]);
  });
});

describe("the catalog section", () => {
  beforeEach(() => {
    mocks.scopes = [
      { id: GTA, name: "GTA", excludedChallengeTypeIds: [] },
      { id: COD, name: "كود", excludedChallengeTypeIds: [] },
    ];
    mocks.items = [
      item("g-easy", GTA, "easy"),
      item("g-hard", GTA, "hard"),
      item("c-medium", COD, "medium"),
      item("c-hard", COD, "hard"),
    ] as unknown as Array<Record<string, unknown>>;
    mocks.lastFilters = undefined;
  });

  const renderSection = () =>
    render(<ContentItemSection worldId="world-video-games" />);
  const visiblePrompts = () =>
    screen
      .getAllByText(/^سؤال /)
      .map((node) => node.textContent)
      .sort();
  const controls = () =>
    within(screen.getByTestId("marhala-difficulty-controls"));

  it("names the mechanic its difficulty controls belong to", () => {
    renderSection();
    expect(screen.getByTestId("marhala-difficulty-controls")).toHaveTextContent(
      "الصعوبة — المرحلة",
    );
    expect(screen.queryByTestId("combo-difficulty-controls")).toBeNull();
  });

  it.each([
    ["سهل", ["سؤال g-easy"]],
    ["متوسط", ["سؤال c-medium"]],
    ["صعب", ["سؤال c-hard", "سؤال g-hard"]],
  ] as const)("filters to %s", (label, expected) => {
    renderSection();
    fireEvent.click(controls().getByRole("button", { name: label }));
    expect(visiblePrompts()).toEqual([...expected].sort());
  });

  it("returns to everything on الكل", () => {
    renderSection();
    fireEvent.click(controls().getByRole("button", { name: "صعب" }));
    expect(visiblePrompts()).toHaveLength(2);
    fireEvent.click(controls().getByRole("button", { name: "الكل" }));
    expect(visiblePrompts()).toHaveLength(4);
  });

  it("composes a Scope with a band as exactly that intersection", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "GTA" }));
    // The Scope goes to the server; the band filters what came back.
    expect(mocks.lastFilters).toEqual({
      worldId: "world-video-games",
      scopeId: GTA,
    });
    fireEvent.click(controls().getByRole("button", { name: "صعب" }));
    expect(visiblePrompts()).toEqual(["سؤال g-hard"]);

    // GTA + متوسط exists in neither dimension's own emptiness: it is simply empty.
    fireEvent.click(controls().getByRole("button", { name: "متوسط" }));
    expect(screen.queryByText(/^سؤال /)).toBeNull();
    expect(screen.getByText("لا يوجد محتوى بهذه الصعوبة")).toBeInTheDocument();
  });

  it("orders the list by band when asked", () => {
    renderSection();
    fireEvent.click(screen.getByTestId("marhala-difficulty-sort"));
    expect(
      screen.getAllByText(/^سؤال /).map((node) => node.textContent),
    ).toEqual(["سؤال g-easy", "سؤال c-medium", "سؤال g-hard", "سؤال c-hard"]);
  });

  it("counts every band, including the ones with nothing in them", () => {
    mocks.items = [
      item("g-easy", GTA, "easy"),
      item("g-easy-2", GTA, "easy", "draft"),
    ] as unknown as Array<Record<string, unknown>>;
    renderSection();

    const coverage = within(screen.getByTestId("marhala-difficulty-coverage"));
    expect(coverage.getByText("1 سهل جاهز من 2")).toBeInTheDocument();
    expect(coverage.getByText("0 متوسط جاهز")).toBeInTheDocument();
    expect(coverage.getByText("0 صعب جاهز")).toBeInTheDocument();
  });

  it("keeps counting every band while one is filtered", () => {
    // Narrowing to صعب must not zero the others: the shortage this exists to show
    // would disappear exactly when an author went looking for it.
    renderSection();
    fireEvent.click(controls().getByRole("button", { name: "صعب" }));
    const coverage = within(screen.getByTestId("marhala-difficulty-coverage"));
    expect(coverage.getByText("1 سهل جاهز")).toBeInTheDocument();
    expect(coverage.getByText("2 صعب جاهز")).toBeInTheDocument();
  });

  it("gives each mechanic separate controls that compose", () => {
    mocks.items = [
      item("m-hard", GTA, "hard"),
      comboItem("c-1", GTA, 1),
    ] as unknown as Array<Record<string, unknown>>;
    renderSection();

    expect(screen.getByTestId("combo-difficulty-controls")).toBeInTheDocument();
    // Filtering one mechanic's band excludes the other mechanic's content, which
    // authored no band of *this* mechanic — not because the two were merged.
    fireEvent.click(controls().getByRole("button", { name: "صعب" }));
    expect(visiblePrompts()).toEqual(["سؤال m-hard"]);
  });
});
