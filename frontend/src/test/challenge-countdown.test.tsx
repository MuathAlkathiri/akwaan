import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChallengeCountdown } from "@/features/live-game-session/match/components/challenge-countdown";

/**
 * The countdown's warning state must stay legible and must not rely on colour.
 *
 * Brand gold measured ~1.9:1 on the cream room, so the warning digits moved to the
 * `--warning` token on the large numeral and to navy on the small chip, and an
 * alarm icon marks every urgent second. None of this may change *when* urgency
 * escalates, or what the timer says.
 */
const at = (seconds: number, variant: "chip" | "prominent") => {
  const view = render(
    <ChallengeCountdown remainingMs={seconds * 1000} variant={variant} />,
  );
  const timer = screen.getByTestId("challenge-countdown");
  const cue = screen.queryByTestId("challenge-countdown-urgent-cue");
  return { view, timer, cue };
};

describe("ChallengeCountdown urgency presentation", () => {
  for (const variant of ["chip", "prominent"] as const) {
    it(`keeps the same thresholds and only marks urgent seconds (${variant})`, () => {
      for (const [seconds, urgency, hasCue] of [
        [10, "calm", false],
        [7, "calm", false],
        [6, "warning", true],
        [4, "warning", true],
        [3, "critical", true],
        [1, "critical", true],
      ] as const) {
        const { view, timer, cue } = at(seconds, variant);
        expect(timer.dataset.urgency).toBe(urgency);
        expect(Boolean(cue)).toBe(hasCue);
        // The cue is decorative: the spoken and visible timer text is unchanged.
        expect(cue?.getAttribute("aria-hidden") ?? "true").toBe("true");
        expect(timer).toHaveAttribute("role", "timer");
        expect(timer).toHaveAttribute("aria-label", `الوقت المتبقي ${seconds} ثانية`);
        expect(timer.textContent).toContain(String(seconds));
        expect(timer.textContent).toContain("ثانية");
        view.unmount();
      }
    });
  }

  it("never paints the digits brand gold", () => {
    for (const variant of ["chip", "prominent"] as const) {
      for (const seconds of [10, 6, 3]) {
        const { view, timer } = at(seconds, variant);
        expect(timer.className).not.toMatch(/text-brand-gold/);
        view.unmount();
      }
    }
  });

  it("uses the warning token on the large numeral, navy digits on the small chip", () => {
    const prominent = at(5, "prominent");
    expect(prominent.timer.className).toMatch(/\btext-warning\b/);
    prominent.view.unmount();

    const chip = at(5, "chip");
    expect(chip.timer.className).toMatch(/\btext-foreground\b/);
    expect(chip.timer.className).toMatch(/\bborder-warning\b/);
    expect(chip.timer.className).not.toMatch(/\btext-warning\b/);
    chip.view.unmount();
  });

  it("keeps the error red for the last three seconds", () => {
    for (const variant of ["chip", "prominent"] as const) {
      const { view, timer } = at(2, variant);
      expect(timer.className).toMatch(/\btext-sem-error\b/);
      view.unmount();
    }
  });
});
