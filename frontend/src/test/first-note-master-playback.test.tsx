/**
 * The Master Audio playback contract for من أول نغمة.
 *
 * The auction sells seconds, so the stop boundary is the mechanic rather than a
 * detail of it: at a winning bid of 1, overrunning by a quarter of a second
 * hands the answering team 25% more than they bought. These drive the real
 * component with a fake media element, because jsdom implements no playback —
 * what is asserted is which URL is requested, when playback is stopped, and
 * that nothing restarts it.
 *
 * No network, no runtime, no DB.
 */
import { render, screen, act } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  snapshot: {
    teams: [
      { id: "team-a", name: "الفريق الأول" },
      { id: "team-b", name: "الفريق الثاني" },
    ],
  },
  gameplayCommand: vi.fn(),
  connection: "connected",
}));

/**
 * jsdom serves the document from http://localhost:3000, which is also
 * `runtimeConfig`'s default API base. Left alone, "the audio src is not the
 * frontend origin" would pass without the resolver doing anything — exactly the
 * bug it is meant to catch. A distinct backend origin makes the two separable.
 */
const media = vi.hoisted(() => ({ backend: "https://api.akwaan.test" }));
const BACKEND = media.backend;
vi.mock("@/config/runtime-config", () => ({
  runtimeConfig: { apiBaseUrl: media.backend },
}));

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => session,
}));

import { FirstNoteGameplayPanel } from "@/features/live-game-session/components/first-note-gameplay-panel";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

const MASTER = "https://cdn.akwaan.test/music/mus-not-001-master.mp3";

/** The one Master, exactly as the shared surface receives it. */
const audioJson = (url = MASTER) =>
  JSON.stringify({ type: "audio", assets: [{ url }] });

const state = (over: Record<string, unknown>) => ({
  phase: "answering",
  currentSongIndex: 0,
  songCount: 3,
  contextualClueJson: JSON.stringify({ ar: "مطرب سعودي" }),
  clueLabelJson: JSON.stringify(null),
  bidHistoryJson: "[]",
  audioJson: audioJson(),
  ...over,
});

/** Shaped like the real snapshot, matching the existing first-note suite. */
const runtime = (modeState: Record<string, unknown>) =>
  ({
    runtimeId: "runtime",
    sessionId: "session",
    revision: 3,
    status: "round-active",
    mode: { key: "first-note", version: 1, stateSchemaVersion: 1 },
    modeState,
    activeRound: { id: "round", status: "active" },
    availableActions: ["mode:submit-first-note-answer"],
    completedRounds: [],
    transitions: [],
    serverTimestamp: "2026-01-01T00:00:00Z",
  }) as unknown as GameplayRuntimeSnapshot;

/**
 * A stand-in for the media element jsdom does not implement, recording what the
 * component asked it to do.
 */
let clock = 0;
let paused: number[] = [];
let playCalls = 0;
let rafQueue: FrameRequestCallback[] = [];

function installFakeMedia() {
  clock = 0;
  paused = [];
  playCalls = 0;
  rafQueue = [];
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get() {
      return clock;
    },
    set(v: number) {
      clock = v;
    },
  });
  HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLMediaElement) {
    playCalls += 1;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }) as never;
  HTMLMediaElement.prototype.pause = vi.fn(function () {
    paused.push(clock);
  }) as never;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
}

/** Advance media time and let the rAF boundary watcher observe it. */
function advanceTo(seconds: number) {
  clock = seconds;
  act(() => {
    const due = rafQueue;
    rafQueue = [];
    for (const cb of due) cb(seconds * 1000);
  });
}

const el = () => screen.getByTestId("first-note-audio") as HTMLAudioElement;

beforeEach(() => {
  installFakeMedia();
  session.gameplayCommand.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("bounded Master playback", () => {
  it.each([1, 7, 15])(
    "stops at the authoritative bid of %i seconds",
    (seconds) => {
      render(
        <FirstNoteGameplayPanel
          runtime={runtime(state({ finalBidSeconds: seconds, answerOwnerTeamId: "team-a" }))}
          actor="shared-screen"
        />,
      );
      expect(el()).toHaveAttribute("src", MASTER);
      expect(playCalls).toBe(1);

      // Just short of the boundary nothing stops.
      advanceTo(seconds - 0.05);
      expect(paused).toHaveLength(0);

      advanceTo(seconds);
      expect(paused).toEqual([seconds]);
    },
  );

  it("plays only the first 15s of a Master that is physically longer", () => {
    render(
      <FirstNoteGameplayPanel
        runtime={runtime(state({ finalBidSeconds: 15, answerOwnerTeamId: "team-a" }))}
        actor="shared-screen"
      />,
    );
    // The authored Master is 15.2s; the extra 0.2s must never play.
    advanceTo(15);
    expect(paused).toEqual([15]);
    expect(el().currentTime).toBeLessThanOrEqual(15);
  });

  it("requests one identical Master URL whatever the bid is", () => {
    const urls = new Set<string>();
    for (const seconds of [1, 4, 9, 15]) {
      const { unmount } = render(
        <FirstNoteGameplayPanel
          runtime={runtime(state({ finalBidSeconds: seconds, answerOwnerTeamId: "team-a" }))}
          actor="shared-screen"
        />,
      );
      urls.add(el().getAttribute("src") ?? "");
      unmount();
    }
    // No per-duration variants: not 1s/3s/7s/15s assets, one Master.
    expect([...urls]).toEqual([MASTER]);
  });
});

describe("steal", () => {
  it("reuses the same Master and the same winning bid, granting no extra audio", () => {
    const { rerender } = render(
      <FirstNoteGameplayPanel
        runtime={runtime(state({ finalBidSeconds: 3, answerOwnerTeamId: "team-a" }))}
        actor="shared-screen"
      />,
    );
    const answeringSrc = el().getAttribute("src");
    advanceTo(3);
    expect(paused).toEqual([3]);

    // A wrong answer hands the opponent the one steal attempt.
    rerender(
      <FirstNoteGameplayPanel
        runtime={runtime(
          state({ phase: "steal", finalBidSeconds: 3, answerOwnerTeamId: "team-b" }),
        )}
        actor="shared-screen"
      />,
    );
    expect(el().getAttribute("src")).toBe(answeringSrc);
    expect(el()).toHaveAttribute("data-clip-seconds", "3");
    expect(screen.getByTestId("first-note-answer-phase")).toHaveTextContent(
      "مدة المقطع: 3 ثانية",
    );

    // Same authorisation, so the steal must not re-trigger a fresh play.
    expect(playCalls).toBe(1);
    advanceTo(3.2);
    expect(paused.every((at) => at <= 3.2)).toBe(true);
  });
});

describe("idempotency and cleanup", () => {
  it("does not restart when the same authoritative state is delivered again", () => {
    const props = {
      runtime: runtime(state({ finalBidSeconds: 5, answerOwnerTeamId: "team-a" })),
      actor: "shared-screen" as const,
    };
    const { rerender } = render(<FirstNoteGameplayPanel {...props} />);
    expect(playCalls).toBe(1);

    // A duplicate socket update / reconnect adoption carrying identical state.
    rerender(
      <FirstNoteGameplayPanel
        runtime={runtime(state({ finalBidSeconds: 5, answerOwnerTeamId: "team-a" }))}
        actor="shared-screen"
      />,
    );
    rerender(
      <FirstNoteGameplayPanel
        runtime={runtime(state({ finalBidSeconds: 5, answerOwnerTeamId: "team-a" }))}
        actor="shared-screen"
      />,
    );
    expect(playCalls).toBe(1);
  });

  it("preserves the authoritative bid across a reconnect re-render", () => {
    const { rerender } = render(
      <FirstNoteGameplayPanel
        runtime={runtime(state({ finalBidSeconds: 2, answerOwnerTeamId: "team-a" }))}
        actor="shared-screen"
      />,
    );
    rerender(
      <FirstNoteGameplayPanel
        runtime={runtime(state({ finalBidSeconds: 2, answerOwnerTeamId: "team-a" }))}
        actor="shared-screen"
      />,
    );
    expect(el()).toHaveAttribute("data-clip-seconds", "2");
    advanceTo(2);
    expect(paused).toEqual([2]);
  });

  it("stops audio when the stage unmounts", () => {
    const { unmount } = render(
      <FirstNoteGameplayPanel
        runtime={runtime(state({ finalBidSeconds: 6, answerOwnerTeamId: "team-a" }))}
        actor="shared-screen"
      />,
    );
    expect(paused).toHaveLength(0);
    unmount();
    expect(paused).toHaveLength(1);
  });
});

describe("projection privacy", () => {
  it("renders no Master audio element on a player's phone", () => {
    render(
      <FirstNoteGameplayPanel
        runtime={runtime(
          // A phone's projection carries no audioJson at all; even were one to
          // arrive, the surface must not mount a player-side player.
          state({ finalBidSeconds: 3, answerOwnerTeamId: "team-a", canAnswer: true }),
        )}
        actor="participant"
      />,
    );
    expect(screen.queryByTestId("first-note-audio")).toBeNull();
    expect(playCalls).toBe(0);
  });
});


describe("Master audio URL resolution", () => {
  const RELATIVE = "/uploads/question-assets/audio/mus-not-004.mp3";

  const renderWith = (url: string) =>
    render(
      <FirstNoteGameplayPanel
        runtime={runtime(
          state({
            finalBidSeconds: 4,
            answerOwnerTeamId: "team-a",
            audioJson: audioJson(url),
          }),
        )}
        actor="shared-screen"
      />,
    );

  it("resolves a relative ContentItem media key against the backend origin", () => {
    renderWith(RELATIVE);
    // A ContentItem stores the key, not a URL. Handing it straight to <audio>
    // made the browser fetch it from the frontend, which 404s.
    expect(el().getAttribute("src")).toBe(`${BACKEND}${RELATIVE}`);
  });

  it("never leaves the audio pointing at the page's own origin", () => {
    renderWith(RELATIVE);
    const src = el().getAttribute("src") ?? "";
    expect(new URL(src).origin).toBe(BACKEND);
    expect(new URL(src).origin).not.toBe(window.location.origin);
  });

  it("resolves the auction-phase preload element the same way", () => {
    render(
      <FirstNoteGameplayPanel
        runtime={runtime(
          state({ phase: "auction", biddingTeamId: "team-a", audioJson: audioJson(RELATIVE) }),
        )}
        actor="shared-screen"
      />,
    );
    const preload = screen.getByTestId("first-note-audio-preload");
    expect(preload.getAttribute("src")).toBe(`${BACKEND}${RELATIVE}`);
  });

  it("leaves an already-absolute Master URL untouched", () => {
    renderWith(MASTER);
    expect(el().getAttribute("src")).toBe(MASTER);
  });

  it("still clamps a resolved relative Master at the authoritative bid", () => {
    renderWith(RELATIVE);
    expect(playCalls).toBe(1);
    advanceTo(4);
    expect(paused).toEqual([4]);
  });

  it("mounts no audio on a phone even when the URL resolves", () => {
    render(
      <FirstNoteGameplayPanel
        runtime={runtime(
          state({ finalBidSeconds: 4, answerOwnerTeamId: "team-a", audioJson: audioJson(RELATIVE) }),
        )}
        actor="participant"
      />,
    );
    expect(screen.queryByTestId("first-note-audio")).toBeNull();
    expect(screen.queryByTestId("first-note-audio-preload")).toBeNull();
    expect(playCalls).toBe(0);
  });
});
