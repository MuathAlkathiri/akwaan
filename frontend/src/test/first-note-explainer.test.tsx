import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  FirstNoteExplainer,
  SAMPLE_FIRST_NOTE_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

describe("من أول نغمة mechanic tutorial", () => {
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

  it("shows the descending auction and bounded shared playback", async () => {
    reducedMotion();
    render(
      <FirstNoteExplainer
        scenario={SAMPLE_FIRST_NOTE_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    expect(screen.getByTestId("first-note-explainer")).not.toHaveTextContent(
      "على بالي",
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("first-note-bid-history")).toHaveTextContent("8");
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("first-note-bid-history")).toHaveTextContent("5");
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("first-note-bid-history")).toHaveTextContent("3");
    await user.click(screen.getByTestId("explainer-next"));
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("first-note-playback")).toHaveAttribute(
      "data-clip-seconds",
      "3",
    );
    expect(screen.getByTestId("first-note-waveform")).toBeInTheDocument();
    expect(screen.queryByTestId("first-note-audio")).toBeNull();
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("first-note-playback")).toHaveAttribute(
      "data-playback-complete",
      "true",
    );
    expect(screen.getByTestId("first-note-playback")).toHaveTextContent(
      "اكتمل المقطع",
    );
  });

  it("shows one failed answer, one steal, and the canonical result", async () => {
    reducedMotion();
    render(
      <FirstNoteExplainer
        scenario={SAMPLE_FIRST_NOTE_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.queryByTestId("first-note-steal-handoff")).toBeNull();
    expect(screen.getByTestId("first-note-reveal")).toHaveTextContent(
      "سرقة ناجحة",
    );
    expect(screen.getByTestId("first-note-reveal")).toHaveTextContent(
      "+1 نقطة",
    );
    expect(screen.getByTestId("first-note-reveal")).toHaveTextContent(
      "3 أغنيات",
    );
  });

  it("makes the failed first answer and single same-duration steal explicit", async () => {
    reducedMotion();
    render(
      <FirstNoteExplainer
        scenario={SAMPLE_FIRST_NOTE_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    for (let index = 0; index < 7; index += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    expect(screen.getByTestId("first-note-steal-handoff")).toHaveAttribute(
      "data-steal-state",
      "opened",
    );
    expect(screen.getByTestId("first-note-steal-handoff")).toHaveTextContent(
      "أولوية الفريق الأول انتهت",
    );
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("first-note-steal-handoff")).toHaveAttribute(
      "data-steal-state",
      "active",
    );
    expect(screen.getByTestId("first-note-steal-handoff")).toHaveTextContent(
      "3 ثوانٍ",
    );
    expect(screen.getByTestId("first-note-answer-input")).toHaveValue(
      "على بالي",
    );
  });
});
