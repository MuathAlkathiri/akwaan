import { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/features/content-engine-review/api";
import {
  ContentEngineReviewWorkspace,
  STUDIO_STORAGE_KEY,
} from "@/features/content-engine-review/content-engine-review-workspace";
import { CreativeSlotInspector } from "@/features/content-engine-review/creative-slot-inspector";
import { BatchSubmissionPanel } from "@/features/content-engine-review/batch-submission-panel";
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
    prompt: { ar: "أي من الكلمات التالية تحتوي على 4 أحرف؟" },
    answerPayload: {
      mode: "multiple_choice",
      options: [
        { id: "1", label: { ar: "كتاب" } },
        { id: "2", label: { ar: "قلم" } },
      ],
      correctOptionId: "1",
    },
  },
  authoring: {
    concept: "عد الحروف",
    answerBasis: "reasoning",
    assignedSlot: {
      slotIndex: 0,
      familyKey: "letter-count",
      familyNameAr: "عد الأحرف",
      mode: "exploitation",
      difficulty: "medium",
      cognitiveTask: "حساب عدد حروف الكلمة ومطابقتها مع الرقم المطلوب",
      creativeAngle: "كلمات شائعة بتشابه في الأطوال",
      mechanicFit: "natural",
      selectionReason: "تغطية منخفضة في سجل النطاق",
    },
    familyCompliance: {
      assignedFamilyKey: "letter-count",
      isCompliant: true,
      verificationMethod: "rule_evaluated",
    },
  },
  factualClaims: ["كلمة كتاب تتكون من 4 أحرف"],
  publishedContentItemId: null,
  findings: [],
  factVerification: { state: "SUPPORTED" },
  qualityEvaluation: null,
  compatibilityEvaluation: null,
  humanAssessment: {
    factualState: "SUPPORTED",
    factualExplanation: "المعلومة صحيحة تماماً",
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
    reviewerEmail: "reviewer@akwaan.com",
    assessedAt: new Date().toISOString(),
  },
  reviewDecision: null,
  reviewEvents: [],
  canonicalTarget: {
    worldId: "w-1",
    worldKey: "puzzles",
    scopeId: "s-1",
    scopeKey: "wordplay-letters",
    challengeTypeId: "c-1",
    mechanicKey: "read-your-opponent",
  },
  job: {
    id: "job-100",
    mechanicKey: "read-your-opponent",
    worldKey: "puzzles",
    scopeKey: "wordplay-letters",
    status: "awaiting_review",
  },
  ...overrides,
});

describe("Content Engine Slice 3D: Review Studio Creative Slot & Visibility UX", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage?.clear();
    window.sessionStorage?.setItem(
      STUDIO_STORAGE_KEY,
      JSON.stringify({ activeSurface: "review", activeJobId: "job-100" }),
    );

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
        provider: "openrouter",
        generationModel: "gpt-4o",
        qualityModel: "gpt-4o-mini",
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
      worlds: [
        {
          worldKey: "puzzles",
          name: "الألغاز",
          eligible: true,
          scopes: [
            {
              scopeKey: "wordplay-letters",
              worldKey: "puzzles",
              name: "ألعاب الحروف",
              eligible: true,
              mechanics: [
                {
                  mechanicKey: "read-your-opponent",
                  eligible: true,
                } as any,
              ],
            } as any,
          ],
        } as any,
      ],
      scopes: [],
      mechanics: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. CreativeSlotInspector component", () => {
    it("renders verified rule-evaluated match with slot metadata", () => {
      const candidate = mockCandidate();
      render(<CreativeSlotInspector candidate={candidate} />);

      expect(screen.getByTestId("creative-slot-inspector")).toBeInTheDocument();
      expect(screen.getByTestId("creative-slot-number")).toHaveTextContent(
        "الخانة #1",
      );
      expect(screen.getByTestId("creative-slot-mode-badge")).toHaveTextContent(
        "استغلال",
      );
      expect(
        screen.getByTestId("creative-slot-compliance-badge"),
      ).toHaveTextContent("عائلة مطابقة (Rule Evaluated)");
      expect(screen.getByTestId("creative-slot-family-name")).toHaveTextContent(
        "عد الأحرف",
      );
      expect(
        screen.getByTestId("creative-slot-cognitive-task"),
      ).toHaveTextContent("حساب عدد حروف الكلمة");

      // Expand technical details
      fireEvent.click(screen.getByText("عرض تفاصيل الخانة"));
      expect(
        screen.getByTestId("creative-slot-creative-angle"),
      ).toHaveTextContent("كلمات شائعة بتشابه في الأطوال");
      expect(
        screen.getByTestId("creative-slot-selection-reason"),
      ).toHaveTextContent("تغطية منخفضة في سجل النطاق");
    });

    it("renders exploration mode chip correctly", () => {
      const candidate = mockCandidate({
        authoring: {
          concept: "تشكيل الكلمات",
          assignedSlot: {
            slotIndex: 2,
            familyKey: "anagram-rearrange",
            familyNameAr: "إعادة ترتيب الحروف",
            mode: "exploration",
            difficulty: "hard",
            cognitiveTask: "إعادة ترتيب الحروف المبعثرة",
            creativeAngle: "ألفاظ فصحى نادرة",
            mechanicFit: "natural",
            selectionReason: "توسيع التنوع الإبداعي للدفعة بنسبة 30%",
          },
          familyCompliance: {
            assignedFamilyKey: "anagram-rearrange",
            isCompliant: true,
            verificationMethod: "rule_evaluated",
          },
        },
      });

      render(<CreativeSlotInspector candidate={candidate} />);
      expect(screen.getByTestId("creative-slot-number")).toHaveTextContent(
        "الخانة #3",
      );
      expect(screen.getByTestId("creative-slot-mode-badge")).toHaveTextContent(
        "استكشاف (Exploration)",
      );
    });

    it("renders structural mismatch warning with approval blocked notice", () => {
      const candidate = mockCandidate({
        findings: [
          {
            code: "FAMILY_COMPLIANCE_MISMATCH",
            severity: "blocking",
            message:
              "STRUCTURAL_MISMATCH: Candidate does not fulfill anagram rearrangement conditions",
          },
        ],
        authoring: {
          concept: "كلمات",
          assignedSlot: {
            slotIndex: 1,
            familyKey: "anagram-rearrange",
            familyNameAr: "إعادة ترتيب الحروف",
            mode: "exploitation",
          },
          familyCompliance: {
            assignedFamilyKey: "anagram-rearrange",
            isCompliant: false,
            verificationMethod: "rule_evaluated",
            mismatchReason:
              "STRUCTURAL_MISMATCH: Letters in prompt do not match correct option",
          },
        },
      });

      render(<CreativeSlotInspector candidate={candidate} />);
      expect(
        screen.getByTestId("creative-slot-compliance-badge"),
      ).toHaveTextContent("تعارض مع العائلة (Approval Blocked)");
      expect(
        screen.getByTestId("creative-slot-mismatch-alert"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/الاعتماد وإنشاء المسودة محظوران/i),
      ).toBeInTheDocument();
    });

    it("renders unverified pending state indicating human explanation required", () => {
      const candidate = mockCandidate({
        findings: [
          {
            code: "FAMILY_COMPLIANCE_UNVERIFIED",
            severity: "warning",
            message:
              "FAMILY_COMPLIANCE_UNVERIFIED: Family has no automated heuristic rules",
          },
        ],
        authoring: {
          concept: "معنى عام",
          assignedSlot: {
            slotIndex: 0,
            familyKey: "semantic-association",
            familyNameAr: "الترابط الدلالي",
            mode: "exploration",
          },
          familyCompliance: {
            assignedFamilyKey: "semantic-association",
            isCompliant: false,
            verificationMethod: "manual_review",
          },
        },
      });

      render(<CreativeSlotInspector candidate={candidate} />);
      expect(
        screen.getByTestId("creative-slot-compliance-badge"),
      ).toHaveTextContent("بانتظار التحقق البشري");
      expect(
        screen.getByTestId("creative-slot-unverified-alert"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/يجب على المراجع التحقق يدويًا وتدوين سبب الاعتماد/i),
      ).toBeInTheDocument();
    });

    it("renders manually resolved state when reviewer explanation is documented", () => {
      const candidate = mockCandidate({
        findings: [
          {
            code: "FAMILY_COMPLIANCE_UNVERIFIED",
            severity: "warning",
            message:
              "FAMILY_COMPLIANCE_UNVERIFIED: Family has no automated heuristic rules",
          },
        ],
        authoring: {
          concept: "معنى عام",
          assignedSlot: {
            slotIndex: 0,
            familyKey: "semantic-association",
            familyNameAr: "الترابط الدلالي",
            mode: "exploration",
          },
          familyCompliance: {
            assignedFamilyKey: "semantic-association",
            isCompliant: true,
            verificationMethod: "manual_review",
            resolvedByReviewerId: "rev-42",
          },
        },
        reviewDecision: {
          decision: "approved",
          explanation: "تم التحقق يدويًا من دقة الترابط الدلالي للكلمات",
          familyComplianceResolution: {
            resolvedByReviewer: true,
            assignedFamilyKey: "semantic-association",
            reviewerExplanation: "الترابط الدلالي واضح بين كافة الخيارات",
            resolvedAt: new Date("2026-10-30T20:00:00Z"),
          },
        },
      });

      render(<CreativeSlotInspector candidate={candidate} />);
      expect(
        screen.getByTestId("creative-slot-compliance-badge"),
      ).toHaveTextContent("معتمد بقرار بشري (Manually Approved)");
      expect(
        screen.getByTestId("creative-slot-resolution-box"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/الترابط الدلالي واضح بين كافة الخيارات/i),
      ).toBeInTheDocument();
    });

    it("renders graceful neutral fallback for legacy V1 candidates without slots", () => {
      const candidate = mockCandidate({
        authoring: {
          concept: "سؤال قديم",
        },
      });

      render(<CreativeSlotInspector candidate={candidate} />);
      expect(screen.getByTestId("creative-slot-inspector")).toBeInTheDocument();
      expect(
        screen.getByTestId("creative-slot-legacy-badge"),
      ).toHaveTextContent("مرشح V1 تقليدي (بدون تخصيص مسبق)");
      expect(screen.getByText(/تم توليد هذا المرشح وفق بنية الإصدار السابق/i)).toBeInTheDocument();
    });
  });

  describe("2. Review Workspace scanning visibility & approval gating", () => {
    it("renders slot row in candidate cards and blocks approval when mismatch exists", async () => {
      const mismatchCandidate = mockCandidate({
        candidateId: "cand-mismatch",
        findings: [
          {
            code: "FAMILY_COMPLIANCE_MISMATCH",
            severity: "blocking",
            message: "Candidate does not conform to family rules",
          },
        ],
        authoring: {
          concept: "عد الحروف",
          assignedSlot: {
            slotIndex: 0,
            familyKey: "letter-count",
            familyNameAr: "عد الأحرف",
            mode: "exploitation",
          },
          familyCompliance: {
            assignedFamilyKey: "letter-count",
            isCompliant: false,
            verificationMethod: "rule_evaluated",
            mismatchReason: "عد الحروف في السؤال لا يطابق المطلوب",
          },
        },
      });

      vi.spyOn(api, "listCandidates").mockResolvedValue([mismatchCandidate]);
      vi.spyOn(api, "getCandidate").mockResolvedValue(mismatchCandidate);

      render(
        <WithQueryClient>
          <ContentEngineReviewWorkspace />
        </WithQueryClient>,
      );

      // Switch to review surface
      fireEvent.click(await screen.findByTestId("surface-tab-review"));

      // Verify scanning info in list card
      await waitFor(() => {
        expect(
          screen.getByTestId("candidate-creative-slot-row-cand-mismatch"),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByTestId("candidate-slot-family-cand-mismatch"),
      ).toHaveTextContent("عد الأحرف");
      expect(
        screen.getByTestId("candidate-slot-mode-cand-mismatch"),
      ).toHaveTextContent("استغلال");
      expect(
        screen.getByTestId("candidate-compliance-indicator-cand-mismatch"),
      ).toHaveTextContent("تعارض مع العائلة");

      // Select candidate
      fireEvent.click(await screen.findByTestId("candidate-row-cand-mismatch"));

      // Verify detail inspection
      expect(await screen.findByTestId("creative-slot-inspector")).toBeInTheDocument();
      expect(
        screen.getByTestId("family-mismatch-approval-blocker-notice"),
      ).toBeInTheDocument();

      // Check approve button is disabled
      const approveBtn = screen.getByTestId("button-approve-candidate");
      expect(approveBtn).toBeDisabled();
    });

    it("displays unverified notice in approval section when compliance is pending", async () => {
      const unverifiedCandidate = mockCandidate({
        candidateId: "cand-unverified",
        findings: [
          {
            code: "FAMILY_COMPLIANCE_UNVERIFIED",
            severity: "warning",
            message: "Family compliance needs human review",
          },
        ],
        authoring: {
          concept: "تداعي حر",
          assignedSlot: {
            slotIndex: 1,
            familyKey: "free-association",
            familyNameAr: "التداعي الحر",
            mode: "exploration",
          },
          familyCompliance: {
            assignedFamilyKey: "free-association",
            isCompliant: false,
            verificationMethod: "manual_review",
          },
        },
      });

      vi.spyOn(api, "listCandidates").mockResolvedValue([unverifiedCandidate]);
      vi.spyOn(api, "getCandidate").mockResolvedValue(unverifiedCandidate);

      render(
        <WithQueryClient>
          <ContentEngineReviewWorkspace />
        </WithQueryClient>,
      );

      // Switch to review surface
      fireEvent.click(await screen.findByTestId("surface-tab-review"));

      // Select candidate
      fireEvent.click(await screen.findByTestId("candidate-row-cand-unverified"));

      await waitFor(() => {
        expect(
          screen.getByTestId("family-unverified-approval-notice"),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText(/ملاحظة توثيق العائلة \(FAMILY_COMPLIANCE_UNVERIFIED\)/i),
      ).toBeInTheDocument();
    });
  });

  describe("3. Preflight & Active Job creative plan visibility", () => {
    it("renders planned family distribution as estimated preview during preflight", async () => {
      vi.spyOn(api, "preflightJob").mockResolvedValue({
        resolvable: true,
        submissionReady: true,
        planDigest: "sha256-abcdef0123456789",
        pricingConfigured: true,
        liveProviderEnabled: true,
        engineEnabled: true,
        budget: {
          periodKey: "2026-10",
          capMicros: 100000000,
          spentMicros: 1000000,
          reservedMicros: 0,
          availableMicros: 99000000,
        },
        generationPlan: {
          digest: "plan-digest-123",
          slots: [
            {
              slotIndex: 0,
              familyKey: "letter-count",
              familyNameAr: "عد الأحرف",
              mode: "exploitation",
              cognitiveTask: "حساب عدد حروف الكلمة ومطابقتها",
            },
            {
              slotIndex: 1,
              familyKey: "letter-count",
              familyNameAr: "عد الأحرف",
              mode: "exploitation",
              cognitiveTask: "حساب عدد حروف الكلمة ومطابقتها",
            },
            {
              slotIndex: 2,
              familyKey: "anagram-rearrange",
              familyNameAr: "إعادة ترتيب الحروف",
              mode: "exploration",
              cognitiveTask: "إعادة ترتيب الحروف لتكوين الكلمة",
            },
          ],
          diversityMetrics: {
            exploitationCount: 2,
            explorationCount: 1,
            distinctFamiliesCount: 2,
            diagnostics: [],
          },
        },
      });

      render(
        <WithQueryClient>
          <BatchSubmissionPanel />
        </WithQueryClient>,
      );

      // Click preflight button
      await waitFor(() => {
        expect(screen.getByTestId("button-preflight")).not.toBeDisabled();
      });
      fireEvent.click(screen.getByTestId("button-preflight"));

      // Verify preview section and badge
      await waitFor(() => {
        expect(
          screen.getByTestId("preflight-creative-plan-section"),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByTestId("preflight-plan-preview-badge"),
      ).toHaveTextContent("معاينة تقديرية قبل الإطلاق (Estimated Preview)");
      expect(screen.getByTestId("preflight-slot-0")).toHaveTextContent(
        "عد الأحرف",
      );
      expect(screen.getByTestId("preflight-slot-2")).toHaveTextContent(
        "إعادة ترتيب الحروف",
      );
      expect(screen.getByText(/استغلال \(Exploitation\):/i)).toBeInTheDocument();
      expect(screen.getByText(/استكشاف \(Exploration\):/i)).toBeInTheDocument();
    });

    it("renders fallback note for V1 preflight when no catalog exists", async () => {
      vi.spyOn(api, "preflightJob").mockResolvedValue({
        resolvable: true,
        submissionReady: true,
        planDigest: "sha256-abcdef0123456789",
        pricingConfigured: true,
        liveProviderEnabled: true,
        engineEnabled: true,
        budget: {
          periodKey: "2026-10",
          capMicros: 100000000,
          spentMicros: 1000000,
          reservedMicros: 0,
          availableMicros: 99000000,
        },
        generationPlan: {
          digest: "v1-legacy-plan",
          slots: [],
        },
      });

      render(
        <WithQueryClient>
          <BatchSubmissionPanel />
        </WithQueryClient>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("button-preflight")).not.toBeDisabled();
      });
      fireEvent.click(screen.getByTestId("button-preflight"));

      await waitFor(() => {
        expect(
          screen.getByTestId("preflight-v1-fallback-note"),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText(/توليد تقليدي V1 \(بدون تقسيم مسبق للعائلات الإبداعية\)/i),
      ).toBeInTheDocument();
    });
  });
});
