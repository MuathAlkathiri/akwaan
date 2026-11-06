import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  OddPieceExplainer,
  SAMPLE_ODD_PIECE_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";
import {
  SAMPLE_ODD_PIECE_V1_TUTORIAL_SCENARIO,
  SAMPLE_ODD_PIECE_V2_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer/odd-piece-demo-scenario";

describe("القطعة الدخيلة V2 mechanic tutorial", () => {
  const reducedMotion = () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    });
  };

  it("demonstrates the single-image hotspot lifecycle, handoff, and hotspot reveal", async () => {
    reducedMotion();
    render(
      <OddPieceExplainer
        scenario={SAMPLE_ODD_PIECE_V2_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );

    // Must never depict four independent answer images
    expect(screen.queryByTestId("odd-piece-grid")).not.toBeInTheDocument();
    // Must render the single vehicle viewport
    expect(screen.getByTestId("odd-piece-v2-viewport")).toBeInTheDocument();
    expect(
      screen.getByTestId("odd-piece-v2-viewport").querySelector("img"),
    ).toHaveAttribute(
      "src",
      "/tutorial-media/odd-piece-v2/question-modified-bmw-m4.png",
    );
    expect(
      screen.getByTestId("odd-piece-fixture-disclaimer"),
    ).toHaveTextContent("معاينة تجريبية — ليست صورة سؤال إنتاجية");
    expect(screen.getByTestId("odd-piece-explainer")).toHaveAttribute(
      "data-demo-step",
      "inspection",
    );

    const user = userEvent.setup();

    // Step 1 -> 2: Claim
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("odd-piece-explainer")).toHaveAttribute(
      "data-demo-step",
      "claim",
    );

    // Step 2 -> 3: Team 1 answering
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("odd-piece-explainer")).toHaveAttribute(
      "data-demo-step",
      "team-1-answering",
    );
    expect(screen.getByTestId("challenge-countdown")).toHaveAttribute(
      "aria-label",
      "الوقت المتبقي 5 ثانية",
    );

    // Step 3 -> 4: Team 1 wrong tap
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("odd-piece-explainer")).toHaveAttribute(
      "data-demo-step",
      "team-1-wrong",
    );
    expect(screen.getByTestId("odd-piece-v2-team-1-wrong")).toBeInTheDocument();

    // Step 4 -> 5: Handoff to Team 2
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("odd-piece-explainer")).toHaveAttribute(
      "data-demo-step",
      "handoff",
    );

    // Step 5 -> 6: Team 2 correct tap
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("odd-piece-explainer")).toHaveAttribute(
      "data-demo-step",
      "team-2-correct",
    );
    expect(
      screen.getByTestId("odd-piece-v2-team-2-correct"),
    ).toBeInTheDocument();

    // Step 6 -> 7: Authoritative Reveal
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("odd-piece-explainer")).toHaveAttribute(
      "data-demo-step",
      "reveal",
    );
    expect(screen.getByTestId("odd-piece-v2-reveal")).toBeInTheDocument();
    expect(screen.getByTestId("odd-piece-v2-hotspot")).toBeInTheDocument();
    expect(screen.getByTestId("odd-piece-v2-hotspot-pin")).toHaveTextContent(
      "العجلة الأمامية الدخيلة",
    );
    expect(screen.getByTestId("odd-piece-v2-wheel-detail")).toBeInTheDocument();
    expect(
      screen.queryByTestId("odd-piece-v2-toggle-original"),
    ).not.toBeInTheDocument();

    // Step 7 -> 8: Three puzzles hold
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("odd-piece-explainer")).toHaveAttribute(
      "data-demo-step",
      "three-puzzles",
    );
    expect(screen.getByTestId("odd-piece-v2-reveal")).toHaveTextContent(
      "3 ألغاز",
    );
  });

  it("parks the complete result with skip and supports replay to inspection", async () => {
    reducedMotion();
    render(
      <OddPieceExplainer
        scenario={SAMPLE_ODD_PIECE_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("odd-piece-explainer")).toHaveAttribute(
      "data-demo-step",
      "three-puzzles",
    );
    expect(screen.getByTestId("odd-piece-v2-reveal")).toHaveTextContent(
      "BMW M4",
    );

    await user.click(screen.getByTestId("explainer-replay"));
    expect(screen.getByTestId("odd-piece-explainer")).toHaveAttribute(
      "data-demo-step",
      "inspection",
    );
  });

  it("maintains historical compatibility for V1 legacy four-image scenario", async () => {
    reducedMotion();
    render(
      <OddPieceExplainer
        scenario={SAMPLE_ODD_PIECE_V1_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    expect(screen.getByTestId("odd-piece-grid")).toBeInTheDocument();
  });
});
