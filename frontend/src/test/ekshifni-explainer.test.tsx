import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  EKSHIFNI_DEMO_STEPS,
  EkshifniExplainer,
  SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO,
  SUPPORTED_TUTORIAL_KINDS,
} from "@/features/challenge-explainer";

describe("EkshifniExplainer", () => {
  it("encodes the clear-window race and keeps One Clue out of current release coverage", () => {
    expect(EKSHIFNI_DEMO_STEPS.map((step) => step.id)).toEqual([
      "obscured",
      "first-window",
      "second-window",
      "answer-entry",
      "wrong",
      "initiative-transfer",
      "opponent-reveal",
      "correct-entry",
      "correct",
      "full-reveal",
      "final",
    ]);
    expect(SUPPORTED_TUTORIAL_KINDS).toContain("ekshifni");
    expect(SUPPORTED_TUTORIAL_KINDS).not.toContain("one-clue");
  });

  it("keeps the authored reveal order aligned with the server-derived outcome", () => {
    expect(
      SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO.regions
        .slice(0, 3)
        .map((region) => region.id),
    ).toEqual(SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO.outcome.revealedRegionIds);
  });

  it("does not disclose identity before resolution and preserves lifecycle controls", () => {
    render(
      <EkshifniExplainer
        scenario={SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    expect(screen.queryByText("رضوى الشربيني")).not.toBeInTheDocument();
    expect(screen.getByAltText("صورة مشهورة مخفية")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("ekshifni-final")).toHaveTextContent("6");
    expect(screen.getByTestId("ekshifni-final")).toHaveTextContent("8");
    expect(screen.getByText(/\+1 نقطة مباراة/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("explainer-replay"));
    expect(screen.getByTestId("ekshifni-explainer")).toHaveAttribute(
      "data-demo-step",
      "obscured",
    );
  });

  it("keeps the answer-entry state generic under reduced motion", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    });
    render(
      <EkshifniExplainer
        scenario={SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    for (let index = 0; index < 3; index += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    expect(screen.getByText("إجابة أولية غير صحيحة")).toBeInTheDocument();
    expect(
      screen.queryByText(
        SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO.wrongSubmittedAnswer,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO.celebrityIdentity),
    ).not.toBeInTheDocument();
  });
});
