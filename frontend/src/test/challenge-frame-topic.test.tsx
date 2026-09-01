import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChallengeFrame } from "@/features/live-game-session/match/components/challenge-frame";

/**
 * The shared-screen (and phone) challenge topic must stay fully readable: a long
 * Top-5 topic was being ellipsized on one line. The frame now wraps it (up to a
 * three-line safety cap) instead of truncating.
 */
describe("ChallengeFrame topic readability", () => {
  const LONG_TOPIC =
    "أفضل 5 أندية في تاريخ دوري أبطال أوروبا (عدد الأهداف المسجلة في البطولة)";

  it("renders the full long Arabic topic, not an ellipsized single line", () => {
    render(
      <ChallengeFrame eyebrow="أفضل 5" title={LONG_TOPIC}>
        <p>body</p>
      </ChallengeFrame>,
    );
    // The complete topic text is present in the DOM (nothing dropped).
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      LONG_TOPIC,
    );
  });

  it("does not single-line truncate the topic; wraps within a line-clamp cap", () => {
    render(
      <ChallengeFrame title={LONG_TOPIC}>
        <p>body</p>
      </ChallengeFrame>,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    // Regression guard: the single-line ellipsis class must be gone, replaced by
    // a multi-line clamp that lets normal long topics wrap.
    expect(heading.className).not.toContain("truncate");
    expect(heading.className).toContain("line-clamp-3");
  });

  it("still renders progress and body content", () => {
    render(
      <ChallengeFrame title="عنوان" progressLabel="البطاقة 3 من 10" progressValue={30}>
        <p>محتوى</p>
      </ChallengeFrame>,
    );
    expect(screen.getByText("البطاقة 3 من 10")).toBeTruthy();
    expect(screen.getByText("محتوى")).toBeTruthy();
  });
});
