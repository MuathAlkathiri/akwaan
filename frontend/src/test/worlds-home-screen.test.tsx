import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

const scope = (index: number, worldId = football.id): PlayableScope => ({
  id: `scope-${index}`,
  worldId,
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
  window.sessionStorage.clear();
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
  mocks.scopes = mocks.worlds.data.flatMap((entry, worldIndex) =>
    Array.from({ length: entry.id === football.id ? 5 : 4 }, (_, index) => ({
      ...scope(index + 1, entry.id),
      id: `scope-${worldIndex + 1}-${index + 1}`,
    })),
  );
});

function chooseFourScopes() {
  for (let index = 1; index <= 4; index += 1) {
    fireEvent.click(screen.getByRole("button", { name: `نطاق ${index}` }));
  }
}

describe("home is a dashboard of Worlds", () => {
  it("leads with the approved product explanation and real World controls", () => {
    render(<WorldsHome />);

    const headline = screen.getByRole("heading", { level: 1 });
    expect(headline).toHaveTextContent("3 عوالم مختلفة، منافسة واحدة");
    // Each active World is a circular portal button keyed by its name.
    expect(
      screen.getByRole("button", { name: "كرة القدم" }),
    ).toBeInTheDocument();
    // The ordered selection surface and its way into setup.
    expect(screen.getByTestId("world-selection-sidebar")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /متابعة إعداد المباراة/ }),
    ).toBeInTheDocument();
    // A World's signature label still renders (anime → الكومبو).
    expect(screen.getAllByText("الكومبو").length).toBeGreaterThan(0);
  });

  it("enters inline Scope Focus Mode instead of a modal or navigation", () => {
    render(<WorldsHome />);
    fireEvent.click(screen.getByRole("button", { name: "كرة القدم" }));
    expect(screen.getByTestId("scope-focus-mode")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "كرة القدم" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "اختر نطاقات كرة القدم" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("حدد النطاقات اللي تبغون تدخل في المباراة."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "نطاق 1" })).toBeInTheDocument();
    expect(screen.getAllByTestId("scope-choice-card")[0]).toHaveClass(
      "aspect-video",
    );
    expect(screen.getAllByTestId("scope-name-overlay")[0]).toHaveTextContent(
      "نطاق 1",
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("builds a guest selection locally and updates the selected Worlds rail", () => {
    render(<WorldsHome />);
    fireEvent.click(screen.getByRole("button", { name: "كرة القدم" }));
    const confirm = screen.getAllByRole("button", {
      name: /تأكيد النطاقات/,
    })[0];
    expect(confirm).toBeDisabled();
    chooseFourScopes();
    expect(confirm).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "نطاق 5" })).toBeDisabled();
    fireEvent.click(confirm);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("scope-focus-mode")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "كرة القدم" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(screen.getByRole("button", { name: "كرة القدم" })).getByText("1"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("نطاق 1، نطاق 2، نطاق 3، نطاق 4"),
    ).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("discards unconfirmed Scope changes when returning to Worlds", () => {
    render(<WorldsHome />);
    fireEvent.click(screen.getByRole("button", { name: "كرة القدم" }));
    fireEvent.click(screen.getByRole("button", { name: "نطاق 1" }));
    fireEvent.click(screen.getByRole("button", { name: "نطاق 2" }));
    fireEvent.click(screen.getAllByRole("button", { name: "رجوع للعوالم" })[0]);

    expect(screen.getByRole("button", { name: "كرة القدم" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      within(screen.getByTestId("world-selection-sidebar")).queryByRole(
        "button",
        { name: "تعديل كرة القدم" },
      ),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "كرة القدم" }));
    expect(screen.getByTestId("scope-count")).toHaveTextContent(
      "0 من 4 مختارة",
    );
  });

  it("hydrates confirmed Scopes when editing without reordering the World", () => {
    render(<WorldsHome />);
    fireEvent.click(screen.getByRole("button", { name: "كرة القدم" }));
    chooseFourScopes();
    fireEvent.click(
      screen.getAllByRole("button", { name: /تأكيد النطاقات/ })[0],
    );

    fireEvent.click(screen.getByRole("button", { name: "كرة القدم" }));
    expect(screen.getByTestId("scope-count")).toHaveTextContent(
      "4 من 4 مختارة",
    );
    expect(screen.getByRole("button", { name: "نطاق 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "نطاق 1" }));
    fireEvent.click(screen.getByRole("button", { name: "نطاق 5" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: /تأكيد النطاقات/ })[0],
    );

    expect(screen.getByRole("button", { name: "كرة القدم" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(screen.getByRole("button", { name: "كرة القدم" })).getByText("1"),
    ).toBeInTheDocument();
    expect(screen.getByText(/نطاق 5/)).toBeInTheDocument();
  });

  it("keeps the exactly-three World limit after confirmed Scope selections", () => {
    render(<WorldsHome />);
    for (const worldName of ["كرة القدم", "أنمي", "ألعاب الفيديو"]) {
      fireEvent.click(screen.getByRole("button", { name: worldName }));
      chooseFourScopes();
      fireEvent.click(
        screen.getAllByRole("button", { name: /تأكيد النطاقات/ })[0],
      );
    }

    expect(
      within(screen.getByTestId("world-selection-sidebar")).getByText("3/3"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تاريخ" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "كرة القدم" }),
    ).not.toBeDisabled();
  });

  it("communicates every ordered selection step and enables Continue only at 3/3", () => {
    render(<WorldsHome />);
    const continueLink = screen.getByRole("link", {
      name: /متابعة إعداد المباراة/,
    });

    expect(
      within(screen.getByTestId("world-selection-sidebar")).getByText("0/3"),
    ).toBeInTheDocument();
    expect(continueLink).toHaveAttribute("aria-disabled", "true");

    for (const [index, worldName] of [
      "كرة القدم",
      "أنمي",
      "ألعاب الفيديو",
    ].entries()) {
      fireEvent.click(screen.getByRole("button", { name: worldName }));
      chooseFourScopes();
      fireEvent.click(
        screen.getAllByRole("button", { name: /تأكيد النطاقات/ })[0],
      );

      const sidebar = screen.getByTestId("world-selection-sidebar");
      expect(within(sidebar).getByText(`${index + 1}/3`)).toBeInTheDocument();
      expect(
        within(sidebar).getByRole("button", { name: `تعديل ${worldName}` }),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole("button", { name: worldName })).getByText(
          String(index + 1),
        ),
      ).toBeInTheDocument();
    }

    expect(
      screen.getByRole("link", { name: /متابعة إعداد المباراة/ }),
    ).toHaveAttribute("aria-disabled", "false");
  });

  it("keeps every coming-soon World muted and outside the interactive controls", () => {
    render(<WorldsHome />);

    for (const label of ["الأفلام", "المسلسلات", "الأغاني", "المزيد قريباً"]) {
      expect(
        screen.getByText(label).closest("[aria-disabled]"),
      ).toHaveAttribute("aria-disabled", "true");
      expect(
        screen.queryByRole("button", { name: label }),
      ).not.toBeInTheDocument();
    }
    expect(screen.getAllByText("قريبًا")).toHaveLength(4);
  });

  it("does not infer an active Match from local browser state", () => {
    render(<WorldsHome />);
    expect(
      screen.queryByRole("region", { name: "أكمل من حيث توقفت" }),
    ).toBeNull();
  });
});
