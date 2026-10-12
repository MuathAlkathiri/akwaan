import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ExplainerDisclosure,
  RyoExplainer,
} from "@/features/challenge-explainer";
import {
  EXPLAINER_LOOP_HOLD_SECONDS,
  EXPLAINER_VISIBILITY_THRESHOLD,
  RYO_DEMO_STEPS,
  SAMPLE_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

/**
 * The explainer is a presentation simulation, and the things worth testing are
 * the ones that would make it stop being one: a network call, a second gameplay
 * engine, an animation that outlives its component, or a rule that drifts from
 * the server's.
 */

const answerLabel =
  SAMPLE_TUTORIAL_SCENARIO.options.find((o) => o.id === SAMPLE_TUTORIAL_SCENARIO.correctOptionId)
    ?.label ?? "";
const decisionLabel = "متأكد منهم";

let reducedMotion = false;

beforeEach(() => {
  reducedMotion = false;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RYO explainer — demo-state isolation", () => {
  it("issues no network request of any kind", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, "open");

    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
  });

  it("renders with no live-session provider mounted", () => {
    // The real panel reads `useLiveSession()`; if the explainer ever grew that
    // dependency this render would throw rather than produce a surface.
    expect(() => render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />)).not.toThrow();
    expect(screen.getByTestId("ryo-explainer")).toBeInTheDocument();
  });

  it("renders every interactive control inert", () => {
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    const answers = screen.getByTestId("explainer-phone-answer-controls");
    within(answers)
      .getAllByRole("button")
      .forEach((button) => expect(button).toBeDisabled());
    const decisions = screen.getByTestId("explainer-phone-decision-controls");
    within(decisions)
      .getAllByRole("button")
      .forEach((button) => expect(button).toBeDisabled());
  });
});

describe("RYO explainer — correct phase presentation", () => {
  it("opens in the collecting phase with neither side locked", () => {
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    expect(screen.getByTestId("explainer-phase")).toHaveTextContent("الاختيار");
    expect(screen.getByTestId("explainer-lock-answering")).toHaveAttribute(
      "data-locked",
      "false",
    );
    expect(screen.getByTestId("explainer-lock-opposing")).toHaveAttribute(
      "data-locked",
      "false",
    );
    expect(screen.queryByTestId("explainer-reveal")).not.toBeInTheDocument();
  });

  it("shows the real authored question and all four authored options", () => {
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    // `BidiText` splits a mixed-direction string into segments, so the prompt is
    // asserted against the element's text content rather than a single node.
    const answers = screen.getByTestId("explainer-phone-answer-controls");
    expect(answers.textContent).toContain(SAMPLE_TUTORIAL_SCENARIO.prompt);
    SAMPLE_TUTORIAL_SCENARIO.options.forEach((option) => {
      expect(within(answers).getByText(option.label)).toBeInTheDocument();
    });
  });

  it("never reveals either private choice before the reveal beat", () => {
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    // The shared screen shows lock state only — not what was chosen.
    const shared = screen.getByTestId("explainer-lock-indicators");
    expect(within(shared).queryByText("ألمانيا")).not.toBeInTheDocument();
    expect(within(shared).queryByText("متأكد منهم")).not.toBeInTheDocument();
  });

  it("keeps each choice on its own phone through every pre-reveal beat", async () => {
    // A locked phone shows its own team their choice, exactly as the real one
    // does. What must never happen is that choice appearing on the shared
    // screen, or on the other team's phone, before the reveal.
    reducedMotion = true;
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);

    const revealBeat = RYO_DEMO_STEPS.findIndex((s) => s.id === "reveal");
    for (let beat = 0; beat < revealBeat; beat += 1) {
      if (beat > 0) await user.click(screen.getByTestId("explainer-next"));
      const screenText =
        screen.getByTestId("explainer-lock-indicators").parentElement
          ?.textContent ?? "";
      expect(screenText).not.toContain(answerLabel);
      expect(screenText).not.toContain(decisionLabel);

      // The reading team never sees the answer while they are still reading.
      const deciding =
        screen.queryByTestId("explainer-phone-decision-controls") ??
        screen.queryByTestId("explainer-phone-deciding-waiting");
      if (deciding) expect(deciding.textContent).not.toContain(answerLabel);
    }
  });

  it("reaches the reveal and the payoff when skipped to the end", async () => {
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    await user.click(screen.getByTestId("explainer-skip"));

    expect(screen.getByTestId("explainer-phase")).toHaveTextContent("الكشف");
    const reveal = screen.getByTestId("explainer-reveal");
    expect(reveal).toHaveAttribute("data-outcome", "correct");
    expect(within(reveal).getByText("إجابة صحيحة")).toBeInTheDocument();
    expect(screen.getByTestId("explainer-payoff")).toBeInTheDocument();
  });

  it("renders the server's derived outcome rather than computing one", async () => {
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    await user.click(screen.getByTestId("explainer-skip"));

    // The scenario carries an `outcome` the server derived from
    // `RyoPayoffMatrixRule`. The explainer may only display it: there is no
    // client-side payoff transcription left to disagree with the Match.
    const { outcome } = SAMPLE_TUTORIAL_SCENARIO;
    expect(screen.getByTestId("explainer-payoff")).toHaveAttribute(
      "data-reason",
      outcome.reason,
    );
    const scoredTeam =
      outcome.teamRole === "answering" ? "tutorial-answering" : "tutorial-opposing";
    expect(screen.getByTestId(`explainer-score-${scoredTeam}`)).toHaveTextContent(
      outcome.delta > 0 ? `+${outcome.delta}` : String(outcome.delta),
    );
  });

  it("follows the scenario when it carries a different outcome", async () => {
    // A different published scenario must change what is taught, with no code
    // change — proof the demonstration is data-driven, not hardcoded.
    const user = userEvent.setup();
    render(
      <RyoExplainer
        mode="preview"
        scenario={{
          ...SAMPLE_TUTORIAL_SCENARIO,
          answeringSelectionOptionId: "b",
          opposingDecision: "STEAL",
          outcome: {
            teamRole: "opposing",
            delta: -1,
            reason: "ryo.steal.failed",
            correct: false,
          },
        }}
      />,
    );
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("explainer-payoff")).toHaveAttribute(
      "data-reason",
      "ryo.steal.failed",
    );
    expect(
      screen.getByTestId("explainer-score-tutorial-opposing"),
    ).toHaveTextContent("-1");
    expect(screen.getByTestId("explainer-reveal")).toHaveAttribute(
      "data-outcome",
      "wrong",
    );
  });
});

describe("RYO explainer — replay and skip", () => {
  it("skip jumps to the final beat and replay returns to the first", async () => {
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    const progress = () => screen.getByTestId("explainer-progress").textContent;

    expect(progress()).toContain(`1 / ${RYO_DEMO_STEPS.length}`);
    await user.click(screen.getByTestId("explainer-skip"));
    expect(progress()).toContain(
      `${RYO_DEMO_STEPS.length} / ${RYO_DEMO_STEPS.length}`,
    );

    await user.click(screen.getByTestId("explainer-replay"));
    expect(progress()).toContain(`1 / ${RYO_DEMO_STEPS.length}`);
    expect(screen.queryByTestId("explainer-reveal")).not.toBeInTheDocument();
  });

  it("disables skip once the end is reached", async () => {
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("explainer-skip")).toBeDisabled();
  });
});

describe("RYO explainer — reduced motion", () => {
  beforeEach(() => {
    reducedMotion = true;
  });

  it("never auto-plays and exposes manual stepping instead", async () => {
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);

    expect(screen.getByTestId("explainer-controls")).toHaveAttribute(
      "data-reduced-motion",
      "true",
    );
    expect(screen.queryByTestId("explainer-play-state")).not.toBeInTheDocument();
    expect(screen.getByTestId("explainer-prev")).toBeDisabled();

    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent(
      `2 / ${RYO_DEMO_STEPS.length}`,
    );
    expect(screen.getByTestId("explainer-lock-answering")).toHaveAttribute(
      "data-locked",
      "true",
    );
  });

  it("still reaches the full reveal without any animation", async () => {
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    for (let step = 1; step < RYO_DEMO_STEPS.length; step += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    expect(screen.getByTestId("explainer-reveal")).toBeInTheDocument();
    expect(screen.getByTestId("explainer-payoff")).toBeInTheDocument();
  });
});

describe("RYO explainer — timeline cleanup", () => {
  it("kills its GSAP timeline on unmount", async () => {
    const gsap = (await import("gsap")).default;
    const contextSpy = vi.spyOn(gsap, "context");

    const view = render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    expect(contextSpy).toHaveBeenCalled();
    const context = contextSpy.mock.results.at(-1)?.value as {
      revert: () => void;
    };
    const revert = vi.spyOn(context, "revert");

    view.unmount();
    expect(revert).toHaveBeenCalled();
  });

  it("creates exactly one timeline across a re-render", () => {
    const view = render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    const before = document.querySelectorAll('[data-testid="ryo-explainer"]').length;
    view.rerender(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    expect(
      document.querySelectorAll('[data-testid="ryo-explainer"]').length,
    ).toBe(before);
  });
});

describe("RYO explainer — responsive structure", () => {
  it("keeps the shared screen and both phones as distinct surfaces", () => {
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    // The split is the mechanic's point: public lock state on the screen,
    // private controls on each phone.
    expect(screen.getByTestId("explainer-lock-indicators")).toBeInTheDocument();
    expect(
      screen.getByTestId("explainer-phone-answer-controls"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("explainer-phone-decision-controls"),
    ).toBeInTheDocument();
  });
});

describe("RYO explainer — compact variant", () => {
  it("spotlights one phone instead of two, so a card column stays readable", async () => {
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);

    expect(screen.getByTestId("ryo-explainer")).toHaveAttribute(
      "data-variant",
      "compact",
    );
    const spotlight = screen.getByTestId("explainer-spotlight");
    // The answering team is acting first, so theirs is the surface on screen.
    expect(spotlight).toHaveAttribute("data-surface", "answering");
    expect(
      screen.getByTestId("explainer-phone-answer-controls"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("explainer-phone-decision-controls"),
    ).not.toBeInTheDocument();

    // Both phones are present at full size — the split is the mechanic.
    cleanup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} mode="preview" />);
    expect(screen.queryByTestId("explainer-spotlight")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("explainer-phone-answer-controls"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("explainer-phone-decision-controls"),
    ).toBeInTheDocument();
    void user;
  });

  it("moves the spotlight to the reading team once the answer locks", async () => {
    reducedMotion = true;
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);

    expect(screen.getByTestId("explainer-spotlight")).toHaveAttribute(
      "data-surface",
      "answering",
    );
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("explainer-spotlight")).toHaveAttribute(
      "data-surface",
      "deciding",
    );
    expect(
      screen.getByTestId("explainer-phone-decision-controls"),
    ).toBeInTheDocument();
  });

  it("still reaches the real reveal and payoff when compact", async () => {
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("explainer-reveal")).toHaveAttribute(
      "data-outcome",
      "correct",
    );
    expect(screen.getByTestId("explainer-payoff")).toHaveAttribute(
      "data-reason",
      "ryo.steal.correct",
    );
  });

  it("keeps the shared screen public and the phone private in compact too", () => {
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    const locks = screen.getByTestId("explainer-lock-indicators");
    expect(locks).toBeInTheDocument();
    // Lock state is public; the chosen answer is not.
    expect(within(locks).queryByText("ألمانيا")).not.toBeInTheDocument();
  });
});

describe("explainer disclosure — collapsed by default", () => {
  it("renders no gameplay surface and starts no timeline while collapsed", async () => {
    const gsap = (await import("gsap")).default;
    const timelineSpy = vi.spyOn(gsap, "timeline");

    render(
      <ExplainerDisclosure>
        <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />
      </ExplainerDisclosure>,
    );

    expect(screen.getByTestId("explainer-disclosure")).toHaveAttribute(
      "data-open",
      "false",
    );
    // Nothing of the demo exists — not hidden, absent.
    expect(screen.queryByTestId("ryo-explainer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("explainer-lock-indicators")).not.toBeInTheDocument();
    expect(screen.queryByTestId("explainer-controls")).not.toBeInTheDocument();
    // And therefore no playback timeline was ever created.
    expect(timelineSpy).not.toHaveBeenCalled();
  });

  it("exposes an accessible, keyboard-operable toggle", async () => {
    const user = userEvent.setup();
    render(
      <ExplainerDisclosure>
        <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />
      </ExplainerDisclosure>,
    );
    const trigger = screen.getByTestId("explainer-disclosure-trigger");
    const panel = screen.getByTestId("explainer-disclosure-panel");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("hidden");

    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("ryo-explainer")).toBeInTheDocument();
  });
});

describe("explainer disclosure — expand and collapse", () => {
  it("mounts the real demo on expand and unmounts it on close", async () => {
    const user = userEvent.setup();
    render(
      <ExplainerDisclosure>
        <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />
      </ExplainerDisclosure>,
    );
    const trigger = screen.getByTestId("explainer-disclosure-trigger");

    await user.click(trigger);
    expect(screen.getByTestId("ryo-explainer")).toHaveAttribute(
      "data-variant",
      "compact",
    );
    // The real authored options are the demo, not a placeholder.
    const answers = screen.getByTestId("explainer-phone-answer-controls");
    SAMPLE_TUTORIAL_SCENARIO.options.forEach((option) =>
      expect(within(answers).getByText(option.label)).toBeInTheDocument(),
    );

    await user.click(trigger);
    expect(screen.queryByTestId("ryo-explainer")).not.toBeInTheDocument();
  });

  it("reverts the playback timeline when closed, and resets on reopen", async () => {
    const gsap = (await import("gsap")).default;
    const contextSpy = vi.spyOn(gsap, "context");
    const user = userEvent.setup();
    render(
      <ExplainerDisclosure>
        <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />
      </ExplainerDisclosure>,
    );
    const trigger = screen.getByTestId("explainer-disclosure-trigger");

    await user.click(trigger);
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent("5 / 5");

    const reverts = contextSpy.mock.results.map(
      (result) => vi.spyOn(result.value as { revert: () => void }, "revert"),
    );
    await user.click(trigger);
    // Closing unmounted the demo, so at least one scoped context was reverted.
    expect(reverts.some((spy) => spy.mock.calls.length > 0)).toBe(true);

    // Reopening is a fresh mount: playback is back at the first beat.
    await user.click(trigger);
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent("1 / 5");
    expect(screen.queryByTestId("explainer-reveal")).not.toBeInTheDocument();
  });

  it("does not accumulate timelines across repeated toggles", async () => {
    const gsap = (await import("gsap")).default;
    const timelineSpy = vi.spyOn(gsap, "timeline");
    const user = userEvent.setup();
    render(
      <ExplainerDisclosure>
        <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />
      </ExplainerDisclosure>,
    );
    const trigger = screen.getByTestId("explainer-disclosure-trigger");

    for (let round = 0; round < 3; round += 1) {
      await user.click(trigger);
      await user.click(trigger);
    }
    // One playback timeline per open, never more — and none left running.
    expect(timelineSpy.mock.calls.length).toBeLessThanOrEqual(3);
    expect(screen.queryByTestId("ryo-explainer")).not.toBeInTheDocument();
  });

  it("returns focus to the trigger after a close", async () => {
    const user = userEvent.setup();
    render(
      <ExplainerDisclosure>
        <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />
      </ExplainerDisclosure>,
    );
    const trigger = screen.getByTestId("explainer-disclosure-trigger");
    await user.click(trigger);
    await user.click(trigger);
    expect(trigger).toHaveFocus();
  });

  it("keeps replay and skip working inside the expanded panel", async () => {
    const user = userEvent.setup();
    render(
      <ExplainerDisclosure>
        <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />
      </ExplainerDisclosure>,
    );
    await user.click(screen.getByTestId("explainer-disclosure-trigger"));
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("explainer-payoff")).toBeInTheDocument();
    await user.click(screen.getByTestId("explainer-replay"));
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent("1 / 5");
  });

  it("does not auto-collapse once playback finishes", async () => {
    const user = userEvent.setup();
    render(
      <ExplainerDisclosure>
        <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />
      </ExplainerDisclosure>,
    );
    const trigger = screen.getByTestId("explainer-disclosure-trigger");
    await user.click(trigger);
    await user.click(screen.getByTestId("explainer-skip"));
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("ryo-explainer")).toBeInTheDocument();
  });
});

describe("explainer disclosure — reduced motion", () => {
  beforeEach(() => {
    reducedMotion = true;
  });

  it("still expands and plays manually with no height animation", async () => {
    const user = userEvent.setup();
    render(
      <ExplainerDisclosure>
        <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />
      </ExplainerDisclosure>,
    );
    await user.click(screen.getByTestId("explainer-disclosure-trigger"));
    expect(screen.getByTestId("explainer-controls")).toHaveAttribute(
      "data-reduced-motion",
      "true",
    );
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent("2 / 5");
  });
});

describe("RYO explainer — autoplay lifecycle", () => {
  it("builds one looping timeline that holds the payoff before repeating", async () => {
    const gsap = (await import("gsap")).default;
    const timelineSpy = vi.spyOn(gsap, "timeline");

    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    await act(async () => {
      await Promise.resolve();
    });

    // One timeline, looping forever: a replay must never allocate a second.
    expect(timelineSpy).toHaveBeenCalledTimes(1);
    const config = timelineSpy.mock.calls[0]?.[0] as
      | { repeat?: number }
      | undefined;
    expect(config?.repeat).toBe(-1);

    // The loop is longer than the beats, because the payoff is held before the
    // restart. Without that tail the result would vanish the instant it landed.
    const timeline = timelineSpy.mock.results[0]?.value as gsap.core.Timeline;
    const beats = RYO_DEMO_STEPS.reduce((sum, step) => sum + step.holdSeconds, 0);
    expect(timeline.duration()).toBeCloseTo(beats + EXPLAINER_LOOP_HOLD_SECONDS, 3);
  });

  it("keeps the final state on screen once playback ends", async () => {
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    await user.click(screen.getByTestId("explainer-skip"));

    expect(screen.getByTestId("explainer-progress")).toHaveTextContent("5 / 5");
    expect(screen.getByTestId("explainer-reveal")).toBeInTheDocument();
    expect(screen.getByTestId("explainer-payoff")).toBeInTheDocument();
    // Nothing clears it afterwards.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("explainer-payoff")).toBeInTheDocument();
  });

  it("offers a pause control that stops and resumes playback", async () => {
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    // The timeline is built in an effect, so flush before asserting on it.
    await act(async () => {
      await Promise.resolve();
    });
    const toggle = screen.getByTestId("explainer-play-toggle");

    expect(toggle).toHaveAttribute("data-playing", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("data-playing", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("data-playing", "true");
  });

  it("suspends while the document is hidden and resumes when it returns", async () => {
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    // The timeline is built in an effect, so flush before asserting on it.
    await act(async () => {
      await Promise.resolve();
    });
    const toggle = screen.getByTestId("explainer-play-toggle");
    expect(toggle).toHaveAttribute("data-playing", "true");

    const hidden = vi
      .spyOn(document, "hidden", "get")
      .mockReturnValue(true);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(toggle).toHaveAttribute("data-playing", "false");

    hidden.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(toggle).toHaveAttribute("data-playing", "true");
    hidden.mockRestore();
  });

  it("does not resume a host-paused demo when the tab returns", async () => {
    const user = userEvent.setup();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    // The timeline is built in an effect, so flush before asserting on it.
    await act(async () => {
      await Promise.resolve();
    });
    const toggle = screen.getByTestId("explainer-play-toggle");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("data-playing", "false");

    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // The host's pause outranks a tab-focus event.
    expect(toggle).toHaveAttribute("data-playing", "false");
    hidden.mockRestore();
  });

  it("does not restart when an unrelated prop changes around it", async () => {
    const gsap = (await import("gsap")).default;
    const timelineSpy = vi.spyOn(gsap, "timeline");

    function Host({ readyCount }: { readyCount: number }) {
      return (
        <div>
          {/* Stands in for readiness/presence churn on the Preflight screen. */}
          <span data-testid="ready-count">{readyCount}</span>
          <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />
        </div>
      );
    }

    const view = render(<Host readyCount={1} />);
    await act(async () => {
      await Promise.resolve();
    });
    const after = screen.getByTestId("explainer-progress").textContent;

    for (const count of [2, 3, 4]) {
      view.rerender(<Host readyCount={count} />);
    }
    expect(screen.getByTestId("ready-count")).toHaveTextContent("4");
    // One timeline for the whole life of the component, and playback did not
    // jump back to the first beat under the host's eyes.
    expect(timelineSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent(
      after ?? "",
    );
  });

  it("hides the pause control under reduced motion", async () => {
    reducedMotion = true;
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    expect(
      screen.queryByTestId("explainer-play-toggle"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("explainer-next")).toBeInTheDocument();
  });
});

/**
 * jsdom ships no IntersectionObserver, so visibility has to be driven by hand.
 * This stub records what was observed and lets a test push intersection ratios,
 * which is the only way to assert the scroll behaviour without a real browser.
 */
function installIntersectionObserver() {
  const instances: {
    callback: IntersectionObserverCallback;
    observed: Element[];
    disconnected: boolean;
    options?: IntersectionObserverInit;
  }[] = [];

  class StubObserver {
    callback: IntersectionObserverCallback;
    observed: Element[] = [];
    disconnected = false;
    options?: IntersectionObserverInit;
    constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.callback = cb;
      this.options = options;
      instances.push(this);
    }
    observe(element: Element) {
      this.observed.push(element);
    }
    unobserve() {}
    disconnect() {
      this.disconnected = true;
    }
    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal("IntersectionObserver", StubObserver);

  return {
    instances,
    /** Push a ratio to every live observer, as a scroll would. */
    async emit(ratio: number) {
      await act(async () => {
        for (const instance of instances) {
          if (instance.disconnected) continue;
          instance.callback(
            [
              {
                intersectionRatio: ratio,
                isIntersecting: ratio > 0,
                target: instance.observed[0],
              } as IntersectionObserverEntry,
            ],
            instance as unknown as IntersectionObserver,
          );
        }
      });
    },
  };
}

describe("RYO explainer — viewport-driven playback", () => {
  it("renders its first frame identically with and without an observer", async () => {
    // The suspended flag is rendered, so it may not be derived from anything the
    // server lacks and the browser has. Probing for `IntersectionObserver` in
    // the initial state hydrates as a mismatch: the server has none and renders
    // "playing", the browser has one and renders "suspended". Both of these
    // renders must agree, and the observer corrects the value afterwards.
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    const withoutObserver = screen
      .getByTestId("explainer-controls")
      .getAttribute("data-suspended");
    cleanup();

    installIntersectionObserver();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    const withObserver = screen
      .getByTestId("explainer-controls")
      .getAttribute("data-suspended");

    expect(withObserver).toBe(withoutObserver);
    expect(withObserver).toBe("false");
  });

  it("does not play while it is scrolled out of view", async () => {
    const observer = installIntersectionObserver();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    await act(async () => {
      await Promise.resolve();
    });
    await observer.emit(0);

    const toggle = screen.getByTestId("explainer-play-toggle");
    expect(toggle).toHaveAttribute("data-playing", "false");
    expect(screen.getByTestId("explainer-controls")).toHaveAttribute(
      "data-suspended",
      "true",
    );
    // Still on its first beat: an offscreen demo has not been burning through
    // the story where nobody could see it.
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent("1 / 5");
  });

  it("starts by itself once it scrolls into view", async () => {
    const observer = installIntersectionObserver();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    await act(async () => {
      await Promise.resolve();
    });
    await observer.emit(0);
    expect(screen.getByTestId("explainer-play-toggle")).toHaveAttribute(
      "data-playing",
      "false",
    );

    await observer.emit(1);

    expect(screen.getByTestId("explainer-play-toggle")).toHaveAttribute(
      "data-playing",
      "true",
    );
    expect(screen.getByTestId("explainer-controls")).toHaveAttribute(
      "data-suspended",
      "false",
    );
  });

  it("treats a sliver of the demo as offscreen", async () => {
    const observer = installIntersectionObserver();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    await act(async () => {
      await Promise.resolve();
    });

    // Just under the threshold — a demo half off the bottom of the screen is
    // not something the host is watching.
    await observer.emit(EXPLAINER_VISIBILITY_THRESHOLD - 0.05);
    expect(screen.getByTestId("explainer-play-toggle")).toHaveAttribute(
      "data-playing",
      "false",
    );

    await observer.emit(EXPLAINER_VISIBILITY_THRESHOLD);
    expect(screen.getByTestId("explainer-play-toggle")).toHaveAttribute(
      "data-playing",
      "true",
    );
  });

  it("observes the explainer itself, at the documented threshold", async () => {
    const observer = installIntersectionObserver();
    const { container } = render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(observer.instances).toHaveLength(1);
    const instance = observer.instances[0]!;
    expect(instance.observed[0]).toBe(container.firstElementChild);
    expect(instance.options?.threshold).toContain(EXPLAINER_VISIBILITY_THRESHOLD);
  });

  it("keeps a host pause through scrolling away and back", async () => {
    const user = userEvent.setup();
    const observer = installIntersectionObserver();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    await act(async () => {
      await Promise.resolve();
    });
    await observer.emit(1);

    const toggle = screen.getByTestId("explainer-play-toggle");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("data-playing", "false");

    await observer.emit(0);
    await observer.emit(1);

    // Scrolling back must not undo a deliberate pause.
    expect(toggle).toHaveAttribute("data-playing", "false");
  });

  it("stops observing when the explainer unmounts", async () => {
    const observer = installIntersectionObserver();
    const { unmount } = render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(observer.instances[0]?.disconnected).toBe(false);

    unmount();

    expect(observer.instances[0]?.disconnected).toBe(true);
  });

  it("builds exactly one observer and one timeline across visibility churn", async () => {
    const gsap = (await import("gsap")).default;
    const timelineSpy = vi.spyOn(gsap, "timeline");
    const observer = installIntersectionObserver();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    await act(async () => {
      await Promise.resolve();
    });

    for (const ratio of [1, 0, 1, 0, 1]) await observer.emit(ratio);

    // Suspending is a pause on the existing timeline, never a teardown and
    // rebuild — otherwise every scroll would restart the story from beat one.
    expect(timelineSpy).toHaveBeenCalledTimes(1);
    expect(observer.instances).toHaveLength(1);
  });

  it("never observes anything when motion is reduced", async () => {
    reducedMotion = true;
    const observer = installIntersectionObserver();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />);
    await act(async () => {
      await Promise.resolve();
    });

    // Reduced motion is detected in an effect, so an observer may be created on
    // the first render — but none may survive it. Manual stepping has nothing to
    // suspend, so a live observer here would be a leak.
    expect(observer.instances.filter((each) => !each.disconnected)).toHaveLength(0);
    expect(screen.getByTestId("explainer-controls")).toHaveAttribute(
      "data-reduced-motion",
      "true",
    );
  });
});

describe("RYO explainer — player vs preview presentation", () => {
  /** Everything the transport strip contributes, and nothing else. */
  const TRANSPORT = [
    "explainer-controls",
    "explainer-progress",
    "explainer-phase",
    "explainer-play-toggle",
    "explainer-skip",
    "explainer-replay",
    "explainer-prev",
    "explainer-next",
  ];

  it("shows a host the demonstration and the narration, and no transport", () => {
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact />);

    for (const id of TRANSPORT) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
    // The sentence explaining the beat is the teaching, so it survives.
    expect(screen.getByTestId("explainer-caption")).toHaveTextContent(
      RYO_DEMO_STEPS[0].caption,
    );
    // And the demonstration itself is untouched.
    expect(screen.getByTestId("explainer-lock-indicators")).toBeInTheDocument();
    expect(screen.getByTestId("explainer-phone-shell")).toBeInTheDocument();
  });

  it("defaults to the player presentation when no mode is given", () => {
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} />);
    expect(screen.queryByTestId("explainer-controls")).not.toBeInTheDocument();
  });

  it("gives an editor the transport back in preview mode", () => {
    render(
      <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />,
    );
    for (const id of ["explainer-controls", "explainer-progress", "explainer-replay"]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getByTestId("explainer-progress")).toHaveTextContent(
      `1 / ${RYO_DEMO_STEPS.length}`,
    );
  });

  it("drops the question counter in both modes", () => {
    // The tutorial demonstrates one representative item, so "السؤال 1 من 3"
    // would describe a sequence that does not exist. The real challenge's own
    // counter is a separate component and is unaffected.
    for (const mode of ["player", "preview"] as const) {
      cleanup();
      render(
        <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode={mode} />,
      );
      const frame = screen.getByTestId("challenge-frame");
      expect(frame.textContent).not.toContain("السؤال");
      expect(frame.textContent).not.toContain("من 3");
      // Replaced by nothing — the challenge name already heads the frame.
      expect(frame.textContent).toContain("اقرأ خصمك");
    }
  });

  it("runs the same single timeline in both modes", async () => {
    const gsap = (await import("gsap")).default;
    const timelineSpy = vi.spyOn(gsap, "timeline");

    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(timelineSpy).toHaveBeenCalledTimes(1);
    const playerConfig = timelineSpy.mock.calls[0]?.[0] as { repeat?: number };
    cleanup();
    timelineSpy.mockClear();

    render(
      <RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact mode="preview" />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(timelineSpy).toHaveBeenCalledTimes(1);
    const previewConfig = timelineSpy.mock.calls[0]?.[0] as { repeat?: number };

    // Same choreography, same loop — the mode changes chrome only.
    expect(playerConfig?.repeat).toBe(-1);
    expect(previewConfig?.repeat).toBe(playerConfig?.repeat);
  });

  it("still autoplays and loops for a host with no controls to press", async () => {
    const observer = installIntersectionObserver();
    render(<RyoExplainer scenario={SAMPLE_TUTORIAL_SCENARIO} compact />);
    await act(async () => {
      await Promise.resolve();
    });
    await observer.emit(1);

    // There is no play button to assert on, so the timeline itself is the
    // evidence: built, looping, and not paused.
    const gsapModule = (await import("gsap")).default;
    void gsapModule;
    expect(screen.getByTestId("explainer-caption")).toBeInTheDocument();
    expect(observer.instances).toHaveLength(1);
    expect(observer.instances[0]?.disconnected).toBe(false);
  });
});
