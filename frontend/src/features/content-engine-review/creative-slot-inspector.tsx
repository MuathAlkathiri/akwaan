"use client";

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  HelpCircle,
  Layers,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { ReviewCandidate } from "./types";

interface CreativeSlotInspectorProps {
  candidate: ReviewCandidate;
}

export function CreativeSlotInspector({ candidate }: CreativeSlotInspectorProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const assignedSlot = candidate.authoring?.assignedSlot;
  const familyCompliance = candidate.authoring?.familyCompliance;
  const findings = candidate.findings ?? [];
  const reviewDecision = candidate.reviewDecision;

  // Case 1: Legacy V1 Candidate without assigned creative slot
  if (!assignedSlot) {
    return (
      <div
        data-testid="creative-slot-inspector"
        className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-700 shadow-sm transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-slate-500 shrink-0" />
            <span className="font-semibold text-slate-800">
              العائلة الإبداعية وتوجيه التوليد (Creative Plan)
            </span>
            <span
              data-testid="creative-slot-legacy-badge"
              className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600"
            >
              مرشح V1 تقليدي (بدون تخصيص مسبق)
            </span>
          </div>
        </div>
        <p className="mt-1.5 text-slate-500 text-[11px] leading-relaxed">
          تم توليد هذا المرشح وفق بنية الإصدار السابق (V1) قبل اعتماد مخطط العائلات الإبداعية؛ لا توجد خانة توجيه مخصصة لهذا السؤال.
        </p>
      </div>
    );
  }

  // Determine compliance state
  const hasMismatchFinding = findings.some(
    (f) => f.code === "FAMILY_COMPLIANCE_MISMATCH",
  );
  const isStructuralMismatch =
    hasMismatchFinding ||
    (familyCompliance &&
      !familyCompliance.isCompliant &&
      familyCompliance.mismatchReason &&
      !familyCompliance.mismatchReason.includes("NO_ASSIGNED_FAMILY"));

  const hasUnverifiedFinding = findings.some(
    (f) => f.code === "FAMILY_COMPLIANCE_UNVERIFIED",
  );
  const isManuallyResolved = Boolean(
    reviewDecision?.familyComplianceResolution?.resolvedByReviewer ||
      familyCompliance?.resolvedByReviewerId,
  );
  const isUnverifiedPending = hasUnverifiedFinding && !isManuallyResolved;

  const isCompliant =
    !isStructuralMismatch &&
    !isUnverifiedPending &&
    (familyCompliance?.isCompliant ||
      familyCompliance?.verificationMethod === "rule_evaluated" ||
      !hasMismatchFinding);

  const getContainerStyles = () => {
    if (isStructuralMismatch) {
      return "border-rose-300 bg-rose-50/40";
    }
    if (isUnverifiedPending) {
      return "border-amber-300 bg-amber-50/40";
    }
    if (isManuallyResolved) {
      return "border-emerald-300 bg-emerald-50/40";
    }
    return "border-emerald-200 bg-emerald-50/30";
  };

  const getModeBadge = () => {
    if (assignedSlot.mode === "exploration") {
      return (
        <span
          data-testid="creative-slot-mode-badge"
          className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700"
        >
          <Compass className="size-3" />
          <span>استكشاف (Exploration)</span>
        </span>
      );
    }
    return (
      <span
        data-testid="creative-slot-mode-badge"
        className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700"
      >
        <Sparkles className="size-3" />
        <span>استغلال (Exploitation)</span>
      </span>
    );
  };

  const getComplianceBadge = () => {
    if (isStructuralMismatch) {
      return (
        <span
          data-testid="creative-slot-compliance-badge"
          className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800"
        >
          <ShieldAlert className="size-3" />
          <span>تعارض مع العائلة (Approval Blocked)</span>
        </span>
      );
    }
    if (isManuallyResolved) {
      return (
        <span
          data-testid="creative-slot-compliance-badge"
          className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800"
        >
          <CheckCircle2 className="size-3" />
          <span>معتمد بقرار بشري (Manually Approved)</span>
        </span>
      );
    }
    if (isUnverifiedPending) {
      return (
        <span
          data-testid="creative-slot-compliance-badge"
          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800"
        >
          <AlertTriangle className="size-3" />
          <span>بانتظار التحقق البشري (Pending Explanation)</span>
        </span>
      );
    }
    return (
      <span
        data-testid="creative-slot-compliance-badge"
        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800"
      >
        <CheckCircle2 className="size-3" />
        <span>عائلة مطابقة (Rule Evaluated)</span>
      </span>
    );
  };

  return (
    <div
      data-testid="creative-slot-inspector"
      className={`rounded-xl border p-4 text-xs shadow-sm transition-colors ${getContainerStyles()}`}
    >
      {/* Top row: Slot title, slot index, mode chip, compliance badge */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Layers className="size-4 text-slate-700 shrink-0" />
          <span className="font-bold text-sm text-foreground">
            العائلة الإبداعية وتوجيه التوليد
          </span>
          <span
            data-testid="creative-slot-number"
            className="rounded-md border border-slate-300 bg-white/90 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs"
          >
            الخانة #{assignedSlot.slotIndex + 1}
          </span>
          {getModeBadge()}
          {getComplianceBadge()}
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 transition self-end sm:self-auto"
        >
          <span>{detailsOpen ? "إخفاء التفاصيل" : "عرض تفاصيل الخانة"}</span>
          {detailsOpen ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
      </div>

      {/* Primary Row: Assigned Family and Quick Cognitive Solve */}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-border/40 pt-3">
        <div>
          <span className="text-[11px] text-muted-foreground block">
            العائلة القانونية المخصصة:
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              data-testid="creative-slot-family-name"
              className="font-bold text-foreground text-sm"
            >
              {assignedSlot.familyNameAr || assignedSlot.familyKey}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground dir-ltr">
              ({assignedSlot.familyKey})
            </span>
          </div>
        </div>

        <div>
          <span className="text-[11px] text-muted-foreground block">
            المهمة الإدراكية المطلوبة:
          </span>
          <p
            data-testid="creative-slot-cognitive-task"
            className="font-medium text-foreground text-xs mt-0.5"
          >
            {assignedSlot.cognitiveTask || "غير محددة"}
          </p>
        </div>
      </div>

      {/* Compliance Status Alerts */}
      {isStructuralMismatch && (
        <div
          data-testid="creative-slot-mismatch-alert"
          className="mt-3 rounded-lg border border-rose-300 bg-rose-100/80 p-3 text-rose-950"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="size-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-xs text-rose-900">
                تعارض مؤكد مع شروط العائلة (FAMILY_COMPLIANCE_MISMATCH):
              </p>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                {familyCompliance?.mismatchReason ||
                  findings.find((f) => f.code === "FAMILY_COMPLIANCE_MISMATCH")
                    ?.message ||
                  "محتوى السؤال لا يتطابق مع متطلبات العائلة المخصصة."}
              </p>
              <p className="text-[11px] font-semibold text-rose-900 mt-1">
                ⛔ الاعتماد وإنشاء المسودة محظوران؛ يلزم تعديل محتوى السؤال ليتطابق مع العائلة قبل الاعتماد.
              </p>
            </div>
          </div>
        </div>
      )}

      {isUnverifiedPending && (
        <div
          data-testid="creative-slot-unverified-alert"
          className="mt-3 rounded-lg border border-amber-300 bg-amber-100/70 p-3 text-amber-950"
        >
          <div className="flex items-start gap-2">
            <HelpCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-xs text-amber-900">
                عائلة تتطلب تقييمًا بشريًا (FAMILY_COMPLIANCE_UNVERIFIED):
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                لم يتم التحقق من امتثال هذا السؤال آليًا؛ يجب على المراجع التحقق يدويًا وتدوين سبب الاعتماد وتطابق المحتوى مع العائلة في خانة الشرح عند الاعتماد.
              </p>
            </div>
          </div>
        </div>
      )}

      {isManuallyResolved && (
        <div
          data-testid="creative-slot-resolution-box"
          className="mt-3 rounded-lg border border-emerald-300 bg-emerald-100/60 p-3 text-emerald-950"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-xs text-emerald-900">
                تم توثيق الامتثال بقرار بشري معتمد:
              </p>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                شرح المراجع:{" "}
                <span className="font-medium text-emerald-950">
                  {reviewDecision?.familyComplianceResolution
                    ?.reviewerExplanation ||
                    reviewDecision?.explanation ||
                    "تم توثيق الامتثال والتوافق مع العائلة."}
                </span>
              </p>
              {reviewDecision?.familyComplianceResolution?.resolvedAt && (
                <p className="text-[10px] text-emerald-700">
                  تاريخ التوثيق:{" "}
                  {String(
                    reviewDecision.familyComplianceResolution.resolvedAt,
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {isCompliant && !isManuallyResolved && (
        <p className="mt-2 text-[11px] text-emerald-800 font-medium">
          ✓ تم التحقق آليًا من تطابق السؤال مع قواعد العائلة القانونية المخصصة بنجاح.
        </p>
      )}

      {/* Expandable Technical Details */}
      {detailsOpen && (
        <div className="mt-3 border-t border-border/60 pt-3 space-y-2.5 text-[11px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground">الزاوية الإبداعية:</span>
              <p
                data-testid="creative-slot-creative-angle"
                className="font-medium text-foreground mt-0.5"
              >
                {assignedSlot.creativeAngle || "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">ملاءمة الميكانيكا:</span>
              <p
                data-testid="creative-slot-mechanic-fit"
                className="font-medium text-foreground mt-0.5"
              >
                {assignedSlot.mechanicFit || "—"}
              </p>
            </div>
          </div>

          <div>
            <span className="text-muted-foreground">سبب اختيار العائلة:</span>
            <p
              data-testid="creative-slot-selection-reason"
              className="font-medium text-foreground mt-0.5"
            >
              {assignedSlot.selectionReason || "—"}
            </p>
          </div>

          {assignedSlot.difficulty && (
            <div>
              <span className="text-muted-foreground">مستوى الصعوبة المخطط للخانة: </span>
              <span className="font-mono font-semibold text-foreground">
                {assignedSlot.difficulty}
              </span>
            </div>
          )}

          {familyCompliance && (
            <div className="rounded-md bg-white/70 p-2 border border-border/40 font-mono text-[10px] space-y-0.5">
              <div>طريقة التحقق: {familyCompliance.verificationMethod}</div>
              <div>حالة الامتثال: {familyCompliance.isCompliant ? "مطابق" : "غير مطابق"}</div>
              {familyCompliance.detectedFamilyKey && (
                <div>العائلة المكتشفة: {familyCompliance.detectedFamilyKey}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
