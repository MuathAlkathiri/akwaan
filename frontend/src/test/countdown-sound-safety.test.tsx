import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChallengeCountdown } from "@/features/live-game-session/match/components/challenge-countdown";
import {
  CountdownSurfaceProvider,
  useCountdownCues,
} from "@/features/live-game-session/match/components/countdown-presentation";
import { DEFAULT_COUNTDOWN_THRESHOLDS } from "@/features/live-game-session/match/components/countdown-urgency";
import { resetCountdownSoundForTests } from "@/features/live-game-session/match/components/countdown-sound";

/**
 * The room's countdown sound, functional safety only (2026-11-16):
 * the switch tells the truth after a reload, a storage-blocked browser still
 * honours the choice for the page, and no second is ever announced twice —
 * not across a Bomb handoff, not when latency bounces the display.
 */
const started: number[] = [];
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    };
  }
  createOscillator() {
    return {
      type: "sine",
      frequency: {
        value: 0,
        setValueAtTime(value: number) {
          this.value = value;
        },
        exponentialRampToValueAtTime() {},
      },
      connect() {},
      start() {
        started.push(this.frequency.value);
      },
      stop() {},
    };
  }
}

let now = 1_000_000;
beforeEach(() => {
  started.length = 0;
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  resetCountdownSoundForTests();
  window.localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext =
    FakeAudioContext;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

const stage = (seconds: number, props: Record<string, unknown> = {}) => (
  <CountdownSurfaceProvider surface="stage">
    <ChallengeCountdown remainingMs={seconds * 1000} {...props} />
  </CountdownSurfaceProvider>
);
const toggle = () => screen.getByTestId("countdown-sound-toggle");
/** A second later on the wall clock, so the 400 ms same-cue guard is not what saves us. */
const later = () => {
  now += 1_000;
};

describe("a truthful switch", () => {
  it("shows off after a reload even though the device chose on — and stays silent", () => {
    window.localStorage.setItem("akwaan.countdownSound", "on");
    const { rerender } = render(stage(7));
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    later();
    rerender(stage(6));
    later();
    rerender(stage(5));
    expect(started).toHaveLength(0);
  });

  it("turns on only on an explicit press, then sounds", () => {
    window.localStorage.setItem("akwaan.countdownSound", "on");
    const { rerender } = render(stage(7));
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    later();
    rerender(stage(6));
    later();
    rerender(stage(5));
    expect(started).toHaveLength(1);
  });

  it("stays off, honestly, where Web Audio is missing", () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    render(stage(7));
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
  });

  it("is silent when muted", () => {
    const { rerender } = render(stage(7));
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    later();
    rerender(stage(6));
    later();
    rerender(stage(5));
    expect(started).toHaveLength(0);
  });
});

describe("a storage-blocked browser", () => {
  it("keeps the choice for this page and plays", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { rerender } = render(stage(7));
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    later();
    rerender(stage(6));
    later();
    rerender(stage(5));
    expect(started).toHaveLength(1);
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
  });
});

describe("audio questions", () => {
  it("stays silent while the question is audio, and sounds for an ordinary one", () => {
    const { rerender } = render(stage(7, { sound: false }));
    fireEvent.click(toggle());
    later();
    rerender(stage(6, { sound: false }));
    later();
    rerender(stage(5, { sound: false }));
    expect(started).toHaveLength(0);
    later();
    rerender(stage(4));
    expect(started).toHaveLength(1);
  });
});

describe("no second announced twice", () => {
  it("does not repeat a second when latency bounces the display", () => {
    const { rerender } = render(stage(7));
    fireEvent.click(toggle());
    later();
    rerender(stage(6));
    later();
    rerender(stage(5)); // tick
    later();
    rerender(stage(6)); // a slower snapshot
    later();
    rerender(stage(5)); // already announced
    expect(started).toHaveLength(1);
    later();
    rerender(stage(4)); // the next real second
    expect(started).toHaveLength(2);
  });

  it("treats a jump of more than a second upward as a new countdown", () => {
    const { rerender } = render(stage(6));
    fireEvent.click(toggle());
    later();
    rerender(stage(5));
    later();
    rerender(stage(20)); // the next question
    later();
    rerender(stage(5)); // first sight of a different value, not a step
    later();
    rerender(stage(4));
    expect(started).toHaveLength(2);
  });

  it("does not replay after the tab comes back", () => {
    const { rerender } = render(stage(8));
    fireEvent.click(toggle());
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    later();
    rerender(stage(4));
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    later();
    rerender(stage(3));
    expect(started).toHaveLength(0);
  });

  /** Bomb's room clock: one hook, a key per team. */
  function Clock({ seconds, team }: { seconds: number; team: string }) {
    useCountdownCues(seconds, DEFAULT_COUNTDOWN_THRESHOLDS, true, team);
    return null;
  }
  const bomb = (seconds: number, team: string) => (
    <CountdownSurfaceProvider surface="stage">
      <ChallengeCountdown remainingMs={60_000} sound={false} />
      <Clock seconds={seconds} team={team} />
    </CountdownSurfaceProvider>
  );

  it("treats a Bomb handoff as a new clock, not a step", () => {
    const { rerender } = render(bomb(12, "team-a"));
    fireEvent.click(toggle());
    later();
    rerender(bomb(11, "team-a"));
    later();
    // Team B's clock happens to read one second lower: not a warning step.
    rerender(bomb(10, "team-b"));
    expect(started).toHaveLength(0);
    later();
    rerender(bomb(9, "team-b"));
    // 10 → 9 is inside warning: no cue on a continuing warning second.
    expect(started).toHaveLength(0);
  });

  it("does not replay on reconnect (a fresh mount is first sight)", () => {
    window.localStorage.setItem("akwaan.countdownSound", "on");
    const first = render(stage(6));
    fireEvent.click(toggle());
    first.unmount();
    render(stage(5));
    expect(started).toHaveLength(0);
  });
});
