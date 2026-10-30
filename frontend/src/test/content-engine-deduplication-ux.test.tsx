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
  reviewRevision: 1,
  draft: {
    prompt: { ar: "ما عاصمة مصر؟" },
    answerPayload: {
      mode: "multiple_choice",
      options: [
        { id: "1", label: { ar: "القاهرة" } },
        { id: "2", label: { ar: "الإسكندرية" } },
      ],
      correctOptionId: "1",
    },
  },
  authoring: {
    concept: "عاصمة عربية مشهورة",
    estimatedConfidence: { band: "likely", why: "معلومة جغرافية شائعة" },
  },
  factualClaims: ["القاهرة هي عاصمة مصر"],
  publishedContentItemId: null,
  findings: [],
  factVerification: { state: "SUPPORTED" },
  qualityEvaluation: null,
  compatibilityEvaluation: null,
  humanAssessment: {
    factualState: "SUPPORTED",
    factualExplanation: "المعلومة صحيحة وموثقة",
    evidence: [],
    quality: {
      correctness: 5,
      mechanicFit: 5,
      clarity: 5,
      multiplayerFit: 5,
      originality: 5,
      explanation: "ممتاز",
    },
    assessedRevision: 1,
    reviewerEmail: "reviewer@example.test",
    assessedAt: new Date().toISOString(),
  },
  reviewDecision: null,
  reviewEvents: [],
  canonicalTarget: {
    worldId: "w-1",
    worldKey: "geography",
    scopeId: "s-1",
    scopeKey: "capitals",
    challengeTypeId: "c-1",
    mechanicKey: "read-your-opponent",
  },
  job: {
    id: "job-100",
    mechanicKey: "read-your-opponent",
    worldKey: "geography",
    scopeKey: "capitals",
    status: "awaiting_review",
    specVersion: "generation-spec-v1",
  },
  ...overrides,
});

describe("Content Engine Review Studio — Deduplication UX (Slice 2D)", () => {
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
      worlds: [],
      scopes: [],
      mechanics: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. displays proven duplicate with blocking badge, match evidence, and blocks approval", async () => {
    const duplicateCandidate = mockCandidate({
      status: "screened_reject",
      findings: [
        {
          code: "DUPLICATE_HISTORICAL_CONTENT",
          severity: "blocking",
          message:
            "Duplicate of CANONICAL_READY item item-cairo: Identical factual task and correct answer; distractor variation does not create a new gameplay task.",
        },
      ],
    });

    vi.spyOn(api, "listCandidates").mockResolvedValue([duplicateCandidate]);
    vi.spyOn(api, "getCandidate").mockResolvedValue(duplicateCandidate);

    render(
      <WithQueryClient>
        <ContentEngineReviewWorkspace />
      </WithQueryClient>,
    );

    // Switch to review surface
    fireEvent.click(await screen.findByTestId("surface-tab-review"));

    // Select candidate
    fireEvent.click(await screen.findByTestId("candidate-row-cid-1"));

    // Verify deduplication panel renders with proven duplicate status
    const badge = await screen.findByTestId("deduplication-status-badge");
    expect(badge.textContent).toContain("تكرار مثبت — الاعتماد محظور");

    // Verify candidate list badge
    const listBadge = await screen.findByTestId("candidate-dedup-badge-cid-1");
    expect(listBadge.textContent).toContain("تكرار مثبت");

    // Verify approval button is disabled
    const approveBtn = screen.getByTestId("button-approve-candidate");
    expect(approveBtn).toBeDisabled();

    // Verify progressive disclosure of match evidence
    const toggleEvidenceBtn = screen.getByTestId("button-toggle-match-evidence");
    fireEvent.click(toggleEvidenceBtn);

    const evidenceContainer = await screen.findByTestId("deduplication-evidence-container");
    expect(evidenceContainer.textContent).toContain("item-cairo");
    expect(evidenceContainer.textContent).toContain("محتوى جاهز معتمد (READY)");
    expect(evidenceContainer.textContent).toContain("تطابق تام في المهمة المعرفية والإجابة الصحيحة");
    expect(evidenceContainer.textContent).toContain("تفاصيل السؤال والخيارات الكاملة للعنصر المرجعي غير محملة");
  });

  it("2. displays potential overlap with warning badge and allows approval when assessed", async () => {
    const overlapCandidate = mockCandidate({
      status: "awaiting_review",
      findings: [
        {
          code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT",
          severity: "warning",
          message:
            "Potential overlap with CANONICAL_READY item item-alex: Identical answer for the same subject and property relationship",
        },
      ],
    });

    vi.spyOn(api, "listCandidates").mockResolvedValue([overlapCandidate]);
    vi.spyOn(api, "getCandidate").mockResolvedValue(overlapCandidate);

    render(
      <WithQueryClient>
        <ContentEngineReviewWorkspace />
      </WithQueryClient>,
    );

    fireEvent.click(await screen.findByTestId("surface-tab-review"));
    fireEvent.click(await screen.findByTestId("candidate-row-cid-1"));

    const badge = await screen.findByTestId("deduplication-status-badge");
    expect(badge.textContent).toContain("شبهة تقاطع أو تشابه — يتطلب مراجعة بشرية");

    // Potential overlap does NOT block approval when assessment is complete
    const explanationInput = screen.getByPlaceholderText(
      /تفسير القرار/i,
    );
    fireEvent.change(explanationInput, { target: { value: "Checked: verified different nuance" } });

    const approveBtn = screen.getByTestId("button-approve-candidate");
    expect(approveBtn).toBeEnabled();
  });

  it("3. displays incomplete historical verification, blocks approval, and provides re-screen action", async () => {
    const incompleteCandidate = mockCandidate({
      findings: [
        {
          code: "HISTORICAL_INVENTORY_UNAVAILABLE",
          severity: "warning",
          message: "Historical scope inventory could not be verified (database retrieval failed)",
        },
      ],
    });

    vi.spyOn(api, "listCandidates").mockResolvedValue([incompleteCandidate]);
    vi.spyOn(api, "getCandidate").mockResolvedValue(incompleteCandidate);

    render(
      <WithQueryClient>
        <ContentEngineReviewWorkspace />
      </WithQueryClient>,
    );

    fireEvent.click(await screen.findByTestId("surface-tab-review"));
    fireEvent.click(await screen.findByTestId("candidate-row-cid-1"));

    const badge = await screen.findByTestId("deduplication-status-badge");
    expect(badge.textContent).toContain("تحقق تاريخي غير مكتمل — الاعتماد محظور");

    const approveBtn = screen.getByTestId("button-approve-candidate");
    expect(approveBtn).toBeDisabled();

    // Re-screen button is present
    const rescreenBtn = screen.getByTestId("button-rescreen-candidate");
    expect(rescreenBtn).toBeEnabled();
    expect(rescreenBtn.textContent).toContain("إعادة فحص التكرار");
  });

  it("4. displays clean candidate within checked scope without claiming absolute global uniqueness", async () => {
    const cleanCandidate = mockCandidate({
      findings: [],
    });

    vi.spyOn(api, "listCandidates").mockResolvedValue([cleanCandidate]);
    vi.spyOn(api, "getCandidate").mockResolvedValue(cleanCandidate);

    render(
      <WithQueryClient>
        <ContentEngineReviewWorkspace />
      </WithQueryClient>,
    );

    fireEvent.click(await screen.findByTestId("surface-tab-review"));
    fireEvent.click(await screen.findByTestId("candidate-row-cid-1"));

    const badge = await screen.findByTestId("deduplication-status-badge");
    expect(badge.textContent).toContain("لم يتم رصد تكرار ضمن النطاق المفحوص");

    const desc = screen.getByTestId("deduplication-description");
    expect(desc.textContent).toContain("ضمن النطاق المفحوص");
    expect(desc.textContent).not.toContain("فريد تماماً ومطلقاً في كل العالم");
  });

  it("5. re-screen action executes with current revision and updates findings", async () => {
    const initialCandidate = mockCandidate({
      reviewRevision: 1,
      findings: [
        {
          code: "HISTORICAL_INVENTORY_UNAVAILABLE",
          severity: "warning",
          message: "Database retrieval failed",
        },
      ],
    });

    const updatedCandidate = mockCandidate({
      reviewRevision: 2,
      findings: [], // Re-screen succeeded!
    });

    vi.spyOn(api, "listCandidates").mockResolvedValue([initialCandidate]);
    vi.spyOn(api, "getCandidate")
      .mockResolvedValueOnce(initialCandidate)
      .mockResolvedValueOnce(updatedCandidate);

    const rescreenSpy = vi.spyOn(api, "rescreenCandidate").mockResolvedValue(updatedCandidate);

    render(
      <WithQueryClient>
        <ContentEngineReviewWorkspace />
      </WithQueryClient>,
    );

    fireEvent.click(await screen.findByTestId("surface-tab-review"));
    fireEvent.click(await screen.findByTestId("candidate-row-cid-1"));

    const rescreenBtn = await screen.findByTestId("button-rescreen-candidate");
    fireEvent.click(rescreenBtn);

    // Verify API called with exact candidateId and revision
    await waitFor(() => {
      expect(rescreenSpy).toHaveBeenCalledWith("cid-1", 1);
    });

    // After completion, candidate updates to clean
    await waitFor(async () => {
      const badge = await screen.findByTestId("deduplication-status-badge");
      expect(badge.textContent).toContain("لم يتم رصد تكرار ضمن النطاق المفحوص");
    });
  });

  it("6. re-screen action handles CAS 409 conflict and presents reload prompt", async () => {
    const initialCandidate = mockCandidate({
      reviewRevision: 1,
      findings: [
        {
          code: "HISTORICAL_INVENTORY_UNAVAILABLE",
          severity: "warning",
          message: "Database retrieval failed",
        },
      ],
    });

    vi.spyOn(api, "listCandidates").mockResolvedValue([initialCandidate]);
    vi.spyOn(api, "getCandidate").mockResolvedValue(initialCandidate);

    const conflictError = {
      response: {
        status: 409,
        data: {
          code: "CANDIDATE_REVISION_CONFLICT",
          message: "Candidate was updated by another reviewer (revision 2)",
          currentRevision: 2,
        },
      },
    };

    vi.spyOn(api, "rescreenCandidate").mockRejectedValue(conflictError);

    render(
      <WithQueryClient>
        <ContentEngineReviewWorkspace />
      </WithQueryClient>,
    );

    fireEvent.click(await screen.findByTestId("surface-tab-review"));
    fireEvent.click(await screen.findByTestId("candidate-row-cid-1"));

    const rescreenBtn = await screen.findByTestId("button-rescreen-candidate");
    fireEvent.click(rescreenBtn);

    // Conflict banner appears
    const conflictBanner = await screen.findByTestId("revision-conflict-banner");
    expect(conflictBanner.textContent).toContain("تعارض في رقم مراجعة");
    expect(conflictBanner.textContent).toContain("إعادة تحميل أحدث نسخة");
  });
});
