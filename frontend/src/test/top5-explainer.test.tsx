import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  MechanicTutorialRenderer,
  SAMPLE_TOP5_TUTORIAL_SCENARIO,
  Top5Explainer,
} from "@/features/challenge-explainer";
import { TOP5_DEMO_STEPS } from "@/features/challenge-explainer/top5-demo-scenario";
import { EXPLAINER_LOOP_HOLD_SECONDS } from "@/features/challenge-explainer/use-explainer-timeline";

describe("Top 5 mechanic tutorial", () => {
  it("uses two detailed decisions, one simulation beat and a full reveal", () => {
    expect(TOP5_DEMO_STEPS).toHaveLength(8);
    expect(TOP5_DEMO_STEPS.map((step) => step.id)).toEqual([
      "keep-decision",
      "keep-owned",
      "give-decision",
      "give-owned",
      "fast-forward",
      "reveal-ranked",
      "reveal-traps",
      "outcome",
    ]);
  });

  it("keeps one natural loop within the approved 21–24 second window", () => {
    const duration =
      TOP5_DEMO_STEPS.reduce((total, step) => total + step.holdSeconds, 0) +
      EXPLAINER_LOOP_HOLD_SECONDS;
    expect(duration).toBeGreaterThanOrEqual(21);
    expect(duration).toBeLessThanOrEqual(24);
  });

  it("renders the production tutorial renderer without a live session", () => {
    expect(() =>
      render(
        <MechanicTutorialRenderer
          scenario={SAMPLE_TOP5_TUTORIAL_SCENARIO}
          mode="preview"
        />,
      ),
    ).not.toThrow();
    expect(screen.getByTestId("top5-explainer")).toBeInTheDocument();
    expect(screen.getByTestId("top5-phones")).toBeInTheDocument();
  });

  it("keeps ranks hidden while keep-or-give decisions are being made", () => {
    render(
      <Top5Explainer scenario={SAMPLE_TOP5_TUTORIAL_SCENARIO} mode="preview" />,
    );
    expect(screen.getByTestId("top5-current-card")).toHaveTextContent(
      "آلان شيرر",
    );
    expect(screen.getByTestId("top5-current-card")).not.toHaveTextContent("1.");
    expect(screen.getByTestId("top5-phone-team-a")).toHaveTextContent(
      "صاحب القرار",
    );
    expect(screen.getByTestId("top5-phone-team-b")).toHaveTextContent("ينتظر");
  });

  it("makes the active keep decision and ownership handoff explicit", async () => {
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
      <Top5Explainer scenario={SAMPLE_TOP5_TUTORIAL_SCENARIO} mode="preview" />,
    );
    const user = userEvent.setup();
    expect(screen.getByTestId("top5-phone-team-a")).toHaveTextContent(
      "تم الاختيار: خلّها",
    );
    expect(screen.getByTestId("top5-action-keep")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("top5-ownership-rail")).toHaveTextContent(
      "آلان شيرر",
    );
  });

  it("shows the give decision and keeps rank hidden through ownership", async () => {
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
      <Top5Explainer scenario={SAMPLE_TOP5_TUTORIAL_SCENARIO} mode="preview" />,
    );
    const user = userEvent.setup();
    for (let index = 0; index < 2; index += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    expect(screen.getByTestId("top5-phone-team-b")).toHaveTextContent(
      "هاري كين",
    );
    expect(screen.getByTestId("top5-action-give")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("top5-current-card")).not.toHaveTextContent("4.");
  });

  it("summarizes the remaining eight decisions without revealing ranks", async () => {
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
      <Top5Explainer scenario={SAMPLE_TOP5_TUTORIAL_SCENARIO} mode="preview" />,
    );
    const user = userEvent.setup();
    for (let index = 0; index < 4; index += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    const simulation = screen.getByTestId("top5-fast-forward");
    expect(simulation).toHaveTextContent("8 قرارات متبقية");
    for (const entry of SAMPLE_TOP5_TUTORIAL_SCENARIO.entries.slice(2)) {
      expect(simulation).toHaveTextContent(entry.label);
    }
    expect(screen.getAllByTestId("top5-phone-fast-forward")).toHaveLength(2);
    expect(simulation).not.toHaveTextContent("1.");
  });

  it("uses a dedicated compact scene for the final score and Match point", async () => {
    render(
      <Top5Explainer scenario={SAMPLE_TOP5_TUTORIAL_SCENARIO} mode="preview" />,
    );
    await userEvent.setup().click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("top5-final-result")).toHaveClass("lg:max-w-4xl");
    expect(screen.queryByTestId("top5-reveal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("top5-phones")).not.toBeInTheDocument();
    expect(screen.getByTestId("top5-final-score")).toHaveTextContent("4 – 1");
    expect(screen.getByTestId("top5-outcome")).toHaveTextContent(
      "+1 نقطة في المباراة",
    );
    expect(screen.getByTestId("top5-outcome")).toHaveTextContent(
      "الفخاخ لا تُحتسب",
    );
  });

  it("never submits a parent form when Skip is used", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Top5Explainer
          scenario={SAMPLE_TOP5_TUTORIAL_SCENARIO}
          mode="preview"
        />
      </form>,
    );

    const skip = screen.getByTestId("explainer-skip");
    expect(skip).toHaveAttribute("type", "button");
    await userEvent.setup().click(skip);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps all ten cards in the complete reveal before the compact result", async () => {
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
      <Top5Explainer scenario={SAMPLE_TOP5_TUTORIAL_SCENARIO} mode="preview" />,
    );
    const user = userEvent.setup();
    for (let index = 0; index < 6; index += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    const reveal = screen.getByTestId("top5-reveal");
    for (const entry of SAMPLE_TOP5_TUTORIAL_SCENARIO.entries) {
      expect(reveal).toHaveTextContent(entry.label);
    }
    expect(screen.queryByTestId("top5-outcome")).not.toBeInTheDocument();
  });

  it("supports reduced-motion stepping and replay", async () => {
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
      <Top5Explainer scenario={SAMPLE_TOP5_TUTORIAL_SCENARIO} mode="preview" />,
    );
    const user = userEvent.setup();
    expect(screen.getByTestId("explainer-controls")).toHaveAttribute(
      "data-reduced-motion",
      "true",
    );
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent(
      `2 / ${TOP5_DEMO_STEPS.length}`,
    );
    await user.click(screen.getByTestId("explainer-skip"));
    await user.click(screen.getByTestId("explainer-replay"));
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent(
      `1 / ${TOP5_DEMO_STEPS.length}`,
    );
  });
});
