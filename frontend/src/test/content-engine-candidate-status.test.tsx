import { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/features/content-engine-review/api";
import { ContentEngineReviewWorkspace } from "@/features/content-engine-review/content-engine-review-workspace";
import type { ReviewCandidate } from "@/features/content-engine-review/types";

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

function WithQueryClient({ children }: { children: ReactNode }) {
  const client = makeQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const mockCandidate = (
  overrides: Partial<ReviewCandidate> = {},
): ReviewCandidate => ({
  id: "cand-1",
  candidateId: "cid-1",
  jobId: "job-100",
  status: "awaiting_review",
  reviewStatus: "pending",
  reviewRevision: 0,
  draft: {
    prompt: { ar: "ما عاصمة سلطنة عُمان؟" },
    answerPayload: {
      mode: "multiple_choice",
      options: [
        { id: "1", label: { ar: "مسقط" } },
        { id: "2", label: { ar: "صلالة" } },
      ],
      correctOptionId: "1",
    },
  },
  authoring: {
    concept: "عاصمة عربية مشهورة",
    estimatedConfidence: { band: "likely", why: "معلومة جغرافية شائعة" },
  },
  factualClaims: ["مسقط هي عاصمة سلطنة عمان"],
  publishedContentItemId: null,
  findings: [],
  factVerification: { state: "UNRESOLVED" },
  qualityEvaluation: null,
  compatibilityEvaluation: null,
  humanAssessment: null,
  reviewDecision: null,
  reviewEvents: [],
  job: {
    id: "job-100",
    mechanicKey: "read-your-opponent",
    worldKey: "puzzles",
    scopeKey: "wordplay-letters",
    status: "awaiting_review",
    specVersion: "generation-spec-v1",
  },
  ...overrides,
});

describe("Content Engine Review Studio — Candidate Status Presentation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage?.clear();
    vi.spyOn(api, "getSpending").mockResolvedValue({
      jobId: "job-100",
      spentMicros: 0,
      spentSar: 0,
      reservedMicros: 0,
      reservedSar: 0,
      stages: [],
    });
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue({
      specVersion: 1,
      limits: {
        minTargetCount: 1,
        maxTargetCount: 10,
        maxBatchGuidanceLength: 1000,
      },
      engine: {
        engineEnabled: true,
        provider: "fake",
        generationModel: "fake-gen",
        qualityModel: "fake-judge",
        providerConfigured: true,
        generationModelConfigured: true,
        qualityModelConfigured: true,
        liveProviderEnabled: false,
        providerReady: true,
        pricingConfigured: true,
        submissionReady: true,
        blockedCode: null,
        blockedReason: null,
      },
      mechanics: [],
      worlds: [],
      scopes: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders distinct pipeline and review status badges for reviewable and rejected candidates", async () => {
    const reviewableCand = mockCandidate({
      id: "cand-pass",
      candidateId: "cid-pass",
      status: "awaiting_review",
      reviewStatus: "pending",
      draft: { prompt: { ar: "سؤال صالح للمراجعة" } },
    });

    const rejectedCand = mockCandidate({
      id: "cand-reject",
      candidateId: "cid-reject",
      status: "screened_reject",
      reviewStatus: "pending",
      draft: { prompt: { ar: "رتب الحروف: (ق-ج-ع-د) لتكوين قرد" } },
      findings: [
        {
          code: "ANAGRAM_LETTER_MULTISET_MISMATCH",
          severity: "blocking",
          message: "clue letters do not match the answer letters (mismatch on letter ج)",
        },
      ],
    });

    vi.spyOn(api, "listCandidates").mockResolvedValue([
      reviewableCand,
      rejectedCand,
    ]);
    vi.spyOn(api, "getCandidate").mockImplementation(async (id) =>
      id === "cid-reject" ? rejectedCand : reviewableCand,
    );

    render(
      <WithQueryClient>
        <ContentEngineReviewWorkspace />
      </WithQueryClient>,
    );

    // Navigate to Review surface
    fireEvent.click(await screen.findByTestId("surface-tab-review"));

    // Check candidate cards exist
    await screen.findByTestId("candidate-row-cid-pass");
    await screen.findByTestId("candidate-row-cid-reject");

    // Reviewable candidate shows Awaiting Review pipeline badge and Pending review badge
    const passPipelineBadge = screen.getByTestId(
      "candidate-pipeline-badge-cid-pass",
    );
    expect(passPipelineBadge).toHaveTextContent("جاهز للمراجعة");

    const passReviewBadge = screen.getByTestId(
      "candidate-review-badge-cid-pass",
    );
    expect(passReviewBadge).toHaveTextContent("بانتظار القرار البشري");

    // Rejected candidate shows Screened Reject pipeline badge
    const rejectPipelineBadge = screen.getByTestId(
      "candidate-pipeline-badge-cid-reject",
    );
    expect(rejectPipelineBadge).toHaveTextContent("مرفوض آلياً");

    // Rejected candidate displays the blocking reason in the list item
    const blockingReason = screen.getByTestId(
      "candidate-blocking-reason-cid-reject",
    );
    expect(blockingReason).toHaveTextContent("ANAGRAM_LETTER_MULTISET_MISMATCH");
    expect(blockingReason).toHaveTextContent("mismatch on letter ج");
  });

  it("displays the prominent screened-reject banner when inspecting a rejected candidate", async () => {
    const rejectedCand = mockCandidate({
      id: "cand-reject-2",
      candidateId: "cid-reject-2",
      status: "screened_reject",
      reviewStatus: "pending",
      draft: { prompt: { ar: "اختر الكلمة التي تعني ماء: (نهر)" } },
      findings: [
        {
          code: "ANSWER_LEAKAGE",
          severity: "blocking",
          message: "the correct answer appears in the prompt text",
        },
      ],
    });

    vi.spyOn(api, "listCandidates").mockResolvedValue([rejectedCand]);
    vi.spyOn(api, "getCandidate").mockResolvedValue(rejectedCand);

    render(
      <WithQueryClient>
        <ContentEngineReviewWorkspace />
      </WithQueryClient>,
    );

    // Switch to review
    fireEvent.click(await screen.findByTestId("surface-tab-review"));
    const row = await screen.findByTestId("candidate-row-cid-reject-2");
    fireEvent.click(row);

    // Banner is rendered with blocking details
    const banner = await screen.findByTestId("screened-reject-banner");
    expect(banner).toHaveTextContent("مرفوض في الفحص الحتمي الآلي");
    expect(banner).toHaveTextContent("ANSWER_LEAKAGE");
    expect(banner).toHaveTextContent("the correct answer appears in the prompt text");
  });

  it("supports filtering by status in the review filters select", async () => {
    const listSpy = vi.spyOn(api, "listCandidates").mockResolvedValue([]);

    render(
      <WithQueryClient>
        <ContentEngineReviewWorkspace />
      </WithQueryClient>,
    );

    fireEvent.click(await screen.findByTestId("surface-tab-review"));

    const statusSelect = await screen.findByRole("combobox", {
      name: /status/i,
    });

    // Change filter to screened_reject
    fireEvent.change(statusSelect, { target: { value: "screened_reject" } });

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: "screened_reject" }),
      );
    });

    // Change filter to awaiting_review
    fireEvent.change(statusSelect, { target: { value: "awaiting_review" } });

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: "awaiting_review" }),
      );
    });
  });
});
