import { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/features/content-engine-review/api";
import { ContentEngineReviewWorkspace } from "@/features/content-engine-review/content-engine-review-workspace";
import type { ReviewCandidate, ScreenFinding } from "@/features/content-engine-review/types";

/**
 * R4-B: reviewer overlap acknowledgment. The browser only ever echoes
 * server-provided `ovl1:` fingerprints; it never computes one.
 */

const FP_A = `ovl1:${"a".repeat(64)}`;
const FP_B = `ovl1:${"b".repeat(64)}`;
const FP_A_CHANGED = `ovl1:${"d".repeat(64)}`;
const FP_NEW = `ovl1:${"e".repeat(64)}`;

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
  message: `Potential overlap with ${kind} item ${referenceId}: Identical answer for the same subject and property relationship`,
  fingerprint,
  evidence: {
    candidateContentHash: "c".repeat(64),
    reasonCode: "SAME_TARGET_DIFFERENT_TASK",
    reference: { kind, id: referenceId, contentHash: "r".repeat(64) },
  },
});

const mockCandidate = (overrides: Partial<ReviewCandidate> = {}): ReviewCandidate => ({
  id: "cand-1",
  candidateId: "cid-1",
  jobId: "job-100",
  status: "awaiting_review",
  reviewStatus: "pending",
  reviewRevision: 1,
  draft: {
    prompt: { ar: "من مخترع التليفون؟" },
    answerPayload: {
      mode: "multiple_choice",
      options: [
        { id: "a", label: { ar: "ألكسندر غراهام بيل" } },
        { id: "b", label: { ar: "نيكولا تيسلا" } },
      ],
      correctOptionId: "a",
    },
  },
  authoring: { concept: "اختراعات" },
  factualClaims: ["بيل اخترع الهاتف"],
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
    worldKey: "science",
    scopeId: "s-1",
    scopeKey: "inventions",
    challengeTypeId: "c-1",
    mechanicKey: "read-your-opponent",
  },
  job: {
    id: "job-100",
    mechanicKey: "read-your-opponent",
    worldKey: "science",
    scopeKey: "inventions",
    status: "awaiting_review",
    specVersion: "generation-spec-v1",
  },
  ...overrides,
});

const conflict = (code: string, details: Record<string, unknown> = {}, extra = {}) => ({
  response: { status: 409, data: { code, message: "conflict", details, ...extra } },
});

async function openCandidate(candidate: ReviewCandidate) {
  vi.spyOn(api, "listCandidates").mockResolvedValue([candidate]);
  vi.spyOn(api, "getCandidate").mockResolvedValue(candidate);
  render(
    <WithQueryClient>
      <ContentEngineReviewWorkspace />
    </WithQueryClient>,
  );
  fireEvent.click(await screen.findByTestId("surface-tab-review"));
  fireEvent.click(await screen.findByTestId("candidate-row-cid-1"));
  await screen.findByTestId("deduplication-panel");
  fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/i), {
    target: { value: "راجعت التقاطع؛ زاوية اللعب مختلفة" },
  });
}

const approveButton = () => screen.getByTestId("button-approve-candidate");
const ack = (referenceId: string) =>
  fireEvent.click(screen.getByTestId(`overlap-ack-checkbox-${referenceId}`));
const payloadOf = (
  spy: { mock: { calls: Array<[string, Record<string, unknown>]> } },
  call = 0,
) => spy.mock.calls[call][1];

describe("Content Engine Review — overlap acknowledgment (R4-B)", () => {
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

  it("1. approves a candidate with no overlap without sending acknowledgments", async () => {
    await openCandidate(mockCandidate());
    const spy = vi.spyOn(api, "approveCandidate").mockResolvedValue(mockCandidate());
    expect(screen.queryByTestId("overlap-acknowledgment-list")).toBeNull();
    expect(approveButton()).toBeEnabled();
    fireEvent.click(approveButton());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(payloadOf(spy)).toEqual({
      expectedRevision: 1,
      explanation: "راجعت التقاطع؛ زاوية اللعب مختلفة",
    });
  });

  it("2. renders each overlap with the affected candidate, reference, reason and evidence, unchecked", async () => {
    await openCandidate(mockCandidate({ findings: [overlap(FP_A, "item-a")] }));
    const item = screen.getByTestId("overlap-requirement-item-a");
    expect(item.textContent).toContain("cid-1");
    expect(item.textContent).toContain("سؤال جاهز منشور (READY ContentItem)");
    expect(item.textContent).toContain("item-a");
    expect(item.textContent).toContain("تطابق في الإجابة لنفس العلاقة");
    expect(item.textContent).toContain("SAME_TARGET_DIFFERENT_TASK");
    expect(item.textContent).toContain("aaaaaaaaaaaa…");
    const box = within(item).getByRole("checkbox");
    expect(box).toHaveAttribute("aria-checked", "false");
  });

  it("3/4/5/11. requires every warning to be acknowledged, then submits exactly the server fingerprints", async () => {
    await openCandidate(
      mockCandidate({
        findings: [overlap(FP_A, "item-a"), overlap(FP_B, "sib-b", "BATCH_CANDIDATE", "POTENTIAL_OVERLAP_IN_BATCH")],
      }),
    );
    const spy = vi.spyOn(api, "approveCandidate").mockResolvedValue(mockCandidate());
    // Opening the evidence disclosure is not acknowledgment.
    fireEvent.click(screen.getByTestId("button-toggle-match-evidence"));
    expect(approveButton()).toBeDisabled();
    expect(screen.getByTestId("approval-eligibility-panel").textContent).toContain(
      "يلزم الإقرار الصريح بكل شبهة تقاطع قبل الاعتماد (2 من 2 دون إقرار)",
    );

    ack("item-a");
    expect(screen.getByTestId("overlap-acknowledgment-progress").textContent).toContain("1 / 2");
    expect(approveButton()).toBeDisabled();

    ack("sib-b");
    expect(approveButton()).toBeEnabled();
    // Un-acknowledging re-blocks.
    ack("sib-b");
    expect(approveButton()).toBeDisabled();
    ack("sib-b");

    fireEvent.click(approveButton());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(payloadOf(spy).overlapAcknowledgments).toEqual([
      { fingerprint: FP_A },
      { fingerprint: FP_B },
    ]);
    expect(payloadOf(spy).expectedRevision).toBe(1);
  });

  it("6. keeps a proven duplicate blocked even when the overlap is acknowledged", async () => {
    await openCandidate(
      mockCandidate({
        status: "screened_reject",
        findings: [
          overlap(FP_A, "item-a"),
          {
            code: "DUPLICATE_HISTORICAL_CONTENT",
            severity: "blocking",
            message: "Duplicate of CANONICAL_READY item item-z: identical prompt text and correct answer",
          },
        ],
      }),
    );
    expect(screen.getByTestId("deduplication-status-badge").textContent).toContain(
      "تكرار مثبت — الاعتماد محظور",
    );
    ack("item-a");
    expect(approveButton()).toBeDisabled();
  });

  it("7. keeps incomplete inventory blocked even when the overlap is acknowledged", async () => {
    await openCandidate(
      mockCandidate({
        findings: [
          overlap(FP_A, "item-a"),
          { code: "HISTORICAL_INVENTORY_PARTIAL", severity: "warning", message: "partial" },
        ],
      }),
    );
    expect(screen.getByTestId("deduplication-status-badge").textContent).toContain(
      "تحقق تاريخي غير مكتمل — الاعتماد محظور",
    );
    ack("item-a");
    expect(approveButton()).toBeDisabled();
  });

  it("blocks an unverifiable overlap with no acknowledgment control", async () => {
    await openCandidate(
      mockCandidate({
        findings: [{ code: "POTENTIAL_OVERLAP_IN_BATCH", severity: "warning", message: "legacy" }],
      }),
    );
    expect(screen.queryByTestId("overlap-acknowledgment-list")).toBeNull();
    expect(screen.getByTestId("deduplication-status-badge").textContent).toContain(
      "شبهة تقاطع غير قابلة للتحقق — الاعتماد محظور",
    );
    expect(approveButton()).toBeDisabled();
  });

  it("8. shows the stale-revision banner and does not retry", async () => {
    await openCandidate(mockCandidate({ findings: [overlap(FP_A, "item-a")] }));
    const spy = vi
      .spyOn(api, "approveCandidate")
      .mockRejectedValue(
        conflict("CANDIDATE_REVISION_CONFLICT", {}, {
          message: "Candidate changed; reload before reviewing",
          currentRevision: 2,
        }),
      );
    ack("item-a");
    fireEvent.click(approveButton());
    const banner = await screen.findByTestId("revision-conflict-banner");
    expect(banner.textContent).toContain("المراجعة الحالية على الخادم: 2");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("9/12. adopts new server evidence, keeps still-valid acknowledgments, requires the new one, then re-approves", async () => {
    await openCandidate(mockCandidate({ findings: [overlap(FP_A, "item-a")] }));
    const spy = vi
      .spyOn(api, "approveCandidate")
      .mockRejectedValueOnce(
        conflict("OVERLAP_ACKNOWLEDGMENT_REQUIRED", {
          overlaps: [
            { fingerprint: FP_A, code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT", reasonCode: "R", reference: { kind: "CANONICAL_READY", id: "item-a", contentHash: "r" } },
            { fingerprint: FP_NEW, code: "POTENTIAL_OVERLAP_APPROVED_CANDIDATE", reasonCode: "R", reference: { kind: "APPROVED_CANDIDATE", id: "cand-new", contentHash: "n" } },
          ],
          missing: [FP_NEW],
          stale: [],
        }),
      )
      .mockResolvedValueOnce(mockCandidate());
    ack("item-a");
    fireEvent.click(approveButton());

    const alert = await screen.findByTestId("review-action-error");
    expect(alert.textContent).toContain("تغيّرت أدلة التقاطع على الخادم");
    expect(screen.queryByTestId("revision-conflict-banner")).toBeNull();
    expect(await screen.findByTestId("overlap-evidence-refreshed")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("overlap-requirement-item-a")).getByRole("checkbox"),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(screen.getByTestId("overlap-requirement-cand-new")).getByRole("checkbox"),
    ).toHaveAttribute("aria-checked", "false");
    expect(approveButton()).toBeDisabled();
    expect(spy).toHaveBeenCalledTimes(1);

    ack("cand-new");
    fireEvent.click(approveButton());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(payloadOf(spy, 1).overlapAcknowledgments).toEqual([
      { fingerprint: FP_A },
      { fingerprint: FP_NEW },
    ]);
  });

  it("10. clears an acknowledgment whose reference fingerprint changed", async () => {
    await openCandidate(mockCandidate({ findings: [overlap(FP_A, "item-a")] }));
    const spy = vi.spyOn(api, "approveCandidate").mockRejectedValueOnce(
      conflict("OVERLAP_ACKNOWLEDGMENT_REQUIRED", {
        overlaps: [
          { fingerprint: FP_A_CHANGED, code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT", reasonCode: "R", reference: { kind: "CANONICAL_READY", id: "item-a", contentHash: "changed" } },
        ],
        missing: [FP_A_CHANGED],
        stale: [FP_A],
      }),
    );
    ack("item-a");
    fireEvent.click(approveButton());
    await screen.findByTestId("overlap-evidence-refreshed");
    expect(
      within(screen.getByTestId("overlap-requirement-item-a")).getByRole("checkbox"),
    ).toHaveAttribute("aria-checked", "false");
    expect(approveButton()).toBeDisabled();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("explains a DRAFT refused because overlap evidence changed after approval", async () => {
    const approved = mockCandidate({
      reviewStatus: "approved",
      findings: [overlap(FP_A, "item-a")],
      reviewDecision: { decision: "approved", revision: 1 },
      reviewEligibility: {
        assessmentCurrent: true,
        assessmentStale: false,
        evidenceCount: 0,
        requiresFactualOverride: false,
        allowedFactualOverrideCodes: [],
        canApprove: false,
        canCreateDraft: true,
        approvalBlockers: [],
        draftBlockers: [],
      },
    });
    await openCandidate(approved);
    // Approved candidates show no acknowledgment controls.
    expect(screen.queryByTestId("overlap-acknowledgment-list")).toBeNull();
    vi.spyOn(api, "createCanonicalDraft").mockRejectedValue(
      conflict("OVERLAP_ACKNOWLEDGMENT_REQUIRED", { overlaps: [], missing: [], stale: [] }),
    );
    fireEvent.click(screen.getByTestId("button-create-canonical-draft"));
    const alert = await screen.findByTestId("review-action-error");
    expect(alert.textContent).toContain("أعد فحص التكرار ليعود المرشح إلى المراجعة البشرية");
  });

  it("shows stale-approval DRAFT blockers reported by the server and disables DRAFT creation", async () => {
    await openCandidate(
      mockCandidate({
        reviewStatus: "approved",
        reviewRevision: 3,
        reviewDecision: { decision: "approved", revision: 2 },
        reviewEligibility: {
          assessmentCurrent: true,
          assessmentStale: false,
          evidenceCount: 0,
          requiresFactualOverride: false,
          allowedFactualOverrideCodes: [],
          canApprove: false,
          canCreateDraft: false,
          approvalBlockers: [],
          draftBlockers: ["لا يمكن إنشاء المسودة: تغيّر رقم المراجعة بعد الاعتماد (Stale approval)"],
        },
      }),
    );
    expect(screen.getByTestId("draft-blockers-panel").textContent).toContain("Stale approval");
    expect(screen.getByTestId("button-create-canonical-draft")).toBeDisabled();
  });

  it("reflects a revoked approval in the decision section and the audit trail", async () => {
    await openCandidate(
      mockCandidate({
        reviewRevision: 3,
        humanAssessment: null,
        reviewEvents: [
          { action: "approved", actorEmail: "r@example.test", occurredAt: new Date().toISOString(), revision: 2, details: { overlapAcknowledgments: [FP_A] } },
          {
            action: "edited",
            actorEmail: "r@example.test",
            occurredAt: new Date().toISOString(),
            revision: 3,
            explanation: "Automated historical re-screen against catalog inventory",
            details: { reScreen: true, approvalRevoked: { reasons: ["OVERLAP_EVIDENCE_UNACKNOWLEDGED"] } },
          },
        ],
      }),
    );
    expect(screen.getByTestId("approval-revoked-banner").textContent).toContain(
      "OVERLAP_EVIDENCE_UNACKNOWLEDGED",
    );
    const trail = screen.getByTestId("candidate-audit-trail");
    expect(trail.textContent).toContain("سُحب الاعتماد في هذه المراجعة (Approval revoked)");
    expect(trail.textContent).toContain("Overlap acknowledged");
  });

  it("R4-C: distinguishes the human approval from an automated carry-forward and keeps DRAFT available", async () => {
    const now = new Date().toISOString();
    await openCandidate(
      mockCandidate({
        reviewStatus: "approved",
        reviewRevision: 3,
        reviewDecision: { decision: "approved", revision: 2, reviewerEmail: "reviewer@example.test" },
        reviewEligibility: {
          assessmentCurrent: true,
          assessmentStale: false,
          evidenceCount: 0,
          requiresFactualOverride: false,
          allowedFactualOverrideCodes: [],
          canApprove: false,
          canCreateDraft: true,
          approvalBlockers: [],
          draftBlockers: [],
        },
        reviewEvents: [
          { action: "approved", actorEmail: "reviewer@example.test", occurredAt: now, revision: 2, details: {} },
          {
            action: "approval_carried_forward",
            actorEmail: "operator@example.test",
            occurredAt: now,
            revision: 3,
            details: {
              fromRevision: 2,
              toRevision: 3,
              originalApproval: { revision: 2, reviewerEmail: "reviewer@example.test" },
            },
          },
        ],
      }),
    );
    expect(screen.getByTestId("approval-carried-forward-banner").textContent).toContain(
      "Approval preserved",
    );
    expect(screen.queryByTestId("approval-revoked-banner")).toBeNull();
    const trail = screen.getByTestId("candidate-audit-trail");
    expect(trail.textContent).toContain("اعتماد بشري للمرشح (Human approval)");
    expect(trail.textContent).toContain("(Approval carried forward)");
    const carried = screen.getByTestId("audit-approval-carried-forward-1");
    expect(carried.textContent).toContain("Automated, not a new human approval");
    expect(carried.textContent).toContain("rev 2 · reviewer@example.test");
    expect(screen.queryByTestId("draft-blockers-panel")).toBeNull();
    expect(screen.getByTestId("button-create-canonical-draft")).toBeEnabled();
  });

  it("13. uses bilingual labels and a layout that stacks and wraps at phone width", async () => {
    await openCandidate(mockCandidate({ findings: [overlap(FP_A, "a-very-long-reference-identifier-0123456789")] }));
    const list = screen.getByTestId("overlap-acknowledgment-list");
    expect(list.textContent).toContain("إقرار المراجع بشبهات التقاطع (Overlap acknowledgment)");
    expect(list.textContent).toContain("(I acknowledge this overlap)");
    // The label is associated with the checkbox, so the whole label is a tap target.
    const box = within(list).getByRole("checkbox");
    expect(list.querySelector(`label[for="${box.id}"]`)).not.toBeNull();
    // Single column by default, two columns from `sm`; identifiers wrap instead of overflowing.
    const grid = list.querySelector("dl");
    expect(grid?.className).toContain("sm:grid-cols-[auto_1fr]");
    expect(grid?.className).not.toMatch(/(^|\s)grid-cols-/);
    expect(list.querySelectorAll(".break-all").length).toBeGreaterThan(0);
    expect(list.innerHTML).not.toMatch(/w-\[\d{3,}px\]/);
  });
});
