import type { EngineJobStatus } from "./api";

export const TERMINAL_JOB_STATUSES = new Set([
  "awaiting_review",
  "completed",
  "failed",
  "cancelled",
]);

export const isTerminalJobStatus = (status: string | undefined | null): boolean =>
  Boolean(status && TERMINAL_JOB_STATUSES.has(status));

export const isJobRunnable = (job: EngineJobStatus | null | undefined): boolean => {
  if (!job) return false;
  if (job.status !== "queued") return false;
  if (job.cancellationRequested) return false;
  if (job.provenanceComplete === false) return false;
  return true;
};

export const JOB_STATUS_LABELS: Record<
  string,
  { label: string; description: string; badgeClass: string }
> = {
  queued: {
    label: "في الانتظار (Queued)",
    description: "الدفعة مسجلة وتنتظر أمر التشغيل المباشر لهذه الدفعة تحديداً.",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  leased: {
    label: "قيد التشغيل (Running)",
    description: "الدفعة مؤجرة حالياً وتعمل مراحل التوليد والفحص.",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-800",
  },
  awaiting_review: {
    label: "جاهزة للمراجعة (Awaiting Review)",
    description: "اكتمل التوليد الآلي وتنتظر الدفعة قرار المراجع البشري.",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  completed: {
    label: "مكتملة (Completed)",
    description: "اكتملت الدفعة بنجاح.",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  failed: {
    label: "فشلت (Failed)",
    description: "توقفت الدفعة بسبب خطأ؛ راجع سبب الفشل أدناه.",
    badgeClass: "border-rose-200 bg-rose-50 text-rose-800",
  },
  cancelled: {
    label: "ملغاة (Cancelled)",
    description: "تم إلغاء الدفعة بطلب من المشرف.",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
  },
};

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  pending: "بانتظار البدء (pending)",
  context_resolved: "تمت قراءة السياق القانوني (context_resolved)",
  generated: "تم توليد المرشحين (generated)",
  screened: "تم الفحص الحتمي (screened)",
  verified: "تم التحقق من الحقائق (verified)",
  compatibility_checked: "تم فحص التوافق (compatibility_checked)",
  judged: "تم تحكيم الجودة (judged)",
  awaiting_review: "بانتظار المراجعة البشرية (awaiting_review)",
  provider_outcome_ambiguous: "نتيجة المزود غير حاسمة (provider_outcome_ambiguous)",
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  mixed: "مختلط (توزيع تجريبي متوازن)",
  easy: "سهل (Easy)",
  medium: "متوسط (Medium)",
  relatively_difficult: "صعب نسبياً (Relatively Difficult)",
};

export const formatSarFromMicros = (
  micros: number | undefined | null,
): string => {
  if (typeof micros !== "number" || !Number.isFinite(micros)) {
    return "غير متاح";
  }
  return `${(micros / 1_000_000).toFixed(4)} ر.س (${micros.toLocaleString("en-US")} ميكرو)`;
};

export const totalCandidatesCount = (
  candidates: Record<string, number> | undefined | null,
): number => {
  if (!candidates) return 0;
  return Object.values(candidates).reduce(
    (sum, n) => sum + (typeof n === "number" ? n : 0),
    0,
  );
};

export interface ExtractedApiError {
  status?: number;
  code?: string;
  message: string;
  isTimeoutOrNetwork: boolean;
}

export const extractApiError = (
  err: unknown,
  fallback: string,
): ExtractedApiError => {
  const response = (
    err as {
      response?: {
        status?: number;
        data?: {
          code?: string;
          message?: string | string[];
          error?: { code?: string; message?: string };
        };
      };
      code?: string;
      message?: string;
    }
  )?.response;

  const status = response?.status;
  const data = response?.data;
  const code =
    data?.code ??
    data?.error?.code ??
    (typeof data?.message === "string" && data.message.includes(":")
      ? data.message.split(":")[0]?.trim()
      : undefined);

  const rawMessage = data?.message ?? data?.error?.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.join(" — ")
    : typeof rawMessage === "string" && rawMessage.trim().length > 0
      ? rawMessage
      : err instanceof Error && err.message
        ? err.message
        : fallback;

  const errCode = (err as { code?: string })?.code;
  const isTimeoutOrNetwork =
    !response ||
    errCode === "ECONNABORTED" ||
    errCode === "ETIMEDOUT" ||
    status === 502 ||
    status === 504 ||
    /timeout|network error/i.test(message);

  return {
    status,
    code,
    message,
    isTimeoutOrNetwork,
  };
};

export const CANDIDATE_PIPELINE_STATUS_LABELS: Record<
  string,
  { label: string; badgeClass: string }
> = {
  screened_reject: {
    label: "مرفوض آلياً (Screened Reject)",
    badgeClass: "border-rose-300 bg-rose-100 text-rose-800 font-medium",
  },
  awaiting_review: {
    label: "جاهز للمراجعة (Awaiting Review)",
    badgeClass: "border-emerald-300 bg-emerald-100 text-emerald-800 font-medium",
  },
  screened_pass: {
    label: "اجتاز الفحص (Screened Pass)",
    badgeClass: "border-sky-300 bg-sky-100 text-sky-800 font-medium",
  },
  fact_blocked: {
    label: "تعثر الحقائق (Fact Blocked)",
    badgeClass: "border-amber-300 bg-amber-100 text-amber-800 font-medium",
  },
  generated: {
    label: "تم التوليد (Generated)",
    badgeClass: "border-slate-300 bg-slate-100 text-slate-700",
  },
  generation_failed: {
    label: "فشل التوليد (Generation Failed)",
    badgeClass: "border-rose-300 bg-rose-100 text-rose-800",
  },
};

export const CANDIDATE_REVIEW_STATUS_LABELS: Record<
  string,
  { label: string; badgeClass: string }
> = {
  pending: {
    label: "بانتظار القرار البشري",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  approved: {
    label: "معتمد بشرياً",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800 font-medium",
  },
  rejected: {
    label: "مرفوض بشرياً",
    badgeClass: "border-rose-200 bg-rose-50 text-rose-800 font-medium",
  },
};
