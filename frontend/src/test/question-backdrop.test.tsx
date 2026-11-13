import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { UnifiedChallengeStage } from "@/features/live-game-session/match/components/unified-challenge-stage";
import type {
  LiveSessionMatchSnapshot,
  MatchActor,
} from "@/features/live-game-session/match/types";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * The World's question backdrop on a challenge in progress (roadmap §30.22
 * Track A).
 *
 * What matters: it appears only on the shared screen, only when the server sent
 * one, it is decorative to assistive technology, and it is a layer *behind* the
 * stage — never anything the gameplay renderer has to make room for.
 */

const BACKDROP = "/world-content/worlds/world-anime-fallback.jpg";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/features/match-setup", () => ({
  abortActiveChallenge: vi.fn(),
  occurrenceLabel: (index: number) =>
    ["العالم الأول", "العالم الثاني", "العالم الثالث"][index],
}));

vi.mock("@/features/live-game-session/match/match-stage-router", () => ({
  MatchGameplayRenderer: () => <div data-testid="renderer" />,
}));

const match = (questionBackdropUrl?: string): LiveSessionMatchSnapshot =>
  ({
    id: "match-1",
    revision: 3,
    status: "active",
    stage: {
      key: "challenge",
      enteredAt: "2026-11-12T00:00:00.000Z",
      minimumDisplayDurationMs: 0,
      audioCue: null,
      animationCue: null,
    },
    unified: {
      occurrences: [],
      board: {
        positions: [
          {
            positionKey: "0:slot_1",
            occurrenceIndex: 0,
            worldId: "world-anime",
            worldName: "انمي",
            slotKey: "slot_1",
            challengeTypeId: "type-ryo",
            challengeKey: "read-your-opponent",
            challengeName: "اقرأ خصمك",
            requiresPhones: true,
            launchability: "launchable",
            status: "in_progress",
            selectedScopeIds: [],
          },
        ],
        totalPositionCount: 12,
        completedPositionCount: 0,
      },
      selectingTeamId: "team-a",
    },
    currentChallenge: {
      occurrenceIndex: 0,
      slotKey: "slot_1",
      challengeKey: "read-your-opponent",
      runtimeId: "runtime-1",
      startedAt: "2026-11-12T00:00:00.000Z",
      doubledTeamIds: [],
      ...(questionBackdropUrl ? { questionBackdropUrl } : {}),
    },
    scoring: { matchTotals: [], worldSubtotals: [] },
    standings: [],
    availableActions: [],
  }) as unknown as LiveSessionMatchSnapshot;

const renderStage = (
  value: LiveSessionMatchSnapshot,
  actor: MatchActor = "controller",
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const snapshot = {
    sessionId: "session-1",
    mode: { key: "core-timed-turns", version: 1 },
    status: "active",
    revision: 2,
    serverTimestamp: "2026-11-12T00:00:00.000Z",
    round: { number: 1 },
    teams: [],
    participants: [],
    availableActions: [],
    match: value,
    gameplay: {
      runtimeId: "runtime-1",
      revision: 1,
      mode: { key: "read-your-opponent", version: 1 },
      status: "active",
      modeState: {},
      transitions: [],
      availableActions: [],
    },
  } as unknown as LiveSessionSnapshot;
  return render(
    <QueryClientProvider client={client}>
      <LiveSessionContext.Provider
        value={
          {
            snapshot,
            resync: vi.fn(),
            adoptSnapshot: vi.fn(),
          } as never
        }
      >
        <UnifiedChallengeStage actor={actor} />
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
};

describe("question backdrop", () => {
  it("paints the World artwork behind a challenge on the shared screen", () => {
    renderStage(match(BACKDROP));

    const backdrop = screen.getByTestId("question-backdrop");
    expect(backdrop).toBeInTheDocument();
    // Behind everything, and not in the way of anything.
    expect(backdrop.className).toContain("-z-10");
    expect(backdrop.className).toContain("pointer-events-none");
    expect(backdrop.className).toContain("absolute");
  });

  it("is decorative: hidden from assistive technology, with no alt text", () => {
    renderStage(match(BACKDROP));

    const backdrop = screen.getByTestId("question-backdrop");
    expect(backdrop).toHaveAttribute("aria-hidden");
    expect(backdrop.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("renders nothing for a World with no artwork", () => {
    renderStage(match());

    expect(screen.queryByTestId("question-backdrop")).not.toBeInTheDocument();
    // The stage itself is unchanged for such a World.
    expect(screen.getByTestId("unified-challenge")).toBeInTheDocument();
    expect(screen.getByTestId("renderer")).toBeInTheDocument();
  });

  it("never wallpapers a phone", () => {
    renderStage(match(BACKDROP), "participant");

    expect(screen.getByTestId("unified-challenge")).toHaveAttribute(
      "data-challenge-surface",
      "phone",
    );
    expect(screen.queryByTestId("question-backdrop")).not.toBeInTheDocument();
  });

  it("keeps the gameplay renderer in the stage, not inside the backdrop", () => {
    renderStage(match(BACKDROP));

    const backdrop = screen.getByTestId("question-backdrop");
    expect(backdrop.contains(screen.getByTestId("renderer"))).toBe(false);
  });
});
