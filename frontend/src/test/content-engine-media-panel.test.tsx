import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/features/content-engine-review/api";
import { CandidateMediaPanel } from "@/features/content-engine-review/candidate-media-panel";
import { ContentEngineReviewWorkspace } from "@/features/content-engine-review/content-engine-review-workspace";
import type {
  CandidateMediaReadiness,
  CandidateMediaSlot,
  ReviewCandidate,
} from "@/features/content-engine-review/types";

/**
 * §30.22 Phase 3B-1 — Review Studio media panel. Media-governed candidates are
 * mocked (the engine cannot generate one yet), shaped exactly like the
 * Phase 3A server responses.
 */

const URL_A = `/uploads/world-content/content-items/engine-${"a".repeat(64)}.png`;
const URL_B = `/uploads/world-content/content-items/engine-${"b".repeat(64)}.png`;
const SLOT = "subject-image";

const descriptor = {
  slotKey: SLOT,
  purpose: "gameplay" as const,
  required: true,
  mediaType: "image" as const,
  uploadSupported: true,
  uploadUnsupportedReason: null,
};

const readiness = (
  overrides: Partial<CandidateMediaReadiness> = {},
): CandidateMediaReadiness => ({
  governed: true,
  slots: [descriptor],
  contractVersion: "media-contract-v1",
  requirementsDigest: "d".repeat(64),
  mediaReviewRevision: 1,
  requiredSlotKeys: [SLOT],
  ready: false,
  blockers: [],
  warnings: [],
  ...overrides,
});

const resolvedSlot = (
  overrides: Partial<CandidateMediaSlot> = {},
): CandidateMediaSlot => ({
  slotKey: SLOT,
  purpose: "gameplay",
  required: true,
  status: "resolved",
  asset: { url: URL_A, mimetype: "image/png", width: 3, height: 2 },
  provenance: { acquisition: "upload", provider: "admin-upload" },
  rights: { status: "UNKNOWN", source: "unrecorded" },
  review: null,
  ...overrides,
});

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
  assessedRevision: 3,
  reviewerEmail: "reviewer@example.test",
  assessedAt: "2026-11-11T00:00:00.000Z",
};

const candidate = (
  overrides: Partial<ReviewCandidate> & {
    mediaReadiness?: CandidateMediaReadiness | null;
  } = {},
): ReviewCandidate => {
  const { mediaReadiness, ...rest } = overrides;
  return {
    id: "id-media-1",
    candidateId: "media-1",
    jobId: "job-1",
    status: "awaiting_review",
    reviewStatus: "pending",
    reviewRevision: 3,
    draft: {
      prompt: { ar: "من هذه الشخصية؟" },
      answerPayload: { mode: "match", acceptedAnswers: ["شخصية"] },
    } as ReviewCandidate["draft"],
    authoring: null,
    factualClaims: ["ادعاء"],
    findings: [],
    factVerification: null,
    qualityEvaluation: null,
    compatibilityEvaluation: null,
    humanAssessment: assessment,
    reviewDecision: null,
    reviewEvents: [],
    publishedContentItemId: null,
    mediaPlan: [resolvedSlot()],
    mediaReviewRevision: 1,
    mediaEvents: [],
    job: {
      id: "job-1",
      mechanicKey: "ekshifni",
      worldKey: "celebrities",
      scopeKey: "arab-media-stars",
      status: "awaiting_review",
    },
    reviewEligibility: {
      assessmentCurrent: true,
      assessmentStale: false,
      evidenceCount: 0,
      requiresFactualOverride: false,
      allowedFactualOverrideCodes: [],
      canApprove: false,
      canCreateDraft: false,
      approvalBlockers: ["الوسائط المطلوبة للعب غير جاهزة"],
      ...(mediaReadiness === null
        ? {}
        : {
            mediaReadiness:
              mediaReadiness ??
              readiness({
                blockers: [
                  {
                    code: "MEDIA_REVIEW_REQUIRED",
                    slotKey: SLOT,
                    severity: "blocking",
                    message: "Required gameplay media needs a human media approval.",
                  },
                  {
                    code: "MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED",
                    slotKey: SLOT,
                    severity: "blocking",
                    message: "Media rights are UNKNOWN; an Admin must acknowledge this asset",
                    rightsStatus: "UNKNOWN",
                    acknowledged: false,
                  },
                ],
                warnings: [],
              }),
          }),
    },
    ...rest,
  };
};

function renderPanel(subject: ReviewCandidate) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const setData = vi.spyOn(client, "setQueryData");
  render(
    <QueryClientProvider client={client}>
      <CandidateMediaPanel candidate={subject} />
    </QueryClientProvider>,
  );
  return { client, invalidate, setData };
}

const slotCard = () => screen.getByTestId(`media-slot-${SLOT}`);
/** Action buttons in the slot card; the full-size viewer is read-only and always available. */
const actionButtons = () =>
  within(slotCard())
    .queryAllByRole("button")
    .filter((button) => button.getAttribute("data-testid") !== "media-preview-open");
const httpError = (status: number, code: string, message = "conflict") =>
  Object.assign(new Error(message), {
    response: { status, data: { code, message } },
  });

describe("Candidate media panel", () => {
  it("renders nothing for a legacy candidate outside the media contract", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <CandidateMediaPanel
          candidate={candidate({
            mediaPlan: [],
            mediaReviewRevision: 0,
            mediaReadiness: readiness({ governed: false, slots: [], requiredSlotKeys: [] }),
          })}
        />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the server reports no media readiness at all", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <CandidateMediaPanel candidate={candidate({ mediaReadiness: null })} />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a missing required slot from the registry, with the server's blocker", () => {
    renderPanel(
      candidate({
        mediaPlan: [],
        mediaReviewRevision: 0,
        mediaReadiness: readiness({
          mediaReviewRevision: 0,
          blockers: [
            {
              code: "MEDIA_REQUIRED_SLOT_MISSING",
              slotKey: SLOT,
              severity: "blocking",
              message: "Required gameplay media has no plan entry",
            },
          ],
        }),
      }),
    );
    expect(screen.getByTestId("media-readiness")).toHaveTextContent("الوسائط غير جاهزة");
    expect(screen.getByTestId("media-blockers")).toHaveTextContent("Required gameplay media has no plan entry");
    expect(within(slotCard()).getByTestId("media-slot-missing")).toBeInTheDocument();
    expect(within(slotCard()).getByTestId("media-slot-purpose")).toHaveTextContent("وسائط لعب مطلوبة");
    expect(within(slotCard()).getByRole("button", { name: "رفع الصورة" })).toBeDisabled();
    expect(within(slotCard()).queryByRole("button", { name: "اعتماد الوسائط" })).not.toBeInTheDocument();
  });

  it("previews the asset with provenance, rights and review state, without an answer-bearing alt text", () => {
    renderPanel(candidate());
    const card = slotCard();
    const preview = within(card).getByTestId("media-slot-preview") as HTMLImageElement;
    expect(preview.src).toContain(URL_A.replace(/^\//, ""));
    expect(preview.alt).toBe("معاينة وسائط المرشح");
    expect(within(card).getByTestId("media-slot-provenance")).toHaveTextContent("upload · admin-upload");
    expect(within(card).getByTestId("media-slot-rights")).toHaveTextContent("حقوق غير معروفة");
    expect(within(card).getByTestId("media-slot-review")).toHaveTextContent("بانتظار المراجعة");
    expect(within(card).getByText("3×2")).toBeInTheDocument();
  });

  it("distinguishes decorative artwork from required gameplay media", () => {
    renderPanel(
      candidate({
        mediaPlan: [],
        mediaReadiness: readiness({
          slots: [
            descriptor,
            { ...descriptor, slotKey: "display-art", purpose: "decorative", required: false },
          ],
        }),
      }),
    );
    expect(within(screen.getByTestId("media-slot-display-art")).getByTestId("media-slot-purpose")).toHaveTextContent(
      "عمل فني زخرفي (اختياري)",
    );
    expect(within(slotCard()).getByTestId("media-slot-purpose")).toHaveTextContent("وسائط لعب مطلوبة");
  });

  describe("actions", () => {
    beforeEach(() => {
      vi.spyOn(api, "attachCandidateMedia");
      vi.spyOn(api, "reviewCandidateMedia");
      vi.spyOn(api, "acknowledgeCandidateMediaRights");
    });

    it("uploads an image for the slot against the current media revision", async () => {
      const updated = candidate({ mediaReviewRevision: 2 });
      vi.mocked(api.attachCandidateMedia).mockResolvedValue(updated);
      const { setData, invalidate } = renderPanel(
        candidate({ mediaPlan: [], mediaReadiness: readiness() }),
      );
      const file = new File(["png"], "answer-name.png", { type: "image/png" });
      fireEvent.change(within(slotCard()).getByLabelText(`ملف صورة للخانة ${SLOT}`), {
        target: { files: [file] },
      });
      fireEvent.click(within(slotCard()).getByRole("button", { name: "رفع الصورة" }));
      await waitFor(() =>
        expect(api.attachCandidateMedia).toHaveBeenCalledWith("media-1", SLOT, 1, file),
      );
      await waitFor(() =>
        expect(setData).toHaveBeenCalledWith(["content-engine-review-detail", "media-1"], updated),
      );
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["content-engine-review"] });
    });

    it("labels an existing asset's upload as a replacement that withdraws prior decisions", () => {
      renderPanel(
        candidate({
          mediaPlan: [
            resolvedSlot({
              review: {
                status: "approved",
                assetUrl: URL_A,
                mediaReviewRevision: 1,
                actorEmail: "admin@example.test",
                at: "2026-11-11T00:00:00.000Z",
              },
            }),
          ],
        }),
      );
      expect(within(slotCard()).getByRole("button", { name: "استبدال الصورة" })).toBeInTheDocument();
      expect(within(slotCard()).getByText(/الاستبدال يلغي اعتماد الوسائط والإقرار بالحقوق/)).toBeInTheDocument();
      expect(within(slotCard()).getByTestId("media-slot-review")).toHaveTextContent("معتمدة (admin@example.test)");
      expect(within(slotCard()).queryByRole("button", { name: "اعتماد الوسائط" })).not.toBeInTheDocument();
    });

    it("treats an approval of a previous asset as not applying to the replacement", () => {
      renderPanel(
        candidate({
          mediaPlan: [
            resolvedSlot({
              asset: { url: URL_B },
              review: {
                status: "approved",
                assetUrl: URL_A,
                mediaReviewRevision: 1,
                actorEmail: "admin@example.test",
                at: "2026-11-11T00:00:00.000Z",
              },
            }),
          ],
        }),
      );
      expect(within(slotCard()).getByTestId("media-slot-review")).toHaveTextContent("بانتظار المراجعة");
      expect(within(slotCard()).getByRole("button", { name: "اعتماد الوسائط" })).toBeInTheDocument();
    });

    it("approves media with only the media revision", async () => {
      vi.mocked(api.reviewCandidateMedia).mockResolvedValue(candidate({ mediaReviewRevision: 2 }));
      renderPanel(candidate());
      fireEvent.click(within(slotCard()).getByRole("button", { name: "اعتماد الوسائط" }));
      await waitFor(() =>
        expect(api.reviewCandidateMedia).toHaveBeenCalledWith("media-1", SLOT, {
          expectedMediaReviewRevision: 1,
          status: "approved",
        }),
      );
    });

    it("rejects media only with an explanation and a reason", async () => {
      vi.mocked(api.reviewCandidateMedia).mockResolvedValue(candidate({ mediaReviewRevision: 2 }));
      renderPanel(candidate());
      const reject = within(slotCard()).getByRole("button", { name: "رفض الوسائط" });
      expect(reject).toBeDisabled();
      fireEvent.change(within(slotCard()).getByLabelText("سبب الرفض"), {
        target: { value: "ANSWER_LEAKAGE" },
      });
      fireEvent.change(within(slotCard()).getByLabelText("شرح رفض الوسائط"), {
        target: { value: "  الاسم ظاهر في الصورة  " },
      });
      fireEvent.click(reject);
      await waitFor(() =>
        expect(api.reviewCandidateMedia).toHaveBeenCalledWith("media-1", SLOT, {
          expectedMediaReviewRevision: 1,
          status: "rejected",
          reasonCode: "ANSWER_LEAKAGE",
          explanation: "الاسم ظاهر في الصورة",
        }),
      );
    });

    it("requires an explicit note to acknowledge UNKNOWN rights, which block approval until then", async () => {
      vi.mocked(api.acknowledgeCandidateMediaRights).mockResolvedValue(candidate({ mediaReviewRevision: 2 }));
      renderPanel(candidate());
      expect(within(slotCard()).getByTestId("media-rights-warning")).toHaveTextContent(
        "مانع للاعتماد وإنشاء المسودة",
      );
      expect(screen.getByTestId("media-blockers")).toHaveTextContent("must acknowledge");
      const acknowledge = within(slotCard()).getByRole("button", {
        name: "أقر بالتحذير (لا يغيّر حالة الترخيص)",
      });
      expect(acknowledge).toBeDisabled();
      fireEvent.change(within(slotCard()).getByLabelText("ملاحظة الإقرار بالحقوق"), {
        target: { value: "الوكالة تؤكد الترخيص" },
      });
      fireEvent.click(acknowledge);
      await waitFor(() =>
        expect(api.acknowledgeCandidateMediaRights).toHaveBeenCalledWith("media-1", SLOT, {
          expectedMediaReviewRevision: 1,
          note: "الوكالة تؤكد الترخيص",
        }),
      );
    });

    it.each(["PENDING", "EXPIRED"] as const)(
      "treats %s rights as requiring an acknowledgment",
      (rightsStatus) => {
        renderPanel(
          candidate({
            mediaPlan: [resolvedSlot({ rights: { status: rightsStatus, source: "media-rights" } })],
            mediaReadiness: readiness({
              blockers: [
                {
                  code: "MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED",
                  slotKey: SLOT,
                  severity: "blocking",
                  message: "acknowledgment required",
                  rightsStatus,
                  acknowledged: false,
                },
              ],
            }),
          }),
        );
        expect(within(slotCard()).getByTestId("media-rights-warning")).toHaveTextContent(rightsStatus);
        expect(
          within(slotCard()).getByRole("button", { name: "أقر بالتحذير (لا يغيّر حالة الترخيص)" }),
        ).toBeInTheDocument();
      },
    );

    it("shows a rights warning for an asset the draft will not carry, without an acknowledgment control", () => {
      renderPanel(
        candidate({
          mediaReadiness: readiness({
            ready: true,
            warnings: [
              {
                code: "MEDIA_RIGHTS_NOT_CLEARED",
                slotKey: SLOT,
                severity: "warning",
                message: "not in draft",
                rightsStatus: "UNKNOWN",
                acknowledged: false,
              },
            ],
          }),
        }),
      );
      expect(within(slotCard()).getByTestId("media-rights-warning")).toHaveTextContent("لا تُنقل إلى المسودة");
      expect(
        within(slotCard()).queryByRole("button", { name: "أقر بالتحذير (لا يغيّر حالة الترخيص)" }),
      ).not.toBeInTheDocument();
    });

    it("shows an acknowledged warning without offering to acknowledge again", () => {
      renderPanel(
        candidate({
          mediaReadiness: readiness({
            ready: true,
            warnings: [
              {
                code: "MEDIA_RIGHTS_NOT_CLEARED",
                slotKey: SLOT,
                severity: "warning",
                message: "acknowledged",
                rightsStatus: "UNKNOWN",
                acknowledged: true,
              },
            ],
          }),
        }),
      );
      expect(within(slotCard()).getByTestId("media-rights-warning")).toHaveTextContent("تم الإقرار");
      expect(
        within(slotCard()).queryByRole("button", { name: "أقر بالتحذير (لا يغيّر حالة الترخيص)" }),
      ).not.toBeInTheDocument();
    });

    it("shows BLOCKED rights as a hard blocker with no approval or acknowledgment", () => {
      renderPanel(
        candidate({
          mediaPlan: [resolvedSlot({ rights: { status: "BLOCKED", source: "media-rights" } })],
          mediaReadiness: readiness({
            blockers: [
              {
                code: "MEDIA_RIGHTS_BLOCKED",
                slotKey: SLOT,
                severity: "blocking",
                message: "Media rights are recorded as BLOCKED",
              },
            ],
          }),
        }),
      );
      expect(within(slotCard()).getByTestId("media-rights-blocked")).toHaveTextContent("مانع صارم");
      expect(within(slotCard()).getByTestId("media-slot-rights")).toHaveTextContent("حقوق محظورة");
      expect(within(slotCard()).queryByRole("button", { name: "اعتماد الوسائط" })).not.toBeInTheDocument();
      expect(
        within(slotCard()).queryByRole("button", { name: "أقر بالتحذير (لا يغيّر حالة الترخيص)" }),
      ).not.toBeInTheDocument();
      // Replacement stays available: it is the way out of a BLOCKED asset.
      expect(within(slotCard()).getByRole("button", { name: "استبدال الصورة" })).toBeInTheDocument();
    });

    it("on a stale media revision, reloads the candidate and asks for a new decision", async () => {
      vi.mocked(api.reviewCandidateMedia).mockRejectedValue(
        httpError(409, "MEDIA_REVISION_CONFLICT"),
      );
      const { invalidate } = renderPanel(candidate());
      fireEvent.change(within(slotCard()).getByLabelText("شرح رفض الوسائط"), {
        target: { value: "قرار قديم" },
      });
      fireEvent.click(within(slotCard()).getByRole("button", { name: "اعتماد الوسائط" }));
      expect(await screen.findByTestId("media-conflict-notice")).toHaveTextContent(
        "اتخذ القرار من جديد",
      );
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["content-engine-review-detail", "media-1"],
      });
    });

    it("keeps the conflict notice when the reload remounts the slot with a new media revision", async () => {
      vi.mocked(api.reviewCandidateMedia).mockRejectedValue(
        httpError(409, "MEDIA_REVISION_CONFLICT"),
      );
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <CandidateMediaPanel candidate={candidate()} />
        </QueryClientProvider>,
      );
      fireEvent.change(within(slotCard()).getByLabelText("شرح رفض الوسائط"), {
        target: { value: "قرار على نسخة قديمة" },
      });
      fireEvent.click(within(slotCard()).getByRole("button", { name: "رفض الوسائط" }));
      await screen.findByTestId("media-conflict-notice");
      // The reload arrives with the other reviewer's decision.
      rerender(
        <QueryClientProvider client={client}>
          <CandidateMediaPanel candidate={candidate({ mediaReviewRevision: 2 })} />
        </QueryClientProvider>,
      );
      expect(screen.getByTestId("media-conflict-notice")).toHaveTextContent("اتخذ القرار من جديد");
      expect(within(slotCard()).getByLabelText("شرح رفض الوسائط")).toHaveValue("");
    });

    it("clears the conflict notice after the next successful media action", async () => {
      vi.mocked(api.reviewCandidateMedia)
        .mockRejectedValueOnce(httpError(409, "MEDIA_REVISION_CONFLICT"))
        .mockResolvedValueOnce(candidate({ mediaReviewRevision: 2 }));
      renderPanel(candidate());
      fireEvent.click(within(slotCard()).getByRole("button", { name: "اعتماد الوسائط" }));
      await screen.findByTestId("media-conflict-notice");
      fireEvent.click(within(slotCard()).getByRole("button", { name: "اعتماد الوسائط" }));
      await waitFor(() =>
        expect(screen.queryByTestId("media-conflict-notice")).not.toBeInTheDocument(),
      );
    });

    it("discards an in-progress decision when the candidate arrives with a new media revision", () => {
      const client = new QueryClient();
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <CandidateMediaPanel candidate={candidate()} />
        </QueryClientProvider>,
      );
      fireEvent.change(within(slotCard()).getByLabelText("شرح رفض الوسائط"), {
        target: { value: "قرار على نسخة قديمة" },
      });
      rerender(
        <QueryClientProvider client={client}>
          <CandidateMediaPanel candidate={candidate({ mediaReviewRevision: 2 })} />
        </QueryClientProvider>,
      );
      expect(within(slotCard()).getByLabelText("شرح رفض الوسائط")).toHaveValue("");
    });

    it("shows a non-conflict server error without reloading", async () => {
      vi.mocked(api.attachCandidateMedia).mockRejectedValue(
        httpError(422, "IMAGE_TRUNCATED", "IMAGE_TRUNCATED: PNG ends before IEND"),
      );
      const { invalidate } = renderPanel(candidate({ mediaPlan: [], mediaReadiness: readiness() }));
      fireEvent.change(within(slotCard()).getByLabelText(`ملف صورة للخانة ${SLOT}`), {
        target: { files: [new File(["x"], "x.png", { type: "image/png" })] },
      });
      fireEvent.click(within(slotCard()).getByRole("button", { name: "رفع الصورة" }));
      expect(await within(slotCard()).findByTestId("media-action-error")).toHaveTextContent(
        "PNG ends before IEND",
      );
      expect(invalidate).not.toHaveBeenCalledWith({
        queryKey: ["content-engine-review-detail", "media-1"],
      });
    });
  });

  describe("locks and unsupported slots", () => {
    it.each([
      ["rejected", { reviewStatus: "rejected" as const }, "المرشح مرفوض"],
      ["published", { reviewStatus: "approved" as const, publishedContentItemId: "item-1" }, "أُنشئت المسودة"],
    ])("locks every media control on a %s candidate", (_label, overrides, text) => {
      renderPanel(candidate(overrides));
      expect(screen.getByTestId("media-locked")).toHaveTextContent(text);
      expect(actionButtons()).toEqual([]);
      // Viewing stays available on a locked candidate.
      expect(within(slotCard()).getByTestId("media-preview-open")).toBeInTheDocument();
    });

    it("on an approved candidate offers only the rights acknowledgment", async () => {
      vi.spyOn(api, "acknowledgeCandidateMediaRights").mockResolvedValue(
        candidate({ reviewStatus: "approved", mediaReviewRevision: 2 }),
      );
      renderPanel(candidate({ reviewStatus: "approved" }));
      expect(screen.getByTestId("media-locked")).toHaveTextContent("يمكن فقط الإقرار");
      const buttons = actionButtons().map((button) => button.textContent);
      expect(buttons).toEqual(["أقر بالتحذير (لا يغيّر حالة الترخيص)"]);
      expect(within(slotCard()).queryByLabelText(`ملف صورة للخانة ${SLOT}`)).not.toBeInTheDocument();
      fireEvent.change(within(slotCard()).getByLabelText("ملاحظة الإقرار بالحقوق"), {
        target: { value: "تجديد الترخيص قيد الطلب" },
      });
      fireEvent.click(within(slotCard()).getByRole("button", { name: "أقر بالتحذير (لا يغيّر حالة الترخيص)" }));
      await waitFor(() =>
        expect(api.acknowledgeCandidateMediaRights).toHaveBeenCalledWith("media-1", SLOT, {
          expectedMediaReviewRevision: 1,
          note: "تجديد الترخيص قيد الطلب",
        }),
      );
    });

    it("on an approved candidate with nothing to acknowledge offers no control", () => {
      renderPanel(
        candidate({
          reviewStatus: "approved",
          mediaPlan: [resolvedSlot({ rights: { status: "CLEARED", source: "media-rights" } })],
          mediaReadiness: readiness({ ready: true }),
        }),
      );
      expect(actionButtons()).toEqual([]);
    });

    it.each([
      ["AUDIO_UPLOAD_NOT_SUPPORTED", "audio" as const, "رفع الصوت غير مدعوم"],
      ["ODD_PIECE_V2_IMAGE_FIELDS_NOT_SUPPORTED", "image" as const, "القطعة الغريبة"],
    ])("explains %s instead of offering a control that would fail", (reason, mediaType, text) => {
      renderPanel(
        candidate({
          mediaPlan: [],
          mediaReadiness: readiness({
            slots: [
              {
                ...descriptor,
                mediaType,
                uploadSupported: false,
                uploadUnsupportedReason: reason,
              },
            ],
          }),
        }),
      );
      expect(within(slotCard()).getByTestId("media-slot-unsupported")).toHaveTextContent(text);
      expect(within(slotCard()).queryByRole("button")).not.toBeInTheDocument();
      expect(within(slotCard()).queryByLabelText(`ملف صورة للخانة ${SLOT}`)).not.toBeInTheDocument();
    });
  });
});

describe("Review workspace integration", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  const renderWorkspaceWith = async (subject: ReviewCandidate) => {
    vi.spyOn(api, "listCandidates").mockResolvedValue([subject]);
    vi.spyOn(api, "getCandidate").mockResolvedValue(subject);
    window.history.replaceState(null, "", `/?candidate=${subject.candidateId}`);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
      >
        <ContentEngineReviewWorkspace />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByTestId("surface-tab-review"));
  };

  it("renders the media panel inside the candidate detail for a media-governed candidate", async () => {
    await renderWorkspaceWith(candidate());
    expect(await screen.findByTestId("candidate-media-panel")).toBeInTheDocument();
  });

  it("leaves a legacy candidate's detail without a media panel", async () => {
    const legacy = candidate({
      mediaPlan: [],
      mediaReviewRevision: 0,
      mediaReadiness: readiness({ governed: false, slots: [], requiredSlotKeys: [] }),
      reviewEligibility: undefined,
    });
    await renderWorkspaceWith(legacy);
    expect(await screen.findByRole("heading", { level: 2, name: /من هذه الشخصية/ })).toBeInTheDocument();
    expect(screen.queryByTestId("candidate-media-panel")).not.toBeInTheDocument();
  });
});

describe("Media review completion (§30.22 Phase 3B-3)", () => {
  it("opens a full-size viewer that fits the image without cropping, and shows it 1:1 on request", async () => {
    renderPanel(candidate());
    fireEvent.click(within(slotCard()).getByTestId("media-preview-open"));
    const dialog = await screen.findByTestId("media-preview-dialog");
    const full = within(dialog).getByTestId("media-preview-full") as HTMLImageElement;
    expect(full.src).toContain(URL_A.replace(/^\//, ""));
    expect(full.alt).toBe("معاينة وسائط المرشح");
    expect(within(dialog).getByTestId("media-preview-frame")).toHaveAttribute("data-mode", "fit");
    expect(full.className).toContain("object-contain");
    expect(full.className).not.toMatch(/object-cover/);

    Object.defineProperty(full, "naturalWidth", { configurable: true, value: 1600 });
    Object.defineProperty(full, "naturalHeight", { configurable: true, value: 900 });
    fireEvent.load(full);
    expect(dialog).toHaveTextContent("1600×900");

    fireEvent.click(within(dialog).getByTestId("media-preview-actual"));
    expect(within(dialog).getByTestId("media-preview-frame")).toHaveAttribute("data-mode", "actual");
    expect(full.style.width).toBe("1600px");
    expect(full.style.height).toBe("900px");
  });

  it("shows recorded licence, rights holder and provenance exactly as recorded", () => {
    renderPanel(
      candidate({
        mediaPlan: [
          resolvedSlot({
            asset: { url: URL_A, sha256: "abcdef0123456789".repeat(4), width: 3, height: 2 },
            provenance: {
              acquisition: "retrieve",
              provider: "wikimedia",
              sourceUrl: "https://example.test/file.png",
              finalUrl: "https://cdn.example.test/file.png",
              redirects: ["https://cdn.example.test/file.png"],
              licenceNote: "CC BY-SA 4.0 (as stated by the source)",
              byteSize: 1234,
            },
            rights: {
              status: "PENDING",
              source: "media-rights",
              licence: "CC BY-SA 4.0",
              rightsHolder: "Example Photo Agency",
            },
          }),
        ],
      }),
    );
    const card = slotCard();
    expect(within(card).getByTestId("media-record-licence-note")).toHaveTextContent("CC BY-SA 4.0 (as stated by the source)");
    expect(within(card).getByTestId("media-record-licence")).toHaveTextContent("CC BY-SA 4.0");
    expect(within(card).getByTestId("media-record-rights-holder")).toHaveTextContent("Example Photo Agency");
    expect(within(card).getByTestId("media-record-rights-source")).toHaveTextContent("سجل الحقوق");
    expect(within(card).getByTestId("media-record-final-url")).toHaveTextContent("cdn.example.test");
    expect(within(card).getByTestId("media-record-redirects")).toHaveTextContent("1");
    expect(within(card).getByTestId("media-record-size")).toHaveTextContent("1234");
    expect(within(card).getByTestId("media-record-sha")).toHaveTextContent("abcdef0123456789");
  });

  it("says 'not recorded' instead of inventing missing licence or holder", () => {
    renderPanel(candidate());
    const card = slotCard();
    for (const id of ["media-record-licence-note", "media-record-licence", "media-record-rights-holder"]) {
      expect(within(card).getByTestId(id)).toHaveTextContent("غير مسجّل");
    }
    expect(within(card).getByTestId("media-record-rights-source")).toHaveTextContent("لا يوجد سجل حقوق");
    // Nothing is shown for fields the server never sent.
    for (const id of ["media-record-final-url", "media-record-redirects", "media-record-size", "media-record-sha", "media-record-model"]) {
      expect(within(card).queryByTestId(id)).not.toBeInTheDocument();
    }
  });

  it("lists the media history newest first with only the facts each event carries", () => {
    renderPanel(
      candidate({
        mediaEvents: [
          {
            action: "media_attached",
            slotKeys: [SLOT],
            actorEmail: "admin@example.test",
            occurredAt: "2026-11-11T10:00:00.000Z",
            mediaReviewRevision: 1,
            reviewRevision: 0,
            details: { superseded: { assetUrl: URL_B } },
          },
          {
            action: "media_rights_acknowledged",
            slotKeys: [SLOT],
            actorEmail: "reviewer@example.test",
            occurredAt: "2026-11-11T12:00:00.000Z",
            mediaReviewRevision: 3,
            reviewRevision: 1,
            details: { rightsStatus: "EXPIRED", afterApproval: true },
          },
        ],
      }),
    );
    const history = screen.getByTestId("media-events");
    expect(history).toHaveTextContent("سجل الوسائط (2)");
    const items = within(history).getAllByTestId("media-event");
    expect(items[0]).toHaveTextContent("إقرار بالحقوق");
    expect(items[0]).toHaveTextContent("حالة الحقوق: EXPIRED");
    expect(items[0]).toHaveTextContent("بعد اعتماد النص");
    expect(items[0]).toHaveTextContent("reviewer@example.test");
    expect(items[1]).toHaveTextContent("إرفاق وسائط");
    expect(items[1]).toHaveTextContent("استبدل وسائط سابقة");
  });

  it("says when there is no media history yet", () => {
    renderPanel(candidate({ mediaEvents: [] }));
    expect(screen.getByTestId("media-events-empty")).toBeInTheDocument();
  });

  it("styles gameplay media and decorative artwork differently", () => {
    renderPanel(
      candidate({
        mediaPlan: [],
        mediaReadiness: readiness({
          slots: [
            descriptor,
            { ...descriptor, slotKey: "display-art", purpose: "decorative", required: false },
          ],
        }),
      }),
    );
    expect(slotCard()).toHaveAttribute("data-purpose", "gameplay");
    expect(screen.getByTestId("media-slot-display-art")).toHaveAttribute("data-purpose", "decorative");
    expect(slotCard().className).not.toEqual(screen.getByTestId("media-slot-display-art").className);
  });
});
