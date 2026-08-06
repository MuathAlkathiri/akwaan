import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  PlayableBoardSlot,
  PlayableScope,
  PlayableWorld,
} from "@/features/worlds/types";

const mocks = vi.hoisted(() => ({
  worlds: { data: [] as PlayableWorld[], isLoading: false, isError: false },
  scopes: { data: [] as PlayableScope[], isLoading: false, isError: false },
  isAuthenticated: true,
  push: vi.fn(),
  matchStage: "scope_selection",
  currentWorldId: "id-football",
  selectedScopeIds: [] as string[],
  selectMatchScopes: vi.fn(),
  continueMatchWorld: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, enabled = true }: { queryKey: unknown[]; enabled?: boolean }) => {
    if (!enabled) return { data: undefined, isLoading: false, isError: false };
    if (queryKey[0] === "match-journey-scopes") {
      return {
        data: mocks.scopes.data.map((item) => ({ scopeId: item.id, name: item.name })),
        isLoading: false,
        isError: false,
      };
    }
    return {
      data: matchSession(),
      isLoading: false,
      isError: false,
    };
  },
}));

vi.mock("@/features/live-game-session/api/live-session-api", () => ({
  getLiveSession: vi.fn(async () => matchSession()),
}));

vi.mock("@/features/live-game-session/match/api/match-api", () => ({
  listMatchScopes: vi.fn(async () =>
    mocks.scopes.data.map((item) => ({ scopeId: item.id, name: item.name })),
  ),
  selectMatchScopes: mocks.selectMatchScopes,
  continueMatchWorld: mocks.continueMatchWorld,
}));

vi.mock("@/features/worlds/hooks/use-player-catalog", () => ({
  usePlayableWorlds: () => ({
    ...mocks.worlds,
    isSuccess: !mocks.worlds.isLoading && !mocks.worlds.isError,
    refetch: vi.fn(),
    isFetching: false,
  }),
  usePlayableWorld: (id: string) => ({
    ...mocks.worlds,
    data: mocks.worlds.data.find((world) => world.id === id),
    isSuccess: !mocks.worlds.isLoading && !mocks.worlds.isError,
    refetch: vi.fn(),
    isFetching: false,
  }),
  usePlayableScopes: () => ({
    ...mocks.scopes,
    isError: false,
    isSuccess: !mocks.scopes.isLoading,
    refetch: vi.fn(),
    isFetching: false,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.push }),
  useParams: () => ({}),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    user: { fullName: "معاذ" },
    isAuthenticated: mocks.isAuthenticated,
    isAdmin: false,
    isLoading: false,
  }),
}));

import {
  BoardScreen,
  WorldScreen,
  WorldsHome,
} from "@/features/worlds";

function world(slug: string, name: string, sortOrder: number): PlayableWorld {
  return {
    id: `id-${slug}`,
    name,
    slug,
    sortOrder,
    scopeCount: 4,
    challengeConfigurationCount: 4,
  };
}

function slot(
  slotKey: string,
  challengeTypeSlug: string,
  displayName: string,
  sortOrder: number,
): PlayableBoardSlot {
  return {
    slotKey,
    challengeTypeId: `type-${slotKey}`,
    challengeTypeSlug,
    family: "ryo",
    displayName,
    answerMode: "ryo",
    itemStructure: "discrete_triple",
    scoringRuleId: "rule",
    sortOrder,
  };
}

function scope(
  id: string,
  name: string,
  sortOrder: number,
  options: { supportsTop10?: boolean } = {},
): PlayableScope {
  const top10 = slot("slot_2", "top-10", "أفضل 10", 1);
  const supportsTop10 = options.supportsTop10 ?? true;
  return {
    id,
    worldId: "id-football",
    name,
    slug: id,
    sortOrder,
    readyContentItemCount: 112,
    usableSlots: [
      slot("slot_1", "read-your-opponent", "اقرأ خصمك", 0),
      ...(supportsTop10 ? [top10] : []),
      slot("slot_3", "same-wavelength", "نفس الموجة", 2),
    ],
  };
}

const football = world("football", "كرة القدم", 1);

function matchSession() {
  return {
    sessionId: "session-1",
    status: "active",
    match: {
      id: "match-1",
      revision: 7,
      stage: { key: mocks.matchStage },
      currentOccurrence: {
        index: 0,
        worldId: mocks.currentWorldId,
        status: "in_progress",
        selectedScopeIds: mocks.selectedScopeIds,
        selectedScopes: [],
        scopeSelectionComplete: mocks.selectedScopeIds.length === 4,
      },
    },
  };
}

beforeEach(() => {
  mocks.isAuthenticated = true;
  mocks.worlds = {
    data: [
      football,
      world("anime", "أنمي", 2),
      world("video-games", "ألعاب الفيديو", 3),
      world("history", "تاريخ", 4),
    ],
    isLoading: false,
    isError: false,
  };
  mocks.scopes = {
    data: [
      // One Scope of the pool cannot supply Top 10; another can.
      scope("world-cup", "كأس العالم", 1, { supportsTop10: false }),
      scope("premier-league", "الدوري الإنجليزي", 2),
      scope("saudi-league", "الدوري السعودي", 3),
      scope("champions-league", "أبطال أوروبا", 4),
      scope("kings-cup", "كأس الملك", 5),
    ],
    isLoading: false,
    isError: false,
  };
  mocks.matchStage = "scope_selection";
  mocks.currentWorldId = "id-football";
  mocks.selectedScopeIds = [];
  mocks.push.mockReset();
  mocks.selectMatchScopes.mockReset();
  mocks.continueMatchWorld.mockReset();
});

describe("home is a dashboard of Worlds", () => {
  it("welcomes the player and leads straight into Worlds", () => {
    render(<WorldsHome />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "أهلاً",
    );
    expect(screen.getByRole("link", { name: "ابدأ لعبة جديدة" })).toHaveAttribute(
      "href",
      "/games/new/setup",
    );
    expect(document.body.textContent).not.toContain("لعبة أسئلة جماعية");

    const featured = screen.getByRole("region", { name: "عوالم مختارة" });
    expect(
      within(featured)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/worlds/id-football",
      "/worlds/id-anime",
      "/worlds/id-video-games",
    ]);

    const all = screen.getByRole("region", { name: "كل العوالم" });
    expect(within(all).getAllByRole("link")).toHaveLength(4);
  });

  it("does not infer an active Match from local browser state", () => {
    render(<WorldsHome />);
    expect(
      screen.queryByRole("region", { name: "أكمل من حيث توقفت" }),
    ).toBeNull();
  });
});

describe("world page selects the four-Scope content pool", () => {
  it("offers every ready Scope as a selection card, not a link", () => {
    render(<WorldScreen worldId="id-football" sessionId="session-1" />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "كرة القدم",
    );
    const cards = screen.getAllByRole("button", { pressed: false });
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "كأس العالم",
      "الدوري الإنجليزي",
      "الدوري السعودي",
      "أبطال أوروبا",
      "كأس الملك",
    ]);
    // A Scope is never a standalone game, so it is never a link.
    const region = screen.getByRole("region", { name: /اختر 4 نطاقات/ });
    expect(within(region).queryAllByRole("link")).toEqual([]);
  });

  it("cannot continue below four and enables continue at exactly four", async () => {
    const user = userEvent.setup();
    render(<WorldScreen worldId="id-football" sessionId="session-1" />);
    const confirm = () => screen.getByRole("button", { name: "ابدأ اللعب" });

    expect(screen.getByTestId("scope-selection-count").textContent).toBe("0/4");
    expect(confirm()).toBeDisabled();

    for (const name of ["كأس العالم", "الدوري الإنجليزي", "الدوري السعودي"]) {
      await user.click(screen.getByRole("button", { name }));
      expect(confirm()).toBeDisabled();
    }
    expect(screen.getByTestId("scope-selection-count").textContent).toBe("3/4");

    await user.click(screen.getByRole("button", { name: "أبطال أوروبا" }));
    expect(screen.getByTestId("scope-selection-count").textContent).toBe("4/4");
    expect(confirm()).toBeEnabled();
  });

  it("refuses a fifth Scope until one is released", async () => {
    const user = userEvent.setup();
    render(<WorldScreen worldId="id-football" sessionId="session-1" />);

    for (const name of [
      "كأس العالم",
      "الدوري الإنجليزي",
      "الدوري السعودي",
      "أبطال أوروبا",
    ]) {
      await user.click(screen.getByRole("button", { name }));
    }
    const fifth = screen.getByRole("button", { name: "كأس الملك" });
    expect(fifth).toBeDisabled();

    // Releasing one opens a slot again.
    await user.click(screen.getByRole("button", { name: "كأس العالم" }));
    expect(screen.getByTestId("scope-selection-count").textContent).toBe("3/4");
    expect(screen.getByRole("button", { name: "كأس الملك" })).toBeEnabled();
  });


  it("shows recovery without a session and never shows a dead Start button", () => {
    render(<WorldScreen worldId="id-football" />);

    expect(screen.getByRole("link", { name: "ابدأ لعبة جديدة أولًا" })).toHaveAttribute(
      "href",
      "/games/new/setup",
    );
    expect(screen.queryByRole("button", { name: "ابدأ اللعب" })).toBeNull();
  });

  it("refuses a route that is not the authoritative current occurrence", () => {
    mocks.currentWorldId = "id-anime";
    render(<WorldScreen worldId="id-football" sessionId="session-1" />);

    expect(screen.getByText("هذا العالم ليس الدور الحالي في المباراة.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "الذهاب إلى العالم الحالي" })).toHaveAttribute(
      "href",
      "/worlds/id-anime?sessionId=session-1",
    );
  });

  it("submits four Scopes against the current occurrence", async () => {
    const user = userEvent.setup();
    render(<WorldScreen worldId="id-football" sessionId="session-1" />);
    for (const name of ["كأس العالم", "الدوري الإنجليزي", "الدوري السعودي", "أبطال أوروبا"]) {
      await user.click(screen.getByRole("button", { name }));
    }
    await user.click(screen.getByRole("button", { name: "ابدأ اللعب" }));

    expect(mocks.selectMatchScopes).toHaveBeenCalledWith({
      sessionId: "session-1",
      revision: 7,
      occurrenceIndex: 0,
      scopeIds: ["world-cup", "premier-league", "saudi-league", "champions-league"],
    });
  });
});

describe("board belongs to the World occurrence", () => {
  beforeEach(() => {
    mocks.matchStage = "board";
    mocks.selectedScopeIds = [
      "world-cup",
      "premier-league",
      "saudi-league",
      "champions-league",
    ];
  });

  it("titles itself by the World and lists all four selected Scopes", () => {
    render(<BoardScreen worldId="id-football" sessionId="session-1" />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "عالم كرة القدم",
    );
    expect(screen.getByText("النطاقات المختارة:")).toBeTruthy();
    for (const name of [
      "كأس العالم",
      "الدوري الإنجليزي",
      "الدوري السعودي",
      "أبطال أوروبا",
    ]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it("shows every challenge at once with its own state and no ordering", () => {
    render(<BoardScreen worldId="id-football" sessionId="session-1" />);

    const tiles = screen.getAllByRole("article");
    expect(tiles).toHaveLength(3);
    expect(tiles.map((tile) => tile.getAttribute("data-availability"))).toEqual(
      ["available", "available", "locked"],
    );
    expect(document.body.textContent).not.toContain("التحدي الأول");
    expect(
      screen.getByText("اختر أي تحدٍّ متاح. لا يوجد ترتيب مفروض."),
    ).toBeTruthy();
  });

  it("keeps a position playable when any Scope in the pool can supply it", () => {
    render(<BoardScreen worldId="id-football" sessionId="session-1" />);

    // slot_2 is excluded by one Scope but usable from another, so it stays open.
    const shared = screen.getByRole("article", { name: "أفضل 10" });
    expect(shared.getAttribute("data-availability")).toBe("available");
  });

  it("keeps a way back to the World to change the pool", () => {
    render(<BoardScreen worldId="id-football" sessionId="session-1" />);

    const trail = screen.getByRole("navigation", { name: "مسار التصفح" });
    expect(
      within(trail)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/", "/worlds/id-football"]);
    expect(
      screen.getByRole("link", { name: "تغيير النطاقات" }).getAttribute("href"),
    ).toBe("/worlds/id-football?sessionId=session-1");
  });

  it("advances to the next authoritative occurrence after World completion", async () => {
    mocks.matchStage = "world_complete";
    mocks.continueMatchWorld.mockResolvedValue({
      match: { stage: { key: "scope_selection" }, currentOccurrence: { worldId: "id-anime" } },
    });
    const user = userEvent.setup();
    render(<BoardScreen worldId="id-football" sessionId="session-1" />);

    await user.click(screen.getByRole("button", { name: "الانتقال إلى العالم التالي" }));
    expect(mocks.push).toHaveBeenCalledWith("/worlds/id-anime?sessionId=session-1");
  });

  it("shows Match complete after the third occurrence", () => {
    mocks.matchStage = "match_complete";
    render(<BoardScreen worldId="id-football" sessionId="session-1" />);

    expect(screen.getByRole("heading", { name: "اكتملت المباراة" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "عرض النتيجة" })).toHaveAttribute(
      "href",
      "/matches/session-1",
    );
  });
});
