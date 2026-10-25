"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BatchSubmissionPanel } from "./batch-submission-panel";
import { JobsHistoryPanel } from "./jobs-history-panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  FilePlus2,
  Lock,
  Pencil,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/components/ui/toast";
import { PageHeader, SectionCard } from "@/components/shared";
import { EntityFormDialog } from "@/features/world-management/components/shared/entity-form-dialog";
import { ContentItemForm } from "@/features/world-management/components/content-items/content-item-form";
import type { ContentItem } from "@/features/world-management/types";
import * as api from "./api";
import type {
  FactualOverrideCode,
  FactualState,
  QualityRubric,
  ReviewCandidate,
} from "./types";

export type StudioSurface = "generate" | "jobs" | "review";

export const STUDIO_STORAGE_KEY = "akwaan.contentEngineStudio.state.v1";

interface PersistedStudioState {
  surface: StudioSurface;
  activeJobId: string | null;
  filters: {
    jobId: string;
    worldKey: string;
    scopeKey: string;
    status: string;
  };
}

const readInitialStudioState = (): PersistedStudioState => {
  const fallback: PersistedStudioState = {
    surface: "generate",
    activeJobId: null,
    filters: {
      jobId: "",
      worldKey: "",
      scopeKey: "",
      status: "pending",
    },
  };

  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.sessionStorage?.getItem(STUDIO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedStudioState>;
      if (
        parsed.surface === "generate" ||
        parsed.surface === "jobs" ||
        parsed.surface === "review"
      ) {
        fallback.surface = parsed.surface;
      }
      if (typeof parsed.activeJobId === "string" && parsed.activeJobId) {
        fallback.activeJobId = parsed.activeJobId;
      }
      if (parsed.filters && typeof parsed.filters === "object") {
        fallback.filters = {
          jobId: parsed.filters.jobId ?? "",
          worldKey: parsed.filters.worldKey ?? "",
          scopeKey: parsed.filters.scopeKey ?? "",
          status: parsed.filters.status ?? "pending",
        };
      }
    }
  } catch {
    // Ignore storage read errors
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const qSurface = params.get("surface");
    if (
      qSurface === "generate" ||
      qSurface === "jobs" ||
      qSurface === "review"
    ) {
      fallback.surface = qSurface;
    }
    const qJobId = params.get("jobId");
    if (qJobId) {
      fallback.activeJobId = qJobId;
      if (!fallback.filters.jobId) {
        fallback.filters.jobId = qJobId;
      }
    }
    const qWorld = params.get("worldKey");
    if (qWorld) fallback.filters.worldKey = qWorld;
    const qScope = params.get("scopeKey");
    if (qScope) fallback.filters.scopeKey = qScope;
  } catch {
    // Ignore URL param errors
  }

  return fallback;
};

const qualityDefaults: QualityRubric = {
  correctness: 3,
  mechanicFit: 3,
  clarity: 3,
  multiplayerFit: 3,
  originality: 3,
  explanation: "",
};

/** Player-facing band names, so a reviewer reads a phrase and not a slug. */
const CONFIDENCE_LABELS: Record<string, string> = {
  "near-certain": "شبه مؤكد — يعرفه الجميع على الأغلب",
  likely: "مرجّح — يعرفه أغلب الفرق",
  even: "متكافئ — نحو النصف",
  unlikely: "غير مرجّح — أغلب الفرق لا تعرفه",
  "near-impossible": "شبه مستحيل — لا يكاد أحد يعرفه",
};

const FACTUAL_OVERRIDE_LABELS: Record<FactualOverrideCode, string> = {
  ACCEPTED_WITH_EVIDENCE:
    "مقبول بدليل موثّق (ACCEPTED_WITH_EVIDENCE) — يتطلب رابط دليل في التقييم البشري",
  CLAIM_NOT_ANSWER_CRITICAL:
    "الادعاء غير جوهري لصحة الإجابة (CLAIM_NOT_ANSWER_CRITICAL)",
  CLAIM_CORRECTED:
    "تم تصحيح الادعاء بتعديل المرشح (CLAIM_CORRECTED) — يتطلب تعديلاً مسجلاً",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  edited: "تعديل المرشح",
  assessment_invalidated: "إبطال التقييم السابق",
  assessed: "تقييم بشري",
  approved: "اعتماد المرشح",
  rejected: "رفض المرشح",
  draft_created: "إنشاء مسودة قانونية (DRAFT)",
};

/** The option's own label where it still exists, else its bare id. */
const optionLabel = (
  candidate: ReviewCandidate,
  optionId: string,
): string => {
  const options = (
    candidate.draft?.answerPayload as
      | { options?: Array<{ id?: string; label?: { ar?: string } }> }
      | undefined
  )?.options;
  const match = options?.find((option) => option.id === optionId);
  return match?.label?.ar ?? optionId;
};

const extractConflictDetails = (
  err: unknown,
): { message: string; isConflict: boolean; currentRevision?: number } => {
  const response = (
    err as {
      response?: {
        status?: number;
        data?: {
          message?: string | string[];
          currentRevision?: number;
        };
      };
      message?: string;
    }
  )?.response;
  const status = response?.status;
  const rawMessage = response?.data?.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.join(" — ")
    : typeof rawMessage === "string"
      ? rawMessage
      : err instanceof Error && err.message
        ? err.message
        : "تعذر تنفيذ العملية.";
  const isConflict =
    status === 409 ||
    /reload before|changed|revision|stale/i.test(message);
  return {
    message,
    isConflict,
    currentRevision: response?.data?.currentRevision,
  };
};

export function ContentEngineReviewWorkspace() {
  const client = useQueryClient();
  const initial = useMemo(() => readInitialStudioState(), []);
  const [activeSurface, setActiveSurface] = useState<StudioSurface>(
    initial.surface,
  );
  const [activeJobId, setActiveJobId] = useState<string | null>(
    initial.activeJobId,
  );
  const [filters, setFilters] = useState(initial.filters);
  const [selectedId, setSelectedId] = useState<string>();
  const [editOpen, setEditOpen] = useState(false);
  const [editExplanation, setEditExplanation] = useState("");
  const [editClaimsText, setEditClaimsText] = useState("");
  const [editModalError, setEditModalError] = useState<string | null>(null);

  const [factualState, setFactualState] = useState<FactualState>("UNRESOLVED");
  const [factualExplanation, setFactualExplanation] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [quality, setQuality] = useState(qualityDefaults);

  const [decisionExplanation, setDecisionExplanation] = useState("");
  const [rejectionReason, setRejectionReason] = useState("LOW_QUALITY");
  const [factualOverrideCode, setFactualOverrideCode] = useState<
    FactualOverrideCode | ""
  >("");
  const [overrideExplanation, setOverrideExplanation] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [revisionConflict, setRevisionConflict] = useState<{
    message: string;
    currentRevision?: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stateToPersist: PersistedStudioState = {
      surface: activeSurface,
      activeJobId,
      filters,
    };
    try {
      window.sessionStorage?.setItem(
        STUDIO_STORAGE_KEY,
        JSON.stringify(stateToPersist),
      );
    } catch {
      // Ignore storage write errors
    }
    try {
      const params = new URLSearchParams(window.location.search);
      params.set("surface", activeSurface);
      if (activeJobId) params.set("jobId", activeJobId);
      else params.delete("jobId");
      if (filters.worldKey) params.set("worldKey", filters.worldKey);
      else params.delete("worldKey");
      if (filters.scopeKey) params.set("scopeKey", filters.scopeKey);
      else params.delete("scopeKey");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (nextUrl !== currentUrl) {
        window.history?.replaceState?.(null, "", nextUrl);
      }
    } catch {
      // Ignore history replace errors
    }
  }, [activeSurface, activeJobId, filters]);

  const handleCandidateHandoff = useCallback(
    (selection: {
      jobId: string;
      worldKey: string;
      scopeKey: string;
      mechanicKey?: string;
    }) => {
      setActiveJobId(selection.jobId);
      setFilters((current) => ({
        ...current,
        jobId: selection.jobId,
        worldKey: selection.worldKey || current.worldKey,
        scopeKey: selection.scopeKey || current.scopeKey,
      }));
      setActiveSurface("review");
    },
    [],
  );

  const list = useQuery({
    queryKey: ["content-engine-review", filters],
    queryFn: () =>
      api.listCandidates(
        Object.fromEntries(
          Object.entries(filters).map(([key, value]) => [
            key,
            value || undefined,
          ]),
        ),
      ),
  });
  const detail = useQuery({
    queryKey: ["content-engine-review-detail", selectedId],
    queryFn: () => api.getCandidate(selectedId!),
    enabled: Boolean(selectedId),
  });
  const spending = useQuery({
    queryKey: ["content-engine-spending", detail.data?.jobId],
    queryFn: () => api.getSpending(detail.data!.jobId),
    enabled: Boolean(detail.data?.jobId),
  });

  const candidate = detail.data;

  // Hydrate assessment and edit fields when the selected candidate or revision changes
  useEffect(() => {
    if (!candidate) return;
    setActionError(null);
    setRevisionConflict(null);
    setEditClaimsText((candidate.factualClaims ?? []).join("\n"));
    setEditExplanation("");
    setEditModalError(null);
    if (candidate.humanAssessment) {
      setFactualState(candidate.humanAssessment.factualState);
      setFactualExplanation(candidate.humanAssessment.factualExplanation ?? "");
      setEvidenceUrl(candidate.humanAssessment.evidence?.[0]?.url ?? "");
      setEvidenceTitle(candidate.humanAssessment.evidence?.[0]?.title ?? "");
      setEvidenceNote(candidate.humanAssessment.evidence?.[0]?.note ?? "");
      setQuality(candidate.humanAssessment.quality ?? qualityDefaults);
    } else {
      setFactualState("UNRESOLVED");
      setFactualExplanation("");
      setEvidenceUrl("");
      setEvidenceTitle("");
      setEvidenceNote("");
      setQuality(qualityDefaults);
    }
    setFactualOverrideCode("");
    setOverrideExplanation("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.candidateId, candidate?.reviewRevision]);

  const refresh = async () => {
    setRevisionConflict(null);
    setActionError(null);
    await client.invalidateQueries({ queryKey: ["content-engine-review"] });
    await client.invalidateQueries({
      queryKey: ["content-engine-review-detail", selectedId],
    });
  };

  const action = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      setActionError(null);
      setRevisionConflict(null);
      await refresh();
      showToast({ message: "تم حفظ قرار المراجعة." });
    },
    onError: (err) => {
      const parsed = extractConflictDetails(err);
      setActionError(parsed.message);
      if (parsed.isConflict) {
        setRevisionConflict({
          message: parsed.message,
          currentRevision: parsed.currentRevision,
        });
      }
      showToast({
        type: "error",
        message: parsed.message || "تعذر حفظ القرار. قد يكون المرشح تغيّر لدى مراجع آخر.",
      });
    },
  });

  const editable = useMemo(
    () => (candidate ? toEditableContentItem(candidate) : null),
    [candidate],
  );

  const eligibility = useMemo(
    () => (candidate ? deriveCandidateEligibility(candidate) : null),
    [candidate],
  );

  const openEditDialog = () => {
    if (!candidate) return;
    setEditClaimsText((candidate.factualClaims ?? []).join("\n"));
    setEditExplanation("");
    setEditModalError(null);
    setEditOpen(true);
  };

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-6 overflow-x-hidden px-4 py-8 sm:px-6 lg:px-10">
      <PageHeader
        title="استوديو توليد المحتوى (Content Generation Studio)"
        description="توليد الدفعات من الخيارات القانونية، الفحص المسبق للتكلفة، التشغيل المحدد بالدفعة، والمراجعة البشرية قبل إنشاء مسودات ContentItem."
      />

      {/* Connected Studio Surfaces Navigation */}
      <nav
        aria-label="أقسام استوديو محرك المحتوى"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-white p-3 shadow-sm"
        data-testid="studio-surface-nav"
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="surface-tab-generate"
            onClick={() => setActiveSurface("generate")}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeSurface === "generate"
                ? "bg-amber-500 text-white shadow-sm"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            1. التوليد والفحص المسبق (Generate)
          </button>
          <button
            type="button"
            data-testid="surface-tab-jobs"
            onClick={() => setActiveSurface("jobs")}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeSurface === "jobs"
                ? "bg-amber-500 text-white shadow-sm"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            2. سجل الدفعات والتشغيل (Jobs)
          </button>
          <button
            type="button"
            data-testid="surface-tab-review"
            onClick={() => setActiveSurface("review")}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeSurface === "review"
                ? "bg-amber-500 text-white shadow-sm"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            3. مراجعة المرشحين (Candidate Review)
          </button>
        </div>

        {(activeJobId || filters.jobId) && (
          <div
            className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-xs text-slate-600"
            data-testid="studio-preserved-context"
          >
            <span className="text-slate-500">الدفعة المحددة:</span>
            <span className="break-all rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 font-mono text-amber-900 font-medium">
              {filters.jobId || activeJobId}
            </span>
            {filters.worldKey && (
              <span className="break-all rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-slate-700">
                {filters.worldKey}
                {filters.scopeKey ? ` / ${filters.scopeKey}` : ""}
              </span>
            )}
          </div>
        )}
      </nav>

      {activeSurface === "generate" && (
        <BatchSubmissionPanel
          initialJobId={activeJobId}
          onActiveJobIdChange={setActiveJobId}
          onJobSubmitted={(jobId) => {
            setActiveJobId(jobId);
            setFilters((current) => ({ ...current, jobId }));
          }}
          onBatchReady={handleCandidateHandoff}
          onOpenJobsSurface={(jobId) => {
            if (jobId) setActiveJobId(jobId);
            setActiveSurface("jobs");
          }}
        />
      )}

      {activeSurface === "jobs" && (
        <JobsHistoryPanel
          selectedJobId={activeJobId}
          onSelectJobId={setActiveJobId}
          onHandoffToReview={handleCandidateHandoff}
        />
      )}

      {activeSurface === "review" && (
        <SectionCard
          title="المرشحون"
          description="تصفية حسب الدفعة والعالم والنطاق والحالة"
        >
          <div className="grid gap-3 md:grid-cols-4">
            {(["jobId", "worldKey", "scopeKey"] as const).map((key) => (
              <Input
                key={key}
                aria-label={key}
                placeholder={
                  {
                    jobId: "Job ID",
                    worldKey: "World",
                    scopeKey: "Scope",
                  }[key]
                }
                value={filters[key]}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            ))}
            <select
              aria-label="status"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              <option value="">كل الحالات</option>
              <option value="pending">بانتظار المراجعة</option>
              <option value="approved">معتمد</option>
              <option value="rejected">مرفوض</option>
              <option value="fact_blocked">تدقيق الحقائق متعثر</option>
            </select>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {(list.data ?? []).map((row) => (
              <button
                key={row.candidateId}
                type="button"
                data-testid={`candidate-row-${row.candidateId}`}
                onClick={() => setSelectedId(row.candidateId)}
                className={`rounded-xl border p-4 text-right transition-colors hover:bg-muted/50 ${
                  selectedId === row.candidateId
                    ? "border-amber-500/70 bg-amber-500/5"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">
                    {row.draft?.prompt?.ar ?? "مرشح بلا سؤال"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {row.publishedContentItemId && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                        مسودة منشأة
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-1 text-xs">
                      {row.reviewStatus}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {row.job?.worldKey} / {row.job?.scopeKey} ·{" "}
                  {row.job?.mechanicKey} · rev {row.reviewRevision}
                </p>
              </button>
            ))}
            {!list.isLoading && !list.data?.length && (
              <p className="text-sm text-muted-foreground">
                لا توجد مرشحات مطابقة.
              </p>
            )}
          </div>
        </SectionCard>
      )}

      {activeSurface === "review" && candidate && (
        <>
          {revisionConflict && (
            <div
              role="alert"
              data-testid="revision-conflict-banner"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 shadow-sm"
            >
              <div className="space-y-1">
                <p className="font-semibold">
                  تعارض في رقم مراجعة المرشح (Stale Revision Conflict)
                </p>
                <p className="text-xs opacity-90 text-rose-700">
                  {revisionConflict.message}
                  {typeof revisionConflict.currentRevision === "number"
                    ? ` (المراجعة الحالية على الخادم: ${revisionConflict.currentRevision}، المراجعة المعروضة: ${candidate.reviewRevision})`
                    : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-rose-300 bg-white text-rose-900 hover:bg-rose-100"
                data-testid="button-reload-conflicted-candidate"
                onClick={() => void refresh()}
              >
                <RefreshCw className="me-1.5 size-4" />
                إعادة تحميل أحدث نسخة للمرشح
              </Button>
            </div>
          )}

          <SectionCard
            title="تفاصيل المرشح"
            description={`Revision ${candidate.reviewRevision} · ${candidate.status} · Review: ${candidate.reviewStatus}`}
            actions={
              editable && !candidate.publishedContentItemId ? (
                <Button
                  variant="outline"
                  data-testid="button-open-candidate-editor"
                  onClick={openEditDialog}
                >
                  <Pencil className="me-2 size-4" /> تعديل بالمحرر المعتمد
                </Button>
              ) : undefined
            }
          >
            {/* Target Identity & Canonical Resolution Context */}
            <div
              data-testid="candidate-target-context"
              className="grid gap-2 rounded-xl border bg-muted/30 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4"
            >
              <div>
                <span className="text-muted-foreground">معرّف المرشح: </span>
                <span className="font-mono font-semibold">
                  {candidate.candidateId}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">معرّف الدفعة: </span>
                <span className="font-mono">{candidate.jobId}</span>
              </div>
              <div className="flex items-center gap-1">
                <Lock className="size-3.5 text-amber-500" />
                <span className="text-muted-foreground">الهدف المثبت: </span>
                <span className="font-mono font-semibold">
                  {candidate.job?.worldKey ?? candidate.canonicalTarget?.worldKey ?? "—"}{" "}
                  /{" "}
                  {candidate.job?.scopeKey ?? candidate.canonicalTarget?.scopeKey ?? "—"}{" "}
                  ·{" "}
                  {candidate.job?.mechanicKey ??
                    candidate.canonicalTarget?.mechanicKey ??
                    "—"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">حالة المسودة: </span>
                {candidate.publishedContentItemId ? (
                  <span
                    className="font-mono font-semibold text-emerald-400"
                    data-testid="published-content-item-id"
                  >
                    DRAFT ({candidate.publishedContentItemId})
                  </span>
                ) : (
                  <span>لم تُنشأ مسودة ContentItem بعد</span>
                )}
              </div>
            </div>

            {candidate.targetResolutionError && (
              <div
                role="alert"
                data-testid="candidate-target-error"
                className="flex items-start gap-2 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-semibold">
                    تعذر التحقق من الهدف القانوني (العالم / النطاق / الميكانيكا)
                  </p>
                  <p>{candidate.targetResolutionError}</p>
                </div>
              </div>
            )}

            {/* Stale vs Current Assessment Banner */}
            {eligibility?.assessmentStale && (
              <div
                role="alert"
                data-testid="stale-assessment-warning"
                className="space-y-1.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldAlert className="size-4 shrink-0 text-amber-600" />
                  <span>
                    تم إبطال التقييم السابق بعد تعديل جوهري — يلزم حفظ تقييم بشري جديد للمراجعة {candidate.reviewRevision}
                  </span>
                </div>
                {candidate.lastInvalidatedAssessments && (
                  <p className="text-[11px] opacity-90 text-amber-800">
                    ملخص التقييم المؤرشف قبل التعديل (المراجعة{" "}
                    {candidate.lastInvalidatedAssessments.previousRevision}):{" "}
                    الحالة البشرية السابقة:{" "}
                    <span className="font-mono font-semibold">
                      {candidate.lastInvalidatedAssessments.humanAssessment
                        ?.factualState ?? "غير مقيم"}
                    </span>
                    {candidate.lastInvalidatedAssessments.changedFields?.length
                      ? ` · الحقول المعدلة: ${candidate.lastInvalidatedAssessments.changedFields.join(", ")}`
                      : ""}
                    {candidate.lastInvalidatedAssessments.reason
                      ? ` · سبب التعديل: ${candidate.lastInvalidatedAssessments.reason}`
                      : ""}
                  </p>
                )}
              </div>
            )}

            {eligibility?.assessmentCurrent && candidate.humanAssessment && (
              <div
                data-testid="current-assessment-badge"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs text-emerald-900"
              >
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
                  <span>
                    التقييم البشري محدّث للنسخة الحالية (rev{" "}
                    {candidate.humanAssessment.assessedRevision ??
                      candidate.reviewRevision}
                    ) — الحالة الواقعية:{" "}
                    <strong className="text-emerald-950 font-bold">{candidate.humanAssessment.factualState}</strong>
                  </span>
                </div>
                <span className="text-emerald-800 text-[11px]">
                  بواسطة {candidate.humanAssessment.reviewerEmail} · الأدلة المرفقة:{" "}
                  {candidate.humanAssessment.evidence?.length ?? 0}
                </span>
              </div>
            )}

            {/* Mechanic-Specific Question & Answer Presentation */}
            <div
              data-testid="candidate-answer-presentation"
              className="space-y-3 rounded-xl border p-4"
            >
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  نص السؤال (العربية)
                </p>
                <p className="mt-1 text-lg font-bold">
                  {candidate.draft?.prompt?.ar}
                </p>
                {candidate.draft?.prompt?.en && (
                  <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                    {candidate.draft.prompt.en}
                  </p>
                )}
              </div>

              <MechanicAnswerSummary candidate={candidate} />

              <details className="rounded-lg bg-muted/50 p-2 text-xs">
                <summary className="cursor-pointer font-medium text-muted-foreground">
                  عرض حمولة الإجابة الخام (Raw answerPayload JSON)
                </summary>
                <pre
                  className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs"
                  dir="ltr"
                >
                  {JSON.stringify(candidate.draft?.answerPayload, null, 2)}
                </pre>
              </details>
            </div>

            {/* Factual Claims List */}
            <div
              data-testid="candidate-factual-claims"
              className="space-y-1.5 rounded-xl border p-3"
            >
              <p className="text-xs font-semibold text-muted-foreground">
                الادعاءات الواقعية المستخرجة للمراجعة (Factual Claims)
              </p>
              {candidate.factualClaims?.length ? (
                <ul className="list-disc space-y-1 pe-5 text-sm">
                  {candidate.factualClaims.map((claim, idx) => (
                    <li key={`${idx}-${claim}`}>{claim}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  لا توجد ادعاءات واقعية مسجلة لهذا المرشح.
                </p>
              )}
            </div>

            {/* The slider is the half of a Closest item a reviewer actually
                has to judge — whether the span came from the question's domain
                and whether the target is reachable on the grid. Showing only
                the answer payload hides it. */}
            {(candidate.authoring?.concept ||
              candidate.authoring?.playerReasoningStrategy) && (
              <div
                className="space-y-2 rounded-xl border border-dashed p-3"
                data-testid="candidate-authoring-rationale"
              >
                <p className="text-xs font-semibold text-muted-foreground">
                  مبرّر التأليف — هل يملك الفريق مدخلًا للتخمين؟
                </p>
                {candidate.authoring?.answerBasis && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">نوع السؤال: </span>
                    {candidate.authoring.answerBasis === "knowledge-anchored"
                      ? "معلومة رقمية — يُقدَّر من المألوف"
                      : "استنتاج — المعطيات في نص السؤال"}
                  </p>
                )}
                {candidate.authoring?.concept && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">الفكرة: </span>
                    {candidate.authoring.concept}
                  </p>
                )}
                {candidate.authoring?.estimatedConfidence && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">
                      تقدير صعوبة السؤال (فرضية تأليف، لا قياس):{" "}
                    </span>
                    {CONFIDENCE_LABELS[
                      candidate.authoring.estimatedConfidence.band
                    ] ?? candidate.authoring.estimatedConfidence.band}
                    {candidate.authoring.estimatedConfidence.why
                      ? ` — ${candidate.authoring.estimatedConfidence.why}`
                      : ""}
                  </p>
                )}
                {Boolean(candidate.authoring?.distractorRationale?.length) && (
                  <div
                    className="space-y-1"
                    data-testid="candidate-distractor-rationale"
                  >
                    <p className="text-xs text-muted-foreground">
                      مبرّر الخيارات الخاطئة — هل كلٌّ منها مُقنع فعلًا؟
                    </p>
                    <ul className="list-disc space-y-1 pe-5 text-sm">
                      {candidate.authoring!.distractorRationale!.map(
                        (entry) => (
                          <li key={entry.optionId}>
                            <span className="text-muted-foreground">
                              {optionLabel(candidate, entry.optionId)}:{" "}
                            </span>
                            {entry.why}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
                {candidate.authoring?.playerReasoningStrategy && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">
                      {candidate.authoring?.answerBasis === "knowledge-anchored"
                        ? "مرجع التقدير: "
                        : "طريقة وصول اللاعب: "}
                    </span>
                    {candidate.authoring.playerReasoningStrategy}
                  </p>
                )}
              </div>
            )}

            {Boolean(
              (
                candidate.draft?.mechanicPayload as
                  | { closestSlider?: unknown }
                  | undefined
              )?.closestSlider,
            ) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  شريط التقدير — تحقّق أن المدى من طبيعة السؤال وأن الهدف قابل للوصول
                </p>
                <pre
                  className="overflow-x-auto rounded-xl bg-muted p-3 text-xs"
                  dir="ltr"
                  data-testid="candidate-closest-slider"
                >
                  {JSON.stringify(
                    (
                      candidate.draft?.mechanicPayload as {
                        closestSlider?: unknown;
                      }
                    ).closestSlider,
                    null,
                    2,
                  )}
                </pre>
              </div>
            )}
            <div className="space-y-2">
              {candidate.findings.map((finding) => (
                <div
                  key={finding.code}
                  className="flex gap-2 rounded-lg border p-3 text-sm"
                >
                  {finding.severity === "blocking" && (
                    <AlertTriangle className="size-4 shrink-0 text-destructive" />
                  )}
                  <span>
                    <strong>{finding.code}</strong> — {finding.message}
                  </span>
                </div>
              ))}
            </div>
            <EvaluationBlock
              label="التحقق الآلي"
              value={candidate.factVerification}
            />
            <EvaluationBlock
              label="تقييم الجودة الآلي"
              value={candidate.qualityEvaluation}
            />
            <EvaluationBlock
              label="التوافق"
              value={candidate.compatibilityEvaluation}
            />
            {spending.data && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                تكلفة الدفعة: {(spending.data.spentSar ?? 0).toFixed(4)} ر.س · محجوز:{" "}
                {(spending.data.reservedSar ?? 0).toFixed(4)} ر.س
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="التقييم البشري"
            description="الروابط والتفسير محفوظة مع هوية المراجع والتوقيت، ويُشترط رابط دليل عند توثيق الادعاءات غير المدعومة آلياً"
          >
            <select
              aria-label="factual state"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={factualState}
              onChange={(event) =>
                setFactualState(event.target.value as FactualState)
              }
            >
              {(
                [
                  "SUPPORTED",
                  "UNSUPPORTED",
                  "CONTRADICTED",
                  "UNRESOLVED",
                ] as const
              ).map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                placeholder="رابط الدليل (https://...)"
                value={evidenceUrl}
                onChange={(event) => setEvidenceUrl(event.target.value)}
              />
              <Input
                placeholder="عنوان المصدر (اختياري)"
                value={evidenceTitle}
                onChange={(event) => setEvidenceTitle(event.target.value)}
              />
              <Input
                placeholder="ملاحظة المصدر (اختياري)"
                value={evidenceNote}
                onChange={(event) => setEvidenceNote(event.target.value)}
              />
            </div>
            <Textarea
              placeholder="تفسير التحقق الواقعي (مطلوب)"
              value={factualExplanation}
              onChange={(event) => setFactualExplanation(event.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-5">
              {(
                [
                  "correctness",
                  "mechanicFit",
                  "clarity",
                  "multiplayerFit",
                  "originality",
                ] as const
              ).map((key) => (
                <label key={key} className="text-xs">
                  {key}
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={quality[key]}
                    onChange={(event) =>
                      setQuality((current) => ({
                        ...current,
                        [key]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <Textarea
              placeholder="شرح معيار الجودة (مطلوب)"
              value={quality.explanation}
              onChange={(event) =>
                setQuality((current) => ({
                  ...current,
                  explanation: event.target.value,
                }))
              }
            />
            <Button
              data-testid="button-save-assessment"
              disabled={
                action.isPending ||
                Boolean(candidate.publishedContentItemId) ||
                !factualExplanation.trim() ||
                !quality.explanation.trim()
              }
              onClick={() =>
                action.mutate(() =>
                  api.assessCandidate(candidate.candidateId, {
                    expectedRevision: candidate.reviewRevision,
                    factualState,
                    factualExplanation: factualExplanation.trim(),
                    evidence: evidenceUrl.trim()
                      ? [
                          {
                            url: evidenceUrl.trim(),
                            ...(candidate.factualClaims?.length > 0
                              ? {
                                  claimIndex: 0,
                                  claimText: candidate.factualClaims[0],
                                }
                              : {}),
                            ...(evidenceTitle.trim()
                              ? { title: evidenceTitle.trim() }
                              : {}),
                            ...(evidenceNote.trim()
                              ? { note: evidenceNote.trim() }
                              : {}),
                          },
                        ]
                      : [],
                    quality: {
                      ...quality,
                      explanation: quality.explanation.trim(),
                    },
                  }),
                )
              }
            >
              حفظ التقييم
            </Button>
          </SectionCard>

          <SectionCard
            title="القرار"
            description="الاعتماد والرفض وإنشاء مسودة ContentItem DRAFT خطوات مستقلة ومحمية برقم المراجعة"
          >
            {/* Approval Eligibility & Blockers Panel */}
            {eligibility && (
              <div
                data-testid="approval-eligibility-panel"
                className={`rounded-xl border p-3 text-xs ${
                  eligibility.approvalBlockers.length > 0
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-emerald-300 bg-emerald-50 text-emerald-900"
                }`}
              >
                {eligibility.approvalBlockers.length > 0 ? (
                  <div className="space-y-1">
                    <p className="font-semibold text-amber-950">
                      متطلبات/موانع الاعتماد قبل اتخاذ القرار:
                    </p>
                    <ul className="list-disc space-y-0.5 pe-5">
                      {eligibility.approvalBlockers.map((blocker, idx) => (
                        <li key={idx}>{blocker}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="font-semibold text-emerald-950">
                    المرشح مستوفٍ لشروط التقييم والتوافق وجاهز للاعتماد البشري.
                  </p>
                )}
              </div>
            )}

            {actionError && !revisionConflict && (
              <div
                role="alert"
                data-testid="review-action-error"
                className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive"
              >
                {actionError}
              </div>
            )}

            <Textarea
              placeholder="تفسير القرار (مطلوب للاعتماد أو الرفض)"
              value={decisionExplanation}
              onChange={(event) => setDecisionExplanation(event.target.value)}
            />

            {candidate.humanAssessment &&
              candidate.humanAssessment.factualState !== "SUPPORTED" && (
                <div
                  data-testid="factual-override-section"
                  className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-slate-900"
                >
                  <p className="text-xs font-semibold text-amber-900">
                    قرار تجاوز استثنائي للحالة الواقعية ({candidate.humanAssessment.factualState}) — لا يتم افتراض القبول بالدليل تلقائياً
                  </p>
                  <select
                    aria-label="factual override code"
                    data-testid="select-factual-override-code"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={factualOverrideCode}
                    onChange={(event) =>
                      setFactualOverrideCode(
                        event.target.value as FactualOverrideCode | "",
                      )
                    }
                  >
                    <option value="">
                      -- اختر رمز الحل الصريح للتعارض أو عدم كفاية الدليل --
                    </option>
                    {(
                      eligibility?.allowedFactualOverrideCodes ?? [
                        "ACCEPTED_WITH_EVIDENCE",
                        "CLAIM_NOT_ANSWER_CRITICAL",
                        "CLAIM_CORRECTED",
                      ]
                    ).map((code) => (
                      <option key={code} value={code}>
                        {FACTUAL_OVERRIDE_LABELS[code]}
                      </option>
                    ))}
                  </select>
                  <Textarea
                    placeholder="تفسير حل التعارض أو عدم كفاية الدليل (مطلوب عند التجاوز)"
                    value={overrideExplanation}
                    onChange={(event) =>
                      setOverrideExplanation(event.target.value)
                    }
                  />
                </div>
              )}

            <div className="flex flex-wrap gap-2">
              <Button
                data-testid="button-approve-candidate"
                disabled={
                  action.isPending ||
                  candidate.reviewStatus === "rejected" ||
                  Boolean(candidate.publishedContentItemId) ||
                  !decisionExplanation.trim() ||
                  Boolean(eligibility && !eligibility.canApprove) ||
                  (candidate.humanAssessment?.factualState !== "SUPPORTED" &&
                    (!factualOverrideCode || !overrideExplanation.trim()))
                }
                onClick={() =>
                  action.mutate(() =>
                    api.approveCandidate(candidate.candidateId, {
                      expectedRevision: candidate.reviewRevision,
                      explanation: decisionExplanation.trim(),
                      ...(candidate.humanAssessment?.factualState ===
                      "SUPPORTED"
                        ? {}
                        : {
                            factualOverrideCode: factualOverrideCode || undefined,
                            factualOverrideExplanation:
                              overrideExplanation.trim(),
                          }),
                    }),
                  )
                }
              >
                <Check className="me-2 size-4" /> اعتماد
              </Button>
              <select
                aria-label="rejection reason"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
              >
                {[
                  "FACTUAL_ERROR",
                  "UNSUPPORTED_CLAIM",
                  "MECHANIC_MISMATCH",
                  "SCOPE_MISMATCH",
                  "DUPLICATE",
                  "LOW_QUALITY",
                  "UNSAFE_OR_INAPPROPRIATE",
                  "OTHER",
                ].map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
              <Button
                variant="destructive"
                data-testid="button-reject-candidate"
                disabled={
                  action.isPending ||
                  Boolean(candidate.publishedContentItemId) ||
                  !decisionExplanation.trim()
                }
                onClick={() =>
                  action.mutate(() =>
                    api.rejectCandidate(candidate.candidateId, {
                      expectedRevision: candidate.reviewRevision,
                      reasonCode: rejectionReason,
                      explanation: decisionExplanation.trim(),
                    }),
                  )
                }
              >
                <X className="me-2 size-4" /> رفض
              </Button>
              <Button
                variant="outline"
                data-testid="button-create-canonical-draft"
                disabled={
                  action.isPending ||
                  candidate.reviewStatus !== "approved" ||
                  Boolean(candidate.publishedContentItemId) ||
                  Boolean(eligibility && !eligibility.canCreateDraft)
                }
                onClick={() =>
                  action.mutate(() =>
                    api.createCanonicalDraft(
                      candidate.candidateId,
                      candidate.reviewRevision,
                    ),
                  )
                }
              >
                <FilePlus2 className="me-2 size-4" /> إنشاء مسودة Canonical (DRAFT)
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="سجل التدقيق">
            {!candidate.reviewEvents.length && (
              <p className="text-xs text-muted-foreground">
                لا توجد أحداث مراجعة بشرية مسجلة بعد.
              </p>
            )}
            <div className="space-y-2" data-testid="candidate-audit-trail">
              {candidate.reviewEvents.map((event, index) => (
                <div
                  key={`${event.revision}-${event.action}-${index}`}
                  className="rounded-lg border bg-muted/20 p-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {AUDIT_ACTION_LABELS[event.action] ?? event.action} (
                      <span className="font-mono">{event.action}</span>) · rev{" "}
                      {event.revision}
                    </span>
                    <span className="text-muted-foreground">
                      {event.actorEmail} ·{" "}
                      {new Date(event.occurredAt).toLocaleString("ar-SA")}
                    </span>
                  </div>
                  {(event.explanation || event.reasonCode) && (
                    <p className="mt-1 text-muted-foreground">
                      {event.reasonCode ? `[${event.reasonCode}] ` : ""}
                      {event.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

          <EntityFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            title="تعديل المرشح بالمحرر المعتمد"
          >
            {editable && candidate.canonicalTarget && (
              <div className="space-y-4">
                <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                  <div>
                    <label
                      htmlFor="candidate-edit-explanation"
                      className="mb-1 block text-xs font-semibold"
                    >
                      سبب التعديل البشري (مطلوب للتدقيق)
                    </label>
                    <Input
                      id="candidate-edit-explanation"
                      data-testid="input-edit-explanation"
                      placeholder="اشرح سبب التعديل (مثال: تصحيح صياغة السؤال أو تعديل مدى المؤشر)"
                      value={editExplanation}
                      onChange={(event) => {
                        setEditExplanation(event.target.value);
                        if (editModalError) setEditModalError(null);
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="candidate-edit-claims"
                      className="mb-1 block text-xs font-semibold"
                    >
                      الادعاءات الواقعية (سطر لكل ادعاء — تعديلها يبطل التقييم السابق)
                    </label>
                    <Textarea
                      id="candidate-edit-claims"
                      data-testid="input-edit-factual-claims"
                      rows={2}
                      value={editClaimsText}
                      onChange={(event) =>
                        setEditClaimsText(event.target.value)
                      }
                    />
                  </div>
                  {editModalError && (
                    <p
                      role="alert"
                      data-testid="edit-modal-error"
                      className="text-xs font-medium text-destructive"
                    >
                      {editModalError}
                    </p>
                  )}
                </div>

                <ContentItemForm
                  key={`${candidate.candidateId}-${candidate.reviewRevision}`}
                  worldId={editable.worldId}
                  contentItem={editable}
                  lockedCandidateTarget={{
                    scopeId: candidate.canonicalTarget.scopeId,
                    scopeName: candidate.canonicalTarget.scopeName,
                    challengeTypeId: candidate.canonicalTarget.challengeTypeId,
                    challengeTypeName:
                      candidate.canonicalTarget.challengeTypeName,
                    challengeTypeSlug:
                      candidate.canonicalTarget.mechanicKey ??
                      candidate.job?.mechanicKey,
                    challengeAnswerMode:
                      candidate.canonicalTarget.challengeAnswerMode,
                  }}
                  submitLabel="حفظ المرشح وإعادة التحقق"
                  onSubmitOverride={async (draft) => {
                    const trimmedReason = editExplanation.trim();
                    if (!trimmedReason) {
                      setEditModalError(
                        "يجب كتابة سبب التعديل البشري قبل حفظ المرشح.",
                      );
                      throw new Error(
                        "يجب كتابة سبب التعديل البشري قبل حفظ المرشح.",
                      );
                    }
                    const claims = editClaimsText
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean);
                    await api.editCandidate(candidate.candidateId, {
                      expectedRevision: candidate.reviewRevision,
                      draft,
                      factualClaims: claims,
                      explanation: trimmedReason,
                    });
                    await refresh();
                  }}
                  onSuccess={() => setEditOpen(false)}
                />
              </div>
            )}
          </EntityFormDialog>
        </>
      )}
    </main>
  );
}

function MechanicAnswerSummary({ candidate }: { candidate: ReviewCandidate }) {
  const answerPayload = candidate.draft?.answerPayload as
    | {
        mode?: string;
        options?: Array<{ id?: string; label?: { ar?: string; en?: string } }>;
        correctOptionId?: string;
        correctValue?: number;
        acceptedTolerance?: number;
        acceptedAnswers?: string[];
      }
    | undefined;
  const mode = answerPayload?.mode;

  if (mode === "multiple_choice") {
    const options = answerPayload?.options ?? [];
    const correctId = answerPayload?.correctOptionId;
    return (
      <div className="space-y-1.5" data-testid="mc-options-summary">
        <p className="text-xs font-semibold text-muted-foreground">
          خيارات الإجابة ({options.length}) — الإجابة الصحيحة:{" "}
          <span className="font-mono">{correctId ?? "—"}</span>
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((opt, idx) => {
            const isCorrect = opt.id === correctId;
            return (
              <div
                key={opt.id ?? idx}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                  isCorrect
                    ? "border-emerald-500/60 bg-emerald-500/10 font-semibold"
                    : "bg-background"
                }`}
              >
                <span>
                  <span className="me-1.5 font-mono text-xs text-muted-foreground">
                    [{opt.id}]
                  </span>
                  {opt.label?.ar ?? "—"}
                </span>
                {isCorrect && (
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">
                    الإجابة الصحيحة
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (mode === "closest") {
    const slider = (
      candidate.draft?.mechanicPayload as
        | {
            closestSlider?: {
              mode?: string;
              min?: number;
              max?: number;
              step?: number;
              unit?: string;
              displayFormat?: string;
              leftAnchor?: string;
              rightAnchor?: string;
            };
          }
        | undefined
    )?.closestSlider;
    return (
      <div
        className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3"
        data-testid="closest-answer-summary"
      >
        <div>
          <span className="text-xs text-muted-foreground">القيمة الصحيحة: </span>
          <strong className="font-mono">
            {answerPayload?.correctValue ?? "—"}
            {slider?.unit ? ` ${slider.unit}` : ""}
          </strong>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">نطاق المؤشر: </span>
          <span className="font-mono">
            {slider ? `${slider.min} .. ${slider.max} (step ${slider.step})` : "—"}
          </span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">نمط المؤشر: </span>
          <span>
            {slider?.mode ?? "—"}
            {slider?.leftAnchor && slider?.rightAnchor
              ? ` (${slider.leftAnchor} ↔ ${slider.rightAnchor})`
              : ""}
          </span>
        </div>
      </div>
    );
  }

  if (mode === "match") {
    const accepted = answerPayload?.acceptedAnswers ?? [];
    return (
      <div className="space-y-1" data-testid="match-answer-summary">
        <p className="text-xs font-semibold text-muted-foreground">
          الإجابات المقبولة ({accepted.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {accepted.map((ans, idx) => (
            <span
              key={`${idx}-${ans}`}
              className="rounded-md border bg-muted px-2.5 py-1 text-xs font-medium"
            >
              {ans}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function deriveCandidateEligibility(candidate: ReviewCandidate) {
  if (candidate.reviewEligibility) {
    return candidate.reviewEligibility;
  }
  const published = Boolean(candidate.publishedContentItemId);
  const hasBlockingFindings = candidate.findings?.some(
    (f) => f.severity === "blocking",
  );
  const assessment = candidate.humanAssessment;
  const assessedRevision = assessment?.assessedRevision ?? candidate.reviewRevision;
  const assessmentCurrent =
    Boolean(assessment) && assessedRevision === candidate.reviewRevision;
  const assessmentStale =
    (Boolean(assessment) && !assessmentCurrent) ||
    (!assessment && Boolean(candidate.lastInvalidatedAssessments));
  const evidenceCount = assessment?.evidence?.length ?? 0;
  const hasEditEvent = (candidate.reviewEvents ?? []).some(
    (e) => e.action === "edited",
  );
  const factualState = assessment?.factualState ?? null;
  const requiresFactualOverride =
    Boolean(assessmentCurrent) &&
    factualState !== null &&
    factualState !== "SUPPORTED";

  const allowedFactualOverrideCodes: FactualOverrideCode[] = [];
  if (requiresFactualOverride) {
    if (factualState === "CONTRADICTED") {
      if (evidenceCount > 0) {
        allowedFactualOverrideCodes.push("ACCEPTED_WITH_EVIDENCE");
      }
    } else {
      if (evidenceCount > 0) {
        allowedFactualOverrideCodes.push("ACCEPTED_WITH_EVIDENCE");
      }
      allowedFactualOverrideCodes.push("CLAIM_NOT_ANSWER_CRITICAL");
      if (hasEditEvent) {
        allowedFactualOverrideCodes.push("CLAIM_CORRECTED");
      }
    }
  }

  const approvalBlockers: string[] = [];
  if (published) {
    approvalBlockers.push("تم إنشاء المسودة القانونية لهذا المرشح مسبقًا.");
  }
  if (candidate.targetResolutionError) {
    approvalBlockers.push(
      `تعذر التحقق من الهدف القانوني: ${candidate.targetResolutionError}`,
    );
  }
  if (hasBlockingFindings) {
    approvalBlockers.push(
      "يحتوي المرشح على ملاحظات فحص آلي مانعة؛ يجب تعديله أولاً.",
    );
  }
  if (!assessmentCurrent) {
    approvalBlockers.push(
      assessmentStale
        ? "تم إبطال التقييم السابق بعد تعديل جوهري؛ يجب حفظ تقييم بشري جديد للنسخة الحالية."
        : "يجب حفظ التقييم البشري للنسخة الحالية قبل الاعتماد.",
    );
  } else if (factualState === "CONTRADICTED" && evidenceCount === 0) {
    approvalBlockers.push(
      "الحالة المتناقضة (CONTRADICTED) تتطلب إرفاق رابط دليل واحد على الأقل في التقييم البشري أو تعديل المرشح.",
    );
  }

  return {
    assessmentCurrent,
    assessmentStale,
    evidenceCount,
    requiresFactualOverride,
    allowedFactualOverrideCodes,
    canApprove:
      !published &&
      candidate.reviewStatus !== "approved" &&
      approvalBlockers.length === 0,
    canCreateDraft:
      !published &&
      candidate.reviewStatus === "approved" &&
      !candidate.targetResolutionError &&
      !hasBlockingFindings,
    approvalBlockers,
  };
}

function EvaluationBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        {label}
      </summary>
      <pre className="mt-2 overflow-x-auto text-xs" dir="ltr">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export function toEditableContentItem(
  candidate: ReviewCandidate,
): ContentItem | null {
  const target = candidate.canonicalTarget;
  const draft = candidate.draft;
  if (!target || !draft?.prompt || !draft.answerPayload) return null;
  return {
    id: candidate.candidateId,
    worldId: target.worldId,
    scopeId: target.scopeId,
    prompt: draft.prompt,
    compatibleChallengeTypeIds: [target.challengeTypeId],
    answerPayload: draft.answerPayload,
    mechanicPayload: draft.mechanicPayload,
    media: draft.media,
    revealMedia: draft.revealMedia,
    isReusableAcrossSessions: draft.isReusableAcrossSessions ?? false,
    status: "draft",
    metadata: draft.metadata,
    readiness: { readiness: "limited", blockers: [], warnings: [] },
    compatibleFamilies: [],
    isSessionReuseExempt: false,
  };
}
