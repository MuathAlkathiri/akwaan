"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BatchSubmissionPanel } from "./batch-submission-panel";
import { JobsHistoryPanel } from "./jobs-history-panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
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
import { DeduplicationPanel } from "./deduplication-panel";
import { CreativeSlotInspector } from "./creative-slot-inspector";
import {
  hasIncompleteHistoricalVerification,
  hasProvenDuplicate,
  overlapRequirementsFromFindings,
  overlapRequirementsFromServer,
  summarizeDeduplication,
  type OverlapRequirement,
} from "./deduplication-findings";
import type {
  FactualOverrideCode,
  FactualState,
  QualityRubric,
  ReviewCandidate,
} from "./types";
import { candidateStatusPresentation } from "./job-status-helpers";
import {
  CANDIDATE_URL_PARAM,
  adjacentCandidates,
  isShortcutBlockedTarget,
} from "./review-navigation";

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
      status: "awaiting_review",
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
          status: parsed.filters.status ?? "awaiting_review",
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
    // A candidate link is a review link even when it names no surface.
    if (params.get(CANDIDATE_URL_PARAM) && !qSurface) {
      fallback.surface = "review";
    }
  } catch {
    // Ignore URL param errors
  }

  return fallback;
};

/** The candidate a direct link, refresh or history entry points at. */
const readCandidateFromUrl = (): string | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    return (
      new URLSearchParams(window.location.search).get(CANDIDATE_URL_PARAM) ??
      undefined
    );
  } catch {
    return undefined;
  }
};

const LARGE_LAYOUT_QUERY = "(min-width: 1024px)";

const DECISION_REQUIREMENTS_ID = "candidate-decision-requirements";

/**
 * One line telling the reviewer what the decision bar is waiting for. It reads
 * the same eligibility the buttons use; it never enables or disables anything.
 */
function DecisionBarSummary({
  candidate,
  approvalBlockers,
  hasExplanation,
  needsFactualOverride,
}: {
  candidate: ReviewCandidate;
  approvalBlockers: string[];
  hasExplanation: boolean;
  needsFactualOverride: boolean;
}) {
  let settled: string | null = null;
  if (candidate.publishedContentItemId) {
    settled = "أُنشئت المسودة لهذا المرشح؛ لا قرار متبقٍ.";
  } else if (candidate.reviewStatus === "rejected") {
    settled = "رُفض هذا المرشح.";
  } else if (candidate.reviewStatus === "approved") {
    settled = "اعتُمد هذا المرشح؛ أنشئ المسودة عند استيفاء شروطها.";
  }

  const requirements = settled
    ? []
    : [
        ...approvalBlockers,
        ...(needsFactualOverride
          ? ["اختر رمز تجاوز الحالة الواقعية واكتب تفسيره."]
          : []),
        ...(hasExplanation ? [] : ["اكتب تفسير القرار (مطلوب للاعتماد أو الرفض)."]),
      ];

  const showRequirements = () => {
    const panel = document.getElementById(DECISION_REQUIREMENTS_ID);
    panel?.focus({ preventScroll: true });
    panel?.scrollIntoView?.({ block: "start" });
  };

  return (
    <div
      data-testid="decision-bar-summary"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs"
    >
      {settled ? (
        <span className="font-medium text-foreground">{settled}</span>
      ) : requirements.length === 0 ? (
        <span className="font-semibold text-foreground">جاهز للاعتماد.</span>
      ) : (
        <>
          {/* One line while sticky; the full list is one click away. */}
          <span
            className="min-w-0 flex-1 text-foreground lg:truncate"
            title={requirements.join("\n")}
          >
            <span className="font-semibold">
              قبل الاعتماد ({requirements.length}):
            </span>{" "}
            {requirements[0]}
          </span>
          <button
            type="button"
            data-testid="button-show-decision-requirements"
            onClick={showRequirements}
            className="shrink-0 rounded font-semibold text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            عرض كل المتطلبات
          </button>
        </>
      )}
    </div>
  );
}

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
  approved: "اعتماد بشري للمرشح (Human approval)",
  rejected: "رفض المرشح",
  draft_created: "إنشاء مسودة قانونية (DRAFT)",
  approval_carried_forward:
    "حفظ الاعتماد آلياً بعد إعادة تحقق دون تغيير (Approval carried forward)",
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
): {
  message: string;
  isConflict: boolean;
  currentRevision?: number;
  code?: string;
  details?: Record<string, unknown>;
} => {
  const response = (
    err as {
      response?: {
        status?: number;
        data?: {
          message?: string | string[];
          currentRevision?: number;
          code?: string;
          details?: Record<string, unknown>;
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
    code: typeof response?.data?.code === "string" ? response.data.code : undefined,
    details:
      response?.data?.details && typeof response.data.details === "object"
        ? response.data.details
        : undefined,
  };
};

/**
 * Review-gate conflicts that are not revision races. They must never be shown
 * as "another reviewer changed this" and never retried automatically.
 */
const REVIEW_GATE_MESSAGES: Record<string, { approve: string; draft: string }> = {
  OVERLAP_ACKNOWLEDGMENT_REQUIRED: {
    approve:
      "تغيّرت أدلة التقاطع على الخادم أو لم يُقَرّ بها كلها. حُدّثت القائمة بالأدلة الحالية؛ راجع كل تقاطع وأقرّ به من جديد قبل الاعتماد.",
    draft:
      "تغيّرت أدلة التقاطع منذ الاعتماد، فلا يمكن إنشاء المسودة. أعد فحص التكرار ليعود المرشح إلى المراجعة البشرية، ثم قيّمه واعتمده من جديد.",
  },
  OVERLAP_ACKNOWLEDGMENT_STALE: {
    approve:
      "إقرار سابق لم يعد مطابقاً للأدلة الحالية على الخادم. حُدّثت القائمة؛ راجع الأدلة الحالية وأقرّ بها من جديد.",
    draft:
      "إقرار الاعتماد لم يعد مطابقاً للأدلة الحالية؛ أعد فحص التكرار ثم أعد المراجعة.",
  },
  OVERLAP_EVIDENCE_UNVERIFIABLE: {
    approve:
      "شبهة تقاطع محفوظة لا تحدد العنصر المرجعي، فلا يمكن الإقرار بها. أعد فحص التكرار لإعادة بناء الأدلة؛ إن تعذر ذلك يبقى الاعتماد محظوراً.",
    draft:
      "شبهة تقاطع غير قابلة للتحقق تمنع إنشاء المسودة. أعد فحص التكرار لإعادة بناء الأدلة.",
  },
  HISTORICAL_DUPLICATE_OR_OVERLAP: {
    approve: "تكرار مثبت مع محتوى قائم — لا يمكن الاعتماد. عدّل السؤال بالمحرر.",
    draft: "تكرار مثبت مع محتوى قائم — لا يمكن إنشاء المسودة.",
  },
  DUPLICATE_IN_BATCH: {
    approve: "مرشح آخر في الدفعة يكرر هذا المرشح — لا يمكن الاعتماد.",
    draft: "مرشح آخر في الدفعة يكرر هذا المرشح — لا يمكن إنشاء المسودة.",
  },
  HISTORICAL_VERIFICATION_INCOMPLETE: {
    approve: "سجل النطاق التاريخي غير مكتمل — لا يمكن الاعتماد حتى تنجح إعادة الفحص.",
    draft: "سجل النطاق التاريخي غير مكتمل — لا يمكن إنشاء المسودة.",
  },
  UNTRUSTED_CANDIDATE_APPROVAL: {
    approve: "بيانات الاعتماد غير موثوقة.",
    draft:
      "اعتماد غير موثوق (Untrusted approval) — لا يمكن إنشاء المسودة؛ يلزم اعتماد بشري جديد.",
  },
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
  const [selectedId, setSelectedId] = useState<string | undefined>(
    readCandidateFromUrl,
  );
  /** The selection as of the latest render, for async callbacks. */
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  /** Set by a reviewer-initiated selection; consumed once the heading renders. */
  const focusDetailOnSelect = useRef(false);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const decisionBarRef = useRef<HTMLDivElement>(null);
  const lastQueueIndex = useRef(-1);
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
  /** Fingerprints the reviewer explicitly acknowledged. Never pre-selected. */
  const [acknowledgedOverlaps, setAcknowledgedOverlaps] = useState<
    ReadonlySet<string>
  >(() => new Set());
  /** Current evidence as a 409 approval conflict reported it, per candidate revision. */
  const [serverOverlapEvidence, setServerOverlapEvidence] = useState<{
    candidateId: string;
    revision: number;
    requirements: OverlapRequirement[];
  } | null>(null);
  const lastActionKind = useRef<"approve" | "draft" | "other">("other");

  // Decision input belongs to one candidate. Reset it in the same render that
  // changes the selection, so the next candidate never shows (or submits) the
  // previous one's note, reason, acknowledgments, errors or open editor.
  const [decisionStateFor, setDecisionStateFor] = useState(selectedId);
  if (decisionStateFor !== selectedId) {
    setDecisionStateFor(selectedId);
    setDecisionExplanation("");
    setRejectionReason("LOW_QUALITY");
    setAcknowledgedOverlaps(new Set());
    setServerOverlapEvidence(null);
    setActionError(null);
    setRevisionConflict(null);
    setEditOpen(false);
  }

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
      if (activeSurface === "review" && selectedId) {
        params.set(CANDIDATE_URL_PARAM, selectedId);
      } else {
        params.delete(CANDIDATE_URL_PARAM);
      }
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (nextUrl !== currentUrl) {
        window.history?.replaceState?.(null, "", nextUrl);
      }
    } catch {
      // Ignore history replace errors
    }
  }, [activeSurface, activeJobId, filters, selectedId]);

  /**
   * A reviewer's selection: one history entry per candidate, so Back and
   * Forward walk the candidates that were actually opened.
   */
  const selectCandidate = useCallback(
    (candidateId: string) => {
      focusDetailOnSelect.current = true;
      setSelectedId(candidateId);
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get(CANDIDATE_URL_PARAM) === candidateId) {
          // Already open: nothing changes, so focus it directly.
          focusDetailOnSelect.current = false;
          detailHeadingRef.current?.focus({ preventScroll: true });
          detailHeadingRef.current?.scrollIntoView?.({ block: "start" });
          return;
        }
        params.set("surface", "review");
        params.set(CANDIDATE_URL_PARAM, candidateId);
        window.history?.pushState?.(
          null,
          "",
          `${window.location.pathname}?${params.toString()}`,
        );
      } catch {
        // Ignore history push errors; selection still works.
      }
    },
    [],
  );

  // Back/Forward restore the candidate (and surface) the entry was made for.
  useEffect(() => {
    const onPopState = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const surface = params.get("surface");
        if (surface === "generate" || surface === "jobs" || surface === "review") {
          setActiveSurface(surface);
        }
        setSelectedId(params.get(CANDIDATE_URL_PARAM) ?? undefined);
      } catch {
        // Ignore malformed history entries.
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Move focus to the opened candidate, and bring its heading into view below
  // the sticky site header. Only for reviewer-initiated selections, never for a
  // page load, so arriving from a link does not steal focus.
  useEffect(() => {
    if (!focusDetailOnSelect.current || !selectedId) return;
    const frame = window.requestAnimationFrame(() => {
      const heading = detailHeadingRef.current;
      if (!heading) return;
      focusDetailOnSelect.current = false;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView?.({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId]);

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

  const queueRows = useMemo(() => list.data ?? [], [list.data]);
  const queueIds = useMemo(
    () => queueRows.map((row) => row.candidateId),
    [queueRows],
  );
  const adjacent = adjacentCandidates(
    queueIds,
    selectedId,
    lastQueueIndex.current,
  );
  useEffect(() => {
    if (adjacent.index >= 0) lastQueueIndex.current = adjacent.index;
  }, [adjacent.index]);
  const selectedRow =
    adjacent.index >= 0 ? queueRows[adjacent.index] : undefined;
  const reviewProgress = useMemo(() => {
    const decided = queueRows.filter(
      (row) => !candidateStatusPresentation(row).needsDecision,
    ).length;
    return { decided, total: queueRows.length };
  }, [queueRows]);

  // J / K walk the queue. Keystrokes typed into, or operating, a control
  // belong to that control, and an open dialog owns the keyboard.
  useEffect(() => {
    if (activeSurface !== "review" || editOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      // `code`, not `key`: the same physical keys on an Arabic layout.
      const target =
        event.code === "KeyJ"
          ? adjacent.nextId
          : event.code === "KeyK"
            ? adjacent.previousId
            : undefined;
      if (!target || isShortcutBlockedTarget(event.target)) return;
      event.preventDefault();
      selectCandidate(target);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeSurface,
    editOpen,
    adjacent.nextId,
    adjacent.previousId,
    selectCandidate,
  ]);

  // Keep focused and scrolled-to content clear of the sticky site header and,
  // on large screens, the sticky decision bar.
  const hasDecisionBar = activeSurface === "review" && Boolean(candidate);
  useEffect(() => {
    if (activeSurface !== "review") return;
    const root = document.documentElement;
    const previousTop = root.style.scrollPaddingTop;
    const previousBottom = root.style.scrollPaddingBottom;
    root.style.scrollPaddingTop = "5.5rem";
    const media = window.matchMedia?.(LARGE_LAYOUT_QUERY);
    const bar = decisionBarRef.current;
    const apply = () => {
      root.style.scrollPaddingBottom =
        bar && media?.matches ? `${bar.offsetHeight + 24}px` : previousBottom;
    };
    apply();
    const observer =
      bar && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(apply)
        : undefined;
    if (bar) observer?.observe(bar);
    media?.addEventListener?.("change", apply);
    return () => {
      observer?.disconnect();
      media?.removeEventListener?.("change", apply);
      root.style.scrollPaddingTop = previousTop;
      root.style.scrollPaddingBottom = previousBottom;
    };
  }, [activeSurface, hasDecisionBar]);

  // Hydrate assessment and edit fields when the selected candidate or revision changes
  useEffect(() => {
    if (!candidate) return;
    // A new candidate or revision is new evidence: acknowledgments start empty.
    setAcknowledgedOverlaps(new Set());
    setServerOverlapEvidence(null);
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

  /**
   * The candidate an action was started on. A reviewer can move to another
   * candidate before the server answers; the answer still belongs to this one.
   */
  type ActionTarget = { candidateId: string; revision: number } | undefined;
  const actionTargetFor = (): ActionTarget =>
    candidate
      ? { candidateId: candidate.candidateId, revision: candidate.reviewRevision }
      : undefined;
  /** True while the action's candidate is still the one on screen. */
  const isOnScreen = (target: ActionTarget) =>
    Boolean(target && selectedIdRef.current === target.candidateId);
  /** Prefix for a toast about a candidate the reviewer has already left. */
  const elsewhere = (target: ActionTarget) =>
    isOnScreen(target) ? "" : "المرشح السابق: ";

  const refresh = async (target: ActionTarget = actionTargetFor()) => {
    if (isOnScreen(target)) {
      setRevisionConflict(null);
      setActionError(null);
    }
    await client.invalidateQueries({ queryKey: ["content-engine-review"] });
    await client.invalidateQueries({
      queryKey: ["content-engine-review-detail", target?.candidateId ?? selectedIdRef.current],
    });
  };

  const action = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onMutate: actionTargetFor,
    onSuccess: async (_data, _run, target) => {
      await refresh(target);
      showToast({ message: `${elsewhere(target)}تم حفظ قرار المراجعة.` });
    },
    onError: (err, _run, target) => {
      const parsed = extractConflictDetails(err);
      const kind = lastActionKind.current;
      const onScreen = isOnScreen(target);
      const gate = parsed.code ? REVIEW_GATE_MESSAGES[parsed.code] : undefined;
      if (gate && kind !== "other") {
        const message = kind === "draft" ? gate.draft : gate.approve;
        if (
          onScreen &&
          target &&
          kind === "approve" &&
          (parsed.code === "OVERLAP_ACKNOWLEDGMENT_REQUIRED" ||
            parsed.code === "OVERLAP_ACKNOWLEDGMENT_STALE")
        ) {
          // Adopt the server's current evidence and drop any acknowledgment
          // that no longer matches it. Nothing is retried automatically.
          const requirements = overlapRequirementsFromServer(
            parsed.details?.overlaps,
          );
          const current = new Set(requirements.map((r) => r.fingerprint));
          setServerOverlapEvidence({
            candidateId: target.candidateId,
            revision: target.revision,
            requirements,
          });
          setAcknowledgedOverlaps(
            (previous) => new Set([...previous].filter((fp) => current.has(fp))),
          );
        }
        if (onScreen) {
          setRevisionConflict(null);
          setActionError(message);
        }
        void client.invalidateQueries({ queryKey: ["content-engine-review"] });
        void client.invalidateQueries({
          queryKey: ["content-engine-review-detail", target?.candidateId],
        });
        showToast({ type: "error", message: `${elsewhere(target)}${message}` });
        return;
      }
      if (onScreen) {
        setActionError(parsed.message);
        if (parsed.isConflict) {
          setRevisionConflict({
            message: parsed.message,
            currentRevision: parsed.currentRevision,
          });
        }
      }
      showToast({
        type: "error",
        message: `${elsewhere(target)}${
          parsed.message || "تعذر حفظ القرار. قد يكون المرشح تغيّر لدى مراجع آخر."
        }`,
      });
    },
  });

  const rescreenMutation = useMutation({
    mutationFn: async () => {
      if (!candidate) return;
      return api.rescreenCandidate(
        candidate.candidateId,
        candidate.reviewRevision,
      );
    },
    onMutate: actionTargetFor,
    onSuccess: async (_data, _variables, target) => {
      await refresh(target);
      showToast({
        message: `${elsewhere(target)}اكتملت إعادة فحص التكرار وتحديث النتائج بنجاح.`,
      });
    },
    onError: (err, _variables, target) => {
      const parsed = extractConflictDetails(err);
      if (isOnScreen(target)) {
        setActionError(parsed.message);
        if (parsed.isConflict) {
          setRevisionConflict({
            message: parsed.message,
            currentRevision: parsed.currentRevision,
          });
        }
      }
      showToast({
        type: "error",
        message: `${elsewhere(target)}${
          parsed.message ||
          "تعذر إعادة فحص التكرار. قد يكون المرشح قد تغيّر لدى مراجع آخر."
        }`,
      });
    },
  });

  const handleRescreen = async () => {
    try {
      await rescreenMutation.mutateAsync();
    } catch {
      // Error handled by mutation onError callback
    }
  };

  const editable = useMemo(
    () => (candidate ? toEditableContentItem(candidate) : null),
    [candidate],
  );

  const overlapState = useMemo(() => {
    if (!candidate) return { required: [] as OverlapRequirement[], unverifiable: 0, refreshed: false };
    const fromFindings = overlapRequirementsFromFindings(candidate.findings);
    const server =
      serverOverlapEvidence &&
      serverOverlapEvidence.candidateId === candidate.candidateId &&
      serverOverlapEvidence.revision === candidate.reviewRevision
        ? serverOverlapEvidence.requirements
        : null;
    return {
      required: server ?? fromFindings.required,
      unverifiable: fromFindings.unverifiable.length,
      refreshed: Boolean(server),
    };
  }, [candidate, serverOverlapEvidence]);
  const unacknowledgedOverlaps = overlapState.required.filter(
    (r) => !acknowledgedOverlaps.has(r.fingerprint),
  ).length;
  const toggleOverlapAcknowledgment = (fingerprint: string, value: boolean) =>
    setAcknowledgedOverlaps((previous) => {
      const next = new Set(previous);
      if (value) next.add(fingerprint);
      else next.delete(fingerprint);
      return next;
    });

  const eligibility = useMemo(() => {
    if (!candidate) return null;
    const base = deriveCandidateEligibility(candidate);
    const overlapBlockers: string[] = [];
    if (candidate.reviewStatus !== "approved" && !candidate.publishedContentItemId) {
      if (overlapState.unverifiable > 0) {
        overlapBlockers.push(
          "توجد شبهة تقاطع غير قابلة للتحقق (بلا عنصر مرجعي)؛ أعد فحص التكرار — لا يمكن الإقرار بها.",
        );
      }
      if (unacknowledgedOverlaps > 0) {
        overlapBlockers.push(
          `يلزم الإقرار الصريح بكل شبهة تقاطع قبل الاعتماد (${unacknowledgedOverlaps} من ${overlapState.required.length} دون إقرار).`,
        );
      }
    }
    return {
      ...base,
      canApprove: base.canApprove && overlapBlockers.length === 0,
      approvalBlockers: [...base.approvalBlockers, ...overlapBlockers],
    };
  }, [candidate, overlapState, unacknowledgedOverlaps]);
  const latestRevocation = useMemo(() => {
    const last = candidate?.reviewEvents?.at(-1);
    return candidate?.reviewStatus === "pending" && last?.details?.approvalRevoked
      ? (last.details.approvalRevoked as { reasons?: string[] })
      : null;
  }, [candidate]);

  const openEditDialog = () => {
    if (!candidate) return;
    setEditClaimsText((candidate.factualClaims ?? []).join("\n"));
    setEditExplanation("");
    setEditModalError(null);
    setEditOpen(true);
  };

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-6 overflow-x-clip px-4 py-8 sm:px-6 lg:px-10">
      {/* `clip`, not `hidden`: hidden makes <main> a scroll container, which
          silently disables the sticky queue and decision bar. */}
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
        <div
          data-testid="review-workspace-layout"
          className="grid items-start gap-6 lg:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)]"
        >
        {/* Queue first in the DOM: in RTL it sits at the start (right). */}
        <aside
          aria-label="قائمة المرشحين"
          data-testid="candidate-queue"
          className="min-w-0 lg:sticky lg:top-[5.5rem] lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:rounded-xl"
        >
        <SectionCard
          title="المرشحون"
          description="تصفية حسب الدفعة والعالم والنطاق والحالة"
        >
          <div
            data-testid="review-progress"
            className="space-y-1.5 rounded-lg bg-muted/40 p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
              <span className="font-semibold text-foreground">
                تم البتّ في{" "}
                <span className="akwaan-numeral">{reviewProgress.decided}</span>{" "}
                من <span className="akwaan-numeral">{reviewProgress.total}</span>
              </span>
              <span className="text-muted-foreground">
                <span className="akwaan-numeral">
                  {reviewProgress.total - reviewProgress.decided}
                </span>{" "}
                بانتظار القرار
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="تقدّم المراجعة في القائمة الحالية"
              aria-valuemin={0}
              aria-valuemax={reviewProgress.total}
              aria-valuenow={reviewProgress.decided}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{
                  width: `${
                    reviewProgress.total
                      ? (reviewProgress.decided / reviewProgress.total) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              للتنقل:{" "}
              <kbd className="rounded border bg-background px-1 font-sans">J</kbd>{" "}
              التالي ·{" "}
              <kbd className="rounded border bg-background px-1 font-sans">K</kbd>{" "}
              السابق
            </p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
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
              className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              <option value="">كل الحالات (جميع المرشحين)</option>
              <option value="awaiting_review">
                جاهز للمراجعة البشرية (Awaiting Review)
              </option>
              <option value="screened_reject">
                مرفوض في الفحص الحتمي (Screened Rejects)
              </option>
              <option value="pending">بانتظار القرار البشري (Pending Decision)</option>
              <option value="approved">معتمد بشرياً (Approved)</option>
              <option value="rejected">مرفوض بشرياً (Rejected)</option>
              <option value="fact_blocked">تدقيق الحقائق متعثر (Fact Blocked)</option>
            </select>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {queueRows.map((row) => {
              const isScreenedReject = row.status === "screened_reject";
              const rowStatus = candidateStatusPresentation(row);
              const blockingFinding = row.findings?.find(
                (f) => f.severity === "blocking",
              );
              const dedup = summarizeDeduplication(row.findings);

              return (
                <button
                  key={row.candidateId}
                  type="button"
                  data-testid={`candidate-row-${row.candidateId}`}
                  aria-current={selectedId === row.candidateId ? "true" : undefined}
                  onClick={() => selectCandidate(row.candidateId)}
                  className={`min-w-0 rounded-xl border p-4 text-right transition-colors ${
                    isScreenedReject
                      ? selectedId === row.candidateId
                        ? "border-rose-500 bg-rose-100/50 ring-1 ring-rose-400"
                        : "border-rose-200/90 bg-rose-50/40 hover:bg-rose-50/80"
                      : selectedId === row.candidateId
                        ? "border-amber-500/70 bg-amber-500/5"
                        : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`font-semibold ${
                        isScreenedReject
                          ? "text-rose-950 opacity-90 line-through decoration-rose-300"
                          : ""
                      }`}
                    >
                      {row.draft?.prompt?.ar ?? "مرشح بلا سؤال"}
                    </span>
                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                      <span
                        data-testid={`candidate-status-badge-${row.candidateId}`}
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${rowStatus.badgeClass}`}
                      >
                        {rowStatus.label}
                      </span>
                      {dedup.listBadge && (
                        <span
                          data-testid={`candidate-dedup-badge-${row.candidateId}`}
                          data-dedup-category={dedup.category}
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${dedup.listBadge.className}`}
                        >
                          {dedup.listBadge.labelAr}
                        </span>
                      )}
                    </div>
                  </div>

                  {row.authoring?.assignedSlot && (
                    <div
                      data-testid={`candidate-creative-slot-row-${row.candidateId}`}
                      className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]"
                    >
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                        #{row.authoring.assignedSlot.slotIndex + 1}
                      </span>
                      <span
                        data-testid={`candidate-slot-family-${row.candidateId}`}
                        className="font-medium text-slate-800"
                      >
                        {row.authoring.assignedSlot.familyNameAr ||
                          row.authoring.assignedSlot.familyKey}
                      </span>
                      <span
                        data-testid={`candidate-slot-mode-${row.candidateId}`}
                        className={`rounded-full px-2 py-0.2 border text-[10px] font-semibold ${
                          row.authoring.assignedSlot.mode === "exploration"
                            ? "border-purple-200 bg-purple-50 text-purple-700"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                        }`}
                      >
                        {row.authoring.assignedSlot.mode === "exploration"
                          ? "استكشاف"
                          : "استغلال"}
                      </span>
                      {row.findings?.some(
                        (f) => f.code === "FAMILY_COMPLIANCE_MISMATCH",
                      ) ? (
                        <span
                          data-testid={`candidate-compliance-indicator-${row.candidateId}`}
                          className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.2 text-[10px] font-bold text-rose-700"
                        >
                          تعارض مع العائلة
                        </span>
                      ) : row.findings?.some(
                          (f) => f.code === "FAMILY_COMPLIANCE_UNVERIFIED",
                        ) ? (
                        <span
                          data-testid={`candidate-compliance-indicator-${row.candidateId}`}
                          className={`rounded-full border px-2 py-0.2 text-[10px] font-semibold ${
                            row.reviewDecision?.familyComplianceResolution
                              ?.resolvedByReviewer ||
                            row.authoring.familyCompliance?.resolvedByReviewerId
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-amber-300 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {row.reviewDecision?.familyComplianceResolution
                            ?.resolvedByReviewer ||
                          row.authoring.familyCompliance?.resolvedByReviewerId
                            ? "عائلة معتمدة يدويًا"
                            : "بانتظار التحقق"}
                        </span>
                      ) : (
                        <span
                          data-testid={`candidate-compliance-indicator-${row.candidateId}`}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.2 text-[10px] font-medium text-emerald-700"
                        >
                          عائلة مطابقة
                        </span>
                      )}
                    </div>
                  )}

                  {isScreenedReject && (
                    <div
                      data-testid={`candidate-blocking-reason-${row.candidateId}`}
                      className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-100/70 p-2 text-xs text-rose-900"
                    >
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-rose-600" />
                      <div>
                        <span className="font-semibold text-rose-950">
                          سبب الرفض الآلي:{" "}
                        </span>
                        <span>
                          {blockingFinding
                            ? `${blockingFinding.code}: ${blockingFinding.message}`
                            : "مخالفة معايير الفحص الحتمي الآلي"}
                        </span>
                      </div>
                    </div>
                  )}

                  <p className="mt-2 text-xs text-muted-foreground">
                    {row.job?.worldKey} / {row.job?.scopeKey} ·{" "}
                    {row.job?.mechanicKey} · rev {row.reviewRevision}
                  </p>
                </button>
              );
            })}
            {!list.isLoading && !list.data?.length && (
              <p className="text-sm text-muted-foreground">
                لا توجد مرشحات مطابقة.
              </p>
            )}
          </div>
        </SectionCard>
        </aside>

        <section
          aria-labelledby={selectedId ? "candidate-detail-heading" : undefined}
          aria-label={selectedId ? undefined : "تفاصيل المرشح"}
          data-testid="candidate-detail-column"
          className="min-w-0 space-y-6"
        >
          {!selectedId && (
            <div
              data-testid="candidate-detail-empty"
              className="hidden rounded-xl border border-dashed bg-card/60 p-8 text-center text-sm text-muted-foreground lg:block"
            >
              اختر مرشحاً من القائمة لعرض تفاصيله، أو اضغط{" "}
              <kbd className="rounded border bg-background px-1 font-sans">J</kbd>{" "}
              لفتح أول مرشح.
            </div>
          )}

          {selectedId && (
            <div
              data-testid="candidate-detail-header"
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm xl:flex-row xl:items-start xl:justify-between"
            >
              <div className="min-w-0 space-y-2">
                <h2
                  id="candidate-detail-heading"
                  ref={detailHeadingRef}
                  tabIndex={-1}
                  className="scroll-mt-24 rounded-md text-lg font-bold leading-snug text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {(candidate?.candidateId === selectedId
                    ? candidate?.draft?.prompt?.ar
                    : selectedRow?.draft?.prompt?.ar) ?? "مرشح بلا سؤال"}
                </h2>
                {(() => {
                  const source =
                    candidate?.candidateId === selectedId ? candidate : selectedRow;
                  if (!source) return null;
                  const status = candidateStatusPresentation(source);
                  return (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span
                        data-testid="candidate-detail-status"
                        className={`rounded-full border px-2.5 py-0.5 text-xs ${status.badgeClass}`}
                      >
                        {status.label}
                      </span>
                      <span>
                        {source.job?.worldKey} / {source.job?.scopeKey} ·{" "}
                        {source.job?.mechanicKey}
                      </span>
                    </div>
                  );
                })()}
              </div>
              <nav
                aria-label="التنقل بين المرشحين"
                className="flex w-full shrink-0 items-center justify-between gap-2 xl:w-auto xl:justify-start xl:self-start"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="button-previous-candidate"
                  aria-keyshortcuts="K"
                  disabled={!adjacent.previousId}
                  onClick={() =>
                    adjacent.previousId && selectCandidate(adjacent.previousId)
                  }
                >
                  <ChevronRight aria-hidden="true" />
                  السابق
                </Button>
                <span
                  data-testid="candidate-position"
                  className="text-center text-xs text-muted-foreground sm:min-w-[5.5rem]"
                >
                  {adjacent.index >= 0 ? (
                    <>
                      المرشح{" "}
                      <span className="akwaan-numeral">{adjacent.index + 1}</span>{" "}
                      من <span className="akwaan-numeral">{queueIds.length}</span>
                    </>
                  ) : (
                    "خارج القائمة الحالية"
                  )}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="button-next-candidate"
                  aria-keyshortcuts="J"
                  disabled={!adjacent.nextId}
                  onClick={() =>
                    adjacent.nextId && selectCandidate(adjacent.nextId)
                  }
                >
                  التالي
                  <ChevronLeft aria-hidden="true" />
                </Button>
              </nav>
            </div>
          )}

          {selectedId && !candidate && detail.isLoading && (
            <p
              role="status"
              data-testid="candidate-detail-loading"
              className="rounded-xl border bg-card p-6 text-sm text-muted-foreground"
            >
              جارٍ تحميل المرشح…
            </p>
          )}

          {selectedId && !candidate && detail.isError && (
            <div
              role="alert"
              data-testid="candidate-detail-error"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
            >
              <span>تعذّر تحميل هذا المرشح.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void detail.refetch()}
              >
                إعادة المحاولة
              </Button>
            </div>
          )}

      {candidate && (
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
            description={`المراجعة ${candidate.reviewRevision}`}
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
            {candidate.status === "screened_reject" && (
              <div
                role="alert"
                data-testid="screened-reject-banner"
                className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-950 shadow-sm"
              >
                <AlertTriangle className="size-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <p className="font-bold text-sm text-rose-900">
                    هذا المرشح مرفوض في الفحص الحتمي الآلي (Screened Reject)
                  </p>
                  <p className="text-rose-800">
                    تم استبعاد هذا المرشح آلياً لعدم استيفائه معايير الفحص الحتمي.
                    لا يمكن اعتماد المرشح أو إنشاء مسودة منه دون تعديله لتصحيح أسباب الرفض.
                  </p>
                  {candidate.findings
                    ?.filter((f) => f.severity === "blocking")
                    .map((finding, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-rose-200 bg-white/90 p-2.5 text-rose-950"
                      >
                        <span className="font-mono font-bold text-rose-700 me-2">
                          [{finding.code}]
                        </span>
                        <span>{finding.message}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Target Identity & Canonical Resolution Context */}
            <div
              data-testid="candidate-target-context"
              className="grid gap-2 rounded-xl border bg-muted/30 p-3 text-xs sm:grid-cols-2"
            >
              <div>
                <span className="text-muted-foreground">معرّف المرشح: </span>
                <span className="break-all font-mono font-semibold">
                  {candidate.candidateId}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">معرّف الدفعة: </span>
                <span className="break-all font-mono">{candidate.jobId}</span>
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
                    className="font-mono font-semibold text-emerald-600"
                    data-testid="published-content-item-id"
                  >
                    DRAFT ({candidate.publishedContentItemId})
                  </span>
                ) : (
                  <span>لم تُنشأ مسودة ContentItem بعد</span>
                )}
              </div>
            </div>

            {/* Creative Slot & Canonical Family Compliance Inspector */}
            <CreativeSlotInspector candidate={candidate} />

            {/* Deduplication & Content Identity Panel */}
            <DeduplicationPanel
              candidate={candidate}
              onRescreen={handleRescreen}
              isRescreening={rescreenMutation.isPending}
              overlapRequirements={
                candidate.reviewStatus === "approved" ? [] : overlapState.required
              }
              acknowledgedFingerprints={acknowledgedOverlaps}
              onToggleAcknowledgment={toggleOverlapAcknowledgment}
              acknowledgmentDisabled={action.isPending}
              overlapEvidenceRefreshed={overlapState.refreshed}
            />

            {candidate.publishedContentItemId && (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 text-xs text-emerald-950 shadow-sm"
                data-testid="draft-created-feedback"
              >
                <div className="flex items-center gap-2.5">
                  <Check className="size-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-bold text-emerald-900 text-sm">
                      تم إنشاء مسودة ContentItem بنجاح في قاعدة البيانات القانونية!
                    </p>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      معرّف المسودة: <span className="font-mono font-bold text-emerald-950">{candidate.publishedContentItemId}</span> · الحالة: <span className="font-semibold">DRAFT</span> (محمية ومفصولة عن أطوار اللعب حتى الاعتماد والترقية الخارجية).
                    </p>
                  </div>
                </div>
                <a
                  href={`/admin/content-items?search=${candidate.publishedContentItemId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-emerald-400 bg-white px-3.5 py-1.5 font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100/50 transition"
                >
                  عرض المسودة في إدارة المحتوى ↗
                </a>
              </div>
            )}

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
            {candidate.reviewStatus === "approved" &&
              candidate.reviewEvents?.at(-1)?.action ===
                "approval_carried_forward" && (
                <div
                  role="status"
                  data-testid="approval-carried-forward-banner"
                  className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-xs text-sky-950"
                >
                  <p className="font-semibold">
                    الاعتماد البشري محفوظ بعد إعادة التحقق (Approval preserved)
                  </p>
                  <p className="mt-0.5 leading-relaxed">
                    أعادت إعادة فحص التكرار التحقق من أن المحتوى والهدف وأدلة التقاطع لم تتغير، فبقي
                    الاعتماد الأصلي سارياً عند رقم المراجعة الحالي. تُعاد مطابقة الأدلة مرة أخرى عند إنشاء المسودة.
                  </p>
                </div>
              )}

            {latestRevocation && (
              <div
                role="status"
                data-testid="approval-revoked-banner"
                className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950"
              >
                <p className="font-semibold">
                  سُحب الاعتماد السابق (Approval revoked) بعد إعادة فحص التكرار
                </p>
                <p className="mt-0.5 leading-relaxed">
                  ظهرت أدلة جديدة أو متغيّرة لم يشملها الاعتماد السابق
                  {latestRevocation.reasons?.length
                    ? ` (${latestRevocation.reasons.join("، ")})`
                    : ""}
                  ؛ يلزم تقييم ومراجعة بشرية جديدة.
                </p>
              </div>
            )}

            {/* Approval Eligibility & Blockers Panel */}
            {eligibility && (
              <div
                id={DECISION_REQUIREMENTS_ID}
                tabIndex={-1}
                data-testid="approval-eligibility-panel"
                className={`scroll-mt-24 rounded-xl border p-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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

            {candidate.findings?.some((f) => f.code === "FAMILY_COMPLIANCE_UNVERIFIED") &&
              !candidate.reviewDecision?.familyComplianceResolution?.resolvedByReviewer && (
                <div
                  data-testid="family-unverified-approval-notice"
                  className="rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-950"
                >
                  <p className="font-semibold text-amber-900">
                    ملاحظة توثيق العائلة (FAMILY_COMPLIANCE_UNVERIFIED):
                  </p>
                  <p className="mt-0.5 text-amber-800 text-[11px] leading-relaxed">
                    هذا المرشح يتبع عائلة تتطلب تقييمًا بشريًا. سيتم توثيق شرح القرار المكتوب أعلاه كإقرار رسمي لتوافق المرشح مع العائلة المخصصة.
                  </p>
                </div>
              )}

            {candidate.findings?.some((f) => f.code === "FAMILY_COMPLIANCE_MISMATCH") && (
              <div
                data-testid="family-mismatch-approval-blocker-notice"
                className="rounded-lg border border-rose-300 bg-rose-50/80 p-3 text-xs text-rose-950"
              >
                <p className="font-bold text-rose-900">
                  ⛔ زر الاعتماد معطّل بسبب تعارض العائلة (FAMILY_COMPLIANCE_MISMATCH)
                </p>
                <p className="mt-0.5 text-rose-800 text-[11px] leading-relaxed">
                  لا يمكن اعتماد هذا المرشح حتى يتم تعديل السؤال بالمحرر ليتوافق مع العائلة القانونية المخصصة.
                </p>
              </div>
            )}

            {candidate.reviewStatus === "approved" &&
              (eligibility?.draftBlockers?.length ?? 0) > 0 && (
                <div
                  role="status"
                  data-testid="draft-blockers-panel"
                  className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
                >
                  <p className="font-semibold">موانع إنشاء المسودة القانونية:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pe-5">
                    {eligibility!.draftBlockers!.map((blocker, idx) => (
                      <li key={idx}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              )}
          </SectionCard>

          {/*
            Sticky on large screens so the decision stays reachable while the
            reviewer reads. It is in normal flow, so it never permanently hides
            content, and scroll-padding keeps focused fields clear of it. The
            controls, their conditions and their payloads are unchanged.
          */}
          <div
            ref={decisionBarRef}
            role="region"
            aria-label="إجراءات القرار"
            data-testid="decision-bar"
            className="z-10 space-y-2 rounded-xl border bg-card p-3 shadow-sm lg:sticky lg:bottom-4 lg:shadow-[0_-10px_24px_-14px_hsl(var(--foreground)/0.35)]"
          >
            <DecisionBarSummary
              candidate={candidate}
              approvalBlockers={eligibility?.approvalBlockers ?? []}
              hasExplanation={Boolean(decisionExplanation.trim())}
              needsFactualOverride={
                Boolean(candidate.humanAssessment) &&
                candidate.humanAssessment?.factualState !== "SUPPORTED" &&
                (!factualOverrideCode || !overrideExplanation.trim())
              }
            />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  data-testid="button-approve-candidate"
                  disabled={
                    action.isPending ||
                    candidate.reviewStatus === "rejected" ||
                    Boolean(candidate.publishedContentItemId) ||
                    !decisionExplanation.trim() ||
                    Boolean(eligibility && !eligibility.canApprove) ||
                    overlapState.unverifiable > 0 ||
                    unacknowledgedOverlaps > 0 ||
                    (candidate.humanAssessment?.factualState !== "SUPPORTED" &&
                      (!factualOverrideCode || !overrideExplanation.trim()))
                  }
                  onClick={() => {
                    lastActionKind.current = "approve";
                    // Exactly the server-provided fingerprints, all acknowledged.
                    const overlapAcknowledgments = overlapState.required
                      .filter((r) => acknowledgedOverlaps.has(r.fingerprint))
                      .map((r) => ({ fingerprint: r.fingerprint }));
                    action.mutate(() =>
                      api.approveCandidate(candidate.candidateId, {
                        expectedRevision: candidate.reviewRevision,
                        explanation: decisionExplanation.trim(),
                        ...(overlapAcknowledgments.length
                          ? { overlapAcknowledgments }
                          : {}),
                        ...(candidate.humanAssessment?.factualState ===
                        "SUPPORTED"
                          ? {}
                          : {
                              factualOverrideCode: factualOverrideCode || undefined,
                              factualOverrideExplanation:
                                overrideExplanation.trim(),
                            }),
                      }),
                    );
                  }}
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
                  onClick={() => {
                    lastActionKind.current = "other";
                    action.mutate(() =>
                      api.rejectCandidate(candidate.candidateId, {
                        expectedRevision: candidate.reviewRevision,
                        reasonCode: rejectionReason,
                        explanation: decisionExplanation.trim(),
                      }),
                    );
                  }}
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
                  onClick={() => {
                    lastActionKind.current = "draft";
                    action.mutate(() =>
                      api.createCanonicalDraft(
                        candidate.candidateId,
                        candidate.reviewRevision,
                      ),
                    );
                  }}
                >
                  <FilePlus2 className="me-2 size-4" /> إنشاء مسودة Canonical (DRAFT)
                </Button>
              </div>
          </div>

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
                  {event.action === "approval_carried_forward" && (
                    <p
                      data-testid={`audit-approval-carried-forward-${index}`}
                      className="mt-1 text-sky-900"
                    >
                      {(() => {
                        const original = event.details?.originalApproval as
                          | { revision?: number; reviewerEmail?: string }
                          | undefined;
                        return `إجراء آلي وليس اعتماداً بشرياً جديداً (Automated, not a new human approval). أُعيد فحص المحتوى والهدف وسجل النطاق وأدلة التقاطع فلم يتغير شيء، فبقي الاعتماد البشري الأصلي (rev ${original?.revision ?? "?"}${original?.reviewerEmail ? ` · ${original.reviewerEmail}` : ""}) سارياً.`;
                      })()}
                    </p>
                  )}
                  {Boolean(event.details?.approvalRevoked) && (
                    <p
                      data-testid={`audit-approval-revoked-${index}`}
                      className="mt-1 font-semibold text-rose-800"
                    >
                      سُحب الاعتماد في هذه المراجعة (Approval revoked)
                    </p>
                  )}
                  {Array.isArray(event.details?.overlapAcknowledgments) &&
                    (event.details.overlapAcknowledgments as unknown[]).length > 0 && (
                      <p className="mt-1 text-emerald-800">
                        أقرّ المراجع بـ{" "}
                        {(event.details.overlapAcknowledgments as unknown[]).length}{" "}
                        شبهة تقاطع (Overlap acknowledged)
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
        </section>
        </div>
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
  const published = Boolean(candidate.publishedContentItemId);
  const hasBlockingFindings = candidate.findings?.some(
    (f) => f.severity === "blocking",
  );
  const hasIncompleteHistorical = hasIncompleteHistoricalVerification(
    candidate.findings,
  );
  const hasProvenDuplicates = hasProvenDuplicate(candidate.findings);
  const hasFamilyMismatch = candidate.findings?.some(
    (f) => f.code === "FAMILY_COMPLIANCE_MISMATCH",
  );

  if (candidate.reviewEligibility) {
    const extraBlockers: string[] = [];
    if (
      hasProvenDuplicates &&
      !candidate.reviewEligibility.approvalBlockers.some((b) =>
        b.includes("تكرار"),
      )
    ) {
      extraBlockers.push(
        "تم رصد تكرار مثبت مع محتوى سابق؛ لا يمكن الاعتماد ويجب تعديل السؤال بالمحرر.",
      );
    }
    if (
      hasIncompleteHistorical &&
      !candidate.reviewEligibility.approvalBlockers.some((b) =>
        b.includes("غير مكتمل"),
      )
    ) {
      extraBlockers.push(
        "التحقق التاريخي من عدم التكرار غير مكتمل؛ يلزم إعادة فحص المرشح بنجاح قبل الاعتماد.",
      );
    }
    if (
      hasFamilyMismatch &&
      !candidate.reviewEligibility.approvalBlockers.some((b) =>
        b.includes("العائلة"),
      )
    ) {
      extraBlockers.push(
        "المرشح يتعارض مع العائلة المحددة له (FAMILY_COMPLIANCE_MISMATCH)؛ يلزم تعديل محتوى المرشح ليتطابق مع العائلة قبل الاعتماد.",
      );
    }

    const mergedBlockers = [
      ...candidate.reviewEligibility.approvalBlockers,
      ...extraBlockers,
    ];
    return {
      ...candidate.reviewEligibility,
      canApprove:
        candidate.reviewEligibility.canApprove && extraBlockers.length === 0,
      canCreateDraft:
        candidate.reviewEligibility.canCreateDraft &&
        !hasIncompleteHistorical &&
        !hasFamilyMismatch,
      approvalBlockers: mergedBlockers,
    };
  }
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
  if (hasProvenDuplicates) {
    approvalBlockers.push(
      "تم رصد تكرار مثبت مع محتوى سابق؛ لا يمكن الاعتماد ويجب تعديل السؤال بالمحرر.",
    );
  }
  if (hasIncompleteHistorical) {
    approvalBlockers.push(
      "التحقق التاريخي من عدم التكرار غير مكتمل؛ يلزم إعادة فحص المرشح بنجاح قبل الاعتماد.",
    );
  }
  if (hasFamilyMismatch) {
    approvalBlockers.push(
      "المرشح يتعارض مع العائلة المحددة له (FAMILY_COMPLIANCE_MISMATCH)؛ يلزم تعديل محتوى المرشح ليتطابق مع العائلة قبل الاعتماد.",
    );
  }
  if (hasBlockingFindings && !hasProvenDuplicates) {
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
      !hasBlockingFindings &&
      !hasIncompleteHistorical &&
      !hasFamilyMismatch,
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
