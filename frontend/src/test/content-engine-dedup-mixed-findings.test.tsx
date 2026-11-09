import { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import * as api from "@/features/content-engine-review/api";
import { ContentEngineReviewWorkspace } from "@/features/content-engine-review/content-engine-review-workspace";
import type { FactualState, ReviewCandidate, ScreenFinding } from "@/features/content-engine-review/types";

/**
 * Candidate-list badge and mixed actionable + inconclusive findings.
 *
 * Inconclusive subjective comparisons are informational: they get a neutral
 * badge when they are the only concern, stay visible next to actionable
 * overlaps, and never become an acknowledgment requirement.
 */

const FP_A = `ovl1:${"a".repeat(64)}`;
const FP_B = `ovl1:${"b".repeat(64)}`;

function WithQueryClient({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const overlap = (
  fingerprint: string,
  referenceId: string,
  kind = "CANONICAL_READY",
  code = "POTENTIAL_OVERLAP_HISTORICAL_CONTENT",
): ScreenFinding => ({
  code,
  severity: "warning",
  message: `Potential overlap with ${kind} item ${referenceId}: Same target answer but questions use differing descriptions`,
  fingerprint,
  evidence: {
    candidateContentHash: "c".repeat(64),
    reasonCode: "UNCERTAIN_FACTUAL_RELATIONSHIP",
    reference: { kind, id: referenceId, contentHash: "r".repeat(64) },
  },
});

const INCONCLUSIVE: ScreenFinding = {
  code: "SUBJECTIVE_COMPARISON_INCONCLUSIVE",
  severity: "deferred",
  message:
    "Some subjective comparisons could not be conclusively evaluated; no actionable overlap was established.",
};

const FACTUAL_PENDING: ScreenFinding = {
  code: "FACTUAL_VERIFICATION_PENDING",
  severity: "deferred",
  message: "claims are verified in Phase 1c",
};

const mockCandidate = (overrides: Partial<ReviewCandidate> = {}): ReviewCandidate => ({
  id: "cand-1",
  candidateId: "cid-1",
  jobId: "job-100",
  status: "awaiting_review",
  reviewStatus: "pending",
  reviewRevision: 1,
  draft: {
    prompt: { ar: "أي نادٍ فاز بلقب أول موسم من الدوري الإنجليزي الممتاز؟" },
    answerPayload: {
      mode: "multiple_choice",
      options: [
        { id: "a", label: { ar: "مانشستر يونايتد" } },
        { id: "b", label: { ar: "أستون فيلا" } },
      ],
      correctOptionId: "a",
    },
  },
  authoring: { concept: "تاريخ الدوري" },
  factualClaims: ["مانشستر يونايتد بطل موسم 1992-93"],
  publishedContentItemId: null,
  findings: [],
  factVerification: { state: "SUPPORTED" },
  qualityEvaluation: null,
  compatibilityEvaluation: null,
  humanAssessment: {
    factualState: "SUPPORTED",
    factualExplanation: "موثق",
    evidence: [],
    quality: {
      correctness: 5,
      mechanicFit: 5,
      clarity: 5,
      multiplayerFit: 5,
      originality: 5,
      explanation: "جيد",
    },
    assessedRevision: 1,
    reviewerEmail: "reviewer@example.test",
    assessedAt: new Date().toISOString(),
  },
  reviewDecision: null,
  reviewEvents: [],
  canonicalTarget: {
    worldId: "w-1",
    worldKey: "football",
    scopeId: "s-1",
    scopeKey: "premier-league",
    challengeTypeId: "c-1",
    mechanicKey: "read-your-opponent",
  },
  job: {
    id: "job-100",
    mechanicKey: "read-your-opponent",
    worldKey: "football",
    scopeKey: "premier-league",
    status: "awaiting_review",
    specVersion: "generation-spec-v1",
  },
  ...overrides,
});

/**
 * Candidates as the server holds them. Approval is assessment-first: saving
 * the assessment bumps the revision, and approval must carry the new one.
 */
let assessSpy: MockInstance<
  Parameters<typeof api.assessCandidate>,
  ReturnType<typeof api.assessCandidate>
>;

function renderWorkspace(candidates: ReviewCandidate[]) {
  const server = new Map(candidates.map((c) => [c.candidateId, c]));
  vi.spyOn(api, "listCandidates").mockImplementation(async () => [...server.values()]);
  vi.spyOn(api, "getCandidate").mockImplementation(async (id: string) =>
    server.get(id) ?? candidates[0],
  );
  assessSpy = vi.spyOn(api, "assessCandidate").mockImplementation(async (id, data) => {
    const current = server.get(id)!;
    const revision = current.reviewRevision + 1;
    const saved: ReviewCandidate = {
      ...current,
      reviewRevision: revision,
      humanAssessment: {
        reviewerEmail: "reviewer@example.test",
        assessedAt: new Date().toISOString(),
        ...current.humanAssessment,
        factualState: data.factualState as FactualState,
        factualExplanation: data.factualExplanation,
        evidence: data.evidence,
        quality: data.quality,
        assessedRevision: revision,
      },
    };
    server.set(id, saved);
    return saved;
  });
  render(
    <WithQueryClient>
      <ContentEngineReviewWorkspace />
    </WithQueryClient>,
  );
}

async function openCandidate(candidate: ReviewCandidate) {
  renderWorkspace([candidate]);
  fireEvent.click(await screen.findByTestId("surface-tab-review"));
  fireEvent.click(await screen.findByTestId(`candidate-row-${candidate.candidateId}`));
  await screen.findByTestId("deduplication-panel");
  fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/i), {
    target: { value: "راجعت التقاطع؛ الحقيقة المختبرة مختلفة" },
  });
}

const approveButton = () => screen.getByTestId("button-approve-candidate");
const payloadOf = (
  spy: { mock: { calls: Array<[string, Record<string, unknown>]> } },
  call = 0,
) => spy.mock.calls[call][1];

describe("Content Engine Review — dedup list badge and mixed findings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "getOverlapContentItem").mockRejectedValue(new Error("reference unavailable"));
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
      limits: { minTargetCount: 1, maxTargetCount: 10, maxBatchGuidanceLength: 1000 },
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

  it("labels each list row by its real deduplication category", async () => {
    renderWorkspace([
      mockCandidate({ candidateId: "inconclusive-only", findings: [INCONCLUSIVE, FACTUAL_PENDING] }),
      mockCandidate({ candidateId: "actionable", findings: [overlap(FP_A, "item-a"), INCONCLUSIVE] }),
      mockCandidate({
        candidateId: "proven",
        status: "screened_reject",
        findings: [{ code: "DUPLICATE_IN_BATCH", severity: "blocking", message: "another candidate asks the same thing" }],
      }),
      mockCandidate({
        candidateId: "incomplete",
        findings: [{ code: "HISTORICAL_INVENTORY_PARTIAL", severity: "blocking", message: "partial" }],
      }),
      mockCandidate({ candidateId: "clean", findings: [FACTUAL_PENDING] }),
    ]);
    fireEvent.click(await screen.findByTestId("surface-tab-review"));
    await screen.findByTestId("candidate-row-inconclusive-only");

    const badge = (id: string) => screen.queryByTestId(`candidate-dedup-badge-${id}`);
    expect(badge("inconclusive-only")?.textContent).toBe("مقارنة غير حاسمة");
    expect(badge("inconclusive-only")?.className).toContain("slate");
    expect(badge("inconclusive-only")?.className).not.toContain("amber");
    expect(badge("actionable")?.textContent).toBe("شبهة تقاطع");
    expect(badge("proven")?.textContent).toBe("تكرار مثبت");
    expect(badge("incomplete")?.textContent).toBe("فحص ناقص");
    expect(badge("clean")).toBeNull();
  });

  it("shows an inconclusive-only candidate as informational, with nothing to acknowledge", async () => {
    await openCandidate(mockCandidate({ findings: [INCONCLUSIVE, FACTUAL_PENDING] }));
    const panel = screen.getByTestId("deduplication-panel");
    expect(screen.getByTestId("deduplication-status-badge").textContent).toBe("بعض المقارنات غير حاسمة");
    expect(screen.queryByTestId("overlap-acknowledgment-list")).toBeNull();
    // The headline already carries it, so no second note.
    expect(screen.queryByTestId("deduplication-inconclusive-note")).toBeNull();
    expect(within(panel).queryAllByRole("checkbox")).toHaveLength(0);

    const spy = vi.spyOn(api, "approveCandidate").mockResolvedValue(mockCandidate());
    expect(approveButton()).toBeEnabled();
    fireEvent.click(approveButton());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(payloadOf(spy).overlapAcknowledgments).toBeUndefined();
    // Assessment first, then approval at the revision that save produced.
    expect(assessSpy).toHaveBeenCalledTimes(1);
    expect(assessSpy.mock.invocationCallOrder[0]).toBeLessThan(spy.mock.invocationCallOrder[0]);
    expect(payloadOf(spy).expectedRevision).toBe(2);
  });

  it("keeps both categories visible on a mixed candidate and gates only the actionable overlaps", async () => {
    await openCandidate(
      mockCandidate({
        findings: [
          overlap(FP_A, "item-a"),
          INCONCLUSIVE,
          FACTUAL_PENDING,
          overlap(FP_B, "sib-b", "BATCH_CANDIDATE", "POTENTIAL_OVERLAP_IN_BATCH"),
        ],
      }),
    );

    // Actionable: headline, acknowledgment list, one checkbox per overlap.
    expect(screen.getByTestId("deduplication-status-badge").textContent).toContain("شبهة تقاطع");
    const list = screen.getByTestId("overlap-acknowledgment-list");
    expect(within(list).getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByTestId("overlap-acknowledgment-progress").textContent).toContain("0 / 2");

    // Informational: a separate, labelled note with no checkbox of its own.
    const note = screen.getByTestId("deduplication-inconclusive-note");
    expect(note).toHaveAccessibleName("مقارنات غير حاسمة — للاطلاع فقط، لا تتطلب إقراراً");
    expect(note.textContent).toContain("لم تكن حاسمة");
    // Must not contradict the acknowledgment list right above it.
    expect(note.textContent).not.toContain("لم يُرصد تقاطع يستلزم الإقرار");
    expect(within(note).queryAllByRole("checkbox")).toHaveLength(0);
    expect(list.contains(note)).toBe(false);

    // Existing comparison cards are unchanged: one per acknowledgeable overlap.
    expect(within(list).getAllByTestId("overlap-comparison")).toHaveLength(2);

    const spy = vi.spyOn(api, "approveCandidate").mockResolvedValue(mockCandidate());
    expect(approveButton()).toBeDisabled();
    fireEvent.click(screen.getByTestId("overlap-ack-checkbox-item-a"));
    expect(approveButton()).toBeDisabled();
    fireEvent.click(screen.getByTestId("overlap-ack-checkbox-sib-b"));
    expect(approveButton()).toBeEnabled();

    fireEvent.click(approveButton());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    // Exactly the overlap fingerprints; the inconclusive finding contributes none.
    expect(payloadOf(spy).overlapAcknowledgments).toEqual([
      { fingerprint: FP_A },
      { fingerprint: FP_B },
    ]);
    expect(assessSpy).toHaveBeenCalledTimes(1);
    expect(payloadOf(spy).expectedRevision).toBe(2);
  });

  it("keeps the inconclusive note visible beside a proven duplicate", async () => {
    await openCandidate(
      mockCandidate({
        status: "screened_reject",
        findings: [
          { code: "DUPLICATE_HISTORICAL_CONTENT", severity: "blocking", message: "Duplicate of CANONICAL_READY item x: identical" },
          INCONCLUSIVE,
        ],
      }),
    );
    expect(screen.getByTestId("deduplication-status-badge").textContent).toContain("تكرار مثبت");
    expect(screen.getByTestId("deduplication-inconclusive-note")).toBeInTheDocument();
  });
});
