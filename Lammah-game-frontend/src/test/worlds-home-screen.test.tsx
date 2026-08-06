import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type {
  PlayableBoardSlot,
  PlayableScope,
  PlayableWorld,
} from "@/features/worlds/types";

/**
 * The public World surfaces.
 *
 * Browsing only. Setting a Match up happens in the wizard, before a session
 * exists, so neither of these screens may offer a way to choose a content pool, to
 * open a board, or to reach a Match — they read the public catalogue and point at
 * the wizard.
 */

const mocks = vi.hoisted(() => ({
  worlds: { data: [] as PlayableWorld[], isLoading: false, isError: false },
  scopes: { data: [] as PlayableScope[], isLoading: false, isError: false },
  isAuthenticated: true,
  push: vi.fn(),
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
    isSuccess: !mocks.scopes.isLoading && !mocks.scopes.isError,
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

import { WorldScreen, WorldsHome } from "@/features/worlds";

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
  options: { usable?: boolean } = {},
): PlayableScope {
  return {
    id,
    worldId: "id-football",
    name,
    slug: id,
    sortOrder,
    readyContentItemCount: 112,
    usableSlots:
      options.usable === false
        ? []
        : [
            slot("slot_1", "read-your-opponent", "اقرأ خصمك", 0),
            slot("slot_3", "same-wavelength", "نفس الموجة", 2),
          ],
  };
}

const football = world("football", "كرة القدم", 1);

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
      scope("world-cup", "كأس العالم", 1),
      scope("premier-league", "الدوري الإنجليزي", 2),
      scope("saudi-league", "الدوري السعودي", 3),
      scope("champions-league", "أبطال أوروبا", 4),
      scope("kings-cup", "كأس الملك", 5),
    ],
    isLoading: false,
    isError: false,
  };
  mocks.push.mockReset();
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

describe("the World page is browsing, not setup", () => {
  it("shows the World and its ready Scopes as reading material", () => {
    render(<WorldScreen worldId="id-football" />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "كرة القدم",
    );
    const region = screen.getByRole("region", { name: "نطاقات هذا العالم" });
    expect(within(region).getAllByRole("heading", { level: 3 })).toHaveLength(5);
    expect(within(region).getByText("كأس العالم")).toBeTruthy();
  });

  it("offers no way to choose a pool, open a board, or start a Match", () => {
    render(<WorldScreen worldId="id-football" />);

    // No selection affordance of any kind, and no count-to-four.
    expect(screen.queryAllByRole("button", { pressed: false })).toHaveLength(0);
    expect(screen.queryByTestId("scope-selection-count")).toBeNull();
    expect(document.body.textContent).not.toContain("اختاروا 4 نطاقات");
    expect(
      screen
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
        .filter((href) => href?.includes("/board")),
    ).toHaveLength(0);
  });

  it("points at the setup wizard as the only way into a Match", () => {
    render(<WorldScreen worldId="id-football" />);

    expect(
      screen.getByRole("link", { name: /ابدأ لعبة جديدة/ }),
    ).toHaveAttribute("href", "/games/new/setup");
  });

  it("hides a Scope with no usable board position", () => {
    mocks.scopes.data = [
      scope("world-cup", "كأس العالم", 1),
      scope("empty", "نطاق فارغ", 2, { usable: false }),
    ];
    render(<WorldScreen worldId="id-football" />);

    const region = screen.getByRole("region", { name: "نطاقات هذا العالم" });
    expect(within(region).getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(within(region).queryByText("نطاق فارغ")).toBeNull();
  });

  it("keeps a failed Scope load apart from a genuinely empty World", () => {
    mocks.scopes = { data: [], isLoading: false, isError: true };
    render(<WorldScreen worldId="id-football" />);
    expect(screen.getByText("تعذر تحميل النطاقات")).toBeTruthy();

    mocks.scopes = { data: [], isLoading: false, isError: false };
    render(<WorldScreen worldId="id-football" />);
    expect(
      screen.getByText("لا توجد نطاقات جاهزة في هذا العالم بعد."),
    ).toBeTruthy();
  });
});
