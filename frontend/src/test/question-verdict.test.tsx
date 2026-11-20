import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionVerdict } from "@/features/live-game-session/components/question-verdict";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";

const draw = (recordContentSignal?: ReturnType<typeof vi.fn>) => {
  render(
    <LiveSessionContext.Provider
      value={{ connection: "connected", recordContentSignal } as never}
    >
      <QuestionVerdict contentItemId="item-1" />
    </LiveSessionContext.Provider>,
  );
  return recordContentSignal;
};

describe("a player's verdict on the question", () => {
  it("sends the taste signal on one tap", () => {
    // Liking costs nothing to get wrong, so it asks for nothing.
    const send = draw(vi.fn().mockResolvedValue(undefined));

    fireEvent.click(screen.getByTestId("question-verdict-liked"));

    expect(send).toHaveBeenCalledWith("item-1", "liked");
    expect(screen.getByTestId("question-verdict-done")).toBeInTheDocument();
  });

  it("asks a second time before reporting a fault", () => {
    // A false report sends somebody to check a question that was fine, so the
    // tap that costs something is the one that confirms.
    const send = draw(vi.fn().mockResolvedValue(undefined));

    fireEvent.click(screen.getByTestId("question-verdict-defect"));
    expect(send).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("question-verdict-defect-confirm"));
    expect(send).toHaveBeenCalledWith("item-1", "defect");
  });

  it("treats the tap as taken even when the send fails", async () => {
    // A game in a room full of people never stops for an opinion.
    const send = draw(vi.fn().mockRejectedValue(new Error("offline")));

    fireEvent.click(screen.getByTestId("question-verdict-liked"));

    expect(send).toHaveBeenCalled();
    expect(screen.getByTestId("question-verdict-done")).toBeInTheDocument();
  });

  it("draws nothing on the shared screen", () => {
    // The television has no participant credential, and nobody walks to it to
    // rate a question.
    draw(undefined);

    expect(screen.queryByTestId("question-verdict")).toBeNull();
  });
});
