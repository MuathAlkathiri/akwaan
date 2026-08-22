import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PlayableScope, PlayableWorld } from "@/features/worlds/types";

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

const scope = (index: number): PlayableScope => ({
  id: `scope-${index}`,
  worldId: football.id,
  name: `نطاق ${index}`,
  slug: `scope-${index}`,
  sortOrder: index,
  readyContentItemCount: 3,
  usableSlots: [
    {
      slotKey: "slot_1",
      challengeTypeSlug: "read-your-opponent",
      family: "ryo",
      displayName: "اقرأ خصمك",
      sortOrder: 0,
    },
  ],
});

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
  mocks.scopes = Array.from({ length: 5 }, (_, index) => scope(index + 1));
});

describe("home is a dashboard of Worlds", () => {
  it("leads with the approved product explanation and real World controls", () => {
    render(<WorldsHome />);

    const headline = screen.getByRole("heading", { level: 1 });
    expect(headline).toHaveTextContent("اختر 3 عوالم");
    expect(headline).toHaveTextContent("التحدي!");
    expect(screen.getByRole("button", { name: "كرة القدم" })).toBeInTheDocument();
    // The ordered selection bar and its way into setup replace the old rail.
    expect(screen.getByTestId("selection-order-bar")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /متابعة إعداد المباراة/ }),
    ).toBeInTheDocument();
    // A headline mechanic orbits the hero (and may also label a World's card).
    expect(screen.getAllByText("الكومبو").length).toBeGreaterThan(0);
  });

  it("opens Scope selection on the homepage instead of navigating", () => {
    render(<WorldsHome />);
    fireEvent.click(screen.getByRole("button", { name: "كرة القدم" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("عالم كرة القدم")).toBeInTheDocument();
    expect(
      screen.getByText("اختر النطاقات اللي تبغاها في المباراة"),
    ).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("builds a guest selection locally and updates the selected Worlds rail", () => {
    render(<WorldsHome />);
    fireEvent.click(screen.getByRole("button", { name: "كرة القدم" }));
    for (let index = 1; index <= 4; index += 1) {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(`نطاق ${index}$`) }),
      );
    }
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الاختيار" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "كرة القدم" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("نطاق 1، نطاق 2، نطاق 3، نطاق 4")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("does not infer an active Match from local browser state", () => {
    render(<WorldsHome />);
    expect(
      screen.queryByRole("region", { name: "أكمل من حيث توقفت" }),
    ).toBeNull();
  });
});
