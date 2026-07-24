import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionMedia } from "@/features/games/components/question-player/question-media";
import { toQuestion } from "@/features/questions/mappers/question-response.mapper";

describe("video question mode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the full-page gameplay video with player controls", () => {
    const { container } = render(
      <QuestionMedia
        presentation={{
          type: "video",
          mediaAvailable: true,
          mediaUrl: "/uploads/video.mp4",
          mediaDuration: 8,
        }}
      />,
    );
    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("controls");
    expect(video).not.toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "metadata");
    fireEvent.error(video);
    expect(container.querySelector("video")).toBeNull();
  });

  it("serializes video assets from the API without changing their type", () => {
    const question = toQuestion({
      _id: "video-1",
      question: "ما هذا المعلم؟",
      questionType: "standard",
      answer: "العلا",
      wrongAnswers: [],
      difficulty: "easy",
      type: "video",
      status: "draft",
      source: "manual",
      requiresAudio: true,
      audioStatus: "ready",
      primaryAsset: {
        type: "video",
        url: "/uploads/question-assets/video/clip.mp4",
        source: "youtube",
        duration: 8,
      },
      audioAsset: {
        type: "video",
        url: "/uploads/question-assets/video/clip.mp4",
        source: "youtube",
        duration: 8,
      },
    });
    expect(question).toMatchObject({
      type: "video",
      primaryAsset: { type: "video", duration: 8 },
      audioAsset: { type: "video", duration: 8 },
    });
  });
});
