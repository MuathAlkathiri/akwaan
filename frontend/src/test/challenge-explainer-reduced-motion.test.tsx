import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  SceneTemplate,
  STEP_NAMES,
} from "@/features/challenge-explainer/scene-template";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function mount(reduced: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches: reduced,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  render(
    <SceneTemplate
      captions={STEP_NAMES}
      renderSurface={(step) => String(step)}
    />,
  );
}
it("holds each reduced-motion scene until a manual step", () => {
  vi.useFakeTimers();
  mount(true);
  act(() => vi.advanceTimersByTime(30000));
  expect(screen.getByRole("button", { current: "step" })).toHaveTextContent(
    STEP_NAMES[0],
  );
  fireEvent.click(screen.getByRole("button", { name: "التالي" }));
  expect(screen.getByRole("button", { current: "step" })).toHaveTextContent(
    STEP_NAMES[1],
  );
});
it("loops, pauses and restarts at the first step", () => {
  vi.useFakeTimers();
  mount(false);
  for (let i = 1; i <= 3; i++) {
    act(() => vi.advanceTimersByTime(7000));
    expect(screen.getByRole("button", { current: "step" })).toHaveTextContent(
      STEP_NAMES[i % 3],
    );
  }
  fireEvent.click(screen.getByRole("button", { name: "السابق" }));
  act(() => vi.advanceTimersByTime(7000));
  expect(screen.getByRole("button", { current: "step" })).toHaveTextContent(
    STEP_NAMES[2],
  );
  fireEvent.click(screen.getByRole("button", { name: "أعد الشرح" }));
  expect(screen.getByRole("button", { current: "step" })).toHaveTextContent(
    STEP_NAMES[0],
  );
});
