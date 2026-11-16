import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GameplayRuntimeSnapshot,
  LiveSessionSnapshot,
} from "@/features/live-game-session/model";

/**
 * Timer cues never talk over an audio question or clue (2026-11-16).
 *
 * The review found three panels that could: Bomb's room clock, مين أقرب and
 * القطها. This pins what each one tells the shared countdown — silent for
 * audio, allowed otherwise — and that المرحلة, اقرأ خصمك and من أول نغمة keep
 * their existing silence. The cue logic itself is pinned in
 * countdown-sound-safety.test.tsx.
 */
const spy = vi.hoisted(() => ({
  countdowns: [] as Array<{ sound?: boolean }>,
  cueGates: [] as boolean[],
}));

vi.mock(
  "@/features/live-game-session/match/components/challenge-countdown",
  async (load) => ({
    ...(await load<
      typeof import("@/features/live-game-session/match/components/challenge-countdown")
    >()),
    ChallengeCountdown: (props: { sound?: boolean }) => {
      spy.countdowns.push(props);
      return null;
    },
  }),
);
vi.mock(
  "@/features/live-game-session/match/components/countdown-presentation",
  async (load) => ({
    ...(await load<
      typeof import("@/features/live-game-session/match/components/countdown-presentation")
    >()),
    useCountdownSurface: () => "stage",
    useCountdownCues: (_s: number, _t: unknown, allowed: boolean) => {
      spy.cueGates.push(allowed);
    },
  }),
);
vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({
    useLiveSessionClock: () => Date.parse("2026-01-01T00:00:10Z"),
  }),
);
vi.mock("@/features/live-game-session/hooks/use-interaction-deadline", () => ({
  useInteractionDeadline: () => 9_000,
}));
vi.mock("@/features/live-game-session/hooks/use-team-clock-display", () => ({
  useTeamClockDisplay: () => ({
    formatted: "0:20",
    expired: false,
    remainingMs: 20_000,
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
const session = {
  sessionId: "s1",
  status: "active",
  revision: 1,
  activeTeamId: "team-1",
  serverTimestamp: "2026-01-01T00:00:10Z",
  teams: [
    {
      id: "team-1",
      name: "ألفا",
      active: true,
      clock: {
        allocatedMs: 30_000,
        consumedMs: 10_000,
        remainingMs: 20_000,
        running: true,
        expired: false,
      },
    },
    {
      id: "team-2",
      name: "بيتا",
      active: true,
      clock: {
        allocatedMs: 30_000,
        consumedMs: 0,
        remainingMs: 30_000,
        running: false,
        expired: false,
      },
    },
  ],
  participants: [],
  availableActions: [],
} as unknown as LiveSessionSnapshot;
vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    connection: "connected",
    gameplayCommand: vi.fn(),
    snapshot: session,
    snapshotReceivedAtMs: Date.parse("2026-01-01T00:00:10Z"),
  }),
}));

import { ClosestGameplayPanel } from "@/features/live-game-session/components/closest-gameplay-panel";
import { LaqathaGameplayPanel } from "@/features/live-game-session/components/laqatha-gameplay-panel";
import { BombGameplayPanel } from "@/features/live-game-session/components/bomb-gameplay-panel";

beforeAll(() => {
  window.HTMLMediaElement.prototype.load = vi.fn();
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
});
beforeEach(() => {
  spy.countdowns.length = 0;
  spy.cueGates.length = 0;
});

const round = (modeState: Record<string, unknown>) => ({
  id: "round-1",
  sequence: 1,
  status: "active",
  activeTeamId: "team-1",
  transitionRevision: 1,
  createdAt: "2026-01-01T00:00:00Z",
  modeState,
});
const runtime = (
  key: string,
  modeState: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) =>
  ({
    runtimeId: "r1",
    sessionId: "s1",
    status: "round-active",
    revision: 1,
    mode: { key, version: 1, stateSchemaVersion: 1 },
    modeState,
    activeRound: round(modeState),
    completedRounds: [],
    transitions: [],
    availableActions: [],
    serverTimestamp: "2026-01-01T00:00:10Z",
    ...extra,
  }) as unknown as GameplayRuntimeSnapshot;

describe("مين أقرب", () => {
  const closest = (media?: Record<string, unknown>) =>
    runtime("closest", {
      currentItemJson: JSON.stringify({
        id: "i1",
        prompt: "كم؟",
        ...(media ? { media } : {}),
      }),
      teamIdsJson: JSON.stringify(["team-1", "team-2"]),
      submissionStatusJson: JSON.stringify({
        "team-1": false,
        "team-2": false,
      }),
      currentItemIndex: 0,
      phase: "answering",
      deadlineAt: "2026-01-01T00:00:19Z",
    });

  it("silences the countdown for an audio question", () => {
    render(
      <ClosestGameplayPanel
        runtime={closest({ type: "audio", url: "https://cdn/q.mp3" })}
      />,
    );
    expect(spy.countdowns.at(-1)?.sound).toBe(false);
  });

  it("allows cues for an ordinary one", () => {
    render(
      <ClosestGameplayPanel
        runtime={closest({ type: "image", url: "https://cdn/q.webp" })}
      />,
    );
    expect(spy.countdowns.at(-1)?.sound).toBe(true);
    render(<ClosestGameplayPanel runtime={closest()} />);
    expect(spy.countdowns.at(-1)?.sound).toBe(true);
  });
});

describe("القطها", () => {
  const laqatha = (clues: unknown[]) =>
    runtime("laqatha", {
      phase: "revealing",
      currentQuestionIndex: 0,
      questionCount: 3,
      revealedClueCount: clues.length,
      currentReward: 4,
      cluesJson: JSON.stringify(clues),
      claimOwnerTeamId: null,
      failedTeamIdsJson: "[]",
      teamIdsJson: JSON.stringify(["team-1", "team-2"]),
      deadlineAt: "2026-01-01T00:00:19Z",
    });
  const text = { order: 1, value: 5, modality: "text", text: { ar: "دليل" } };
  const audio = {
    order: 2,
    value: 4,
    modality: "audio",
    media: { type: "audio", assets: [{ url: "https://cdn/c.mp3" }] },
  };

  it("silences the countdown while an audio clue is on screen", () => {
    render(
      <LaqathaGameplayPanel
        runtime={laqatha([text, audio])}
        actor="shared-screen"
      />,
    );
    expect(spy.countdowns.at(-1)?.sound).toBe(false);
  });

  it("allows cues while the clues are not audio", () => {
    render(
      <LaqathaGameplayPanel runtime={laqatha([text])} actor="shared-screen" />,
    );
    expect(spy.countdowns.at(-1)?.sound).toBe(true);
  });
});

describe("القنبلة's room clock", () => {
  const bomb = (mediaType: "audio" | "image" | "none") =>
    runtime(
      "bomb",
      {
        phase: "presenting",
        questionId: "q-1",
        prompt: "سؤال",
        itemIndex: 0,
        itemCount: 3,
        mediaType,
        mediaUrl:
          mediaType === "none"
            ? ""
            : `https://cdn/item.${mediaType === "audio" ? "mp3" : "webp"}`,
        imageUrl: mediaType === "image" ? "https://cdn/item.webp" : "",
        altText: "",
      },
      {
        activeTeamId: "team-1",
        currentItem: {
          id: "q-1:0",
          index: 0,
          totalItems: 3,
          media:
            mediaType === "none"
              ? { type: "none" }
              : {
                  type: mediaType,
                  url: `https://cdn/item.${mediaType === "audio" ? "mp3" : "webp"}`,
                },
        },
      },
    );

  it("never sounds over an audio item", () => {
    render(<BombGameplayPanel runtime={bomb("audio")} />);
    expect(spy.cueGates.length).toBeGreaterThan(0);
    expect(spy.cueGates.every((gate) => gate === false)).toBe(true);
  });

  it("may sound for a picture or a text item", () => {
    render(<BombGameplayPanel runtime={bomb("image")} />);
    expect(spy.cueGates.at(-1)).toBe(true);
    render(<BombGameplayPanel runtime={bomb("none")} />);
    expect(spy.cueGates.at(-1)).toBe(true);
  });
});

describe("unchanged silence elsewhere", () => {
  const source = (file: string) =>
    readFileSync(
      join(process.cwd(), "src/features/live-game-session/components", file),
      "utf8",
    );

  it("keeps المرحلة and اقرأ خصمك silent for audio, and من أول نغمة always silent", () => {
    expect(source("marhala-screen.tsx")).toContain(
      'sound={view.media?.type !== "audio"}',
    );
    expect(source("ryo-gameplay-panel.tsx")).toContain(
      'sound={item.media?.type !== "audio"}',
    );
    expect(source("first-note-gameplay-panel.tsx")).toContain("sound={false}");
  });
});
