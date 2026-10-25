import { describe, expect, it, vi } from "vitest";
import apiClient from "@/lib/api/client";
import {
  approveCandidate,
  editCandidate,
  preflightJob,
  rejectCandidate,
  runJob,
  runNextJob,
  submitJob,
} from "@/features/content-engine-review/api";
import { toEditableContentItem } from "@/features/content-engine-review/content-engine-review-workspace";
import type { ReviewCandidate } from "@/features/content-engine-review/types";
import {
  findLocalFormProblems,
  normalizeArabicAnswerClient,
} from "@/features/world-management/services/content-item-form.service";

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

  it("sends planDigest on job submission and exact jobId on job execution", async () => {
    const postSpy = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { data: { ok: true } } } as never);

    try {
      await preflightJob({
        mechanicKey: "read-your-opponent",
        worldKey: "video-games",
        scopeKey: "overwatch",
        targetCount: 3,
      });
      expect(postSpy).toHaveBeenCalledWith(
        "/admin/content-engine/jobs/preflight",
        {
          mechanicKey: "read-your-opponent",
          worldKey: "video-games",
          scopeKey: "overwatch",
          targetCount: 3,
        },
      );

      await submitJob({
        mechanicKey: "read-your-opponent",
        worldKey: "video-games",
        scopeKey: "overwatch",
        targetCount: 3,
        planDigest: "a".repeat(64),
      });
      expect(postSpy).toHaveBeenCalledWith("/admin/content-engine/jobs", {
        mechanicKey: "read-your-opponent",
        worldKey: "video-games",
        scopeKey: "overwatch",
        targetCount: 3,
        planDigest: "a".repeat(64),
      });

      await runNextJob("job-123");
      expect(postSpy).toHaveBeenCalledWith("/admin/content-engine/jobs/run", {
        jobId: "job-123",
      });

      await runJob("job-123");
      expect(postSpy).toHaveBeenCalledWith(
        "/admin/content-engine/jobs/job-123/run",
        {},
      );
    } finally {
      postSpy.mockRestore();
    }
  });

  describe("Phase C candidate review hardening guarantees", () => {
    it("normalizes Arabic text and catches duplicate option labels for candidate review", () => {
      expect(normalizeArabicAnswerClient("أحمد")).toBe(
        normalizeArabicAnswerClient("احمد"),
      );
      expect(normalizeArabicAnswerClient("مَرسي")).toBe(
        normalizeArabicAnswerClient("مرسي"),
      );

      const candidateFormValues = {
        scopeId: "scope-1",
        promptAr: "من الفائز؟",
        promptEn: "",
        compatibleChallengeTypeIds: ["challenge-1"],
        mediaType: "none" as const,
        mediaUrls: [],
        revealMediaUrl: "",
        status: "draft" as const,
        isReusableAcrossSessions: false,
        notes: "",
        answer: {
          mode: "multiple_choice" as const,
          options: [
            { id: "a", label: "أحمد" },
            { id: "b", label: "احمد" }, // normalized duplicate
          ],
          correctOptionId: "a",
          correctValue: "",
          closestInteraction: "numeric-range" as const,
          closestMin: "0",
          closestMax: "100",
          closestStep: "1",
          closestUnit: "",
          closestDisplayFormat: "number" as const,
          closestLeftAnchor: "",
          closestRightAnchor: "",
          acceptedAnswers: "",
        },
        top5: { items: [] },
        rakkibha: { enabled: false, candidates: [] },
        oneClue: { enabled: false, clues: [], targetAnswer: "" },
        combo: { enabled: false, stage: "" as const },
        marhala: { enabled: false, difficulty: "" as const },
        oddPiece: { enabled: false, pieces: [] },
        laqatha: { enabled: false, clues: [] },
        firstNote: { enabled: false },
        ekshifni: { enabled: false, regions: [] },
        laTahriqha: { enabled: false, ingredients: [] },
      };

      const problems = findLocalFormProblems(candidateFormValues as never, {
        isCandidateReview: true,
      });
      expect(problems).toContain(
        "لا يمكن تكرار نص الخيارات بعد تطبيع النص العربي.",
      );
    });

    it("enforces 2 to 4 options and valid correctOptionId for multiple-choice review candidates", () => {
      const singleOptionValues = {
        scopeId: "scope-1",
        promptAr: "سؤال",
        promptEn: "",
        compatibleChallengeTypeIds: ["challenge-1"],
        mediaType: "none" as const,
        mediaUrls: [],
        revealMediaUrl: "",
        status: "draft" as const,
        isReusableAcrossSessions: false,
        notes: "",
        answer: {
          mode: "multiple_choice" as const,
          options: [{ id: "a", label: "خيار وحيد" }],
          correctOptionId: "a",
          correctValue: "",
          closestInteraction: "numeric-range" as const,
          closestMin: "0",
          closestMax: "100",
          closestStep: "1",
          closestUnit: "",
          closestDisplayFormat: "number" as const,
          closestLeftAnchor: "",
          closestRightAnchor: "",
          acceptedAnswers: "",
        },
        top5: { items: [] },
        rakkibha: { enabled: false, candidates: [] },
        oneClue: { enabled: false, clues: [], targetAnswer: "" },
        combo: { enabled: false, stage: "" as const },
        marhala: { enabled: false, difficulty: "" as const },
        oddPiece: { enabled: false, pieces: [] },
        laqatha: { enabled: false, clues: [] },
        firstNote: { enabled: false },
        ekshifni: { enabled: false, regions: [] },
        laTahriqha: { enabled: false, ingredients: [] },
      };

      const problems = findLocalFormProblems(singleOptionValues as never, {
        isCandidateReview: true,
      });
      expect(problems).toContain(
        "يجب أن يحتوي سؤال الاختيار المتعدد على خيارين إلى 4 خيارات.",
      );
    });

    it("verifies Closest step-grid reachability locally during candidate review", () => {
      const unreachableClosest = {
        scopeId: "scope-1",
        promptAr: "كم الارتفاع؟",
        promptEn: "",
        compatibleChallengeTypeIds: ["challenge-1"],
        mediaType: "none" as const,
        mediaUrls: [],
        revealMediaUrl: "",
        status: "draft" as const,
        isReusableAcrossSessions: false,
        notes: "",
        answer: {
          mode: "closest" as const,
          options: [],
          correctOptionId: "",
          correctValue: "303", // unreachable from 0 in steps of 5
          closestInteraction: "numeric-range" as const,
          closestMin: "0",
          closestMax: "500",
          closestStep: "5",
          closestUnit: "متر",
          closestDisplayFormat: "number" as const,
          closestLeftAnchor: "",
          closestRightAnchor: "",
          acceptedAnswers: "",
        },
        top5: { items: [] },
        rakkibha: { enabled: false, candidates: [] },
        oneClue: { enabled: false, clues: [], targetAnswer: "" },
        combo: { enabled: false, stage: "" as const },
        marhala: { enabled: false, difficulty: "" as const },
        oddPiece: { enabled: false, pieces: [] },
        laqatha: { enabled: false, clues: [] },
        firstNote: { enabled: false },
        ekshifni: { enabled: false, regions: [] },
        laTahriqha: { enabled: false, ingredients: [] },
      };

      const problems = findLocalFormProblems(unreachableClosest as never, {
        isCandidateReview: true,
      });
      expect(problems).toContain(
        "الإجابة الصحيحة يجب أن تقع على شبكة خطوات المؤشر (قابلة للوصول من الحد الأدنى بمضاعفات الخطوة).",
      );
    });

    it("sends structured approve payload with required explanation and explicit override code", async () => {
      const postSpy = vi
        .spyOn(apiClient, "post")
        .mockResolvedValue({ data: { data: { reviewStatus: "approved" } } } as never);

      try {
        await approveCandidate("cand-1", {
          expectedRevision: 2,
          explanation: "Approved after human review.",
          factualOverrideCode: "ACCEPTED_WITH_EVIDENCE",
          factualOverrideExplanation: "Source URL provided in assessment.",
        });

        expect(postSpy).toHaveBeenCalledWith(
          "/admin/content-engine/candidates/cand-1/approve",
          {
            expectedRevision: 2,
            explanation: "Approved after human review.",
            factualOverrideCode: "ACCEPTED_WITH_EVIDENCE",
            factualOverrideExplanation: "Source URL provided in assessment.",
          },
        );
      } finally {
        postSpy.mockRestore();
      }
    });

    it("sends structured reject and edit payloads preserving candidate review contracts", async () => {
      const postSpy = vi
        .spyOn(apiClient, "post")
        .mockResolvedValue({ data: { data: { ok: true } } } as never);
      const patchSpy = vi
        .spyOn(apiClient, "patch")
        .mockResolvedValue({ data: { data: { ok: true } } } as never);

      try {
        await rejectCandidate("cand-1", {
          expectedRevision: 1,
          reasonCode: "FACTUAL_ERROR",
          explanation: "Factual claim contradicted by official record.",
        });
        expect(postSpy).toHaveBeenCalledWith(
          "/admin/content-engine/candidates/cand-1/reject",
          {
            expectedRevision: 1,
            reasonCode: "FACTUAL_ERROR",
            explanation: "Factual claim contradicted by official record.",
          },
        );

        await editCandidate("cand-1", {
          expectedRevision: 1,
          draft: { prompt: { ar: "نص معدل" } },
          factualClaims: ["ادعاء معدل"],
          explanation: "Editorial correction",
        });
        expect(patchSpy).toHaveBeenCalledWith(
          "/admin/content-engine/candidates/cand-1",
          {
            expectedRevision: 1,
            draft: { prompt: { ar: "نص معدل" } },
            factualClaims: ["ادعاء معدل"],
            explanation: "Editorial correction",
          },
        );
      } finally {
        postSpy.mockRestore();
        patchSpy.mockRestore();
      }
    });
  });
});
