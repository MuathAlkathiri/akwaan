import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { render, screen, act } from "@testing-library/react";
import type {
  GameplayRuntimeSnapshot,
  LiveSessionSnapshot,
} from "@/features/live-game-session/model";

/**
 * اقرأ خصمك — server-authoritative audio replay, and the readiness barrier that
 * stops an audio item's clock starting before its clip has loaded.
 *
 * The thing worth asserting is not that a button sends a command. It is that the
 * shared screen restarts the clip **exactly** when the server authorised one
 * more replay than it has played, and at no other time — not on the first
 * snapshot, not on a redelivered one, not on a reconnect, and never on a counter
 * belonging to the previous question. M2 persists then publishes with no outbox,
 * so a replay can be durably recorded while the event announcing it is lost;
 * everything here therefore reads committed state rather than events, which is
 * also what makes recovery from a missed signal fall out for free.
 */

const NOW = "2026-01-01T00:00:10.000Z";

const mocks = vi.hoisted(() => ({
  snapshot: {
    sessionId: "session-1",
    revision: 4,
    serverTimestamp: "2026-01-01T00:00:10.000Z",
    teams: [
      { id: "team-a", name: "أسود الشمال" },
      { id: "team-b", name: "صقور الرياض" },
    ],
    participants: [],
    availableActions: [],
  } as unknown as LiveSessionSnapshot,
  gameplayCommand: vi.fn(),
  connection: "connected" as string,
  presentationReadySocket: vi.fn(),
  phone: false,
}));

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({ useLiveSessionClock: () => Date.parse(NOW) }),
);

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: mocks.snapshot,
    snapshotReceivedAtMs: Date.parse(NOW),
    gameplayCommand: mocks.gameplayCommand,
    connection: mocks.connection,
    presentationReadySocket: mocks.presentationReadySocket,
    connectionEpoch: 1,
  }),
}));

vi.mock(
  "@/features/live-game-session/match/components/mobile-gameplay-shell",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/features/live-game-session/match/components/mobile-gameplay-shell")
      >();
    return { ...actual, useMobileSurface: () => mocks.phone };
  },
);

import { RyoGameplayPanel } from "@/features/live-game-session/components/ryo-gameplay-panel";

const AUDIO = { type: "audio", url: "https://cdn/clip.mp3" };

/** Every replay-relevant knob in one place, defaulted to a live audio item. */
const runtime = (
  over: {
    media?: unknown;
    replaySequence?: number;
    replayItemIndex?: number;
    replayAt?: string;
    cooldownSeconds?: number;
    itemIndex?: number;
    phase?: string;
    actions?: string[];
    revision?: number;
    deadlineAt?: string;
    interactionStatus?: string;
    actorRole?: string;
  } = {},
) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    status: "round-active",
    revision: over.revision ?? 7,
    mode: { key: "read-your-opponent", version: 1, stateSchemaVersion: 1 },
    modeState: {
      currentItemIndex: over.itemIndex ?? 0,
      audioReplayCooldownSeconds: over.cooldownSeconds ?? 2,
    },
    presentationSurface: undefined,
    activeRound: {
      id: "round-1",
      sequence: 1,
      status: "active",
      modeState: {
        answeringTeamId: "team-a",
        opposingTeamId: "team-b",
        phase: over.phase ?? "collecting",
        itemIndex: over.itemIndex ?? 0,
        ...(over.replaySequence !== undefined
          ? {
              audioReplaySequence: over.replaySequence,
              audioReplayItemIndex: over.replayItemIndex ?? over.itemIndex ?? 0,
              audioReplayAt: over.replayAt ?? "2026-01-01T00:00:00.000Z",
            }
          : {}),
      },
      transitionRevision: 1,
      createdAt: NOW,
      startedAt: NOW,
      interaction: {
        id: "interaction-1",
        revision: 3,
        status: over.interactionStatus ?? "open",
        prompt: {
          id: "p-1",
          type: "ryo.item",
          schemaVersion: 1,
          payload: {
            itemJson: JSON.stringify({
              id: "item-1",
              prompt: { ar: "ما اسم هذه الأغنية؟" },
              answerMode: "multiple_choice",
              options: [{ id: "o1", label: { ar: "أ" } }],
              media: "media" in over ? over.media : AUDIO,
            }),
            actorRole: over.actorRole ?? "opposing",
            isAssignedActor: true,
            answererParticipantId: "p-answerer",
            deciderParticipantId: "p-decider",
          },
          visibleFrom: NOW,
          deadlineAt: over.deadlineAt ?? "2026-01-01T00:00:35.000Z",
          metadata: {},
        },
        submissions: [],
      },
    },
    availableActions: over.actions ?? [
      "submission:create",
      "mode:request-ryo-replay",
    ],
  }) as unknown as GameplayRuntimeSnapshot;

/** Count restarts by watching `currentTime` being rewound and play() called. */
let plays: number[] = [];
let pauses = 0;
/** The `volume` each play() was attempted at, for the playability probe. */
let volumesAtPlay: number[] = [];

beforeEach(() => {
  mocks.gameplayCommand.mockReset();
  mocks.presentationReadySocket.mockReset();
  mocks.presentationReadySocket.mockResolvedValue(undefined);
  mocks.connection = "connected";
  mocks.phone = false;
  plays = [];
  pauses = 0;
  volumesAtPlay = [];
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    plays.push(this.currentTime);
    volumesAtPlay.push(this.volume);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {
    pauses += 1;
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Plays triggered after mount — i.e. replays rather than the initial autoplay. */
const replaysAfterMount = (baseline: number) => plays.length - baseline;

describe("اقرأ خصمك — shared-screen audio replay", () => {
  it("does not replay historical audio from the first snapshot it sees", () => {
    // A room joining mid-item receives a sequence of 3. It has played none of
    // them and must play none of them: the first value is a baseline, not a
    // backlog.
    render(<RyoGameplayPanel runtime={runtime({ replaySequence: 3 })} />);
    const afterMount = plays.length;
    expect(replaysAfterMount(afterMount)).toBe(0);
  });

  it("restarts the clip exactly once when the server authorises a new replay", () => {
    const { rerender } = render(
      <RyoGameplayPanel runtime={runtime({ replaySequence: 1 })} />,
    );
    const baseline = plays.length;
    rerender(
      <RyoGameplayPanel
        runtime={runtime({ replaySequence: 2, revision: 8 })}
      />,
    );
    expect(replaysAfterMount(baseline)).toBe(1);
    // Restart, not resume: the clip begins at the beginning.
    expect(plays.at(-1)).toBe(0);
  });

  it("does not restart twice for a redelivered snapshot at the same sequence", () => {
    const { rerender } = render(
      <RyoGameplayPanel runtime={runtime({ replaySequence: 1 })} />,
    );
    const baseline = plays.length;
    rerender(
      <RyoGameplayPanel runtime={runtime({ replaySequence: 2, revision: 8 })} />,
    );
    rerender(
      <RyoGameplayPanel runtime={runtime({ replaySequence: 2, revision: 9 })} />,
    );
    rerender(
      <RyoGameplayPanel
        runtime={runtime({ replaySequence: 2, revision: 10 })}
      />,
    );
    expect(replaysAfterMount(baseline)).toBe(1);
  });

  it("recovers a MISSED signal from a newer snapshot", () => {
    // Persist-then-publish with no outbox: the event announcing replay 2 never
    // arrived, and the next snapshot says 3. One restart is correct — the room
    // owes the players a replay, not two.
    const { rerender } = render(
      <RyoGameplayPanel runtime={runtime({ replaySequence: 1 })} />,
    );
    const baseline = plays.length;
    rerender(
      <RyoGameplayPanel runtime={runtime({ replaySequence: 3, revision: 9 })} />,
    );
    expect(replaysAfterMount(baseline)).toBe(1);
  });

  it("ignores a replay counter belonging to a previous item", () => {
    // Item 1 is on screen; the counter still names item 0. Playing it would
    // restart the wrong question's clip.
    const { rerender } = render(
      <RyoGameplayPanel
        runtime={runtime({ itemIndex: 1, replaySequence: 1, replayItemIndex: 1 })}
      />,
    );
    const baseline = plays.length;
    rerender(
      <RyoGameplayPanel
        runtime={runtime({
          itemIndex: 1,
          replaySequence: 9,
          replayItemIndex: 0,
          revision: 8,
        })}
      />,
    );
    expect(replaysAfterMount(baseline)).toBe(0);
  });

  it("never replays on a remount, which is what a reconnect looks like", () => {
    const { unmount } = render(
      <RyoGameplayPanel runtime={runtime({ replaySequence: 4 })} />,
    );
    unmount();
    plays = [];
    render(<RyoGameplayPanel runtime={runtime({ replaySequence: 4 })} />);
    // Mounting autoplays the clip for the new surface; it must not then also
    // replay the four requests the old one already served.
    expect(plays.length).toBeLessThanOrEqual(1);
  });

  it("never touches the gameplay countdown", () => {
    const { rerender } = render(
      <RyoGameplayPanel runtime={runtime({ replaySequence: 1 })} />,
    );
    const before = screen.getByTestId("challenge-countdown").textContent;
    rerender(
      <RyoGameplayPanel runtime={runtime({ replaySequence: 2, revision: 8 })} />,
    );
    expect(screen.getByTestId("challenge-countdown").textContent).toBe(before);
  });

  it("stops playback when the authoritative window has closed", () => {
    const { rerender } = render(<RyoGameplayPanel runtime={runtime()} />);
    const before = pauses;
    // The deadline has passed relative to the mocked server clock.
    rerender(
      <RyoGameplayPanel
        runtime={runtime({ deadlineAt: "2026-01-01T00:00:05.000Z", revision: 8 })}
      />,
    );
    expect(pauses).toBeGreaterThan(before);
  });

  it("stops playback when the item resolves", () => {
    const { rerender } = render(<RyoGameplayPanel runtime={runtime()} />);
    const before = pauses;
    rerender(
      <RyoGameplayPanel
        runtime={runtime({ interactionStatus: "resolved", revision: 8 })}
      />,
    );
    expect(pauses).toBeGreaterThan(before);
  });

  it("stops playback on unmount — an abort or a stage change", () => {
    const { unmount } = render(<RyoGameplayPanel runtime={runtime()} />);
    const before = pauses;
    unmount();
    expect(pauses).toBeGreaterThan(before);
  });
});

describe("اقرأ خصمك — replay control", () => {
  it("offers the control on the shared screen when the server allows it", () => {
    render(<RyoGameplayPanel runtime={runtime()} />);
    expect(screen.getByTestId("ryo-replay-button")).toBeTruthy();
  });

  it("sends the M2 command with the active item index", () => {
    render(<RyoGameplayPanel runtime={runtime({ itemIndex: 2 })} />);
    screen.getByTestId("ryo-replay-button").click();
    expect(mocks.gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "request-ryo-replay",
      payload: { itemIndex: 2 },
    });
  });

  it("hides the control from an actor the server has not authorised", () => {
    // A spectator's snapshot simply does not carry the action. No client-side
    // role rule is restated here — this IS the server's answer.
    render(
      <RyoGameplayPanel runtime={runtime({ actions: ["submission:create"] })} />,
    );
    expect(screen.queryByTestId("ryo-replay-button")).toBeNull();
  });

  it("does not offer replay for a text-only question", () => {
    render(<RyoGameplayPanel runtime={runtime({ media: null })} />);
    expect(screen.queryByTestId("ryo-replay-button")).toBeNull();
  });

  it("disables the control outside the eligible phase", () => {
    render(<RyoGameplayPanel runtime={runtime({ phase: "resolved" })} />);
    const button = screen.getByTestId("ryo-replay-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("reflects the server's cooldown and counts it down in seconds", () => {
    // Authorised at :09 with a 2s cooldown, read at :10 — one second left.
    render(
      <RyoGameplayPanel
        runtime={runtime({
          replaySequence: 1,
          replayAt: "2026-01-01T00:00:09.000Z",
          cooldownSeconds: 2,
        })}
      />,
    );
    const button = screen.getByTestId("ryo-replay-button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("1");
  });

  it("re-enables once the server's cooldown has elapsed", () => {
    render(
      <RyoGameplayPanel
        runtime={runtime({
          replaySequence: 1,
          replayAt: "2026-01-01T00:00:00.000Z",
          cooldownSeconds: 2,
        })}
      />,
    );
    expect(
      (screen.getByTestId("ryo-replay-button") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("sends one command for a double tap", () => {
    render(<RyoGameplayPanel runtime={runtime()} />);
    const button = screen.getByTestId("ryo-replay-button");
    button.click();
    button.click();
    button.click();
    expect(mocks.gameplayCommand).toHaveBeenCalledTimes(1);
  });

  it("releases the local guard on the next authoritative snapshot", () => {
    const { rerender } = render(<RyoGameplayPanel runtime={runtime()} />);
    screen.getByTestId("ryo-replay-button").click();
    rerender(
      <RyoGameplayPanel
        runtime={runtime({ revision: 8, replaySequence: 1, replayAt: NOW })}
      />,
    );
    // The cooldown now governs; the stuck-button failure mode does not.
    expect(screen.getByTestId("ryo-replay-button")).toBeTruthy();
  });
});

describe("اقرأ خصمك — phone replay control", () => {
  beforeEach(() => {
    mocks.phone = true;
  });

  it("offers replay to the answering team", () => {
    render(<RyoGameplayPanel runtime={runtime({ actorRole: "answering" })} />);
    expect(screen.getByTestId("ryo-phone-replay")).toBeTruthy();
  });

  it("offers replay to the opposing team — both sides hear the same clip", () => {
    render(<RyoGameplayPanel runtime={runtime({ actorRole: "opposing" })} />);
    expect(screen.getByTestId("ryo-phone-replay")).toBeTruthy();
  });

  it("hides replay for a text-only question", () => {
    render(<RyoGameplayPanel runtime={runtime({ media: null })} />);
    expect(screen.queryByTestId("ryo-phone-replay")).toBeNull();
  });

  it("never plays audio on the phone — only the shared screen does", () => {
    render(<RyoGameplayPanel runtime={runtime()} />);
    expect(document.querySelector("audio")).toBeNull();
  });

  it("leaves the existing decision controls untouched", () => {
    render(<RyoGameplayPanel runtime={runtime({ actorRole: "opposing" })} />);
    expect(screen.getByTestId("ryo-phone-controller")).toBeTruthy();
    expect(mocks.gameplayCommand).not.toHaveBeenCalled();
  });
});

describe("اقرأ خصمك — audio readiness barrier", () => {
  const awaiting = (preloadAudioUrl?: string) =>
    ({
      ...runtime(),
      modeState: { awaitingPresentation: true },
      presentationSurface: {
        running: true,
        required: true,
        capability: "shared",
        generation: 2,
        ...(preloadAudioUrl ? { preloadAudioUrl } : {}),
      },
    }) as unknown as GameplayRuntimeSnapshot;

  it("buffers the clip the server named before reporting ready", () => {
    render(<RyoGameplayPanel runtime={awaiting(AUDIO.url)} />);
    const preload = screen.getByTestId("ryo-audio-preload");
    expect(preload.getAttribute("src")).toBe(AUDIO.url);
    // The whole point: no acknowledgement yet, so no deadline is anchored.
    expect(mocks.presentationReadySocket).not.toHaveBeenCalled();
  });

  it("acknowledges READY once the clip is proven playable", async () => {
    render(<RyoGameplayPanel runtime={awaiting(AUDIO.url)} />);
    await act(async () => {
      screen
        .getByTestId("ryo-audio-preload")
        .dispatchEvent(new Event("canplaythrough"));
    });
    expect(mocks.presentationReadySocket).toHaveBeenCalledWith(
      expect.objectContaining({
        presentationGeneration: 2,
        presentationOutcome: "ready",
      }),
    );
  });

  it("reports MEDIA-UNAVAILABLE for a clip that cannot load — never readiness", async () => {
    render(<RyoGameplayPanel runtime={awaiting(AUDIO.url)} />);
    await act(async () => {
      screen.getByTestId("ryo-audio-preload").dispatchEvent(new Event("error"));
    });
    // The M3.1 correction. A 404 used to release the barrier exactly like a
    // loaded clip, and the question then started a ten-second blind window with
    // nothing to hear. The surface now says it cannot present, and the server
    // leaves the clock stopped.
    expect(mocks.presentationReadySocket).toHaveBeenCalledWith(
      expect.objectContaining({ presentationOutcome: "media-unavailable" }),
    );
    expect(mocks.presentationReadySocket).not.toHaveBeenCalledWith(
      expect.objectContaining({ presentationOutcome: "ready" }),
    );
  });

  it("reports MEDIA-UNAVAILABLE when loading stalls past the bound", async () => {
    vi.useFakeTimers();
    render(<RyoGameplayPanel runtime={awaiting(AUDIO.url)} />);
    expect(mocks.presentationReadySocket).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(9000);
    });
    // A timeout is not a success either. Nothing arrived, so nothing is ready.
    expect(mocks.presentationReadySocket).toHaveBeenCalledWith(
      expect.objectContaining({ presentationOutcome: "media-unavailable" }),
    );
  });

  it("reports AUTOPLAY-BLOCKED when the browser refuses to start the clip", async () => {
    // Buffered, decodable, and silent: the policy refuses `play()` long after
    // the media is perfectly ready. Without this the question would burn its
    // whole window behind a refusal nobody could see.
    (HTMLMediaElement.prototype.play as unknown as Mock).mockImplementation(
      () => Promise.reject(Object.assign(new Error("blocked"), {
        name: "NotAllowedError",
      })),
    );
    render(<RyoGameplayPanel runtime={awaiting(AUDIO.url)} />);
    await act(async () => {
      screen
        .getByTestId("ryo-audio-preload")
        .dispatchEvent(new Event("canplaythrough"));
    });
    expect(mocks.presentationReadySocket).toHaveBeenCalledWith(
      expect.objectContaining({ presentationOutcome: "autoplay-blocked" }),
    );
  });

  it("probes at zero volume rather than muted, so muted-autoplay allowance cannot fake a pass", async () => {
    render(<RyoGameplayPanel runtime={awaiting(AUDIO.url)} />);
    const element = screen.getByTestId("ryo-audio-preload") as HTMLAudioElement;
    await act(async () => {
      element.dispatchEvent(new Event("canplaythrough"));
    });
    // Browsers grant MUTED autoplay freely, so a muted probe would report
    // success for exactly the case the probe exists to catch.
    expect(element.muted).toBe(false);
    expect(volumesAtPlay).toContain(0);
  });

  it("does not start the gameplay timer while a failure stands", async () => {
    // The claim that matters. The clock is only ever started by an activation,
    // so a barrier that refuses to activate is the mechanism — not a flag the
    // UI is trusted to honour.
    const failed = {
      ...awaiting(AUDIO.url),
      presentationSurface: {
        running: true,
        required: true,
        capability: "shared",
        generation: 2,
        preloadAudioUrl: AUDIO.url,
        failure: { reason: "media-unavailable", canRetry: true },
      },
    } as unknown as GameplayRuntimeSnapshot;
    render(<RyoGameplayPanel runtime={failed} />);
    expect(screen.queryByTestId("challenge-countdown")).toBeNull();
    expect(screen.getByTestId("ryo-presentation-failure")).toBeTruthy();
  });

  it("names the failure without naming the asset", () => {
    const failed = {
      ...awaiting(AUDIO.url),
      presentationSurface: {
        running: true,
        capability: "shared",
        generation: 2,
        preloadAudioUrl: AUDIO.url,
        failure: { reason: "media-unavailable", canRetry: true },
      },
    } as unknown as GameplayRuntimeSnapshot;
    render(<RyoGameplayPanel runtime={failed} />);
    const text = screen.getByTestId("ryo-presentation-failure").textContent!;
    // These words are on a television in front of both teams.
    expect(text).not.toContain("clip.mp3");
    expect(text).not.toContain("cdn");
    expect(text).not.toContain("ما اسم هذه الأغنية");
  });

  it("offers recovery to the host and withholds it from everyone else", () => {
    const withRetry = (canRetry: boolean) =>
      ({
        ...awaiting(AUDIO.url),
        presentationSurface: {
          running: true,
          capability: "shared",
          generation: 2,
          preloadAudioUrl: AUDIO.url,
          failure: { reason: "media-unavailable", canRetry },
        },
      }) as unknown as GameplayRuntimeSnapshot;
    const { unmount } = render(<RyoGameplayPanel runtime={withRetry(true)} />);
    expect(screen.getByTestId("ryo-presentation-recover")).toBeTruthy();
    unmount();
    // The server decides this, not the component: a phone is told what happened
    // and offered nothing to press.
    render(<RyoGameplayPanel runtime={withRetry(false)} />);
    expect(screen.queryByTestId("ryo-presentation-recover")).toBeNull();
    expect(screen.getByTestId("ryo-presentation-failure")).toBeTruthy();
  });

  it("host recovery from a dead asset asks the server to reopen the barrier", async () => {
    const failed = {
      ...awaiting(AUDIO.url),
      presentationSurface: {
        running: true,
        capability: "shared",
        generation: 2,
        preloadAudioUrl: AUDIO.url,
        failure: { reason: "media-unavailable", canRetry: true },
      },
    } as unknown as GameplayRuntimeSnapshot;
    render(<RyoGameplayPanel runtime={failed} />);
    await act(async () => {
      screen.getByTestId("ryo-presentation-recover").click();
    });
    expect(mocks.presentationReadySocket).toHaveBeenCalledWith(
      expect.objectContaining({ presentationOutcome: "retry" }),
    );
  });

  it("host recovery from an autoplay block re-probes on the gesture instead of reloading", async () => {
    // The click IS the user gesture the policy was waiting for, so the right
    // move is to try again right here — not to ask the server to re-fetch a
    // clip that was never the problem.
    const blocked = {
      ...awaiting(AUDIO.url),
      presentationSurface: {
        running: true,
        capability: "shared",
        generation: 2,
        preloadAudioUrl: AUDIO.url,
        failure: { reason: "autoplay-blocked", canRetry: true },
      },
    } as unknown as GameplayRuntimeSnapshot;
    render(<RyoGameplayPanel runtime={blocked} />);
    await act(async () => {
      screen.getByTestId("ryo-presentation-recover").click();
    });
    expect(mocks.presentationReadySocket).toHaveBeenCalledWith(
      expect.objectContaining({ presentationOutcome: "ready" }),
    );
    expect(mocks.presentationReadySocket).not.toHaveBeenCalledWith(
      expect.objectContaining({ presentationOutcome: "retry" }),
    );
  });

  it("a double-pressed recovery sends one command", async () => {
    const failed = {
      ...awaiting(AUDIO.url),
      presentationSurface: {
        running: true,
        capability: "shared",
        generation: 2,
        preloadAudioUrl: AUDIO.url,
        failure: { reason: "readiness-timeout", canRetry: true },
      },
    } as unknown as GameplayRuntimeSnapshot;
    render(<RyoGameplayPanel runtime={failed} />);
    const button = screen.getByTestId("ryo-presentation-recover");
    await act(async () => {
      button.click();
      button.click();
      button.click();
    });
    expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(1);
  });

  it("an item change abandons a pending load rather than answering for the new one", async () => {
    // A verdict is keyed to the URL it was reached for, so a late `error` from
    // the previous item's clip cannot fail the item now on screen.
    const { rerender } = render(<RyoGameplayPanel runtime={awaiting(AUDIO.url)} />);
    const next = {
      ...awaiting("https://cdn/clip-2.mp3"),
      presentationSurface: {
        running: true,
        capability: "shared",
        generation: 3,
        preloadAudioUrl: "https://cdn/clip-2.mp3",
      },
    } as unknown as GameplayRuntimeSnapshot;
    rerender(<RyoGameplayPanel runtime={next} />);
    mocks.presentationReadySocket.mockClear();
    await act(async () => {
      screen
        .getByTestId("ryo-audio-preload")
        .dispatchEvent(new Event("canplaythrough"));
    });
    expect(mocks.presentationReadySocket).toHaveBeenCalledWith(
      expect.objectContaining({
        presentationGeneration: 3,
        presentationOutcome: "ready",
      }),
    );
  });

  it("keeps the existing immediate acknowledgement for a text item", () => {
    // No clip named, nothing to wait for: unchanged behaviour.
    render(<RyoGameplayPanel runtime={awaiting()} />);
    expect(screen.queryByTestId("ryo-audio-preload")).toBeNull();
    expect(mocks.presentationReadySocket).toHaveBeenCalled();
  });

  it("names the question the server says is held, not always the first", () => {
    const third = {
      ...awaiting(AUDIO.url),
      presentationSurface: {
        running: true,
        required: true,
        capability: "shared",
        generation: 3,
        preloadAudioUrl: AUDIO.url,
        itemOrdinal: 3,
      },
    } as unknown as GameplayRuntimeSnapshot;
    render(<RyoGameplayPanel runtime={third} />);
    expect(document.body.textContent).toContain("السؤال 3 من 3");
  });

  it("exposes nothing but the clip through the barrier", () => {
    render(<RyoGameplayPanel runtime={awaiting(AUDIO.url)} />);
    // No prompt, no options, no answer while the item is held.
    expect(document.body.textContent).not.toContain("ما اسم هذه الأغنية");
    expect(screen.getByTestId("ryo-preparing")).toBeTruthy();
  });
});
