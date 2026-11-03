import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  LaqathaExplainer,
  MechanicTutorialRenderer,
  SAMPLE_LAQATHA_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

describe("القطها mechanic tutorial", () => {
  it("renders five ordered clues without leaking the movie title", async () => {
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
    render(
      <MechanicTutorialRenderer
        scenario={SAMPLE_LAQATHA_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    expect(screen.getByTestId("laqatha-explainer")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("laqatha-tutorial-clue-1")).toBeInTheDocument();
    expect(
      screen.queryByText(SAMPLE_LAQATHA_TUTORIAL_SCENARIO.title),
    ).not.toBeInTheDocument();
  });

  it("shows reward decay, claim lock, wrong answer and opponent continuation", async () => {
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
      <LaqathaExplainer
        scenario={SAMPLE_LAQATHA_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("laqatha-tutorial-reward")).toHaveTextContent(
      "5",
    );
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("laqatha-tutorial-reward")).toHaveTextContent(
      "4",
    );
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("laqatha-tutorial-claim")).toBeInTheDocument();
    expect(
      screen.getByTestId("laqatha-tutorial-team-status"),
    ).toHaveTextContent("حجز الإجابة");
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("laqatha-tutorial-free-text")).toHaveValue("");
    expect(screen.getByText("الفريق الثاني مقفول مؤقتًا")).toBeInTheDocument();
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("laqatha-tutorial-wrong")).toBeInTheDocument();
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByText(/لا يُعاد الزمن/)).toBeInTheDocument();
    expect(
      screen.getByTestId("laqatha-tutorial-team2-reactivated"),
    ).toHaveTextContent("يكمل من الدليل 3");
  });

  it("shows free-text correct submission and the post-question Reveal", async () => {
    render(
      <LaqathaExplainer
        scenario={SAMPLE_LAQATHA_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("laqatha-tutorial-reveal")).toHaveTextContent(
      "حديقة الديناصورات",
    );
    expect(screen.getByTestId("laqatha-tutorial-reveal")).toHaveTextContent(
      "التحدي يضم 3 أفلام",
    );
    expect(screen.getByTestId("laqatha-tutorial-reveal")).toHaveTextContent(
      "+3 نقاط",
    );
  });
});
