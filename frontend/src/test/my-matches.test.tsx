import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyMatchesPageData, MyMatchSummary } from "@/features/my-matches";

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  push: vi.fn(),
  writeDraft: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
  usePathname: () => "/matches",
}));
vi.mock("@/components/auth/require-auth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/features/my-matches/use-my-matches", () => ({
  useMyMatches: () => state.query,
}));
vi.mock("@/features/worlds/hooks/use-player-catalog", () => ({
  usePlayableWorlds: () => ({
    data: [
      { id: "world-0", name: "كرة القدم" },
      { id: "world-1", name: "الأنمي" },
      { id: "world-2", name: "فيديو قيمز" },
    ],
  }),
}));
vi.mock("@/features/match-setup", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/match-setup")>();
  return { ...original, writeStoredDraft: state.writeDraft };
});

import { MyMatchesPage } from "@/features/my-matches";

const active: MyMatchSummary = {
  matchId: "match-1",
  liveSessionId: "session-1",
  status: "active",
  stage: "board",
  resumeState: "resumable",
  resumable: true,
  createdAt: "2026-08-25T10:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z",
  teams: [
    {
      id: "t1",
      name: "فرسان المعرفة الطويل جدًا",
      signedScore: 2,
      displayScore: 2,
    },
    {
      id: "t2",
      name: "أبطال الأكوان الطويل جدًا",
      signedScore: 1,
      displayScore: 1,
    },
  ],
  occurrences: [0, 1, 2].map((index) => ({
    occurrenceIndex: index,
    worldId: `world-${index}`,
    selectedScopeIds: ["a", "b", "c", "d"].map((scope) => `${index}-${scope}`),
  })),
  progress: { completedChallenges: 3, totalChallenges: 12 },
};

const completed: MyMatchSummary = {
  ...active,
  matchId: "match-2",
  liveSessionId: "session-2",
  status: "completed",
  stage: "match_complete",
  resumeState: "session_terminal",
  resumable: false,
  completedAt: "2026-08-26T10:00:00.000Z",
  result: { winnerTeamId: "t1", tie: false },
};

function data(overrides: Partial<MyMatchesPageData> = {}): MyMatchesPageData {
  return {
    active: [],
    completed: [],
    pagination: { page: 1, limit: 10, completedTotal: 0, hasMore: false },
    ...overrides,
  };
}

beforeEach(() => {
  state.push.mockReset();
  state.writeDraft.mockReset();
  state.query = {
    data: data(),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
});

describe("My Games page", () => {
  it("renders loading, errors with retry, and both empty states", () => {
    state.query = { isLoading: true, isError: false };
    const view = render(<MyMatchesPage />);
    // The initial query shows card skeletons in the final geometry, not text.
    expect(screen.getByTestId("my-matches-skeleton")).toBeInTheDocument();
    // The page shell (title) stays visible above the skeleton.
    expect(screen.getByRole("heading", { name: "مبارياتي" })).toBeInTheDocument();

    const refetch = vi.fn();
    state.query = { isLoading: false, isError: true, refetch };
    view.rerender(<MyMatchesPage />);
    fireEvent.click(screen.getByRole("button", { name: "حاول مرة ثانية" }));
    expect(refetch).toHaveBeenCalledOnce();

    state.query = { data: data(), isLoading: false, isError: false };
    view.rerender(<MyMatchesPage />);
    expect(
      screen.getByText("ما عندك مباراة جارية حاليًا."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ما لعبت مباريات مكتملة حتى الآن."),
    ).toBeInTheDocument();
  });

  it("shows an RTL active card whose Resume link keeps the same session id", () => {
    state.query = {
      data: data({ active: [active] }),
      isLoading: false,
      isError: false,
    };
    render(<MyMatchesPage />);

    expect(screen.getByText("فرسان المعرفة الطويل جدًا")).toHaveAttribute(
      "title",
      "فرسان المعرفة الطويل جدًا",
    );
    expect(screen.getByText("كرة القدم")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /كمّل المباراة/ })).toHaveAttribute(
      "href",
      "/matches/session-1",
    );
    expect(
      screen.getByText("مبارياتي").closest("div[dir='rtl']"),
    ).not.toBeNull();
  });

  it("keeps an expired active Match factual and non-actionable", () => {
    state.query = {
      data: data({
        active: [
          { ...active, resumable: false, resumeState: "session_expired" },
        ],
      }),
      isLoading: false,
      isError: false,
    };
    render(<MyMatchesPage />);

    expect(screen.getByText("انتهت صلاحية الجلسة")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /كمّل المباراة/ })).toBeNull();
  });

  it("writes a setup-only replay draft before navigating to Team Setup", () => {
    state.query = {
      data: data({
        completed: [completed],
        pagination: { page: 1, limit: 10, completedTotal: 1, hasMore: false },
      }),
      isLoading: false,
      isError: false,
    };
    render(<MyMatchesPage />);
    fireEvent.click(screen.getByRole("button", { name: /العب مرة ثانية/ }));

    expect(state.writeDraft).toHaveBeenCalledOnce();
    const draft = state.writeDraft.mock.calls[0][0];
    expect(draft.activeStep).toBe("teams");
    expect(
      draft.occurrences.map((entry: { worldId: string }) => entry.worldId),
    ).toEqual(["world-0", "world-1", "world-2"]);
    expect(draft).not.toHaveProperty("matchId");
    expect(draft).not.toHaveProperty("score");
    expect(draft).not.toHaveProperty("progress");
    expect(state.push).toHaveBeenCalledWith("/matches/new");
  });
});
