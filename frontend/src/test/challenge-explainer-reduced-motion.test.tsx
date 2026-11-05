import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MechanicTutorialRenderer } from "@/features/challenge-explainer/tutorial-renderer";
import { MechanicTutorialDialog } from "@/features/challenge-explainer/components/explainer-dialog";
import { showsExplainerControls } from "@/features/challenge-explainer/components/explainer-controls";
import type { TutorialScenario } from "@/features/challenge-explainer/tutorial-scenario";
import { SAMPLE_BOMB_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/bomb-demo-scenario";
import { SAMPLE_CLOSEST_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/closest-demo-scenario";
import { SAMPLE_COMBO_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/combo-demo-scenario";
import { SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/ekshifni-demo-scenario";
import { SAMPLE_FIRST_NOTE_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/first-note-demo-scenario";
import { SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/la-tahriqha-demo-scenario";
import { SAMPLE_LAQATHA_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/laqatha-demo-scenario";
import { SAMPLE_MARHALA_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/marhala-demo-scenario";
import { SAMPLE_ODD_PIECE_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/odd-piece-demo-scenario";
import { SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/one-clue-demo-scenario";
import { SAMPLE_TUTORIAL_SCENARIO as SAMPLE_RYO_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/ryo-demo-scenario";
import { SAMPLE_TOP5_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/top5-demo-scenario";

/**
 * The shared-screen tutorial under reduced motion.
 *
 * The production dialog renders explainers in `player` mode, which hides the
 * transport while the demo plays itself. Under reduced motion the timeline never
 * plays on its own, so the player has to offer the same manual Previous / Next
 * stepping the preview already had — otherwise a reduced-motion viewer is left
 * on the first step for good.
 */
const published = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/features/challenge-explainer/use-published-tutorial", () => ({
  usePublishedTutorial: () => ({ data: published.value, isError: false, isLoading: false }),
}));

let reducedMotion = false;
const listeners = new Set<(event: MediaQueryListEvent) => void>();

beforeEach(() => {
  reducedMotion = false;
  listeners.clear();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, fn: (event: MediaQueryListEvent) => void) => listeners.add(fn),
      removeEventListener: (_type: string, fn: (event: MediaQueryListEvent) => void) => listeners.delete(fn),
      addListener: (fn: (event: MediaQueryListEvent) => void) => listeners.add(fn),
      removeListener: (fn: (event: MediaQueryListEvent) => void) => listeners.delete(fn),
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  published.value = null;
});

/** The OS-level preference changing while the tutorial is open. */
const setReducedMotion = (value: boolean) => {
  reducedMotion = value;
  act(() => listeners.forEach((fn) => fn({ matches: value } as MediaQueryListEvent)));
};

const SCENARIOS: [string, TutorialScenario][] = [
  ["bomb", SAMPLE_BOMB_TUTORIAL_SCENARIO],
  ["closest", SAMPLE_CLOSEST_TUTORIAL_SCENARIO],
  ["combo", SAMPLE_COMBO_TUTORIAL_SCENARIO],
  ["ekshifni", SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO],
  ["first-note", SAMPLE_FIRST_NOTE_TUTORIAL_SCENARIO],
  ["la-tahriqha", SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO],
  ["laqatha", SAMPLE_LAQATHA_TUTORIAL_SCENARIO],
  ["marhala", SAMPLE_MARHALA_TUTORIAL_SCENARIO],
  ["odd-piece", SAMPLE_ODD_PIECE_TUTORIAL_SCENARIO],
  ["one-clue", SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO],
  ["ryo", SAMPLE_RYO_TUTORIAL_SCENARIO],
  ["top-5", SAMPLE_TOP5_TUTORIAL_SCENARIO],
];

const progress = () => {
  const [current, total] = screen.getByTestId("explainer-progress").textContent!.split("/").map((n) => Number(n.trim()));
  return { current, total };
};
const caption = () => screen.getByTestId("explainer-caption").textContent;
const TRANSPORT = ["explainer-controls", "explainer-prev", "explainer-next", "explainer-play-toggle"];

describe("the controls policy", () => {
  it("shows transport in preview always, and in the player only under reduced motion", () => {
    expect(showsExplainerControls("preview", { reducedMotion: false })).toBe(true);
    expect(showsExplainerControls("preview", { reducedMotion: true })).toBe(true);
    expect(showsExplainerControls("player", { reducedMotion: false })).toBe(false);
    expect(showsExplainerControls("player", { reducedMotion: true })).toBe(true);
  });
});

describe.each(SCENARIOS)("%s tutorial in the shared-screen player", (_name, scenario) => {
  it("plays itself with narration and no transport when motion is allowed", () => {
    render(<MechanicTutorialRenderer scenario={scenario} compact />);
    for (const id of TRANSPORT) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    expect(screen.getByTestId("explainer-caption")).toBeInTheDocument();
  });

  it("steps manually from the first to the final step under reduced motion", () => {
    reducedMotion = true;
    render(<MechanicTutorialRenderer scenario={scenario} compact />);

    expect(screen.getByTestId("explainer-controls")).toHaveAttribute("data-reduced-motion", "true");
    expect(screen.queryByTestId("explainer-play-toggle")).not.toBeInTheDocument();
    const { total } = progress();
    expect(progress().current).toBe(1);
    expect(screen.getByTestId("explainer-prev")).toBeDisabled();
    expect(screen.getByTestId("explainer-next")).toBeEnabled();

    const seen = new Set([caption()]);
    for (let step = 2; step <= total; step++) {
      fireEvent.click(screen.getByTestId("explainer-next"));
      expect(progress().current).toBe(step);
      seen.add(caption());
    }
    // The final step is reachable and is the end: Next stops, Previous remains.
    expect(progress()).toEqual({ current: total, total });
    expect(screen.getByTestId("explainer-next")).toBeDisabled();
    expect(screen.getByTestId("explainer-prev")).toBeEnabled();
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("reduced-motion stepping", () => {
  it("moves back and forth with Previous / Next and keeps the narration in step", () => {
    reducedMotion = true;
    render(<MechanicTutorialRenderer scenario={SAMPLE_COMBO_TUTORIAL_SCENARIO} compact />);
    const first = caption();
    fireEvent.click(screen.getByTestId("explainer-next"));
    const second = caption();
    expect(second).not.toBe(first);
    fireEvent.click(screen.getByTestId("explainer-next"));
    expect(progress().current).toBe(3);
    fireEvent.click(screen.getByTestId("explainer-prev"));
    expect(progress().current).toBe(2);
    expect(caption()).toBe(second);
    fireEvent.click(screen.getByTestId("explainer-prev"));
    expect(progress().current).toBe(1);
    expect(caption()).toBe(first);
    expect(screen.getByTestId("explainer-prev")).toBeDisabled();
  });

  it("is operable from the keyboard", async () => {
    reducedMotion = true;
    const user = userEvent.setup();
    render(<MechanicTutorialRenderer scenario={SAMPLE_COMBO_TUTORIAL_SCENARIO} compact />);
    screen.getByTestId("explainer-next").focus();
    await user.keyboard("{Enter}");
    expect(progress().current).toBe(2);
    await user.keyboard(" ");
    expect(progress().current).toBe(3);
    screen.getByTestId("explainer-prev").focus();
    await user.keyboard("{Enter}");
    expect(progress().current).toBe(2);
  });

  it("never advances on its own", () => {
    reducedMotion = true;
    vi.useFakeTimers();
    render(<MechanicTutorialRenderer scenario={SAMPLE_COMBO_TUTORIAL_SCENARIO} compact />);
    const before = caption();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(progress().current).toBe(1);
    expect(caption()).toBe(before);
  });

  it("follows the preference when it changes while the tutorial is open", () => {
    render(<MechanicTutorialRenderer scenario={SAMPLE_COMBO_TUTORIAL_SCENARIO} compact />);
    expect(screen.queryByTestId("explainer-controls")).not.toBeInTheDocument();

    setReducedMotion(true);
    expect(screen.getByTestId("explainer-controls")).toHaveAttribute("data-reduced-motion", "true");
    fireEvent.click(screen.getByTestId("explainer-next"));
    expect(progress().current).toBeGreaterThanOrEqual(2);

    setReducedMotion(false);
    expect(screen.queryByTestId("explainer-controls")).not.toBeInTheDocument();
    expect(screen.getByTestId("explainer-caption")).toBeInTheDocument();
  });
});

describe("the production tutorial dialog under reduced motion", () => {
  it("can be completed and closed, and reopens at the start", async () => {
    reducedMotion = true;
    published.value = { mechanicKey: "combo", revision: 1, scenario: SAMPLE_COMBO_TUTORIAL_SCENARIO };
    const user = userEvent.setup();
    render(<MechanicTutorialDialog mechanicKey="combo" />);

    await user.click(screen.getByTestId("preflight-how-to-play"));
    const dialog = screen.getByRole("dialog");
    const next = within(dialog).getByTestId("explainer-next");
    const { total } = progress();
    while (!next.hasAttribute("disabled")) await user.click(next);
    expect(progress()).toEqual({ current: total, total });

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("preflight-how-to-play"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(progress().current).toBe(1);

    const close = within(screen.getByRole("dialog")).getAllByRole("button").find((b) => /close|إغلاق/i.test(b.textContent ?? "") || /close|إغلاق/i.test(b.getAttribute("aria-label") ?? ""));
    expect(close).toBeDefined();
    await user.click(close!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
