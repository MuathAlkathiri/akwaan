import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlayableScope, PlayableWorld } from "@/features/worlds/types";

/**
 * The pre-match setup journey, end to end in the browser environment.
 *
 * The load-bearing assertion is negative: while the host is choosing Worlds and
 * Scopes, *no* server call happens at all. The Match is created once, by the last
 * button, from one payload.
 */

const ANIME = "world-anime";
const FOOTBALL = "world-football";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createSession: vi.fn(),
  markReady: vi.fn(),
  startSession: vi.fn(),
  createMatch: vi.fn(),
  cancelSession: vi.fn(),
}));

/** Every server call the wizard could possibly make, counted in one place. */
const serverCalls = () =>
  mocks.createSession.mock.calls.length +
  mocks.markReady.mock.calls.length +
  mocks.startSession.mock.calls.length +
  mocks.createMatch.mock.calls.length +
  mocks.cancelSession.mock.calls.length;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.push }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/features/live-game-session/api/live-session-api", () => ({
  createLiveSession: mocks.createSession,
  cancelLiveSession: mocks.cancelSession,
}));

vi.mock("@/features/match-setup/api/unified-match.api", () => ({
  createUnifiedMatch: mocks.createMatch,
  markLiveSessionReady: mocks.markReady,
  startLiveSession: mocks.startSession,
}));

vi.mock("@/components/auth/require-auth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const world = (id: string, name: string): PlayableWorld => ({
  id,
  name,
  slug: id,
  description: `${name} description`,
  sortOrder: 0,
  scopeCount: 8,
  challengeConfigurationCount: 4,
});

const scope = (id: string, name: string, worldId: string): PlayableScope => ({
  id,
  worldId,
  name,
  slug: id,
  description: `${name} scope`,
  sortOrder: Number(id.split("-").pop() ?? 0),
  readyContentItemCount: 6,
  usableSlots: [
    {
      slotKey: "slot_1",
      challengeTypeId: `${worldId}-type-1`,
      challengeTypeSlug: "read-your-opponent",
      family: "ryo",
      displayName: "اقرأ خصمك",
      itemStructure: "discrete_triple",
      answerMode: "ryo",
      scoringRuleId: "ryo",
      sortOrder: 0,
    },
  ],
});

const scopesByWorld: Record<string, PlayableScope[]> = {
  [ANIME]: Array.from({ length: 8 }, (_, index) =>
    scope(`anime-scope-${index}`, `نطاق أنمي ${index}`, ANIME),
  ),
  [FOOTBALL]: Array.from({ length: 6 }, (_, index) =>
    scope(`football-scope-${index}`, `نطاق كرة ${index}`, FOOTBALL),
  ),
};

vi.mock("@/features/worlds/hooks/use-player-catalog", () => ({
  usePlayableWorlds: () => ({
    data: [world(ANIME, "انمي"), world(FOOTBALL, "كرة القدم")],
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    refetch: vi.fn(),
  }),
  usePlayableWorld: (worldId?: string) => ({
    data: worldId
      ? [world(ANIME, "انمي"), world(FOOTBALL, "كرة القدم")].find(
          (entry) => entry.id === worldId,
        )
      : undefined,
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    refetch: vi.fn(),
  }),
  usePlayableScopes: (worldId?: string) => ({
    data: worldId ? (scopesByWorld[worldId] ?? []) : [],
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

// The review screen reads names through the same public player endpoints.
vi.mock("@tanstack/react-query", () => ({
  useQueries: ({ queries }: { queries: Array<{ queryKey: unknown[] }> }) =>
    queries.map((query) => {
      const [, , worldId, leaf] = query.queryKey as string[];
      return {
        data:
          leaf === "scopes"
            ? (scopesByWorld[worldId] ?? [])
            : [world(ANIME, "انمي"), world(FOOTBALL, "كرة القدم")].find(
                (entry) => entry.id === worldId,
              ),
        isLoading: false,
        isError: false,
      };
    }),
}));

import { MatchSetupWizard } from "@/features/match-setup";
import { MATCH_SETUP_DRAFT_STORAGE_KEY } from "@/features/match-setup";

const boardSnapshot = (sessionId: string) => ({
  sessionId,
  revision: 4,
  status: "active",
  match: {
    id: "match-1",
    revision: 0,
    setupMode: "unified_preconfigured",
    status: "active",
    stage: { key: "board" },
    unified: {
      occurrences: [
        { occurrenceIndex: 0, worldId: ANIME },
        { occurrenceIndex: 1, worldId: FOOTBALL },
        { occurrenceIndex: 2, worldId: ANIME },
      ],
      board: { positions: Array.from({ length: 12 }), totalPositionCount: 12 },
    },
  },
});

beforeEach(() => {
  window.sessionStorage.clear();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.createSession.mockResolvedValue({
    reconnectToken: "reconnect-token",
    snapshot: { sessionId: "session-1", revision: 0, status: "waiting" },
  });
  mocks.markReady.mockResolvedValue({ sessionId: "session-1", revision: 1 });
  mocks.startSession.mockResolvedValue({ sessionId: "session-1", revision: 2 });
  mocks.createMatch.mockResolvedValue(boardSnapshot("session-1"));
  mocks.cancelSession.mockResolvedValue({ sessionId: "session-1", revision: 3 });
});

/** Picks a World, then its first four offered Scopes, then continues. */
async function configureOccurrence(
  user: ReturnType<typeof userEvent.setup>,
  worldName: string,
  scopeNames: string[],
) {
  await user.click(screen.getByRole("button", { name: worldName }));
  for (const name of scopeNames) {
    await user.click(screen.getByRole("button", { name }));
  }
  await user.click(screen.getByRole("button", { name: "متابعة" }));
}

const ANIME_FIRST_FOUR = [
  "نطاق أنمي 0",
  "نطاق أنمي 1",
  "نطاق أنمي 2",
  "نطاق أنمي 3",
];
const ANIME_SECOND_FOUR = [
  "نطاق أنمي 4",
  "نطاق أنمي 5",
  "نطاق أنمي 6",
  "نطاق أنمي 7",
];
const FOOTBALL_FOUR = [
  "نطاق كرة 0",
  "نطاق كرة 1",
  "نطاق كرة 2",
  "نطاق كرة 3",
];

/** Anime, Football, Anime again from a different pool — then to the teams step. */
async function configureWholeMatch(user: ReturnType<typeof userEvent.setup>) {
  await configureOccurrence(user, "انمي", ANIME_FIRST_FOUR);
  await configureOccurrence(user, "كرة القدم", FOOTBALL_FOUR);
  await configureOccurrence(user, "انمي", ANIME_SECOND_FOUR);
}

describe("pre-match setup wizard", () => {
  it("begins on the first occurrence's World selection", () => {
    render(<MatchSetupWizard />);

    expect(
      screen.getByRole("heading", { name: "اختر العالم الأول" }),
    ).toBeTruthy();
    expect(screen.getByTestId("match-setup-wizard").dataset.step).toBe("world");
    // No sequential stage is ever rendered here.
    expect(screen.queryByText(/رمية الاختيار/)).toBeNull();
    expect(serverCalls()).toBe(0);
  });

  it("opens the Scope step for the chosen World and enforces exactly four", async () => {
    const user = userEvent.setup();
    render(<MatchSetupWizard />);

    await user.click(screen.getByRole("button", { name: "انمي" }));
    expect(
      screen.getByRole("heading", { name: "اختر 4 نطاقات لهذا العالم" }),
    ).toBeTruthy();
    expect(screen.getAllByTestId("scope-card-media")).toHaveLength(8);
    expect(screen.getAllByTestId("scope-artwork-pending")).toHaveLength(8);
    expect(screen.getAllByTestId("scope-card-media")[0]).toHaveClass(
      "h-40",
      "sm:h-44",
    );
    expect(screen.getByTestId("scope-count").textContent).toBe("0/4");
    // Three Scopes cannot continue.
    for (const name of ANIME_FIRST_FOUR.slice(0, 3)) {
      await user.click(screen.getByRole("button", { name }));
    }
    expect(screen.getByTestId("scope-count").textContent).toBe("3/4");
    expect(
      screen.getByRole("button", { name: "متابعة" }).hasAttribute("disabled"),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: ANIME_FIRST_FOUR[3] }));
    expect(screen.getByTestId("scope-count").textContent).toBe("4/4");
    expect(
      screen.getByRole("button", { name: "متابعة" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("refuses a fifth Scope until one is released", async () => {
    const user = userEvent.setup();
    render(<MatchSetupWizard />);

    await user.click(screen.getByRole("button", { name: "انمي" }));
    for (const name of ANIME_FIRST_FOUR) {
      await user.click(screen.getByRole("button", { name }));
    }
    const fifth = screen.getByRole("button", { name: "نطاق أنمي 4" });
    expect(fifth.hasAttribute("disabled")).toBe(true);
    await user.click(fifth);
    expect(screen.getByTestId("scope-count").textContent).toBe("4/4");

    await user.click(screen.getByRole("button", { name: ANIME_FIRST_FOUR[0] }));
    expect(screen.getByTestId("scope-count").textContent).toBe("3/4");
    await user.click(screen.getByRole("button", { name: "نطاق أنمي 4" }));
    expect(screen.getByTestId("scope-count").textContent).toBe("4/4");
  });

  it("clears the Scopes when the occurrence's World is changed", async () => {
    const user = userEvent.setup();
    render(<MatchSetupWizard />);

    await user.click(screen.getByRole("button", { name: "انمي" }));
    for (const name of ANIME_FIRST_FOUR) {
      await user.click(screen.getByRole("button", { name }));
    }
    await user.click(screen.getByRole("button", { name: "تغيير العالم" }));
    await user.click(screen.getByRole("button", { name: "كرة القدم" }));

    expect(screen.getByTestId("scope-count").textContent).toBe("0/4");
    expect(screen.getByRole("button", { name: "نطاق كرة 0" })).toBeTruthy();
  });

  it("reviews three occurrences with the repeated World kept separate", async () => {
    const user = userEvent.setup();
    render(<MatchSetupWizard />);

    await configureWholeMatch(user);

    expect(screen.getByRole("heading", { name: "مراجعة المباراة" })).toBeTruthy();
    const summary = screen.getByTestId("review-summary");
    expect(summary.textContent).toContain("3 عوالم");
    expect(summary.textContent).toContain("12 نطاقًا مختارًا");
    expect(summary.textContent).toContain("12 تحديًا على البورد");
    expect(summary.textContent).toContain("يمكن اختيار التحديات بأي ترتيب");
    expect(summary.textContent).toContain(
      "بعض التحديات قد تحتاج جوالات بعد بدء المباراة",
    );

    // Three cards, the first and third both Anime, with different Scopes.
    const first = screen.getByTestId("review-occurrence-0");
    const third = screen.getByTestId("review-occurrence-2");
    expect(within(first).getByText("انمي")).toBeTruthy();
    expect(within(third).getByText("انمي")).toBeTruthy();
    expect(within(first).getByText("نطاق أنمي 0")).toBeTruthy();
    expect(within(third).getByText("نطاق أنمي 4")).toBeTruthy();
    expect(within(first).queryByText("نطاق أنمي 4")).toBeNull();
    expect(within(third).queryByText("نطاق أنمي 0")).toBeNull();
    expect(
      within(screen.getByTestId("review-occurrence-1")).getByText("كرة القدم"),
    ).toBeTruthy();

    // Still no QR, no session code, and no server call.
    expect(screen.queryByText(/رمز الانضمام|QR/)).toBeNull();
    expect(serverCalls()).toBe(0);
  });

  it("creates nothing until ابدأ المباراة, then creates exactly one Match", async () => {
    const user = userEvent.setup();
    render(<MatchSetupWizard />);

    await configureWholeMatch(user);
    await user.click(screen.getByRole("button", { name: "متابعة إلى الفريقين" }));
    // Setup is finished and the server has still not been touched.
    expect(serverCalls()).toBe(0);

    await user.click(screen.getByRole("button", { name: "ابدأ المباراة" }));

    await waitFor(() => expect(mocks.createMatch).toHaveBeenCalledTimes(1));
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.createSession).toHaveBeenCalledWith({
      teamNames: ["الأخضر", "الوردي"],
    });
    // The session leaves the lobby over HTTP, with no phones involved.
    expect(mocks.markReady).toHaveBeenCalledWith("session-1", 0);
    expect(mocks.startSession).toHaveBeenCalledWith("session-1", 1);
    expect(mocks.createMatch).toHaveBeenCalledWith("session-1", {
      occurrences: [
        {
          occurrenceIndex: 0,
          worldId: ANIME,
          selectedScopeIds: [
            "anime-scope-0",
            "anime-scope-1",
            "anime-scope-2",
            "anime-scope-3",
          ],
        },
        {
          occurrenceIndex: 1,
          worldId: FOOTBALL,
          selectedScopeIds: [
            "football-scope-0",
            "football-scope-1",
            "football-scope-2",
            "football-scope-3",
          ],
        },
        {
          occurrenceIndex: 2,
          worldId: ANIME,
          selectedScopeIds: [
            "anime-scope-4",
            "anime-scope-5",
            "anime-scope-6",
            "anime-scope-7",
          ],
        },
      ],
    });
    // Straight to the board route, with the draft cleared and the credential kept.
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/matches/session-1"),
    );
    expect(
      window.sessionStorage.getItem(MATCH_SETUP_DRAFT_STORAGE_KEY),
    ).toBeNull();
    expect(
      window.sessionStorage.getItem("live-session-reconnect:session-1"),
    ).toBe("reconnect-token");
    expect(mocks.cancelSession).not.toHaveBeenCalled();
  });

  it("does not duplicate creation on a double click", async () => {
    const user = userEvent.setup();
    let resolveMatch: (value: unknown) => void = () => {};
    mocks.createMatch.mockImplementation(
      () => new Promise((resolve) => (resolveMatch = resolve)),
    );
    render(<MatchSetupWizard />);

    await configureWholeMatch(user);
    await user.click(screen.getByRole("button", { name: "متابعة إلى الفريقين" }));
    const start = screen.getByRole("button", { name: "ابدأ المباراة" });
    await user.click(start);
    await user.click(start);
    await user.click(start);

    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(1));
    expect(mocks.createMatch).toHaveBeenCalledTimes(1);
    resolveMatch(boardSnapshot("session-1"));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/matches/session-1"),
    );
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  describe("failure handling", () => {
    const rejection = (code: string, message: string, status = 400) => ({
      isAxiosError: true,
      code: undefined,
      response: { status, data: { code, message } },
      message,
    });

    it("routes back to the occurrence the server rejected, keeping the rest", async () => {
      const user = userEvent.setup();
      mocks.createMatch.mockRejectedValue(
        rejection(
          "MATCH_WORLD_NOT_ACTIVE",
          'World occurrence 1 world "x" is not active',
        ),
      );
      render(<MatchSetupWizard />);

      await configureWholeMatch(user);
      await user.click(
        screen.getByRole("button", { name: "متابعة إلى الفريقين" }),
      );
      await user.click(screen.getByRole("button", { name: "ابدأ المباراة" }));

      await waitFor(() =>
        expect(screen.getByTestId("match-setup-wizard").dataset.step).toBe(
          "scopes",
        ),
      );
      expect(screen.getByRole("alert").textContent).toContain("العالم الثاني");
      // The rejected occurrence is the one on screen, and its Scopes are intact.
      expect(screen.getByTestId("scope-count").textContent).toBe("4/4");
      // The orphan session was cleaned up and no Match was claimed.
      expect(mocks.cancelSession).toHaveBeenCalledWith("session-1", 2);
      expect(mocks.push).not.toHaveBeenCalled();
      // The draft is still recoverable.
      expect(
        window.sessionStorage.getItem(MATCH_SETUP_DRAFT_STORAGE_KEY),
      ).not.toBeNull();
    });

    it("keeps the draft after a network failure and never cancels what it did not create", async () => {
      const user = userEvent.setup();
      mocks.createSession.mockRejectedValue({
        isAxiosError: true,
        code: "ERR_NETWORK",
        message: "Network Error",
      });
      render(<MatchSetupWizard />);

      await configureWholeMatch(user);
      await user.click(
        screen.getByRole("button", { name: "متابعة إلى الفريقين" }),
      );
      await user.click(screen.getByRole("button", { name: "ابدأ المباراة" }));

      await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
      expect(screen.getByRole("alert").textContent).toContain("انقطع الاتصال");
      expect(mocks.createMatch).not.toHaveBeenCalled();
      expect(mocks.cancelSession).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
      // Still on the teams step, with the whole configuration retained.
      expect(screen.getByTestId("match-setup-wizard").dataset.step).toBe("teams");
      expect(
        window.sessionStorage.getItem(MATCH_SETUP_DRAFT_STORAGE_KEY),
      ).not.toBeNull();

      // And a retry succeeds without re-entering anything.
      mocks.createSession.mockResolvedValue({
        reconnectToken: "reconnect-token",
        snapshot: { sessionId: "session-2", revision: 0, status: "waiting" },
      });
      mocks.createMatch.mockResolvedValue(boardSnapshot("session-2"));
      await user.click(screen.getByRole("button", { name: "ابدأ المباراة" }));
      await waitFor(() =>
        expect(mocks.push).toHaveBeenCalledWith("/matches/session-2"),
      );
    });

    it("reports a Match-wide rejection without blaming an occurrence", async () => {
      const user = userEvent.setup();
      mocks.createMatch.mockRejectedValue(
        rejection(
          "MATCH_ALREADY_IN_PROGRESS",
          "This live session already has a match in progress",
        ),
      );
      render(<MatchSetupWizard />);

      await configureWholeMatch(user);
      await user.click(
        screen.getByRole("button", { name: "متابعة إلى الفريقين" }),
      );
      await user.click(screen.getByRole("button", { name: "ابدأ المباراة" }));

      await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
      expect(screen.getByTestId("match-setup-wizard").dataset.step).toBe("teams");
      expect(screen.getByRole("alert").textContent).toContain("مباراة قائمة");
    });
  });

  it("recovers a refreshed draft from sessionStorage", async () => {
    const user = userEvent.setup();
    const first = render(<MatchSetupWizard />);
    await configureOccurrence(user, "انمي", ANIME_FIRST_FOUR);
    first.unmount();

    render(<MatchSetupWizard />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "اختر العالم الثاني" }),
      ).toBeTruthy(),
    );
    const progress = screen.getByTestId("setup-progress");
    expect(progress.textContent).toContain("العالم الأول");
    expect(progress.textContent).toContain("4/4");
    expect(serverCalls()).toBe(0);
  });
});
