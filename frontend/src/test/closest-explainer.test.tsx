import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ClosestExplainer,
  MechanicTutorialRenderer,
  SAMPLE_CLOSEST_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

describe("Closest mechanic tutorial", () => {
  it("keeps estimates hidden until each team locks", () => {
    render(
      <ClosestExplainer
        scenario={SAMPLE_CLOSEST_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    expect(screen.getByTestId("closest-phone-team-a")).not.toHaveTextContent(
      "١١٠",
    );
    expect(screen.getByTestId("closest-phone-team-b")).not.toHaveTextContent(
      "١٤٥",
    );
    expect(screen.queryByText("١٢٠ متر")).toBeNull();
    expect(screen.getByTestId("closest-tutorial-slider-team-a")).toHaveValue(
      "130",
    );
    expect(screen.queryByTestId("closest-slider-value-team-a")).toBeNull();
    expect(screen.getByTestId("closest-phone-team-a")).toHaveAttribute(
      "data-estimate-confirmed",
      "false",
    );
  });

  it("selects the Closest renderer from the versioned scenario", () => {
    render(
      <MechanicTutorialRenderer
        scenario={SAMPLE_CLOSEST_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    expect(screen.getByTestId("closest-explainer")).toBeInTheDocument();
    expect(screen.queryByTestId("ryo-explainer")).toBeNull();
  });

  it("reveals the canonical distances and internal tally consequence on skip", async () => {
    render(
      <ClosestExplainer
        scenario={SAMPLE_CLOSEST_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    await userEvent.setup().click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("closest-tutorial-reveal")).toHaveTextContent(
      "١٠",
    );
    expect(screen.getByTestId("closest-tutorial-reveal")).toHaveTextContent(
      "٢٥",
    );
    expect(screen.getByTestId("closest-tutorial-outcome")).toHaveTextContent(
      "+1 في حصيلة التحدي الداخلية",
    );
    expect(screen.getByTestId("closest-tutorial-outcome")).toHaveTextContent(
      "بعد الأسئلة الثلاثة فقط",
    );
    expect(screen.getByTestId("explainer-phase")).toHaveTextContent("الكشف");
    expect(screen.getByLabelText("الأول: ١١٠ متر")).toBeInTheDocument();
    expect(screen.getByLabelText("الصحيح: ١٢٠ متر")).toBeInTheDocument();
    expect(screen.getByLabelText("الثاني: ١٤٥ متر")).toBeInTheDocument();
  });

  it("uses manual step controls when reduced motion is requested", async () => {
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
      <ClosestExplainer
        scenario={SAMPLE_CLOSEST_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    expect(screen.getByTestId("explainer-controls")).toHaveAttribute(
      "data-reduced-motion",
      "true",
    );
    expect(screen.queryByTestId("explainer-play-toggle")).toBeNull();
    await userEvent.setup().click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent("2 / 6");
    expect(screen.getByTestId("closest-phone-team-a")).toHaveTextContent("١١٠");
    expect(screen.getByTestId("closest-tutorial-slider-team-a")).toHaveValue(
      "110",
    );
    expect(screen.getByTestId("closest-phone-team-a")).toHaveAttribute(
      "data-estimate-confirmed",
      "true",
    );
  });

  it("groups the six steps into stable mobile scenes without scrolling", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(
      <ClosestExplainer
        scenario={SAMPLE_CLOSEST_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    const explainer = screen.getByTestId("closest-explainer");
    const answers = screen.getByTestId("closest-answer-scene");

    expect(explainer).toHaveAttribute("data-mobile-scene", "question");
    expect(answers).toHaveClass("hidden", "lg:grid");

    await user.click(screen.getByTestId("explainer-next"));
    expect(explainer).toHaveAttribute("data-mobile-scene", "answers");
    expect(answers).toHaveClass("grid");
    expect(screen.getByTestId("closest-tutorial-slider-team-a")).toHaveStyle({
      "--closest-progress": "35.714285714285715%",
    });
    expect(screen.getByTestId("closest-phone-team-a")).toHaveTextContent("١١٠");
    expect(screen.getByTestId("closest-phone-team-b")).not.toHaveTextContent(
      "١٤٥",
    );

    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("closest-phone-team-b")).toHaveTextContent("١٤٥");
    expect(screen.getByTestId("closest-tutorial-slider-team-b")).toHaveValue(
      "145",
    );
    expect(screen.getByTestId("closest-phone-team-b")).toHaveAttribute(
      "data-estimate-confirmed",
      "true",
    );
    await user.click(screen.getByTestId("explainer-next"));
    await user.click(screen.getByTestId("explainer-next"));
    expect(explainer).toHaveAttribute("data-mobile-scene", "reveal");
    expect(answers).toHaveClass("hidden", "lg:grid");
    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  it("skips from the answer scene to the complete scoring payoff", async () => {
    render(
      <ClosestExplainer
        scenario={SAMPLE_CLOSEST_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("closest-explainer")).toHaveAttribute(
      "data-mobile-scene",
      "answers",
    );
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("closest-explainer")).toHaveAttribute(
      "data-mobile-scene",
      "reveal",
    );
    expect(screen.getByTestId("closest-tutorial-outcome")).toHaveTextContent(
      "نقطة المباراة",
    );
    expect(screen.getByTestId("closest-phone-team-a")).toHaveAttribute(
      "data-estimate-confirmed",
      "true",
    );
    expect(screen.getByTestId("closest-phone-team-b")).toHaveAttribute(
      "data-estimate-confirmed",
      "true",
    );
  });

  it("explains that an equal-distance tie adds nothing to the internal tally", async () => {
    render(
      <ClosestExplainer
        mode="preview"
        scenario={{
          ...SAMPLE_CLOSEST_TUTORIAL_SCENARIO,
          teamAEstimate: 110,
          teamBEstimate: 130,
          outcome: {
            ...SAMPLE_CLOSEST_TUTORIAL_SCENARIO.outcome,
            teamADistance: 10,
            teamBDistance: 10,
            winnerTeam: null,
            tie: true,
            mechanicTallyDelta: 0,
          },
        }}
      />,
    );
    await userEvent.setup().click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("closest-tutorial-outcome")).toHaveTextContent(
      "تعادل — لا تُضاف نقطة إلى حصيلة التحدي",
    );
  });

  it("replay returns to the question before either estimate is locked", async () => {
    render(
      <ClosestExplainer
        scenario={SAMPLE_CLOSEST_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("explainer-skip"));
    await user.click(screen.getByTestId("explainer-replay"));
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent("1 / 6");
    expect(screen.queryByTestId("closest-tutorial-reveal")).toBeNull();
    expect(screen.queryByTestId("closest-slider-value-team-a")).toBeNull();
    expect(screen.queryByTestId("closest-slider-value-team-b")).toBeNull();
    expect(screen.getByTestId("closest-tutorial-slider-team-a")).toHaveValue(
      "130",
    );
  });

  it("kills its scoped GSAP context on unmount", async () => {
    const gsap = (await import("gsap")).default;
    const contextSpy = vi.spyOn(gsap, "context");
    const view = render(
      <ClosestExplainer
        scenario={SAMPLE_CLOSEST_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    view.unmount();
    expect(contextSpy).toHaveBeenCalled();
    contextSpy.mockRestore();
  });
});
