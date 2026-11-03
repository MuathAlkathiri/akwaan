import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ComboExplainer,
  MechanicTutorialRenderer,
  SAMPLE_COMBO_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";
import { COMBO_DEMO_STEPS } from "@/features/challenge-explainer/combo-demo-scenario";

describe("Combo mechanic tutorial", () => {
  it("keeps the completed outcome readable for a full result hold", () => {
    const outcome = COMBO_DEMO_STEPS.find((step) => step.id === "outcome");
    expect(outcome?.holdSeconds).toBeGreaterThanOrEqual(3.5);
  });

  it("renders the versioned Combo renderer and real decision labels", () => {
    render(
      <MechanicTutorialRenderer
        scenario={SAMPLE_COMBO_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );

    expect(screen.getByTestId("combo-explainer")).toBeInTheDocument();
    expect(screen.getByTestId("combo-tutorial-question")).toHaveTextContent(
      "ما اسم القرية التي ينتمي إليها ناروتو؟",
    );
    expect(screen.queryByText("خذ نقاطك")).toBeNull();
    expect(screen.getByTestId("combo-stage-scale")).toHaveTextContent(
      "4 → صعب جدًا",
    );
    expect(screen.queryByText("كونوها")).toBeNull();
  });

  it("shows the accumulated point and the real safe-versus-risky decision", async () => {
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
      <ComboExplainer
        scenario={SAMPLE_COMBO_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("explainer-next"));
    await user.click(screen.getByTestId("explainer-next"));

    expect(screen.getByTestId("combo-tutorial-streak")).toHaveTextContent("1");
    expect(screen.getByTestId("combo-risk-emphasis")).toHaveTextContent(
      "تضمن 1",
    );
    expect(screen.getByTestId("combo-risk-emphasis")).toHaveTextContent(
      "قد تخسر 1 إذا أخطأت",
    );
  });

  it("shows the failed forced continuation and compact outcome on skip", async () => {
    render(
      <ComboExplainer
        scenario={SAMPLE_COMBO_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );

    await userEvent.setup().click(screen.getByTestId("explainer-skip"));

    expect(screen.getByTestId("combo-tutorial-outcome")).toHaveTextContent(
      "انكسر الكومبو",
    );
    expect(screen.getByTestId("combo-tutorial-outcome")).toHaveTextContent(
      "0 نقاط مثبتة",
    );
    expect(screen.getByTestId("combo-tutorial-outcome")).toHaveTextContent(
      "مونكي دي لوفي",
    );
    expect(screen.getByTestId("combo-tutorial-outcome")).toHaveTextContent(
      "غير المثبّت",
    );
    expect(
      screen.getByTestId("combo-tutorial-score-meaning"),
    ).toHaveTextContent("نتيجة المباراة دون إضافة");
    expect(screen.queryByText("كمّل غصب")).toBeNull();
  });

  it("exposes the forced continuation scene before the final result", async () => {
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
      <ComboExplainer
        scenario={SAMPLE_COMBO_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    for (let index = 0; index < 5; index += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    expect(screen.getByTestId("combo-tutorial-phone")).toHaveTextContent(
      "كمّل غصب",
    );
    expect(screen.getByTestId("combo-tutorial-question")).toHaveTextContent(
      "كسر الكومبو انكشف",
    );
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("combo-tutorial-phone")).toHaveTextContent(
      "ابدأ السؤال الإجباري",
    );
  });

  it("uses the shared reduced-motion manual controls and cleans GSAP", async () => {
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
    const gsap = (await import("gsap")).default;
    const contextSpy = vi.spyOn(gsap, "context");
    const view = render(
      <ComboExplainer
        scenario={SAMPLE_COMBO_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    expect(screen.getByTestId("explainer-controls")).toHaveAttribute(
      "data-reduced-motion",
      "true",
    );
    await userEvent.setup().click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent("2 / 8");
    view.unmount();
    expect(contextSpy).toHaveBeenCalled();
    contextSpy.mockRestore();
  });
});
