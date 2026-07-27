import { describe, expect, it } from "vitest";
import { adminNavigation } from "@/config/admin-navigation";
import {
  getAudioRetryModes,
  getAudioStateLabel,
  getCurrentQuestionMediaUrl,
} from "@/features/questions/components/questions-list";

describe("manual question architecture", () => {
  it("exposes reviewed generation but not the retired generated list", () => {
    expect(adminNavigation.map((item) => item.href)).toContain(
      "/admin/ai-generator",
    );
    expect(adminNavigation.map((item) => item.href)).not.toContain(
      "/admin/ai-generated",
    );
  });

  it.each([
    [{ requiresAudio: false }, "لا يحتاج صوتاً"],
    [{ requiresAudio: true, audioStatus: "pending" as const }, "بانتظار البدء"],
    [{ requiresAudio: true, audioStatus: "searching" as const }, "جاري البحث"],
    [
      { requiresAudio: true, audioStatus: "processing" as const },
      "جاري المعالجة",
    ],
    [{ requiresAudio: true, audioStatus: "ready" as const }, "جاهز للمراجعة"],
    [{ requiresAudio: true, audioStatus: "failed" as const }, "فشل التجهيز"],
    [
      {
        requiresAudio: true,
        audioStatus: "ready" as const,
        audioReviewStatus: "approved" as const,
      },
      "الصوت معتمد",
    ],
  ])("renders audio state %o", (question, expected) => {
    expect(getAudioStateLabel(question)).toBe(expected);
  });

  it("offers search again separately from retrying the selected candidate", () => {
    expect(getAudioRetryModes({ audioRequest: undefined })).toEqual([
      "research",
    ]);
    expect(
      getAudioRetryModes({
        audioRequest: {
          kind: "identify_voice",
          searchQuery: "Naruto voice",
          selectedCandidateId: "candidate-1",
        },
      }),
    ).toEqual(["research", "retryProcessing"]);
  });

  it("does not expose a stale audio clip as the current media", () => {
    expect(
      getCurrentQuestionMediaUrl({
        type: "audio",
        audioRequestStale: true,
        audioAsset: { type: "audio", url: "/old.mp3", source: "youtube" },
      }),
    ).toBeUndefined();
  });
});
