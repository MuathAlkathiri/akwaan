import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  MarhalaExplainer,
  MechanicTutorialRenderer,
  SAMPLE_MARHALA_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

describe("Marhala mechanic tutorial", () => {
  it("renders the canonical board and difficulty ranges", () => {
    render(
      <MechanicTutorialRenderer
        scenario={SAMPLE_MARHALA_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    expect(screen.getByTestId("marhala-explainer")).toBeInTheDocument();
    expect(screen.getByTestId("marhala-tutorial-board")).toBeInTheDocument();
    expect(screen.getByText("سهل")).toBeInTheDocument();
    expect(screen.getByText("1–2")).toBeInTheDocument();
    expect(screen.getByText("صعب")).toBeInTheDocument();
  });

  it("walks through the real answer, movement, boost and takeaway beats", async () => {
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
      <MarhalaExplainer
        scenario={SAMPLE_MARHALA_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    for (let index = 0; index < 3; index += 1)
      await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByDisplayValue("غود أوف وور")).toBeInTheDocument();
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("marhala-tutorial-roll")).toHaveTextContent("+4");
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("marhala-tutorial-movement")).toHaveTextContent(
      "4 → 8",
    );
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("marhala-tutorial-effect")).toHaveTextContent(
      "8",
    );
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("marhala-tutorial-takeaway")).toHaveTextContent(
      "الفوز عند 16",
    );
  });

  it("keeps the question and answering interaction in one visible scene", async () => {
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
      <MarhalaExplainer
        scenario={SAMPLE_MARHALA_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    for (let index = 0; index < 2; index += 1)
      await user.click(screen.getByTestId("explainer-next"));
    expect(
      screen.getByTestId("marhala-tutorial-question-scene"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("marhala-tutorial-answer")).toBeInTheDocument();
    expect(
      screen.getByTestId("marhala-tutorial-board-context"),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("explainer-next"));
    expect(
      screen.getByTestId("marhala-tutorial-answer-state"),
    ).toHaveTextContent("إجابة صحيحة");
  });

  it("shows strategic landing exposure and a competitive final board outcome", async () => {
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
      <MarhalaExplainer
        scenario={SAMPLE_MARHALA_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("explainer-next"));
    expect(
      screen.getByTestId("marhala-tutorial-landing-possibilities"),
    ).toHaveTextContent("8");
    expect(
      screen.getByTestId("marhala-tutorial-landing-possibilities"),
    ).toHaveTextContent("فخ");
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("marhala-tutorial-outcome")).toHaveTextContent(
      "4 → 8 → 13",
    );
    expect(screen.getByTestId("marhala-tutorial-outcome")).toHaveTextContent(
      "الفريق الثاني الآن 11",
    );
    expect(screen.getByTestId("marhala-tutorial-outcome")).toHaveTextContent(
      "اختر الصعوبة، جاوب، وتقدّم",
    );
  });
});
