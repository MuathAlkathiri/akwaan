import { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/features/content-engine-review/api";
import { ContentEngineReviewWorkspace } from "@/features/content-engine-review/content-engine-review-workspace";
import type { ReviewCandidate, ScreenFinding } from "@/features/content-engine-review/types";

/**
 * Phase 1 review workspace: queue + detail layout, the selected candidate in
 * the URL, focus on selection, J/K and Previous/Next navigation, progress, the
 * consolidated status and the decision bar. Review actions are unchanged.
 */

const FP_A = `ovl1:${"a".repeat(64)}`;

function WithQueryClient({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const assessment = {
  factualState: "SUPPORTED" as const,
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
};

const mockCandidate = (
  candidateId: string,
  prompt: string,
  overrides: Partial<ReviewCandidate> = {},
): ReviewCandidate => ({
  id: `id-${candidateId}`,
  candidateId,
  jobId: "job-100",
  status: "awaiting_review",
  reviewStatus: "pending",
  reviewRevision: 1,
  draft: {
    prompt: { ar: prompt },
    answerPayload: {
      mode: "multiple_choice",
      options: [
        { id: "a", label: { ar: "أ" } },
        { id: "b", label: { ar: "ب" } },
      ],
      correctOptionId: "a",
    },
  },
  authoring: { concept: "مفهوم" },
  factualClaims: ["ادعاء"],
  publishedContentItemId: null,
  findings: [],
  factVerification: { state: "SUPPORTED" },
  qualityEvaluation: null,
  compatibilityEvaluation: null,
  humanAssessment: assessment,
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

const QUEUE = [
  mockCandidate("cid-1", "السؤال الأول"),
  mockCandidate("cid-2", "السؤال الثاني"),
  mockCandidate("cid-3", "السؤال الثالث", { reviewStatus: "approved" }),
];

function renderWorkspace(candidates: ReviewCandidate[] = QUEUE) {
  vi.spyOn(api, "listCandidates").mockResolvedValue(candidates);
  const getCandidate = vi
    .spyOn(api, "getCandidate")
    .mockImplementation(
      async (id: string) => candidates.find((c) => c.candidateId === id) ?? candidates[0],
    );
  render(
    <WithQueryClient>
      <ContentEngineReviewWorkspace />
    </WithQueryClient>,
  );
  return { getCandidate };
}

const candidateParam = () =>
  new URLSearchParams(window.location.search).get("candidate");
const heading = () => screen.getByRole("heading", { level: 2, name: /السؤال/ });
const pressKey = (code: string, target: Element = document.body, init = {}) =>
  fireEvent.keyDown(target, { code, key: code.replace("Key", "").toLowerCase(), ...init });

async function openReview() {
  fireEvent.click(await screen.findByTestId("surface-tab-review"));
  await screen.findByTestId("candidate-row-cid-1");
}

describe("Content Engine Review — Phase 1 workspace layout", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "assessCandidate").mockImplementation(async (id) => ({ ...QUEUE.find((c) => c.candidateId === id)!, reviewRevision: 2 }));
    window.sessionStorage?.clear();
    window.history.replaceState(null, "", "/admin/content-engine");
    vi.spyOn(api, "getOverlapContentItem").mockRejectedValue(new Error("unavailable"));
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

  it("lays out the queue and the detail as separate regions, with an empty detail prompt", async () => {
    renderWorkspace();
    await openReview();
    const layout = screen.getByTestId("review-workspace-layout");
    expect(within(layout).getByRole("complementary", { name: "قائمة المرشحين" })).toBeInTheDocument();
    expect(screen.getByTestId("candidate-detail-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("decision-bar")).toBeNull();
  });

  it("selecting a candidate puts it in the URL, marks the row current and focuses its heading", async () => {
    renderWorkspace();
    await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-2"));

    expect(candidateParam()).toBe("cid-2");
    expect(screen.getByTestId("candidate-row-cid-2")).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("candidate-row-cid-1")).not.toHaveAttribute("aria-current");
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    expect(heading()).toHaveTextContent("السؤال الثاني");
    await screen.findByTestId("decision-bar");
    expect(screen.getByTestId("candidate-detail-header")).toHaveTextContent("السؤال الثاني");
    expect(screen.getByTestId("candidate-answer-presentation")).not.toHaveTextContent("السؤال الثاني");
  });

  it("restores the selection from a direct link without stealing focus", async () => {
    window.history.replaceState(null, "", "/admin/content-engine?candidate=cid-2");
    const { getCandidate } = renderWorkspace();

    // A candidate link opens the review surface even without `surface=review`.
    await screen.findByTestId("candidate-row-cid-2");
    await waitFor(() => expect(getCandidate).toHaveBeenCalledWith("cid-2"));
    expect(await screen.findByTestId("decision-bar")).toBeInTheDocument();
    expect(heading()).toHaveTextContent("السؤال الثاني");
    expect(screen.getByTestId("candidate-row-cid-2")).toHaveAttribute("aria-current", "true");
    expect(document.activeElement).toBe(document.body);
    expect(new URLSearchParams(window.location.search).get("surface")).toBe("review");
  });

  it("walks Back and Forward through the candidates that were opened", async () => {
    renderWorkspace();
    await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    fireEvent.click(screen.getByTestId("candidate-row-cid-2"));
    expect(candidateParam()).toBe("cid-2");

    window.history.back();
    await waitFor(() => expect(candidateParam()).toBe("cid-1"));
    await waitFor(() =>
      expect(screen.getByTestId("candidate-row-cid-1")).toHaveAttribute("aria-current", "true"),
    );
    expect(heading()).toHaveTextContent("السؤال الأول");

    window.history.forward();
    await waitFor(() =>
      expect(screen.getByTestId("candidate-row-cid-2")).toHaveAttribute("aria-current", "true"),
    );
  });

  it("navigates with Previous/Next and shows the position", async () => {
    renderWorkspace();
    await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-1"));

    expect(screen.getByTestId("candidate-position")).toHaveTextContent("المرشح 1 من 3");
    expect(screen.getByTestId("button-previous-candidate")).toBeDisabled();

    fireEvent.click(screen.getByTestId("button-next-candidate"));
    expect(candidateParam()).toBe("cid-2");
    expect(screen.getByTestId("candidate-position")).toHaveTextContent("المرشح 2 من 3");

    fireEvent.click(screen.getByTestId("button-next-candidate"));
    expect(screen.getByTestId("candidate-position")).toHaveTextContent("المرشح 3 من 3");
    expect(screen.getByTestId("button-next-candidate")).toBeDisabled();

    fireEvent.click(screen.getByTestId("button-previous-candidate"));
    expect(candidateParam()).toBe("cid-2");
    await waitFor(() => expect(document.activeElement).toBe(heading()));
  });

  it("moves with J and K, and J opens the first candidate when none is selected", async () => {
    renderWorkspace();
    await openReview();

    pressKey("KeyJ");
    expect(candidateParam()).toBe("cid-1");
    pressKey("KeyJ");
    expect(candidateParam()).toBe("cid-2");
    pressKey("KeyK");
    expect(candidateParam()).toBe("cid-1");
    // Already at the start: K does nothing.
    pressKey("KeyK");
    expect(candidateParam()).toBe("cid-1");
  });

  it("ignores J/K while typing, operating a control, with modifiers, or on key repeat", async () => {
    renderWorkspace();
    await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    await screen.findByTestId("decision-bar");

    pressKey("KeyJ", screen.getByPlaceholderText(/تفسير القرار/));
    pressKey("KeyJ", screen.getByLabelText("rejection reason"));
    pressKey("KeyJ", screen.getByTestId("button-next-candidate"));
    pressKey("KeyJ", document.body, { ctrlKey: true });
    pressKey("KeyJ", document.body, { metaKey: true });
    pressKey("KeyJ", document.body, { repeat: true });
    expect(candidateParam()).toBe("cid-1");

    pressKey("KeyJ");
    expect(candidateParam()).toBe("cid-2");
  });

  it("shows review progress for the current queue", async () => {
    renderWorkspace();
    await openReview();
    const progress = screen.getByTestId("review-progress");
    expect(progress).toHaveTextContent("تم البتّ في 1 من 3");
    expect(progress).toHaveTextContent("2 بانتظار القرار");
    const bar = within(progress).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "3");
  });

  it("shows one status per candidate in the queue and in the detail heading", async () => {
    renderWorkspace();
    await openReview();
    expect(screen.getByTestId("candidate-status-badge-cid-1")).toHaveTextContent("بانتظار المراجعة");
    expect(screen.getByTestId("candidate-status-badge-cid-3")).toHaveTextContent("معتمد");
    expect(screen.queryByTestId("candidate-pipeline-badge-cid-1")).toBeNull();
    expect(screen.queryByTestId("candidate-review-badge-cid-1")).toBeNull();

    fireEvent.click(screen.getByTestId("candidate-row-cid-3"));
    expect(await screen.findByTestId("candidate-detail-status")).toHaveTextContent("معتمد");
  });

  it("keeps every decision control in the decision bar and says what approval is waiting for", async () => {
    renderWorkspace([
      mockCandidate("cid-1", "السؤال الأول", {
        findings: [
          {
            code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT",
            severity: "warning",
            message: "Potential overlap with CANONICAL_READY item item-a: same",
            fingerprint: FP_A,
            evidence: {
              candidateContentHash: "c".repeat(64),
              reasonCode: "SAME_TARGET_DIFFERENT_TASK",
              reference: { kind: "CANONICAL_READY", id: "item-a", contentHash: "r".repeat(64) },
            },
          } satisfies ScreenFinding,
        ],
      }),
    ]);
    await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    const bar = await screen.findByTestId("decision-bar");

    for (const id of [
      "button-approve-candidate",
      "button-reject-candidate",
      "button-create-canonical-draft",
    ]) {
      expect(within(bar).getByTestId(id)).toBeInTheDocument();
      expect(screen.getAllByTestId(id)).toHaveLength(1);
    }
    expect(within(bar).getByLabelText("rejection reason")).toBeInTheDocument();

    const summary = within(bar).getByTestId("decision-bar-summary");
    expect(summary).toHaveTextContent("قبل الاعتماد (2)");
    expect(within(bar).getByTestId("button-approve-candidate")).toBeDisabled();

    // "Show all requirements" moves focus to the full requirements panel.
    fireEvent.click(within(bar).getByTestId("button-show-decision-requirements"));
    expect(document.activeElement).toBe(screen.getByTestId("approval-eligibility-panel"));

    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), {
      target: { value: "راجعت التقاطع" },
    });
    expect(summary).toHaveTextContent("قبل الاعتماد (1)");
    fireEvent.click(screen.getByTestId("overlap-ack-checkbox-item-a"));
    expect(summary).toHaveTextContent("جاهز للاعتماد.");
    expect(within(bar).getByTestId("button-approve-candidate")).toBeEnabled();
  });

  it("approves from the decision bar with exactly the same payload as before", async () => {
    renderWorkspace();
    await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    await screen.findByTestId("decision-bar");
    const approve = vi.spyOn(api, "approveCandidate").mockResolvedValue(QUEUE[0]);

    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), {
      target: { value: "سؤال سليم" },
    });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));

    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    expect(approve.mock.calls[0]).toEqual([
      "cid-1",
      { expectedRevision: 2, explanation: "سؤال سليم" },
    ]);
  });

  it("states the settled outcome instead of requirements for a decided candidate", async () => {
    renderWorkspace();
    await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-3"));
    const bar = await screen.findByTestId("decision-bar");
    expect(within(bar).getByTestId("decision-bar-summary")).toHaveTextContent("اعتُمد هذا المرشح");
  });

  describe("safety: candidate-scoped state never crosses selections", () => {
    const explanation = () =>
      screen.getByPlaceholderText(/تفسير القرار/) as HTMLTextAreaElement;
    const reason = () => screen.getByLabelText("rejection reason") as HTMLSelectElement;
    const conflict = (code: string, details: Record<string, unknown> = {}) => ({
      response: { status: 409, data: { code, message: "conflict", details } },
    });

    it("starts every candidate with an empty decision note and the unselected rejection reason", async () => {
      renderWorkspace();
      await openReview();
      fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
      await screen.findByTestId("decision-bar");
      fireEvent.change(explanation(), { target: { value: "ملاحظة عن الأول" } });
      fireEvent.change(reason(), { target: { value: "FACTUAL_ERROR" } });

      pressKey("KeyJ");
      await waitFor(() => expect(heading()).toHaveTextContent("السؤال الثاني"));
      await screen.findByTestId("decision-bar");
      expect(explanation().value).toBe("");
      expect(reason().value).toBe("");
    });

    it("approves the candidate on screen with its own note after navigating", async () => {
      renderWorkspace();
      await openReview();
      fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
      await screen.findByTestId("decision-bar");
      fireEvent.change(explanation(), { target: { value: "ملاحظة عن الأول" } });
      pressKey("KeyJ");
      await waitFor(() => expect(heading()).toHaveTextContent("السؤال الثاني"));
      await screen.findByTestId("decision-bar");

      const approve = vi.spyOn(api, "approveCandidate").mockResolvedValue(QUEUE[1]);
      expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
      fireEvent.change(explanation(), { target: { value: "ملاحظة عن الثاني" } });
      fireEvent.click(screen.getByTestId("button-approve-candidate"));
      await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
      expect(approve.mock.calls[0]).toEqual([
        "cid-2",
        { expectedRevision: 2, explanation: "ملاحظة عن الثاني" },
      ]);
    });

    it("keeps a late failure for the previous candidate off the newly selected one", async () => {
      renderWorkspace();
      await openReview();
      fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
      await screen.findByTestId("decision-bar");
      let fail!: (reason: unknown) => void;
      vi.spyOn(api, "approveCandidate").mockImplementation(
        () => new Promise((_resolve, reject) => (fail = reject)),
      );
      fireEvent.change(explanation(), { target: { value: "سليم" } });
      fireEvent.click(screen.getByTestId("button-approve-candidate"));

      await waitFor(() => expect(fail).toBeTypeOf("function"));
      // The reviewer moves on before the server answers.
      pressKey("KeyJ");
      await waitFor(() => expect(heading()).toHaveTextContent("السؤال الثاني"));
      await screen.findByTestId("decision-bar");

      fail(conflict("REVISION_CONFLICT"));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByTestId("revision-conflict-banner")).toBeNull();
      expect(screen.queryByTestId("review-action-error")).toBeNull();
    });

    it("never attaches another candidate's refreshed overlap evidence", async () => {
      const withOverlap = (id: string, prompt: string, fpChar: string) =>
        mockCandidate(id, prompt, {
          findings: [
            {
              code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT",
              severity: "warning",
              message: `Potential overlap with CANONICAL_READY item ref-${id}: same`,
              fingerprint: `ovl1:${fpChar.repeat(64)}`,
              evidence: {
                candidateContentHash: "c".repeat(64),
                reasonCode: "SAME_TARGET_DIFFERENT_TASK",
                reference: { kind: "CANONICAL_READY", id: `ref-${id}`, contentHash: "r".repeat(64) },
              },
            },
          ],
        });
      renderWorkspace([
        withOverlap("cid-1", "السؤال الأول", "a"),
        withOverlap("cid-2", "السؤال الثاني", "b"),
      ]);
      await openReview();
      fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
      await screen.findByTestId("decision-bar");
      let fail!: (reason: unknown) => void;
      vi.spyOn(api, "approveCandidate").mockImplementation(
        () => new Promise((_resolve, reject) => (fail = reject)),
      );
      fireEvent.change(explanation(), { target: { value: "سليم" } });
      fireEvent.click(screen.getByTestId("overlap-ack-checkbox-ref-cid-1"));
      fireEvent.click(screen.getByTestId("button-approve-candidate"));
      await waitFor(() => expect(fail).toBeTypeOf("function"));

      pressKey("KeyJ");
      await waitFor(() => expect(heading()).toHaveTextContent("السؤال الثاني"));
      await screen.findByTestId("overlap-requirement-ref-cid-2");

      fail(
        conflict("OVERLAP_ACKNOWLEDGMENT_REQUIRED", {
          overlaps: [
            {
              fingerprint: `ovl1:${"e".repeat(64)}`,
              code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT",
              reference: { kind: "CANONICAL_READY", id: "ref-from-cid-1" },
            },
          ],
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      // cid-2 still shows its own evidence only, with nothing refreshed onto it.
      expect(screen.queryByTestId("overlap-requirement-ref-from-cid-1")).toBeNull();
      expect(screen.getByTestId("overlap-requirement-ref-cid-2")).toBeInTheDocument();
      expect(screen.queryByTestId("overlap-evidence-refreshed")).toBeNull();
      expect(screen.queryByTestId("review-action-error")).toBeNull();
    });

    it("never lets a slow response for a previous candidate replace the current one", async () => {
      vi.spyOn(api, "listCandidates").mockResolvedValue(QUEUE);
      let releaseFirst!: () => void;
      vi.spyOn(api, "getCandidate").mockImplementation((id: string) => {
        const found = QUEUE.find((c) => c.candidateId === id)!;
        if (id !== "cid-1") return Promise.resolve(found);
        return new Promise((resolve) => (releaseFirst = () => resolve(found)));
      });
      render(
        <WithQueryClient>
          <ContentEngineReviewWorkspace />
        </WithQueryClient>,
      );
      await openReview();
      fireEvent.click(screen.getByTestId("candidate-row-cid-1")); // slow
      fireEvent.click(screen.getByTestId("candidate-row-cid-2")); // fast
      await screen.findByTestId("decision-bar");
      releaseFirst();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(candidateParam()).toBe("cid-2");
      expect(heading()).toHaveTextContent("السؤال الثاني");
      const approve = vi.spyOn(api, "approveCandidate").mockResolvedValue(QUEUE[1]);
      fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), {
        target: { value: "سليم" },
      });
      fireEvent.click(screen.getByTestId("button-approve-candidate"));
      await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
      expect(approve.mock.calls[0][0]).toBe("cid-2");
    });

    it("handles a linked candidate that does not exist", async () => {
      window.history.replaceState(null, "", "/admin/content-engine?candidate=does-not-exist");
      vi.spyOn(api, "listCandidates").mockResolvedValue(QUEUE);
      vi.spyOn(api, "getCandidate").mockImplementation(async (id: string) => {
        const found = QUEUE.find((c) => c.candidateId === id);
        if (!found) throw Object.assign(new Error("Not found"), { response: { status: 404 } });
        return found;
      });
      render(
        <WithQueryClient>
          <ContentEngineReviewWorkspace />
        </WithQueryClient>,
      );
      expect(await screen.findByTestId("candidate-detail-error")).toBeInTheDocument();
      expect(screen.queryByTestId("decision-bar")).toBeNull();
      expect(screen.getByTestId("candidate-position")).toHaveTextContent("خارج القائمة الحالية");

      // The queue still works: J opens its first candidate.
      await screen.findByTestId("candidate-row-cid-1");
      pressKey("KeyJ");
      expect(candidateParam()).toBe("cid-1");
      expect(await screen.findByTestId("decision-bar")).toBeInTheDocument();
    });

    it("shows a linked candidate that the current filter excludes, outside the queue", async () => {
      const hidden = mockCandidate("cid-hidden", "سؤال خارج التصفية");
      window.history.replaceState(null, "", "/admin/content-engine?candidate=cid-hidden");
      vi.spyOn(api, "listCandidates").mockResolvedValue(QUEUE);
      vi.spyOn(api, "getCandidate").mockImplementation(
        async (id: string) => [...QUEUE, hidden].find((c) => c.candidateId === id)!,
      );
      render(
        <WithQueryClient>
          <ContentEngineReviewWorkspace />
        </WithQueryClient>,
      );
      await screen.findByTestId("decision-bar");
      expect(
        screen.getByRole("heading", { level: 2, name: "سؤال خارج التصفية" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("candidate-position")).toHaveTextContent("خارج القائمة الحالية");
      expect(screen.getByTestId("button-previous-candidate")).toBeDisabled();
      fireEvent.click(screen.getByTestId("button-next-candidate"));
      expect(candidateParam()).toBe("cid-1");
    });

    it("closes the candidate editor when Back changes the selection", async () => {
      renderWorkspace();
      await openReview();
      fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
      fireEvent.click(screen.getByTestId("candidate-row-cid-2"));
      await screen.findByTestId("decision-bar");
      fireEvent.click(await screen.findByTestId("button-open-candidate-editor"));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      window.history.back();
      await waitFor(() => expect(candidateParam()).toBe("cid-1"));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
  });

  it("blocks approval when duplicate screening is blocking", async () => {
    renderWorkspace([mockCandidate("cid-1", "السؤال الأول", { findings: [{ code: "PROVEN_DUPLICATE_IN_SCOPE", severity: "blocking", message: "duplicate" }] })]);
    await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    await screen.findByTestId("decision-bar");
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "سليم" } });
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
  });

  it("keeps candidate B unchanged when assessment for A completes late", async () => {
    renderWorkspace(); await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-1")); await screen.findByTestId("decision-bar");
    let finish!: (candidate: ReviewCandidate) => void;
    vi.mocked(api.assessCandidate).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const approve = vi.spyOn(api, "approveCandidate").mockResolvedValue(QUEUE[0]);
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار الأول" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    pressKey("KeyJ"); await waitFor(() => expect(heading()).toHaveTextContent("السؤال الثاني"));
    await screen.findByTestId("decision-bar");
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار الثاني" } });
    finish({ ...QUEUE[0], reviewRevision: 2 });
    await waitFor(() => expect(approve).toHaveBeenCalledWith("cid-1", { expectedRevision: 2, explanation: "قرار الأول" }));
    expect(screen.getByPlaceholderText(/تفسير القرار/)).toHaveValue("قرار الثاني");
    expect(screen.getByLabelText("rejection reason")).toHaveValue("");
  });

  it("distinguishes a failed list from an empty list and permits retry", async () => {
    const list = vi.spyOn(api, "listCandidates").mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    render(<WithQueryClient><ContentEngineReviewWorkspace /></WithQueryClient>);
    fireEvent.click(await screen.findByTestId("surface-tab-review"));
    expect(await screen.findByText(/تعذر تحميل المرشحين/)).toBeVisible();
    expect(screen.queryByText("لا توجد مرشحات مطابقة.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText("لا توجد مرشحات مطابقة.")).toBeVisible();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("requires explicit scores for new assessments", async () => {
    renderWorkspace([mockCandidate("cid-1", "السؤال الأول", { humanAssessment: null })]);
    await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    await screen.findByTestId("decision-bar");
    const scores = screen.getAllByRole("spinbutton");
    expect(scores).toHaveLength(5);
    scores.forEach((score) => expect(score).toHaveValue(null));
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
  });

  it("does not approve if assessment saving fails", async () => {
    renderWorkspace();
    await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    await screen.findByTestId("decision-bar");
    vi.mocked(api.assessCandidate).mockRejectedValueOnce(new Error("assessment failed"));
    const approve = vi.spyOn(api, "approveCandidate");
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "سليم" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await waitFor(() => expect(api.assessCandidate).toHaveBeenCalledOnce());
    expect(approve).not.toHaveBeenCalled();
  });

  it("saves the assessment before approval and submits only once", async () => {
    renderWorkspace(); await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    await screen.findByTestId("decision-bar");
    let release!: (value: ReviewCandidate) => void;
    vi.mocked(api.assessCandidate).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const approve = vi.spyOn(api, "approveCandidate").mockResolvedValue(QUEUE[0]);
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "سليم" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await waitFor(() => expect(api.assessCandidate).toHaveBeenCalledTimes(1));
    expect(approve).not.toHaveBeenCalled();
    release({ ...QUEUE[0], reviewRevision: 2 });
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    expect(approve).toHaveBeenCalledWith("cid-1", { expectedRevision: 2, explanation: "سليم" });
  });

  it("reports an approval failure after saving the assessment", async () => {
    renderWorkspace(); await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    await screen.findByTestId("decision-bar");
    vi.spyOn(api, "approveCandidate").mockRejectedValueOnce({ response: { status: 400, data: { message: "approval failed" } } });
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "سليم" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await waitFor(() => expect(api.assessCandidate).toHaveBeenCalledOnce());
    expect(await screen.findByText(/حُفظ التقييم، لكن لم يكتمل الاعتماد/)).toBeVisible();
    expect(screen.queryByTestId("approval-outcome-unknown")).toBeNull();
  });

  it.each([false, true])("retries a saved assessment with edited=%s and the correct revision", async (edited) => {
    let server = { ...QUEUE[0] };
    renderWorkspace();
    vi.mocked(api.getCandidate).mockImplementation(async () => server);
    vi.mocked(api.assessCandidate).mockImplementation(async (_id, payload) => {
      server = { ...server, reviewRevision: server.reviewRevision + 1, humanAssessment: { ...assessment, factualExplanation: payload.factualExplanation, quality: payload.quality, assessedRevision: server.reviewRevision + 1 } };
      return server;
    });
    const approve = vi.spyOn(api, "approveCandidate").mockRejectedValueOnce({ response: { status: 400, data: { message: "temporary failure" } } }).mockImplementationOnce(async () => { server = { ...server, reviewStatus: "approved" }; return server; });
    await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1")); await screen.findByTestId("decision-bar");
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    expect(await screen.findByText(/حُفظ التقييم، لكن لم يكتمل الاعتماد/)).toBeVisible();
    expect(server.reviewStatus).toBe("pending"); expect(server.reviewRevision).toBe(2);
    await waitFor(() => expect(screen.getByTestId("button-approve-candidate")).toBeEnabled());
    if (edited) fireEvent.change(screen.getByPlaceholderText(/تفسير التحقق الواقعي/), { target: { value: "موثق مجدداً" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(2));
    expect(api.assessCandidate).toHaveBeenCalledTimes(edited ? 2 : 1);
    if (edited) expect(vi.mocked(api.assessCandidate).mock.calls[1][1]).toMatchObject({ expectedRevision: 2, factualExplanation: "موثق مجدداً" });
    expect(approve).toHaveBeenNthCalledWith(2, "cid-1", { expectedRevision: edited ? 3 : 2, explanation: "قرار" });
    await waitFor(() => expect(server.reviewStatus).toBe("approved"));
  });

  it("leaves the assessment saved and candidate pending when retry also fails", async () => {
    let server = { ...QUEUE[0] };
    renderWorkspace(); vi.mocked(api.getCandidate).mockImplementation(async () => server);
    vi.mocked(api.assessCandidate).mockImplementation(async () => { server = { ...server, reviewRevision: 2, humanAssessment: { ...assessment, assessedRevision: 2 } }; return server; });
    const approve = vi.spyOn(api, "approveCandidate").mockRejectedValue({ response: { status: 400, data: { message: "temporary failure" } } });
    await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1")); await screen.findByTestId("decision-bar");
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await screen.findByText(/حُفظ التقييم، لكن لم يكتمل الاعتماد/);
    await waitFor(() => expect(screen.getByTestId("button-approve-candidate")).toBeEnabled());
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(2));
    expect(api.assessCandidate).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenNthCalledWith(2, "cid-1", { expectedRevision: 2, explanation: "قرار" });
    expect(server.reviewStatus).toBe("pending"); expect(server.reviewRevision).toBe(2);
    expect(await screen.findByText(/حُفظ التقييم، لكن لم يكتمل الاعتماد/)).toBeVisible();
  });

  it("refreshes revision conflicts and requires explicit review before retry", async () => {
    let server = { ...QUEUE[0] };
    renderWorkspace(); vi.mocked(api.getCandidate).mockImplementation(async () => server);
    vi.mocked(api.assessCandidate).mockImplementation(async () => { server = { ...server, reviewRevision: 2, humanAssessment: { ...assessment, assessedRevision: 2 } }; return server; });
    const approve = vi.spyOn(api, "approveCandidate").mockImplementationOnce(async () => { server = { ...server, reviewRevision: 3 }; throw { response: { status: 409, data: { code: "REVISION_CONFLICT", message: "revision conflict", details: { currentRevision: 3 } } } }; });
    await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1")); await screen.findByTestId("decision-bar");
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    expect(await screen.findByTestId("revision-conflict-banner")).toBeVisible();
    await waitFor(() => expect(vi.mocked(api.getCandidate).mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
    expect(server.reviewStatus).toBe("pending");
  });

  it("requires acknowledgment of newly returned overlap evidence before retry", async () => {
    let server = { ...QUEUE[0], findings: [{ code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT", severity: "warning" as const, message: "old", fingerprint: FP_A, evidence: { candidateContentHash: "c".repeat(64), reasonCode: "UNCERTAIN_FACTUAL_RELATIONSHIP", reference: { kind: "CANONICAL_READY", id: "old-ref", contentHash: "r".repeat(64) } } }] };
    renderWorkspace(); vi.mocked(api.getCandidate).mockImplementation(async () => server);
    vi.mocked(api.assessCandidate).mockImplementation(async () => { server = { ...server, reviewRevision: 2, humanAssessment: { ...assessment, assessedRevision: 2 } }; return server; });
    const fingerprint = `ovl1:${"e".repeat(64)}`;
    const approve = vi.spyOn(api, "approveCandidate").mockRejectedValueOnce({ response: { status: 409, data: { code: "OVERLAP_ACKNOWLEDGMENT_REQUIRED", message: "new overlap", details: { overlaps: [{ fingerprint, code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT", reference: { kind: "CANONICAL_READY", id: "new-ref" } }] } } } }).mockResolvedValueOnce({ ...QUEUE[0], reviewStatus: "approved", reviewRevision: 3 });
    await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1")); await screen.findByTestId("decision-bar");
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    fireEvent.click(screen.getByTestId("overlap-ack-checkbox-old-ref"));
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    expect(await screen.findByTestId("overlap-requirement-new-ref")).toBeInTheDocument();
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
    const checkbox = screen.getByTestId("overlap-ack-checkbox-new-ref");
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    fireEvent.click(checkbox); fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(2));
    expect(approve).toHaveBeenNthCalledWith(1, "cid-1", { expectedRevision: 2, explanation: "قرار", overlapAcknowledgments: [{ fingerprint: FP_A }] });
    expect(approve).toHaveBeenNthCalledWith(2, "cid-1", { expectedRevision: 2, explanation: "قرار", overlapAcknowledgments: [{ fingerprint }] });
    expect(api.assessCandidate).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("preserves all evidence and claim associations when edited=%s", async (edited) => {
    const evidence = [{ url: "https://one.example/test", title: "one", note: "first", claimIndex: 1, claimText: "claim two" }, { url: "https://two.example/test", title: "two", claimIndex: 0, claimText: "claim one" }];
    const item = mockCandidate("cid-1", "السؤال الأول", { factualClaims: ["claim one", "claim two"], humanAssessment: { ...assessment, evidence } });
    renderWorkspace([item]); vi.mocked(api.assessCandidate).mockResolvedValue({ ...item, reviewRevision: 2 });
    vi.spyOn(api, "approveCandidate").mockResolvedValue({ ...item, reviewStatus: "approved", reviewRevision: 3 });
    await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1")); await screen.findByTestId("decision-bar");
    if (edited) {
      fireEvent.change(screen.getByPlaceholderText(/شرح معيار الجودة/), { target: { value: "جودة جديدة" } });
      fireEvent.change(screen.getByPlaceholderText(/رابط الدليل/), { target: { value: "https://edited.example/test" } });
    }
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await waitFor(() => expect(api.assessCandidate).toHaveBeenCalledOnce());
    expect(vi.mocked(api.assessCandidate).mock.calls[0][1].evidence).toEqual(edited ? [{ ...evidence[0], url: "https://edited.example/test" }, evidence[1]] : evidence);
  });

  it("preserves unsaved edits and blocks approval on a newer same-candidate revision until explicitly reloaded", async () => {
    let server = { ...QUEUE[0] };
    renderWorkspace(); vi.mocked(api.getCandidate).mockImplementation(async () => server);
    vi.mocked(api.assessCandidate).mockImplementation(async () => { server = { ...server, reviewRevision: 2, humanAssessment: { ...assessment, assessedRevision: 2, factualExplanation: "تقييم مراجع آخر" } }; throw { response: { status: 409, data: { message: "Candidate changed; reload before reviewing", currentRevision: 2 } } }; });
    await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1")); await screen.findByTestId("decision-bar");
    fireEvent.change(screen.getByPlaceholderText(/تفسير التحقق الواقعي/), { target: { value: "تعديل غير محفوظ" } });
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    expect(await screen.findByTestId("assessment-stale-conflict")).toBeVisible();
    expect(screen.getByPlaceholderText(/تفسير التحقق الواقعي/)).toHaveValue("تعديل غير محفوظ");
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /تحميل أحدث تقييم والتخلي/ }));
    await waitFor(() => expect(screen.getByPlaceholderText(/تفسير التحقق الواقعي/)).toHaveValue("تقييم مراجع آخر"));
  });

  it("preserves multi-claim evidence through conflict, refreshed overlap and explicit retry", async () => {
    const evidence = [{ url: "https://one.example/source", title: "first", claimIndex: 1, claimText: "claim two" }, { url: "https://two.example/source", note: "second", claimIndex: 0, claimText: "claim one" }];
    const finding = (id: string, fingerprint: string): ScreenFinding => ({ code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT", severity: "warning", message: "overlap", fingerprint, evidence: { candidateContentHash: "c".repeat(64), reasonCode: "UNCERTAIN_FACTUAL_RELATIONSHIP", reference: { kind: "CANONICAL_READY", id, contentHash: "r".repeat(64) } } });
    const nextFingerprint = `ovl1:${"e".repeat(64)}`;
    let server = mockCandidate("cid-1", "السؤال الأول", { factualClaims: ["claim one", "claim two"], humanAssessment: { ...assessment, evidence }, findings: [finding("old-ref", FP_A)] });
    renderWorkspace([server]); vi.mocked(api.getCandidate).mockImplementation(async () => server);
    vi.mocked(api.assessCandidate).mockImplementation(async (_id, payload) => {
      server = { ...server, reviewRevision: server.reviewRevision + 1, humanAssessment: { ...assessment, evidence: payload.evidence, quality: payload.quality, factualExplanation: payload.factualExplanation, assessedRevision: server.reviewRevision + 1 } }; return server;
    });
    let rejectPending!: (error: unknown) => void;
    const approve = vi.spyOn(api, "approveCandidate").mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectPending = reject; })).mockImplementationOnce(async () => { server = { ...server, reviewRevision: 4, reviewStatus: "approved" }; return server; });
    await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1")); await screen.findByTestId("decision-bar");
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    fireEvent.click(screen.getByTestId("overlap-ack-checkbox-old-ref"));
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText(/تفسير التحقق الواقعي/), { target: { value: "تعديل غير محفوظ" } });
    server = { ...server, reviewRevision: 3, humanAssessment: { ...server.humanAssessment!, assessedRevision: 3 }, findings: [finding("new-ref", nextFingerprint)] };
    rejectPending({ response: { status: 409, data: { message: "Candidate changed; reload before reviewing", currentRevision: 3 } } });
    expect(await screen.findByTestId("assessment-stale-conflict")).toBeVisible();
    expect(screen.getByPlaceholderText(/تفسير التحقق الواقعي/)).toHaveValue("تعديل غير محفوظ");
    expect(server.humanAssessment!.evidence).toEqual(evidence);
    expect(approve).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /تحميل أحدث تقييم والتخلي/ }));
    await waitFor(() => expect(screen.getByPlaceholderText(/تفسير التحقق الواقعي/)).toHaveValue(assessment.factualExplanation));
    expect(await screen.findByTestId("overlap-requirement-new-ref")).toBeVisible();
    expect(screen.getByTestId("overlap-ack-checkbox-new-ref")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
    fireEvent.click(screen.getByTestId("overlap-ack-checkbox-new-ref"));
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.assessCandidate)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.assessCandidate).mock.calls[0][1].evidence).toEqual(evidence);
    expect(approve).toHaveBeenNthCalledWith(2, "cid-1", { expectedRevision: 3, explanation: "قرار", overlapAcknowledgments: [{ fingerprint: nextFingerprint }] });
    expect(server.humanAssessment!.evidence).toEqual(evidence); expect(server.reviewStatus).toBe("approved");
  });

  it.each(["approved", "pending", "unavailable"] as const)("reconciles an unknown approval result: %s", async (outcome) => {
    const evidence = [{ url: "https://one.example/test", claimIndex: 1, claimText: "claim two" }, { url: "https://two.example/test", claimIndex: 0, claimText: "claim one" }];
    let server = mockCandidate("cid-1", "السؤال الأول", { factualClaims: ["claim one", "claim two"], humanAssessment: { ...assessment, evidence } });
    let failRead = false;
    renderWorkspace([server]); vi.mocked(api.getCandidate).mockImplementation(async () => { if (failRead) throw new Error("offline"); return server; });
    vi.mocked(api.assessCandidate).mockImplementation(async (_id, data) => { server = { ...server, reviewRevision: 2, humanAssessment: { ...assessment, evidence: data.evidence, assessedRevision: 2 } }; return server; });
    const approve = vi.spyOn(api, "approveCandidate").mockImplementation(async () => { if (outcome === "approved") server = { ...server, reviewRevision: 3, reviewStatus: "approved" }; if (outcome === "unavailable") failRead = true; throw new Error("connection lost"); });
    await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1")); await screen.findByTestId("decision-bar");
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    expect(await screen.findByTestId("approval-outcome-unknown")).toBeVisible();
    expect(screen.queryByText(/حُفظ التقييم، لكن لم يكتمل الاعتماد/)).toBeNull();
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
    expect(screen.getByTestId("button-reject-candidate")).toBeDisabled();
    expect(server.humanAssessment!.evidence).toEqual(evidence);
    fireEvent.click(screen.getByRole("button", { name: "التحقق من حالة الاعتماد" }));
    if (outcome === "unavailable") {
      await waitFor(() => expect(screen.getByRole("button", { name: "التحقق من حالة الاعتماد" })).toBeEnabled());
      expect(screen.getByTestId("approval-outcome-unknown")).toBeVisible();
      expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
    } else {
      await waitFor(() => expect(screen.queryByTestId("approval-outcome-unknown")).toBeNull());
      expect(server.reviewStatus).toBe(outcome);
    }
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("shows fresh overlap evidence after verifying an unknown pending result", async () => {
    let server = { ...QUEUE[0] };
    renderWorkspace(); vi.mocked(api.getCandidate).mockImplementation(async () => server);
    vi.mocked(api.assessCandidate).mockImplementation(async () => { server = { ...server, reviewRevision: 2, humanAssessment: { ...assessment, assessedRevision: 2 } }; return server; });
    const fingerprint = `ovl1:${"f".repeat(64)}`;
    const approve = vi.spyOn(api, "approveCandidate").mockImplementation(async () => { server = { ...server, findings: [{ code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT", severity: "warning", message: "overlap", fingerprint, evidence: { candidateContentHash: "c".repeat(64), reasonCode: "UNCERTAIN_FACTUAL_RELATIONSHIP", reference: { kind: "CANONICAL_READY", id: "new-ref", contentHash: "r".repeat(64) } } }] }; throw new Error("connection lost"); });
    await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1")); await screen.findByTestId("decision-bar");
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate")); await screen.findByTestId("approval-outcome-unknown");
    fireEvent.click(screen.getByRole("button", { name: "التحقق من حالة الاعتماد" }));
    await screen.findByTestId("overlap-requirement-new-ref");
    expect(screen.getByTestId("overlap-ack-checkbox-new-ref")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled(); expect(approve).toHaveBeenCalledTimes(1);
  });

  it("keeps verification of A from changing candidate B", async () => {
    renderWorkspace(); let release!: (candidate: ReviewCandidate) => void; let verify = false;
    vi.mocked(api.getCandidate).mockImplementation(async (id) => id === "cid-1" && verify ? new Promise((resolve) => { release = resolve; }) : QUEUE.find(c => c.candidateId === id)!);
    vi.spyOn(api, "approveCandidate").mockRejectedValueOnce(new Error("connection lost"));
    await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1")); await screen.findByTestId("decision-bar");
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate")); await screen.findByTestId("approval-outcome-unknown");
    verify = true; fireEvent.click(screen.getByRole("button", { name: "التحقق من حالة الاعتماد" }));
    await waitFor(() => expect(release).toBeTypeOf("function")); pressKey("KeyJ");
    await waitFor(() => expect(heading()).toHaveTextContent("السؤال الثاني")); await screen.findByTestId("decision-bar");
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار ب" } });
    release({ ...QUEUE[0], reviewStatus: "approved", reviewRevision: 3 });
    await waitFor(() => expect(screen.getByPlaceholderText(/تفسير القرار/)).toHaveValue("قرار ب"));
    expect(screen.queryByTestId("approval-outcome-unknown")).toBeNull();
    expect(heading()).toHaveTextContent("السؤال الثاني");
  });

  it.each(["approved", "pending"] as const)("requires a network verification after remount when storage throws: %s", async (outcome) => {
    const nativeGet = Storage.prototype.getItem;
    const nativeSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) { if (key === "akwaan.contentEngine.unknownApprovals") throw new Error("storage unavailable"); return nativeGet.call(this, key); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) { if (key === "akwaan.contentEngine.unknownApprovals") throw new Error("storage unavailable"); return nativeSet.call(this, key, value); });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    client.setQueryData(["content-engine-review-detail", "cid-1"], QUEUE[0]);
    vi.spyOn(api, "listCandidates").mockResolvedValue(QUEUE);
    const get = vi.spyOn(api, "getCandidate").mockResolvedValueOnce(QUEUE[0]);
    vi.spyOn(api, "approveCandidate").mockRejectedValueOnce(new Error("response lost"));
    window.history.replaceState(null, "", "/admin/content-engine?surface=review&candidate=cid-1");
    const view = render(<QueryClientProvider client={client}><ContentEngineReviewWorkspace /></QueryClientProvider>);
    await screen.findByTestId("approval-outcome-unknown");
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "التحقق من حالة الاعتماد" }));
    await waitFor(() => expect(screen.queryByTestId("approval-outcome-unknown")).toBeNull());
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await screen.findByTestId("approval-outcome-unknown");
    view.unmount();
    get.mockRejectedValueOnce(new Error("offline"));
    render(<QueryClientProvider client={client}><ContentEngineReviewWorkspace /></QueryClientProvider>);
    await screen.findByTestId("approval-outcome-unknown");
    expect(get).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
    expect(screen.getByTestId("button-reject-candidate")).toBeDisabled();
    expect(screen.getByTestId("button-create-canonical-draft")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "التحقق من حالة الاعتماد" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("approval-outcome-unknown")).toBeVisible();
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
    get.mockResolvedValueOnce({ ...QUEUE[0], reviewRevision: 2, reviewStatus: outcome });
    fireEvent.click(await screen.findByRole("button", { name: "التحقق من حالة الاعتماد" }));
    await waitFor(() => expect(screen.queryByTestId("approval-outcome-unknown")).toBeNull());
    expect(get).toHaveBeenCalledTimes(3);
    expect(api.approveCandidate).toHaveBeenCalledTimes(1);
    if (outcome === "approved") expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
  });

  it("keeps storage-fallback verification candidate-specific", async () => {
    const nativeGet = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) { if (key === "akwaan.contentEngine.unknownApprovals") throw new Error("storage unavailable"); return nativeGet.call(this, key); });
    renderWorkspace(); await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    await screen.findByTestId("approval-outcome-unknown");
    fireEvent.click(screen.getByRole("button", { name: "التحقق من حالة الاعتماد" }));
    await waitFor(() => expect(screen.queryByTestId("approval-outcome-unknown")).toBeNull());
    pressKey("KeyJ"); await waitFor(() => expect(heading()).toHaveTextContent("السؤال الثاني"));
    expect(await screen.findByTestId("approval-outcome-unknown")).toBeVisible();
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "التحقق من حالة الاعتماد" }));
    await waitFor(() => expect(screen.queryByTestId("approval-outcome-unknown")).toBeNull());
    pressKey("KeyK"); await waitFor(() => expect(heading()).toHaveTextContent("السؤال الأول"));
    await screen.findByTestId("decision-bar");
    expect(screen.queryByTestId("approval-outcome-unknown")).toBeNull();
  });

  it("allows B to verify while A verification remains pending", async () => {
    const nativeGet = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) { if (key === "akwaan.contentEngine.unknownApprovals") throw new Error("storage unavailable"); return nativeGet.call(this, key); });
    renderWorkspace(); await openReview(); fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    await screen.findByTestId("approval-outcome-unknown");
    let release!: (candidate: ReviewCandidate) => void;
    vi.mocked(api.getCandidate).mockImplementation((id) => id === "cid-1" ? new Promise((resolve) => { release = resolve; }) : Promise.resolve(QUEUE[1]));
    fireEvent.click(screen.getByRole("button", { name: "التحقق من حالة الاعتماد" }));
    await waitFor(() => expect(release).toBeTypeOf("function"));
    pressKey("KeyJ"); await waitFor(() => expect(heading()).toHaveTextContent("السؤال الثاني"));
    await screen.findByTestId("approval-outcome-unknown");
    fireEvent.click(screen.getByRole("button", { name: "التحقق من حالة الاعتماد" }));
    await waitFor(() => expect(screen.queryByTestId("approval-outcome-unknown")).toBeNull());
    expect(vi.mocked(api.getCandidate)).toHaveBeenCalledWith("cid-2");
    release(QUEUE[0]);
  });

  it("requires a rejection reason and confirmation", async () => {
    renderWorkspace();
    await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    await screen.findByTestId("decision-bar");
    const reject = vi.spyOn(api, "rejectCandidate").mockResolvedValue(QUEUE[0]);
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "سبب" } });
    expect(screen.getByTestId("button-reject-candidate")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("rejection reason"), { target: { value: "FACTUAL_ERROR" } });
    fireEvent.click(screen.getByTestId("button-reject-candidate"));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("السؤال الأول");
    expect(dialog).toHaveTextContent("FACTUAL_ERROR");
    fireEvent.click(within(dialog).getByText("إلغاء"));
    expect(reject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("button-reject-candidate"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByText("تأكيد الرفض"));
    await waitFor(() => expect(reject).toHaveBeenCalledWith("cid-1", { expectedRevision: 1, reasonCode: "FACTUAL_ERROR", explanation: "سبب" }));
  });

  it("removes the candidate from the URL when leaving the review surface", async () => {
    vi.spyOn(api, "listJobs").mockResolvedValue({ items: [], nextCursor: null });
    renderWorkspace();
    await openReview();
    fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
    expect(candidateParam()).toBe("cid-1");
    fireEvent.click(screen.getByTestId("surface-tab-jobs"));
    await waitFor(() => expect(candidateParam()).toBeNull());
    fireEvent.click(screen.getByTestId("surface-tab-review"));
    await waitFor(() => expect(candidateParam()).toBe("cid-1"));
  });

  describe("decision bar and Approve agree (assessment-first approval)", () => {
    const NEEDS_SAVE = "يجب حفظ التقييم البشري (الحقائق والجودة) للنسخة الحالية قبل الاعتماد.";
    const COMPATIBILITY = "يوجد تعارض في التوافق مع المحتوى القانوني (Compatibility Blockers).";
    const AUTO_CONTRADICTED =
      "التحقق الآلي وجد تناقضًا مع المصادر (CONTRADICTED)؛ لا يمكن اعتماد المرشح كـ SUPPORTED مباشرة.";
    const eligibilityWith = (approvalBlockers: string[]) => ({
      assessmentCurrent: false,
      assessmentStale: false,
      evidenceCount: 0,
      requiresFactualOverride: false,
      allowedFactualOverrideCodes: [],
      canApprove: approvalBlockers.length === 0,
      canCreateDraft: false,
      approvalBlockers,
      draftBlockers: [],
    });
    const summary = () => screen.getByTestId("decision-bar-summary").textContent ?? "";
    const approveEnabled = () =>
      !(screen.getByTestId("button-approve-candidate") as HTMLButtonElement).disabled;
    /** The invariant under test: Approve is enabled exactly when the bar says ready. */
    const expectAgreement = () =>
      expect(approveEnabled()).toBe(summary().includes("جاهز للاعتماد."));
    const fillAssessment = () => {
      fireEvent.change(screen.getByLabelText("factual state"), { target: { value: "SUPPORTED" } });
      fireEvent.change(screen.getByPlaceholderText("تفسير التحقق الواقعي (مطلوب)"), { target: { value: "موثق" } });
      for (const key of ["correctness", "mechanicFit", "clarity", "multiplayerFit", "originality"]) {
        fireEvent.change(screen.getByLabelText(key), { target: { value: "4" } });
      }
      fireEvent.change(screen.getByPlaceholderText("شرح معيار الجودة (مطلوب)"), { target: { value: "جيد" } });
      fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    };
    async function open(candidate: ReviewCandidate) {
      renderWorkspace([candidate]);
      await openReview();
      fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
      await screen.findByTestId("decision-bar");
    }

    it("does not ask to save an assessment the combined action saves, and lists what is still missing", async () => {
      await open(
        mockCandidate("cid-1", "السؤال الأول", {
          humanAssessment: null,
          reviewEligibility: eligibilityWith([NEEDS_SAVE]),
        } as never),
      );
      // Before filling in: concrete reviewer requirements, never the save message.
      expect(summary()).not.toContain("يجب حفظ التقييم");
      expect(approveEnabled()).toBe(false);
      fireEvent.click(screen.getByTestId("button-show-decision-requirements"));
      const panel = screen.getByTestId("approval-eligibility-panel");
      expect(panel.textContent).toContain("أدخل درجات الجودة الخمس (من 1 إلى 5).");
      expect(panel.textContent).toContain("اكتب تفسير التحقق الواقعي.");
      expect(panel.textContent).not.toContain("يجب حفظ التقييم");
      expectAgreement();

      fillAssessment();
      expect(summary()).toContain("جاهز للاعتماد.");
      expect(approveEnabled()).toBe(true);
      expectAgreement();
    });

    it("keeps a genuine server blocker visible and Approve disabled even with a complete assessment", async () => {
      await open(
        mockCandidate("cid-1", "السؤال الأول", {
          humanAssessment: null,
          reviewEligibility: eligibilityWith([NEEDS_SAVE, COMPATIBILITY]),
        } as never),
      );
      fillAssessment();
      expect(summary()).toContain("Compatibility Blockers");
      expect(summary()).not.toContain("يجب حفظ التقييم");
      expect(approveEnabled()).toBe(false);
      expectAgreement();
    });

    it("treats a blocker about the saved assessment as blocking until the reviewer changes that assessment", async () => {
      await open(
        mockCandidate("cid-1", "السؤال الأول", {
          reviewEligibility: eligibilityWith([AUTO_CONTRADICTED]),
        } as never),
      );
      fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
      // Unchanged inputs: saving again cannot help, so it blocks.
      expect(summary()).toContain("التحقق الآلي وجد تناقضًا");
      expect(approveEnabled()).toBe(false);
      expectAgreement();

      // The reviewer changes the assessment: the combined action will replace
      // it and the server re-checks, so Approve must be reachable (no deadlock).
      fireEvent.change(screen.getByLabelText("factual state"), { target: { value: "UNSUPPORTED" } });
      fireEvent.change(screen.getByLabelText("factual override code"), {
        target: { value: "CLAIM_NOT_ANSWER_CRITICAL" },
      });
      fireEvent.change(screen.getByPlaceholderText(/تفسير حل التعارض/), {
        target: { value: "المعلومة ليست جوهرية للإجابة" },
      });
      expect(summary()).not.toContain("التحقق الآلي وجد تناقضًا");
      expect(summary()).toContain("جاهز للاعتماد.");
      expect(approveEnabled()).toBe(true);
      expectAgreement();
    });

    it("names a stale same-candidate revision in the bar while Approve is blocked by it", async () => {
      renderWorkspace([mockCandidate("cid-1", "السؤال الأول")]);
      await openReview();
      fireEvent.click(screen.getByTestId("candidate-row-cid-1"));
      await screen.findByTestId("decision-bar");
      fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
      expect(summary()).toContain("جاهز للاعتماد.");
      // Another reviewer moves the candidate on; a rescreen refetch brings it in.
      vi.mocked(api.getCandidate).mockResolvedValue(mockCandidate("cid-1", "السؤال الأول", { reviewRevision: 2 }));
      vi.spyOn(api, "rescreenCandidate").mockResolvedValue(mockCandidate("cid-1", "السؤال الأول", { reviewRevision: 2 }));
      fireEvent.click(screen.getByTestId("button-rescreen-candidate"));
      await screen.findByTestId("assessment-stale-conflict");
      expect(summary()).toContain("تغيّرت نسخة المرشح");
      expect(approveEnabled()).toBe(false);
      expectAgreement();
    });
  });

  it.each([
    ["a cache that keeps idle entries", Infinity],
    ["a cache that collects idle entries immediately", 0],
  ] as const)("keeps an unknown approval locked after remount when only writing its marker failed, with %s", async (_label, gcTime) => {
    const KEY = "akwaan.contentEngine.unknownApprovals";
    const nativeSet = Storage.prototype.setItem;
    let failWrites = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === KEY && failWrites) throw new Error("quota exceeded");
      return nativeSet.call(this, key, value);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime } } });
    // The candidate itself stays cached and fresh in both cases.
    client.setQueryDefaults(["content-engine-review-detail"], { staleTime: Infinity, gcTime: Infinity });
    client.setQueryData(["content-engine-review-detail", "cid-1"], QUEUE[0]);
    vi.spyOn(api, "listCandidates").mockResolvedValue(QUEUE);
    const get = vi.spyOn(api, "getCandidate").mockResolvedValue(QUEUE[0]);
    const approve = vi.spyOn(api, "approveCandidate").mockRejectedValueOnce(new Error("response lost"));
    window.history.replaceState(null, "", "/admin/content-engine?surface=review&candidate=cid-1");
    const view = render(<QueryClientProvider client={client}><ContentEngineReviewWorkspace /></QueryClientProvider>);
    await screen.findByTestId("decision-bar");
    expect(screen.queryByTestId("approval-outcome-unknown")).toBeNull();

    // 1-2. The approval result is ambiguous and the marker cannot be written.
    failWrites = true;
    fireEvent.change(screen.getByPlaceholderText(/تفسير القرار/), { target: { value: "قرار" } });
    fireEvent.click(screen.getByTestId("button-approve-candidate"));
    await screen.findByTestId("approval-outcome-unknown");

    // 3-5. The reviewer leaves, storage recovers, the workspace remounts with
    // the same fresh cache. sessionStorage never received the marker.
    view.unmount();
    failWrites = false;
    await new Promise((resolve) => setTimeout(resolve, 30)); // let garbage collection run
    expect(JSON.parse(window.sessionStorage.getItem(KEY) ?? "[]")).not.toContain("cid-1");
    render(<QueryClientProvider client={client}><ContentEngineReviewWorkspace /></QueryClientProvider>);

    // The unknown outcome must not silently disappear.
    expect(await screen.findByTestId("approval-outcome-unknown")).toBeVisible();
    expect(screen.getByTestId("button-approve-candidate")).toBeDisabled();
    expect(screen.getByTestId("button-reject-candidate")).toBeDisabled();
    expect(get).not.toHaveBeenCalled(); // the cached copy cannot unlock it

    // Only an authoritative read does, and the recovered storage is repaired.
    get.mockResolvedValueOnce({ ...QUEUE[0], reviewRevision: 2 });
    fireEvent.click(screen.getByRole("button", { name: "التحقق من حالة الاعتماد" }));
    await waitFor(() => expect(screen.queryByTestId("approval-outcome-unknown")).toBeNull());
    expect(get).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem(KEY) ?? "[]")).not.toContain("cid-1");
  });
});
