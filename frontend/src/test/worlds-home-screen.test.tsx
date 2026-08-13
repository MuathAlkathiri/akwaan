import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { PlayableWorld } from "@/features/worlds/types";

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
  mocks.push.mockReset();
});

describe("home is a dashboard of Worlds", () => {
  it("leads with the product action rather than duplicating account identity", () => {
    render(<WorldsHome />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "اختر عالمك وابدأ التحدي",
    );
    expect(screen.getByText("عوالم مختلفة، تحديات مختلفة، وكل مباراة لها قصتها.")).toBeInTheDocument();
    expect(screen.queryByText(/أهلاً معاذ/)).toBeNull();
    expect(screen.queryByRole("link", { name: "تصفّح كل العوالم" })).toBeNull();
    expect(screen.queryByText("أكوان", { selector: "p" })).toBeNull();
    expect(screen.getByRole("link", { name: "ابدأ مباراة جديدة" })).toHaveAttribute(
      "href",
      "/matches/new",
    );
    expect(document.body.textContent).not.toContain("لعبة أسئلة جماعية");

    const featured = screen.getByRole("region", { name: "عوالم مختارة" });
    expect(
      within(featured)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/matches/new?worldId=id-football",
      "/matches/new?worldId=id-anime",
      "/matches/new?worldId=id-video-games",
    ]);

    const all = screen.getByRole("region", { name: "كل العوالم" });
    expect(within(all).getAllByRole("link")).toHaveLength(4);
  });

  it("activates a side World before allowing it to navigate", () => {
    render(<WorldsHome />);
    const carousel = within(screen.getByTestId("featured-worlds-carousel"));

    expect(
      carousel.getByRole("link", { name: "ادخل عالم كرة القدم" }),
    ).toBeInTheDocument();
    const anime = carousel.getByRole("link", { name: "اعرض عالم أنمي" });
    fireEvent.click(anime);

    expect(
      carousel.getByRole("link", { name: "ادخل عالم أنمي" }),
    ).toHaveAttribute("href", "/matches/new?worldId=id-anime");
    expect(screen.getByTestId("featured-world-position")).toHaveTextContent(
      "2 من 3",
    );
  });

  it("rotates the featured World every five seconds", () => {
    vi.useFakeTimers();
    render(<WorldsHome />);

    expect(screen.getByTestId("featured-world-position")).toHaveTextContent(
      "1 من 3",
    );
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByTestId("featured-world-position")).toHaveTextContent(
      "2 من 3",
    );
    vi.useRealTimers();
  });

  it("does not infer an active Match from local browser state", () => {
    render(<WorldsHome />);
    expect(
      screen.queryByRole("region", { name: "أكمل من حيث توقفت" }),
    ).toBeNull();
  });
});
