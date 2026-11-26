import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChallengeCountdown } from "@/features/live-game-session/match/components/challenge-countdown";

/**
 * The countdown's warning state must stay legible and must not rely on colour.
 *
 * Brand gold measured ~1.9:1 on the cream room, so the warning digits moved to the
 * `--warning` token on the large numeral and to navy on the small chip, and an
 * alarm icon marks every urgent second. None of this may change what the timer
 * says.
 *
 * The default thresholds are the Timer Experience values — warning from ten
 * seconds, critical from five — replacing the earlier six and three. A short
 * window passes its own (RYO keeps six and three; see its decision-screen test).
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
    it(`escalates at ten and five seconds and only marks urgent seconds (${variant})`, () => {
      for (const [seconds, urgency, hasCue] of [
        [25, "calm", false],
        [11, "calm", false],
        [10, "warning", true],
        [6, "warning", true],
        [5, "critical", true],
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
    const prominent = at(8, "prominent");
    expect(prominent.timer.className).toMatch(/\btext-warning\b/);
    prominent.view.unmount();

    const chip = at(8, "chip");
    expect(chip.timer.className).toMatch(/\btext-foreground\b/);
    expect(chip.timer.className).toMatch(/\bborder-warning\b/);
    expect(chip.timer.className).not.toMatch(/\btext-warning\b/);
    chip.view.unmount();
  });

  it("fills the round chip with coral for the last three seconds, and never colours text", () => {
    const chip = at(2, "chip");
    expect(chip.timer.className).toMatch(/\bbg-sem-error\b/);
    expect(chip.timer.className).toMatch(/\btext-sem-reveal-foreground\b/);
    chip.view.unmount();
    // The plain numeral has no fill to wear, so it stays navy: red is never a
    // text colour. Its beat and its icon carry the urgency.
    const plain = at(2, "prominent");
    expect(plain.timer.className).not.toMatch(/text-sem-error|text-destructive/);
    plain.view.unmount();
  });
});
