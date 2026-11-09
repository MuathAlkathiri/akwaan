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
      { expectedRevision: 1, explanation: "سؤال سليم" },
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

    it("starts every candidate with an empty decision note and the default rejection reason", async () => {
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
      expect(reason().value).toBe("LOW_QUALITY");
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
        { expectedRevision: 1, explanation: "ملاحظة عن الثاني" },
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
});
