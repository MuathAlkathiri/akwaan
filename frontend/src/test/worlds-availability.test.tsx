import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { PlayableScope, PlayableWorld } from "@/features/worlds/types";

/**
 * Which Worlds a player may open, and which are only announced.
 *
 * The bug these exist for was one screen holding two opinions: الأغاني shipped
 * and appeared in the selectable grid, while a hardcoded roadmap array below it
 * went on calling the same World «قريبًا». Both rows now partition one catalog
 * response, so the contradiction is not a thing that can be reintroduced by
 * forgetting to edit a list.
 */

const mocks = vi.hoisted(() => ({
  worlds: { data: [] as PlayableWorld[], isLoading: false, isError: false },
  scopes: [] as PlayableScope[],
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
  usePlayableScopes: (worldId?: string) => ({
    data: mocks.scopes.filter((scope) => scope.worldId === worldId),
    isLoading: false,
    isError: false,
    isSuccess: true,
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

import { WorldsHome } from "@/features/worlds";
import {
  playableWorlds,
  upcomingWorlds,
} from "@/features/worlds/utils/featured-worlds";

const world = (
  slug: string,
  name: string,
  sortOrder: number,
  availability: PlayableWorld["availability"] = "available",
  art?: PlayableWorld["banner"],
): PlayableWorld => ({
  id: `id-${slug}`,
  name,
  slug,
  sortOrder,
  scopeCount: 4,
  challengeConfigurationCount: 4,
  availability,
  ...(art ? { banner: art } : {}),
});

/** الأغاني after it shipped, which is exactly the state that exposed the bug. */
const MUSIC_AVAILABLE = world("music", "الأغاني", 1);
const MUSIC_UPCOMING = world("music", "الأغاني", 1, "upcoming");
const MOVIES = world("movies", "الأفلام", 5, "upcoming");

const UPCOMING_SECTION = "عوالم جديدة في الطريق";

const setCatalog = (worlds: PlayableWorld[]) => {
  mocks.worlds = { data: worlds, isLoading: false, isError: false };
};

const upcomingList = () => screen.queryByTestId("upcoming-worlds");

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.isAuthenticated = true;
  mocks.scopes = [];
  setCatalog([MUSIC_AVAILABLE, world("anime", "أنمي", 2), MOVIES]);
});

describe("the worlds page reads availability from the catalog", () => {
  it("never shows one World in both rows", () => {
    render(<WorldsHome />);
    const upcoming = upcomingList()!;
    // الأغاني is selectable, so it must not also be announced as coming.
    expect(within(upcoming).queryByText("الأغاني")).toBeNull();
    expect(within(upcoming).getByText("الأفلام")).toBeInTheDocument();
  });

  it("partitions the catalog, so the two groups can never intersect", () => {
    const catalog = [MUSIC_AVAILABLE, MOVIES, world("q", "أسئلة", 9, "upcoming")];
    const available = playableWorlds(catalog).map((entry) => entry.id);
    const upcoming = upcomingWorlds(catalog).map((entry) => entry.id);
    expect(available.filter((id) => upcoming.includes(id))).toEqual([]);
    expect([...available, ...upcoming].sort()).toEqual(
      catalog.map((entry) => entry.id).sort(),
    );
  });

  it("announces an upcoming World without making it selectable", () => {
    render(<WorldsHome />);
    const card = screen.getByTestId("upcoming-world-movies");
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(card).toHaveTextContent("الأفلام");
    expect(card).toHaveTextContent("قريبًا");
    expect(within(card).queryByRole("button")).toBeNull();
    expect(within(card).queryByRole("link")).toBeNull();
  });

  it("promotes a World on new API data alone, with no code that knows its slug", () => {
    // Before: the catalog calls الأغاني upcoming, so it is announced only.
    setCatalog([MUSIC_UPCOMING, world("anime", "أنمي", 2), MOVIES]);
    const first = render(<WorldsHome />);
    expect(
      within(upcomingList()!).getByText("الأغاني"),
    ).toBeInTheDocument();
    first.unmount();

    // After: the same World, now available. Nothing about this page changed.
    setCatalog([MUSIC_AVAILABLE, world("anime", "أنمي", 2), MOVIES]);
    render(<WorldsHome />);
    expect(within(upcomingList()!).queryByText("الأغاني")).toBeNull();
  });

  it("hides the whole section when nothing is coming", () => {
    setCatalog([MUSIC_AVAILABLE, world("anime", "أنمي", 2)]);
    render(<WorldsHome />);
    expect(screen.queryByText(UPCOMING_SECTION)).toBeNull();
    expect(upcomingList()).toBeNull();
    expect(screen.queryByText("قريبًا")).toBeNull();
  });

  it("falls back to the neutral placeholder when a World has no artwork", () => {
    render(<WorldsHome />);
    const card = screen.getByTestId("upcoming-world-movies");
    // The neutral dashed plate, not a broken image and not a blank hole.
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector("svg")).toBeTruthy();
    expect(card).toHaveTextContent("الأفلام");
    expect(card).toHaveTextContent("قريبًا");
  });

  it("shows the World's own artwork when the catalog has some", () => {
    setCatalog([
      MUSIC_AVAILABLE,
      world("series", "المسلسلات", 6, "upcoming", {
        url: "/uploads/series.webp",
        altText: "المسلسلات",
      }),
    ]);
    render(<WorldsHome />);
    const card = screen.getByTestId("upcoming-world-series");
    expect(card.querySelector("img")).toBeTruthy();
    expect(card).toHaveTextContent("المسلسلات");
    expect(card).toHaveTextContent("قريبًا");
  });

  it("treats a World with no availability field as playable", () => {
    // An older backend only ever returned playable Worlds and sent no
    // availability at all; a deploy skew must not blank the page.
    const legacy = { ...MUSIC_AVAILABLE };
    delete legacy.availability;
    expect(playableWorlds([legacy])).toHaveLength(1);
    expect(upcomingWorlds([legacy])).toHaveLength(0);
  });

  it("orders both rows by the catalog's own sortOrder", () => {
    const catalog = [
      world("c", "ج", 3, "upcoming"),
      world("a", "أ", 1, "upcoming"),
      world("b", "ب", 2, "upcoming"),
    ];
    expect(upcomingWorlds(catalog).map((entry) => entry.slug)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
