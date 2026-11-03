import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ONE_CLUE_DEMO_STEPS,
  OneClueExplainer,
  SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

describe("OneClueExplainer", () => {
  it("encodes progressive value, a locked wrong answer, and continuation", () => {
    expect(ONE_CLUE_DEMO_STEPS.map((step) => step.id)).toEqual([
      "opening",
      "first-clue",
      "second-clue",
      "team-a-input",
      "team-a-lock",
      "wrong",
      "third-clue",
      "team-b-lock",
      "item-reveal",
      "final",
    ]);
    expect(
      SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO.clues.map((clue) => clue.value),
    ).toEqual([5, 4, 3, 2, 1]);
    render(
      <OneClueExplainer
        scenario={SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    expect(screen.getByText(/7 ثوانٍ · 5 نقاط/)).toBeInTheDocument();
    expect(screen.getByText("ما المدينة المقصودة؟")).toBeInTheDocument();
  });

  it("shows the canonical three-item Match result", () => {
    render(
      <OneClueExplainer
        scenario={SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    fireEvent.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("one-clue-final")).toHaveTextContent("5");
    expect(screen.getByTestId("one-clue-final")).toHaveTextContent("7");
    expect(screen.getByText(/\+1 نقطة مباراة/)).toBeInTheDocument();
  });

  it("supports skip and replay lifecycle controls", () => {
    render(
      <OneClueExplainer
        scenario={SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    fireEvent.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("one-clue-final")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("explainer-replay"));
    expect(screen.getByTestId("one-clue-explainer")).toHaveAttribute(
      "data-demo-step",
      "opening",
    );
  });
});
