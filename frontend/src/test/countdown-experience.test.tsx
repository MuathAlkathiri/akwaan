import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChallengeCountdown } from "@/features/live-game-session/match/components/challenge-countdown";
import { CountdownSurfaceProvider } from "@/features/live-game-session/match/components/countdown-presentation";
import {
  countdownCueForStep,
  countdownThresholdsForWindow,
  countdownUrgency,
  DEFAULT_COUNTDOWN_THRESHOLDS,
} from "@/features/live-game-session/match/components/countdown-urgency";
import { resetCountdownSoundForTests } from "@/features/live-game-session/match/components/countdown-sound";

/**
 * The timer experience: a large, four-state countdown on the room's screen, a
 * compact one on phones, and opt-in cues that follow the authoritative seconds
 * and never replay what a page missed. Presentation only.
 */

// ── A Web Audio stand-in that records every tone started ──────────────────
const started: number[] = [];
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
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

beforeEach(() => {
  started.length = 0;
  resetCountdownSoundForTests();
  window.localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext =
    FakeAudioContext;
});

afterEach(() => {
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

const stage = (seconds: number, props: Record<string, unknown> = {}) => (
  <CountdownSurfaceProvider surface="stage">
    <ChallengeCountdown remainingMs={seconds * 1000} {...props} />
  </CountdownSurfaceProvider>
);
const timer = () => screen.getByTestId("challenge-countdown");
const turnSoundOn = () => fireEvent.click(screen.getByTestId("countdown-sound-toggle"));

describe("1. normal → warning → critical → expired", () => {
  it("escalates at the default ten and five seconds", () => {
    expect(
      [25, 11, 10, 6, 5, 1, 0].map((s) => countdownUrgency(s)),
    ).toEqual(["calm", "calm", "warning", "warning", "critical", "critical", "expired"]);
  });

  it("scales the thresholds down for a short window, never past the defaults", () => {
    expect(countdownThresholdsForWindow(135)).toEqual(DEFAULT_COUNTDOWN_THRESHOLDS);
    expect(countdownThresholdsForWindow(30)).toEqual(DEFAULT_COUNTDOWN_THRESHOLDS);
    expect(countdownThresholdsForWindow(15)).toEqual({ warningSeconds: 7, criticalSeconds: 5 });
    expect(countdownThresholdsForWindow(10)).toEqual({ warningSeconds: 5, criticalSeconds: 3 });
    expect(countdownThresholdsForWindow(5)).toEqual({ warningSeconds: 2, criticalSeconds: 1 });
    // A ten-second window starts calm rather than amber.
    expect(countdownUrgency(10, countdownThresholdsForWindow(10))).toBe("calm");
  });

  it("draws each state on the stage with its own icon, never colour alone", () => {
    const { rerender } = render(stage(25));
    expect(timer()).toHaveAttribute("data-urgency", "calm");
    expect(timer().className).toMatch(/bg-card/);
    for (const [seconds, urgency, tone] of [
      [9, "warning", /bg-warning-subtle/],
      [4, "critical", /bg-sem-error/],
    ] as const) {
      rerender(stage(seconds));
      expect(timer()).toHaveAttribute("data-urgency", urgency);
      expect(timer().className).toMatch(tone);
      expect(timer().querySelector("svg")).not.toBeNull();
      expect(timer()).toHaveAttribute("aria-label", `الوقت المتبقي ${seconds} ثانية`);
    }
  });
});

describe("2. expiry", () => {
  it("says the time is up instead of printing zero", () => {
    render(stage(0));
    expect(timer()).toHaveAttribute("data-urgency", "expired");
    expect(timer()).toHaveAttribute("aria-label", "انتهى الوقت");
    expect(timer().textContent).toContain("انتهى الوقت");
  });

  it("does the same on a phone", () => {
    render(<ChallengeCountdown remainingMs={0} />);
    expect(timer().textContent).toContain("انتهى الوقت");
  });
});

describe("3. one cue per observed second, never duplicated", () => {
  it("chooses cues deterministically from consecutive seconds", () => {
    const cues: Array<string | null> = [];
    let previous: number | undefined;
    for (const seconds of [12, 11, 10, 9, 6, 5, 4, 3, 2, 1, 0]) {
      cues.push(countdownCueForStep(previous, seconds));
      previous = seconds;
    }
    expect(cues).toEqual([
      null, // first sight
      null, // calm
      "warning", // entering warning
      null, // still warning
      null, // a jump of three seconds is not a step
      "tick",
      "tick",
      "final-tick",
      "final-tick",
      "final-tick",
      "expired",
    ]);
  });

  it("sounds once per second however often the screen re-renders", () => {
    const { rerender } = render(stage(7));
    turnSoundOn();
    rerender(stage(6));
    rerender(stage(5));
    rerender(stage(5));
    rerender(stage(5));
    expect(started).toHaveLength(1);
  });

  it("sounds once when two countdowns on one screen reach the same second", () => {
    const both = (seconds: number) => (
      <CountdownSurfaceProvider surface="stage">
        <ChallengeCountdown remainingMs={seconds * 1000} />
        <ChallengeCountdown remainingMs={seconds * 1000} />
      </CountdownSurfaceProvider>
    );
    const { rerender } = render(both(6));
    fireEvent.click(screen.getAllByTestId("countdown-sound-toggle")[0]);
    rerender(both(5));
    expect(started).toHaveLength(1);
  });
});

describe("4. reconnect and a tab coming back never replay", () => {
  it("is silent on first sight, even mid-countdown", () => {
    window.localStorage.setItem("akwaan.countdownSound", "on");
    render(stage(3));
    expect(started).toHaveLength(0);
  });

  it("does not catch up the seconds a hidden tab missed", () => {
    const { rerender } = render(stage(8));
    turnSoundOn();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    rerender(stage(4));
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    rerender(stage(3));
    expect(started).toHaveLength(0);
    // The next live step after returning sounds normally.
    rerender(stage(2));
    expect(started).toHaveLength(1);
  });
});

describe("5. mute, opt-in and browser restrictions", () => {
  it("is silent until someone in the room turns it on", () => {
    const { rerender } = render(stage(6));
    rerender(stage(5));
    expect(started).toHaveLength(0);
    expect(screen.getByTestId("countdown-sound-toggle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("turns off again and stays off", () => {
    const { rerender } = render(stage(7));
    turnSoundOn();
    turnSoundOn();
    rerender(stage(6));
    rerender(stage(5));
    expect(started).toHaveLength(0);
    expect(window.localStorage.getItem("akwaan.countdownSound")).toBe("off");
  });

  it("stays quiet while the question itself is audio", () => {
    const { rerender } = render(stage(6, { sound: false }));
    window.localStorage.setItem("akwaan.countdownSound", "on");
    rerender(stage(5, { sound: false }));
    expect(started).toHaveLength(0);
  });

  it("does nothing, and throws nothing, where Web Audio is unavailable", () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    const { rerender } = render(stage(6));
    expect(() => turnSoundOn()).not.toThrow();
    rerender(stage(5));
    expect(started).toHaveLength(0);
  });
});

describe("6. reduced motion", () => {
  it("beats only on the stage in its critical seconds", () => {
    const { rerender } = render(stage(4));
    expect(document.querySelector(".akwaan-countdown-beat")).not.toBeNull();
    rerender(stage(8));
    expect(document.querySelector(".akwaan-countdown-beat")).toBeNull();
  });

  it("never beats on a phone", () => {
    render(<ChallengeCountdown remainingMs={2000} />);
    expect(document.querySelector(".akwaan-countdown-beat")).toBeNull();
  });

  it("is stilled under prefers-reduced-motion", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const block = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/\.akwaan-countdown-beat[\s\S]*animation: none/);
  });
});

describe("8. the room's box fits a 720p screen", () => {
  it("draws the stage box through the shared sizing class", () => {
    render(stage(9));
    expect(timer().className).toMatch(/\bakwaan-stage-countdown\b/);
    expect(timer().querySelector(".akwaan-stage-countdown-digits")).not.toBeNull();
  });

  it("lowers the box on a short screen, after the wide-screen rule so it wins", () => {
    // المرحلة keeps its whole board on a 1280×720 screen; a 72px timer pushed
    // it down 27px. On a screen 800px tall or less the box is 48px.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const wide = css.indexOf("@media (min-width: 1024px) {\n  .akwaan-stage-countdown");
    const short = css.indexOf("@media (max-height: 800px) {\n  .akwaan-stage-countdown");
    expect(wide).toBeGreaterThan(-1);
    expect(short).toBeGreaterThan(wide);
    expect(css.slice(short, short + 200)).toMatch(/height: 3rem/);
  });
});

describe("9. phones keep a compact, steady timer", () => {
  it("has no stage size, no sound switch and a fixed-width numeral", () => {
    render(<ChallengeCountdown remainingMs={8000} />);
    expect(timer()).toHaveAttribute("data-surface", "compact");
    expect(timer().className).toMatch(/text-sm/);
    expect(screen.queryByTestId("countdown-sound-toggle")).toBeNull();
    expect(timer().querySelector(".akwaan-numeral")?.className).toMatch(/min-w-\[2ch\]/);
  });
});

describe("10. nothing sounds without an active countdown", () => {
  it("never sounds a cue from a surface that is not the stage", () => {
    window.localStorage.setItem("akwaan.countdownSound", "on");
    const { rerender } = render(<ChallengeCountdown remainingMs={6000} />);
    rerender(<ChallengeCountdown remainingMs={5000} />);
    expect(started).toHaveLength(0);
  });
});
