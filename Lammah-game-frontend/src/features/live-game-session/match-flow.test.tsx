import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "./hooks/live-session-context";
import { MatchStageRouter } from "./match/match-stage-router";
import { localizeMatchError } from "./match/errors/match-errors";
import { parseMatchSnapshot, type MatchStageKey } from "./match/types";
import type { GameplayRuntimeSnapshot, LiveSessionSnapshot } from "./model";
import { liveSessionReducer } from "./state/live-session-reducer";

const api = vi.hoisted(() => ({
  createMatch: vi.fn(),
  startMatch: vi.fn(),
  resolveMatchCoinToss: vi.fn(),
  listMatchWorlds: vi.fn(),
  selectMatchWorld: vi.fn(),
  launchMatchChallenge: vi.fn(),
  continueMatchWorld: vi.fn(),
  cancelMatch: vi.fn(),
}));

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
}));

vi.mock("./match/api/match-api", () => api);

function snapshot(stage: MatchStageKey = "lobby"): LiveSessionSnapshot {
  return {
    sessionId: "session-1",
    mode: { key: "core-timed-turns", version: 1 },
    status: "active",
    revision: 8,
    serverTimestamp: "2026-01-01T00:00:00.000Z",
    round: { number: 1 },
    teams: [
      { id: "team-a", name: "النجوم", active: true, clock: clock() },
      { id: "team-b", name: "المجرّة", active: true, clock: clock() },
    ],
    participants: [
      {
        id: "player-a",
        displayName: "أحمد",
        role: "team-player",
        teamId: "team-a",
        ready: true,
        joinedAt: "2026-01-01T00:00:00.000Z",
        connected: true,
        connectedDeviceCount: 1,
        lastSeenAt: "2026-01-01T00:00:00.000Z",
        presence: "connected",
      },
    ],
    readiness: {
      canMarkSessionReady: false,
      readyPlayers: 1,
      totalPlayers: 1,
      readyTeamIds: ["team-a"],
    },
    availableActions: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    lastTransitionAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-02T00:00:00.000Z",
    match: {
      id: "match-1",
      revision: 4,
      // These fixtures drive the sequential stages on purpose: the legacy router
      // must keep working while unified Matches take a different branch.
      setupMode: "legacy_sequential" as const,
      status: stage === "lobby" ? "draft" : stage === "match_complete" ? "completed" : "active",
      stage: {
        key: stage,
        enteredAt: "2026-01-01T00:00:00.000Z",
        minimumDisplayDurationMs: 0,
        audioCue: null,
        animationCue: null,
      },
      coinToss: {
        status: stage === "lobby" || stage === "coin_toss" ? "pending" : "resolved",
        winnerTeamId: stage === "lobby" ? undefined : "team-a",
        firstChooserTeamId: stage === "lobby" ? undefined : "team-a",
      },
      worldSelection: {
        selections: [],
        nextTeamId: "team-a",
        requiresAgreement: false,
        remainingCount: 3,
        complete: false,
      },
      board: { slots: [] },
      scoring: {
        matchTotals: [score("team-a", 2), score("team-b", 1)],
        worldSubtotals: [score("team-a", 1), score("team-b", 0)],
      },
      availableActions: [],
    },
  };
}

function clock() {
  return {
    allocatedMs: 10_000,
    consumedMs: 0,
    remainingMs: 10_000,
    running: false,
    expired: false,
  };
}

function score(teamId: string, displayTotal: number) {
  return { teamId, signedTotal: displayTotal, displayTotal };
}

function renderMatch(
  value: LiveSessionSnapshot,
  actor: "controller" | "shared-screen" | "participant" = "shared-screen",
  overrides: Partial<React.ContextType<typeof LiveSessionContext>> = {},
) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context = {
    snapshot: value,
    connection: "connected" as const,
    syncState: "idle" as const,
    nowMs: Date.parse("2026-01-01T00:00:10.000Z"),
    command: vi.fn(),
    gameplayCommand: vi.fn(),
    adoptSnapshot: vi.fn(),
    resync: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={query}>
      <LiveSessionContext.Provider value={context}>
        <MatchStageRouter actor={actor} participantId="player-a" />
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
  return context;
}

beforeEach(() => {
  navigation.replace.mockReset();
  Object.values(api).forEach((mock) => mock.mockReset());
  api.listMatchWorlds.mockResolvedValue([
    {
      worldId: "world-1",
      name: "كرة القدم",
      boardReady: true,
      hasRelationalChallenge: false,
      slotKeys: ["slot_2", "slot_3", "slot_4"],
    },
  ]);
});

describe("Match snapshot foundation", () => {
  it("parses the backend projection and rejects an incomplete value", () => {
    expect(parseMatchSnapshot(snapshot().match)?.id).toBe("match-1");
    expect(parseMatchSnapshot({ id: "broken" })).toBeUndefined();
  });

  it("keeps a newer Match revision and permits gameplay removal when Match advances", () => {
    const current = snapshot("challenge");
    current.gameplay = runtime("read-your-opponent");
    const stale = structuredClone(current);
    stale.match!.revision = 3;
    expect(
      liveSessionReducer(
        { connection: "connected", snapshot: current },
        { type: "snapshot", snapshot: stale, receivedAtMs: 1 },
      ).snapshot?.match?.revision,
    ).toBe(4);
    const advanced = structuredClone(current);
    advanced.match!.revision = 5;
    advanced.match!.stage.key = "board";
    delete advanced.gameplay;
    expect(
      liveSessionReducer(
        { connection: "connected", snapshot: current },
        { type: "snapshot", snapshot: advanced, receivedAtMs: 2 },
      ).snapshot?.gameplay,
    ).toBeUndefined();
  });

  it("renders Match absent", () => {
    const absent = snapshot();
    delete absent.match;
    renderMatch(absent);
    expect(screen.getByText("المباراة لم تبدأ بعد")).toBeInTheDocument();
  });

  it("renders an unknown stage as recoverable and requests resync", () => {
    const value = snapshot();
    value.match!.stage.key = "future_stage";
    const resync = vi.fn();
    renderMatch(value, "shared-screen", { resync });
    expect(screen.getByText("تعذر عرض المرحلة الحالية")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "مزامنة المباراة" }));
    expect(resync).toHaveBeenCalledTimes(1);
  });
});

describe("Match stages and actors", () => {
  it("routes the real scope_selection snapshot to its authoritative occurrence", async () => {
    const value = snapshot("scope_selection");
    value.match!.currentOccurrence = {
      index: 0,
      worldId: "world-1",
      status: "in_progress",
      selectedScopeIds: [],
      selectedScopes: [],
      scopeSelectionComplete: false,
    };
    value.match!.scopeSelection = {
      occurrenceIndex: 0,
      worldId: "world-1",
      required: 4,
      selectedScopeIds: [],
    };
    renderMatch(value, "controller");

    expect(screen.getByText("اختيار أربعة نطاقات")).toBeInTheDocument();
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        "/worlds/world-1?sessionId=session-1",
      ),
    );
    expect(screen.queryByText("تعذر عرض المرحلة الحالية")).not.toBeInTheDocument();
  });

  it.each<MatchStageKey>([
    "lobby",
    "coin_toss",
    "world_selection",
    "scope_selection",
    "board",
    "challenge",
    "world_complete",
    "match_complete",
  ])("recognizes the production stage %s", (stage) => {
    const value = snapshot(stage);
    if (stage === "scope_selection" || stage === "board" || stage === "world_complete") {
      value.match!.currentOccurrence = {
        index: 0,
        worldId: "world-1",
        status: stage === "world_complete" ? "completed" : "in_progress",
        selectedScopeIds: stage === "scope_selection" ? [] : ["s1", "s2", "s3", "s4"],
        selectedScopes: [],
        scopeSelectionComplete: stage !== "scope_selection",
      };
    }
    if (stage === "match_complete") {
      value.match!.result = { teams: [], winnerTeamId: null, tie: true, worlds: [] };
    }
    renderMatch(value);
    expect(screen.queryByText("تعذر عرض المرحلة الحالية")).not.toBeInTheDocument();
  });

  it("uses the settled server coin result for participant copy", async () => {
    const value = snapshot("coin_toss");
    value.match!.coinToss = {
      status: "resolved",
      winnerTeamId: "team-a",
      firstChooserTeamId: "team-a",
    };
    renderMatch(value, "participant");
    expect(await screen.findByText("أنتم تختارون أولًا")).toBeInTheDocument();
    expect(screen.getAllByText("النجوم").length).toBeGreaterThan(0);
  });

  it("shows repeated Worlds in their authoritative order", async () => {
    const value = snapshot("world_selection");
    value.match!.worldSelection.selections = [
      { occurrenceIndex: 0, worldId: "world-1", method: "team_pick", selectedByTeamId: "team-a", selectedAt: "2026-01-01" },
      { occurrenceIndex: 1, worldId: "world-1", method: "team_pick", selectedByTeamId: "team-b", selectedAt: "2026-01-01" },
    ];
    value.match!.worldSelection.remainingCount = 1;
    renderMatch(value);
    await waitFor(() => expect(screen.getAllByText("كرة القدم ×2")).toHaveLength(2));
    expect(screen.getByText("ثلاث محطات، ويمكن تكرار العالم")).toBeInTheDocument();
  });

  it("renders all board statuses and hides development launch from shared screen", async () => {
    const value = boardSnapshot();
    renderMatch(value);
    expect(screen.getByText("مكتمل")).toBeInTheDocument();
    expect(screen.getByText("قريبًا")).toBeInTheDocument();
    expect(screen.queryByText("اختيار المحتوى وتشغيل التحدي")).not.toBeInTheDocument();
  });

  it("enforces RYO content cardinality in the controller development dialog", async () => {
    const value = boardSnapshot();
    value.match!.availableActions = ["match:launch-challenge"];
    api.launchMatchChallenge.mockResolvedValue(value);
    renderMatch(value, "controller");
    await screen.findByText("كرة القدم");
    fireEvent.click(screen.getByRole("button", { name: "اختيار المحتوى وتشغيل التحدي" }));
    expect(screen.getAllByPlaceholderText("ContentItem ID")).toHaveLength(3);
    const launch = screen.getByRole("button", { name: "تشغيل التحدي" });
    expect(launch).toBeDisabled();
    screen.getAllByPlaceholderText("ContentItem ID").forEach((input, index) =>
      fireEvent.change(input, { target: { value: `item-${index + 1}` } }),
    );
    expect(launch).toBeEnabled();
    fireEvent.click(launch);
    await waitFor(() =>
      expect(api.launchMatchChallenge).toHaveBeenCalledWith({
        sessionId: "session-1",
        revision: 4,
        occurrenceIndex: 0,
        slotKey: "slot_2",
        contentItemIds: ["item-1", "item-2", "item-3"],
        startingTeamId: undefined,
      }),
    );
  });

  it("renders World completion and final tie summaries from backend totals", () => {
    const complete = snapshot("world_complete");
    complete.match!.currentOccurrence = {
    index: 0,
    worldId: "world-1",
    status: "completed",
    selectedScopeIds: ["s1", "s2", "s3", "s4"],
    selectedScopes: [
      { scopeId: "s1", name: "كأس العالم" },
      { scopeId: "s2", name: "الدوري الإنجليزي" },
      { scopeId: "s3", name: "الدوري السعودي" },
      { scopeId: "s4", name: "أبطال أوروبا" },
    ],
    scopeSelectionComplete: true,
  };
    renderMatch(complete, "participant");
    expect(screen.getByText("اكتمل العالم 1 من 3")).toBeInTheDocument();
    expect(screen.getByText("بانتظار المتحكّم للمتابعة.")).toBeInTheDocument();
  });

  it("renders the authoritative final result and World summaries", () => {
    const value = snapshot("match_complete");
    value.match!.result = {
      teams: [score("team-a", 2), score("team-b", 2)],
      winnerTeamId: null,
      tie: true,
      worlds: [
        { occurrenceIndex: 0, worldId: "world-1", subtotals: [score("team-a", 1), score("team-b", 1)] },
      ],
    };
    renderMatch(value, "participant");
    expect(screen.getByText("المباراة انتهت بالتعادل")).toBeInTheDocument();
    expect(screen.getByText("نتائج العوالم")).toBeInTheDocument();
  });
});

describe("mechanic reuse and localization", () => {
  it("routes Match challenge to the existing RYO renderer without a completion control", () => {
    const value = snapshot("challenge");
    value.match!.currentChallenge = {
      occurrenceIndex: 0,
      slotKey: "slot_2",
      challengeKey: "read-your-opponent",
      runtimeId: "runtime-1",
      startedAt: "2026-01-01",
    };
    value.gameplay = runtime("read-your-opponent");
    renderMatch(value, "participant");
    expect(screen.getByText("السؤال 1 من 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /إكمال المباراة/ })).not.toBeInTheDocument();
  });

  it("submits the actor-appropriate RYO answer through the existing gameplay command", () => {
    const value = snapshot("challenge");
    value.gameplay = runtime("read-your-opponent");
    value.gameplay.availableActions = ["submission:create"];
    const gameplayCommand = vi.fn();
    renderMatch(value, "participant", { gameplayCommand });
    fireEvent.click(screen.getByRole("button", { name: "أ" }));
    expect(gameplayCommand).toHaveBeenCalledWith("interaction-submit", {
      roundId: "round-1",
      payload: {
        kind: "answer",
        mode: "multiple_choice",
        optionId: "a",
      },
    });
  });

  it("routes Top 10 through its existing panel", () => {
    const value = snapshot("challenge");
    value.gameplay = runtime("top-10");
    renderMatch(value);
    expect(screen.getByText("خذها أو دسّها")).toBeInTheDocument();
  });

  it("maps backend codes to Arabic while retaining debug detail", () => {
    const localized = localizeMatchError({
      isAxiosError: true,
      response: { data: { code: "RYO_REQUIRES_THREE_ITEMS", message: "raw" } },
      message: "raw",
      toJSON: () => ({}),
    });
    expect(localized.message).toContain("3 عناصر");
    expect(localized.rawMessage).toBe("raw");
  });
});

function boardSnapshot() {
  const value = snapshot("board");
  value.match!.currentOccurrence = {
    index: 0,
    worldId: "world-1",
    status: "in_progress",
    selectedScopeIds: ["s1", "s2", "s3", "s4"],
    selectedScopes: [
      { scopeId: "s1", name: "كأس العالم" },
      { scopeId: "s2", name: "الدوري الإنجليزي" },
      { scopeId: "s3", name: "الدوري السعودي" },
      { scopeId: "s4", name: "أبطال أوروبا" },
    ],
    scopeSelectionComplete: true,
  };
  value.match!.board = { slots: [] };
  value.match!.board.slots = [
    {
      slotKey: "slot_2",
      challengeKey: "read-your-opponent",
      challengeName: "اقرأ خصمك",
      launchability: "launchable",
      status: "available",
    },
    {
      slotKey: "slot_3",
      challengeKey: "read-your-opponent",
      challengeName: "اقرأ خصمك",
      launchability: "launchable",
      status: "completed",
    },
    {
      slotKey: "slot_4",
      challengeName: "تحدٍ جديد",
      launchability: "configured_but_unimplemented",
      status: "unavailable",
    },
  ];
  return value;
}

function runtime(mode: "read-your-opponent" | "top-10"): GameplayRuntimeSnapshot {
  const ryo = mode === "read-your-opponent";
  return {
    runtimeId: "runtime-1",
    sessionId: "session-1",
    status: "round-active",
    revision: 3,
    mode: { key: mode, version: 1, stateSchemaVersion: 1 },
    modeState: ryo
      ? { currentItemIndex: 0, phase: "collecting" }
      : {
          title: "خذها أو دسّها",
          instruction: "اختر",
          assignmentsJson: "[]",
          revealedJson: "[]",
          resultJson: "null",
          rankingBasis: "official",
          sourceLabel: "source",
        },
    activeRound: {
      id: "round-1",
      sequence: 1,
      status: "active",
      activeTeamId: "team-a",
      modeState: ryo
        ? { phase: "collecting", answeringTeamId: "team-a", opposingTeamId: "team-b" }
        : {
            phase: "assigning",
            turnIndex: 0,
            currentCardJson: JSON.stringify({ id: "card-1", label: "بطاقة" }),
          },
      transitionRevision: 3,
      createdAt: "2026-01-01",
      interaction: ryo
        ? {
            id: "interaction-1",
            revision: 1,
            status: "open",
            prompt: {
              id: "prompt-1",
              type: "ryo.item",
              schemaVersion: 1,
              payload: {
                actorRole: "answering",
                itemJson: JSON.stringify({
                  id: "item-1",
                  prompt: "ما الإجابة؟",
                  answerMode: "multiple_choice",
                  options: [{ id: "a", label: "أ" }],
                }),
              },
              metadata: {},
            },
            submissions: [],
          }
        : undefined,
    },
    completedRounds: [],
    transitions: [],
    availableActions: [],
    serverTimestamp: "2026-01-01",
  };
}
