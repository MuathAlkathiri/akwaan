import { describe, expect, it } from "vitest";
import { toEditableContentItem } from "@/features/content-engine-review/content-engine-review-workspace";
import type { ReviewCandidate } from "@/features/content-engine-review/types";

describe("Content Engine review workspace", () => {
  it("hydrates a candidate into the canonical mechanic-specific ContentItem editor", () => {
    const candidate = {
      candidateId: "candidate-1",
      canonicalTarget: {
        worldId: "world-1",
        scopeId: "scope-1",
        challengeTypeId: "mechanic-1",
      },
      draft: {
        prompt: { ar: "من تختار؟" },
        answerPayload: {
          mode: "multiple_choice",
          options: [
            { id: "a", label: { ar: "أ" } },
            { id: "b", label: { ar: "ب" } },
          ],
          correctOptionId: "a",
        },
      },
    } as ReviewCandidate;

    expect(toEditableContentItem(candidate)).toMatchObject({
      id: "candidate-1",
      worldId: "world-1",
      scopeId: "scope-1",
      compatibleChallengeTypeIds: ["mechanic-1"],
      status: "draft",
      answerPayload: { mode: "multiple_choice", correctOptionId: "a" },
    });
  });

  it("fails closed when canonical IDs are unavailable", () => {
    expect(
      toEditableContentItem({
        candidateId: "candidate-1",
        draft: { prompt: { ar: "سؤال" } },
      } as ReviewCandidate),
    ).toBeNull();
  });
});
