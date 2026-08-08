import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OptionalQuestionMedia } from "@/legacy/classic-game/components/game-board";
import { toQuestion } from "@/features/questions/mappers/question-response.mapper";

const dto = {
  _id: "question-1",
  question: "ما الإجابة؟",
  questionType: "standard" as const,
  wrongAnswers: [],
  difficulty: "easy" as const,
  status: "approved" as const,
  source: "manual" as const,
  requiresAudio: false,
  audioStatus: "not_required" as const,
};

describe("optional question media", () => {
  it.each([
    ["image", "MISSING_ASSET"],
    ["audio", "PROCESSING"],
    ["video", "FAILED"],
  ] as const)(
    "keeps an unavailable preferred %s question text-only",
    (preferredPresentationType, mediaFallbackReason) => {
      const question = toQuestion({
        ...dto,
        type: preferredPresentationType,
        preferredPresentationType,
        effectivePresentationType: "text",
        mediaAvailable: false,
        mediaFallbackReason,
      });
      expect(question.question).toBe("ما الإجابة؟");
      expect(question.effectivePresentationType).toBe("text");
      expect(question.mediaAvailable).toBe(false);
      expect(question.mediaFallbackReason).toBe(mediaFallbackReason);
      expect(question.resolvedMedia).toBeUndefined();
    },
  );

  it.each([
    ["image", "/ready.jpg"],
    ["audio", "/ready.m4a"],
    ["video", "/ready.mp4"],
  ] as const)("renders valid ready %s media", (type, src) => {
    const { container } = render(
      <OptionalQuestionMedia type={type} src={src} durationSeconds={8} />,
    );
    expect(
      container.querySelector(type === "image" ? "img" : type),
    ).toBeInTheDocument();
  });

  it("removes a media element after a load error instead of leaving it broken", () => {
    const { container } = render(
      <OptionalQuestionMedia type="image" src="/missing.jpg" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
  });

  it("never renders an empty player", () => {
    const { container } = render(
      <OptionalQuestionMedia type="audio" src="   " />,
    );
    expect(container.querySelector("audio")).toBeNull();
  });

  it("preserves a ready runtime media contract", () => {
    const question = toQuestion({
      ...dto,
      type: "image",
      preferredPresentationType: "image",
      effectivePresentationType: "image",
      mediaAvailable: true,
      mediaFallbackReason: null,
      resolvedMedia: {
        type: "image",
        url: "/ready.jpg",
      },
    });
    expect(question).toMatchObject({
      question: "ما الإجابة؟",
      effectivePresentationType: "image",
      mediaAvailable: true,
      resolvedMedia: {
        type: "image",
      },
    });
  });
});
