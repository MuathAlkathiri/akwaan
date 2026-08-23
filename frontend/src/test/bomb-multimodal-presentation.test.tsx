import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  GameplayRuntimeSnapshot,
  LiveSessionSnapshot,
} from "@/features/live-game-session/model";
import { BombGameplayPanel } from "@/features/live-game-session/components/bomb-gameplay-panel";

const mocks = vi.hoisted(() => ({ gameplayCommand: vi.fn() }));

beforeAll(() => {
  window.HTMLMediaElement.prototype.load = vi.fn();
  window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

const baseSnapshot: LiveSessionSnapshot = {
  sessionId: "session-1",
  mode: { key: "bomb", version: 1 },
  status: "active",
  revision: 1,
  serverTimestamp: "2026-08-23T00:00:00.000Z",
  activeTeamId: "team-1",
  round: { number: 1 },
  teams: [
    {
      id: "team-1",
      name: "الأخضر",
      active: true,
      clock: {
        allocatedMs: 60_000,
        consumedMs: 10_000,
        remainingMs: 50_000,
        startedAt: "2026-08-23T00:00:00.000Z",
        running: true,
        expired: false,
      },
    },
  ],
  participants: [
    {
      id: "player-1",
      displayName: "سارة",
      role: "team-player",
      teamId: "team-1",
      ready: true,
      joinedAt: "2026-08-23T00:00:00.000Z",
      connected: true,
      connectedDeviceCount: 1,
      lastSeenAt: "2026-08-23T00:00:00.000Z",
      presence: "connected",
    },
  ],
  readiness: {
    canMarkSessionReady: true,
    readyPlayers: 1,
    totalPlayers: 1,
    readyTeamIds: ["team-1"],
  },
  availableActions: ["mode:submit-answer", "mode:skip"],
  createdAt: "2026-08-23T00:00:00.000Z",
  lastTransitionAt: "2026-08-23T00:00:00.000Z",
  expiresAt: "2026-08-23T01:00:00.000Z",
};

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    connection: "connected",
    gameplayCommand: mocks.gameplayCommand,
    snapshot: baseSnapshot,
    nowMs: Date.parse("2026-08-23T00:00:00.000Z"),
    snapshotReceivedAtMs: Date.parse("2026-08-23T00:00:00.000Z"),
  }),
}));

vi.mock("@/features/live-game-session/hooks/use-team-clock-display", () => ({
  useTeamClockDisplay: () => ({
    formatted: "0:50",
    expired: false,
    remainingMs: 50_000,
  }),
}));

vi.mock("@/features/live-game-session/hooks/use-bomb-voice-input", () => ({
  useBombVoiceInput: () => ({
    state: "idle",
    supported: false,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

function buildRuntime(overrides: Partial<GameplayRuntimeSnapshot> = {}): GameplayRuntimeSnapshot {
  return {
    runtimeId: "runtime-1",
    sessionId: "session-1",
    status: "round-active",
    revision: 1,
    mode: { key: "bomb", version: 1, stateSchemaVersion: 1 },
    modeState: { phase: "ready", questionIndex: 0, questionCount: 1 },
    activeTeamId: "team-1",
    availableActions: ["mode:submit-answer", "mode:skip"],
    serverTimestamp: "2026-08-23T00:00:00.000Z",
    completedRounds: [],
    transitions: [],
    activeRound: {
      id: "round-1",
      sequence: 1,
      status: "active",
      activeTeamId: "team-1",
      transitionRevision: 1,
      createdAt: "2026-08-23T00:00:00.000Z",
      modeState: {
        phase: "presenting",
        questionId: "q-1",
        prompt: "سؤال تجريبي",
        itemIndex: 0,
        itemCount: 3,
        imageUrl: "",
        altText: "",
      },
    },
    ...overrides,
  };
}

describe("Bomb Multimodal Presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a text-only item with dominant typography and without image box", () => {
    const runtime = buildRuntime({
      prompt: "بيلينغهام... وش اسمه الأول؟",
      currentItem: {
        id: "q-1:0",
        index: 0,
        totalItems: 3,
        media: { type: "none" },
      },
    });

    render(<BombGameplayPanel runtime={runtime} />);

    expect(screen.getByText("بيلينغهام... وش اسمه الأول؟")).toBeDefined();
    expect(screen.queryByText(/The image for this Bomb item is unavailable/i)).toBeNull();
    expect(screen.getByPlaceholderText(/اكتب إجابتك/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Skip/i })).toBeDefined();
  });

  it("renders an image item with image preview and altText", () => {
    const runtime = buildRuntime({
      prompt: "ما هذا الشعار؟",
      currentItem: {
        id: "q-1:1",
        index: 1,
        totalItems: 3,
        media: {
          type: "image",
          url: "/uploads/crest.webp",
          altText: "شعار النادي",
        },
        image: {
          url: "/uploads/crest.webp",
          altText: "شعار النادي",
        },
      },
    });

    render(<BombGameplayPanel runtime={runtime} />);

    expect(screen.getByText("ما هذا الشعار؟")).toBeDefined();
    const img = screen.getByRole("img", { name: "شعار النادي" });
    expect(img).toBeDefined();
    expect(img.getAttribute("src")).toContain("crest.webp");
  });

  it("renders an audio item with play controls", () => {
    const runtime = buildRuntime({
      prompt: "من صاحب هذه الأغنية؟",
      currentItem: {
        id: "q-1:2",
        index: 2,
        totalItems: 3,
        media: {
          type: "audio",
          url: "/uploads/song.mp3",
          altText: "مقطع صوتي",
        },
      },
    });

    render(<BombGameplayPanel runtime={runtime} />);

    expect(screen.getByText("من صاحب هذه الأغنية؟")).toBeDefined();
    expect(screen.getByRole("button", { name: /^تشغيل الصوت$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^إعادة تشغيل الصوت$/i })).toBeDefined();
  });

  it("submits answer from text input regardless of modality", () => {
    const runtime = buildRuntime({
      prompt: "سؤال نصي سريع",
      currentItem: {
        id: "q-1:0",
        index: 0,
        totalItems: 3,
        media: { type: "none" },
      },
    });

    render(<BombGameplayPanel runtime={runtime} />);

    const input = screen.getByPlaceholderText(/اكتب إجابتك/i);
    fireEvent.change(input, { target: { value: "إجابة صحيحة" } });
    fireEvent.submit(input.closest("form")!);

    expect(mocks.gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-answer",
      payload: { answer: "إجابة صحيحة" },
    });
  });

  it("skips item correctly regardless of modality", () => {
    const runtime = buildRuntime({
      prompt: "سؤال للتخطي",
      currentItem: {
        id: "q-1:0",
        index: 0,
        totalItems: 3,
        media: { type: "none" },
      },
    });

    render(<BombGameplayPanel runtime={runtime} />);

    const skipButton = screen.getByRole("button", { name: /Skip/i });
    fireEvent.click(skipButton);

    expect(mocks.gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "skip",
      payload: {},
    });
  });
});
