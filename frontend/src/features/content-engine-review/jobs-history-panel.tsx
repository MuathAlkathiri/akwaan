"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  cancelJob,
  type EngineJobListResponse,
  type EngineJobStatus,
  getJobStatus,
  listJobs,
  runJob,
} from "./api";
import {
  cancellationFeedback,
  DIFFICULTY_LABELS,
  extractApiError,
  isJobRunnable,
  isTerminalJobStatus,
  JOB_STATUS_LABELS,
  PIPELINE_STAGE_LABELS,
  totalCandidatesCount,
} from "./job-status-helpers";

const JOBS_POLL_INTERVAL_MS = 2_500;

export interface JobsHistoryPanelProps {
  selectedJobId: string | null;
  onSelectJobId: (jobId: string | null) => void;
  onHandoffToReview: (selection: {
    jobId: string;
    worldKey: string;
    scopeKey: string;
    mechanicKey?: string;
  }) => void;
}

export function JobsHistoryPanel({
  selectedJobId,
  onSelectJobId,
  onHandoffToReview,
}: JobsHistoryPanelProps) {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [extraPages, setExtraPages] = useState<EngineJobStatus[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageCountRef = useRef(0);
  const pageGenerationRef = useRef(0);
  const filterRef = useRef(statusFilter);
  const previousFirstPageRef = useRef<EngineJobStatus[]>([]);
  const extraPagesRef = useRef(extraPages);
  extraPagesRef.current = extraPages;
  const rebuildInFlightRef = useRef<number | null>(null);
  const latestBoundaryRef = useRef<string | null>(null);
  const [rebuildAttempt, setRebuildAttempt] = useState(0);

  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"run" | "cancel" | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "info" | "error";
    code?: string;
    message: string;
  } | null>(null);

  const actionLockRef = useRef(false);

  const jobsQuery = useQuery<EngineJobListResponse>({
    queryKey: ["content-engine-jobs", { status: statusFilter || undefined }],
    queryFn: () =>
      listJobs({
        limit: 20,
        status: statusFilter || undefined,
      }),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasActive =
        busyAction === "run" ||
        items.some((item) => item.status === "leased");
      return hasActive ? JOBS_POLL_INTERVAL_MS : false;
    },
  });

  useEffect(() => {
    if (filterRef.current !== statusFilter) {
      pageGenerationRef.current += 1;
      rebuildInFlightRef.current = null;
      latestBoundaryRef.current = null;
      filterRef.current = statusFilter;
      pageCountRef.current = 0;
      previousFirstPageRef.current = [];
      setExtraPages([]);
      setNextCursor(null);
      setLoadingMore(false);
    }
    if (!jobsQuery.data) return;
    const boundary = JSON.stringify([statusFilter, jobsQuery.data.nextCursor, jobsQuery.data.items.map((item) => item.jobId)]);
    latestBoundaryRef.current = boundary;
    if (rebuildInFlightRef.current !== null) return;
    if (pageCountRef.current === 0) {
      previousFirstPageRef.current = jobsQuery.data.items;
      setLoadingMore(false);
      setNextCursor(jobsQuery.data.nextCursor ?? null);
      return;
    }
    const generation = ++pageGenerationRef.current;
    rebuildInFlightRef.current = generation;
    // Rebuild the loaded window from the new first-page cursor: insertions can
    // shift page boundaries, so reusing old cursor pages can omit jobs.
    const previousFirstPage = previousFirstPageRef.current;
    const oldestLoadedId = extraPagesRef.current.at(-1)?.jobId ?? previousFirstPage.at(-1)?.jobId;
    previousFirstPageRef.current = jobsQuery.data.items;
    setExtraPages((previous) => [...previousFirstPage, ...previous]);
    setLoadingMore(true);
    const rebuild = async () => {
      let cursor = jobsQuery.data?.nextCursor ?? null;
      const items: EngineJobStatus[] = [];
      let loaded = 0;
      try {
        const maxPages = pageCountRef.current + 5;
        while (cursor && (loaded < pageCountRef.current || (oldestLoadedId && ![...jobsQuery.data!.items, ...items].some((item) => item.jobId === oldestLoadedId)))) {
          if (loaded >= maxPages) throw new Error("تعذر تحديث جميع الدفعات المحملة؛ حاول التحديث مجدداً.");
          const page = await listJobs({ limit: 20, cursor, status: statusFilter || undefined });
          if (generation !== pageGenerationRef.current) return;
          items.push(...page.items);
          cursor = page.nextCursor ?? null;
          loaded += 1;
        }
        if (generation !== pageGenerationRef.current || boundary !== latestBoundaryRef.current) return;
        setExtraPages(items);
        setNextCursor(cursor);
        pageCountRef.current = loaded;
      } catch (err) {
        if (generation !== pageGenerationRef.current) return;
        const extracted = extractApiError(err, "تعذر تحديث الدفعات المحملة");
        setFeedback({ type: "error", code: extracted.code, message: extracted.message });
      } finally {
        if (generation === pageGenerationRef.current) {
          rebuildInFlightRef.current = null;
          setLoadingMore(false);
          if (boundary !== latestBoundaryRef.current) setRebuildAttempt((value) => value + 1);
        }
      }
    };
    void rebuild();
  }, [jobsQuery.data, jobsQuery.dataUpdatedAt, statusFilter, rebuildAttempt]);

  const allJobs = useMemo(() => {
    const firstPageItems = jobsQuery.data?.items ?? [];
    if (extraPages.length === 0) return firstPageItems;
    const seen = new Set<string>();
    const merged: EngineJobStatus[] = [];
    for (const item of [...firstPageItems, ...extraPages]) {
      if (!seen.has(item.jobId)) {
        seen.add(item.jobId);
        merged.push(item);
      }
    }
    return merged.sort((a, b) => b.jobId.localeCompare(a.jobId));
  }, [jobsQuery.data?.items, extraPages]);

  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return allJobs;
    const q = searchQuery.trim().toLowerCase();
    return allJobs.filter(
      (job) =>
        job.jobId.toLowerCase().includes(q) ||
        (job.worldKey ?? job.generationSpec?.worldKey ?? "").toLowerCase().includes(q) ||
        (job.scopeKey ?? job.generationSpec?.scopeKey ?? "").toLowerCase().includes(q) ||
        (job.mechanicKey ?? job.generationSpec?.mechanicKey ?? "").toLowerCase().includes(q),
    );
  }, [allJobs, searchQuery]);

  // Auto-select the first job if none is selected
  useEffect(() => {
    if (!selectedJobId && allJobs.length > 0) {
      onSelectJobId(allJobs[0].jobId);
    }
  }, [selectedJobId, allJobs, onSelectJobId]);

  // Selected job resolution
  const selectedJobFromList = useMemo(
    () => allJobs.find((j) => j.jobId === selectedJobId) ?? null,
    [allJobs, selectedJobId],
  );

  const selectedJobDetailQuery = useQuery<EngineJobStatus>({
    queryKey: ["content-engine-job-detail", selectedJobId],
    queryFn: () => getJobStatus(selectedJobId!),
    enabled: Boolean(selectedJobId),
  });

  const detailConflict = Boolean(selectedJobFromList && selectedJobDetailQuery.data && (
    selectedJobFromList.status !== selectedJobDetailQuery.data.status ||
    selectedJobFromList.cancellationRequested !== selectedJobDetailQuery.data.cancellationRequested
  ));
  const conflictRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detailConflict || !selectedJobFromList || !selectedJobDetailQuery.data) {
      conflictRef.current = null;
      return;
    }
    if (selectedJobDetailQuery.isFetching) return;
    const signature = `${selectedJobId}:${selectedJobFromList.status}:${selectedJobFromList.cancellationRequested}:${selectedJobDetailQuery.data.status}:${selectedJobDetailQuery.data.cancellationRequested}`;
    if (conflictRef.current === signature) return;
    conflictRef.current = signature;
    const detailIsTerminal = isTerminalJobStatus(selectedJobDetailQuery.data.status);
    const listIsTerminal = isTerminalJobStatus(selectedJobFromList.status);
    const key = detailIsTerminal && !listIsTerminal
      ? ["content-engine-jobs"]
      : ["content-engine-job-detail", selectedJobId];
    void queryClient.invalidateQueries({ queryKey: key }, { cancelRefetch: false });
  }, [detailConflict, selectedJobId, selectedJobFromList, selectedJobDetailQuery.data, selectedJobDetailQuery.isFetching, queryClient]);
  const reconcilingDetail = selectedJobDetailQuery.isError || !selectedJobDetailQuery.data || detailConflict;
  const inspectedJob = detailConflict && !isTerminalJobStatus(selectedJobDetailQuery.data?.status)
    ? selectedJobFromList
    : (selectedJobDetailQuery.data ?? selectedJobFromList);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const generation = pageGenerationRef.current;
    setLoadingMore(true);
    try {
      const page = await listJobs({
        limit: 20,
        cursor: nextCursor,
        status: statusFilter || undefined,
      });
      if (generation !== pageGenerationRef.current) return;
      setExtraPages((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor ?? null);
      pageCountRef.current += 1;
    } catch (err) {
      if (generation !== pageGenerationRef.current) return;
      const extracted = extractApiError(err, "فشل تحميل الدفعات الإضافية");
      setFeedback({
        type: "error",
        code: extracted.code,
        message: extracted.message,
      });
    } finally {
      if (generation === pageGenerationRef.current) setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, statusFilter]);

  const handleRunJob = useCallback(
    async (jobId: string) => {
      if (!jobId || actionLockRef.current || busyJobId !== null) return;
      actionLockRef.current = true;
      setBusyJobId(jobId);
      setBusyAction("run");
      setFeedback(null);

      try {
        const runOutcome = await runJob(jobId);
        const latest = await getJobStatus(jobId);
        queryClient.setQueryData(["content-engine-job-detail", jobId], latest);
        void queryClient.invalidateQueries({
          queryKey: ["content-engine-jobs"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["content-engine-candidates"],
        });

        if (runOutcome.alreadyRunning) {
          setFeedback({
            type: "info",
            message: `الدفعة (${jobId}) قيد التشغيل بالفعل بواسطة مشرف آخر.`,
          });
        } else if (latest.status === "awaiting_review") {
          setFeedback({
            type: "info",
            message: `اكتمل تشغيل الدفعة (${jobId}) بنجاح وجاهزة للمراجعة.`,
          });
        }
      } catch (err) {
        const extracted = extractApiError(err, "فشل تشغيل الدفعة");
        try {
          const fallback = await getJobStatus(jobId);
          queryClient.setQueryData(
            ["content-engine-job-detail", jobId],
            fallback,
          );
          void queryClient.invalidateQueries({
            queryKey: ["content-engine-jobs"],
          });
          if (extracted.isTimeoutOrNetwork) {
            setFeedback({
              type: "error",
              code: extracted.code,
              message: `استغرق نداء التشغيل وقتاً أطول من المتوقع، ولكن تم جلب حالة الدفعة من الخادم بنجاح دون إعادة تشغيل مدفوع تلقائي: ${extracted.message}`,
            });
          } else {
            setFeedback({
              type: "error",
              code: extracted.code,
              message: extracted.message,
            });
          }
        } catch {
          setFeedback({
            type: "error",
            code: extracted.code,
            message: extracted.message,
          });
        }
      } finally {
        actionLockRef.current = false;
        setBusyJobId(null);
        setBusyAction(null);
      }
    },
    [busyJobId, queryClient],
  );

  const handleCancelJob = useCallback(
    async (jobId: string) => {
      if (!jobId || actionLockRef.current || busyJobId !== null) return;
      actionLockRef.current = true;
      setBusyJobId(jobId);
      setBusyAction("cancel");
      setFeedback(null);

      try {
        const recorded = await cancelJob(jobId);
        const latest = await getJobStatus(jobId);
        queryClient.setQueryData(["content-engine-job-detail", jobId], latest);
        void queryClient.invalidateQueries({
          queryKey: ["content-engine-jobs"],
        });
        setFeedback({
          type: "info",
          message: cancellationFeedback(recorded, jobId, latest.status),
        });
      } catch (err) {
        const extracted = extractApiError(err, "تعذر إلغاء الدفعة");
        setFeedback({
          type: "error",
          code: extracted.code,
          message: extracted.message,
        });
      } finally {
        actionLockRef.current = false;
        setBusyJobId(null);
        setBusyAction(null);
      }
    },
    [busyJobId, queryClient],
  );

  return (
    <section
      className="mb-8 rounded-2xl border border-border/80 bg-white p-6 sm:p-8 shadow-sm space-y-6 text-foreground"
      data-testid="jobs-history-panel"
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            سجل دفعات التوليد ومراقبة التشغيل
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            متابعة الدفعات، تشغيل الدفعة المحددة بالمعرّف، الإلغاء، والانتقال لمراجعة المرشحين.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex flex-col gap-0.5">
            <input
              type="text"
              data-testid="input-search-jobs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في الدفعات المحملة..."
              title="تصفية فورية للدفعات المحملة حالياً في القائمة (لا تشمل الدفعات السابقة غير المحملة من الخادم)"
              aria-label="تصفية فورية للدفعات المحملة حالياً"
              className="h-9 w-48 rounded-xl border border-input bg-white px-3 text-xs text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            <span className="text-[10px] text-slate-400">
              * تصفية النتائج المحملة فقط
            </span>
          </div>

          <label className="flex max-w-full min-w-0 flex-wrap items-center gap-2 text-slate-600 font-medium">
            <span>تصفية الحالة:</span>
            <select
              data-testid="jobs-filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 max-w-full min-w-0 rounded-xl border border-input bg-white px-3 text-xs text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="">جميع الحالات</option>
              <option value="queued">في الانتظار (queued)</option>
              <option value="leased">قيد التشغيل (leased)</option>
              <option value="awaiting_review">
                جاهزة للمراجعة (awaiting_review)
              </option>
              <option value="completed">مكتملة (completed)</option>
              <option value="failed">فشلت (failed)</option>
              <option value="cancelled">ملغاة (cancelled)</option>
            </select>
          </label>

          <button
            type="button"
            data-testid="button-refresh-jobs"
            onClick={() => {
              void jobsQuery.refetch();
              if (selectedJobId) {
                void selectedJobDetailQuery.refetch();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition"
          >
            <RefreshCw className="size-3.5 text-slate-500" />
            تحديث السجل
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border p-4 text-xs shadow-sm ${
            feedback.type === "error"
              ? "border-rose-200 bg-rose-50/70 text-rose-900"
              : "border-sky-200 bg-sky-50/70 text-sky-900"
          }`}
          data-testid="jobs-feedback-banner"
        >
          {feedback.code && (
            <span className="ml-2 rounded-md bg-white border px-2 py-0.5 font-mono text-[11px] font-semibold">
              {feedback.code}
            </span>
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Jobs List */}
        <div className="min-w-0 space-y-3 lg:col-span-6">
          {jobsQuery.isLoading && (
            <div className="rounded-xl border border-border/80 bg-slate-50/50 p-6 text-center text-xs text-slate-500 space-y-2">
              <div className="size-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent mx-auto" />
              <p>جاري تحميل سجل الدفعات...</p>
            </div>
          )}

          {jobsQuery.isError && (
            <div role="alert" data-testid="jobs-load-error" className="rounded-xl border border-destructive/40 p-4 text-sm">
              <p>تعذر تحميل سجل الدفعات.</p>
              <button type="button" onClick={() => void jobsQuery.refetch()} className="mt-2 rounded-lg border px-3 py-2">إعادة المحاولة</button>
            </div>
          )}
          {!jobsQuery.isLoading && !jobsQuery.isError && allJobs.length === 0 && (
            <div
              className="rounded-xl border border-dashed border-border/90 bg-slate-50/40 p-8 text-center text-xs text-slate-500"
              data-testid="jobs-empty-state"
            >
              <Layers className="size-8 mx-auto mb-2 text-slate-400 stroke-1" />
              <p className="font-semibold text-slate-700">لا توجد دفعات مطابقة</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                لم يتم العثور على دفعات مطابقة للفلتر المحدد حالياً.
              </p>
            </div>
          )}

          {filteredJobs.map((item) => {
            const isSelected = item.jobId === selectedJobId;
            const statusMeta = JOB_STATUS_LABELS[item.status] ?? {
              label: item.status,
              description: "",
              badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
            };
            const itemWorld =
              item.worldKey ?? item.generationSpec?.worldKey ?? "—";
            const itemScope =
              item.scopeKey ?? item.generationSpec?.scopeKey ?? "—";
            const itemMechanic =
              item.mechanicKey ?? item.generationSpec?.mechanicKey ?? "—";
            const itemCount =
              item.targetCount ?? item.generationSpec?.targetCount ?? 0;
            const candCount = totalCandidatesCount(item.candidates);
            const isRunningThis =
              (busyJobId === item.jobId && busyAction === "run") ||
              item.status === "leased";

            return (
              <div
                key={item.jobId}
                data-testid={`job-row-${item.jobId}`}
                className={`rounded-2xl border p-4 text-xs transition shadow-sm ${
                  isSelected
                    ? "border-amber-500 bg-amber-50/30 ring-1 ring-amber-500/20"
                    : "border-border/80 bg-white hover:border-amber-300 hover:bg-amber-50/20"
                }`}
              >
                <button type="button" data-testid={`job-select-${item.jobId}`} aria-pressed={isSelected} aria-label={`عرض تفاصيل الدفعة ${itemScope} ${itemMechanic} ${item.jobId}`} onClick={() => onSelectJobId(item.jobId)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded border-b border-border/40 pb-2.5 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">
                  <span className="font-bold text-amber-800 text-sm">
                    {itemScope} · {itemMechanic}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                    data-testid={`job-status-${item.jobId}`}
                  >
                    {isRunningThis
                      ? "قيد التشغيل (Running)"
                      : statusMeta.label}
                  </span>
                </button>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-slate-800 font-medium">
                  <span className="font-mono text-slate-900">
                    {itemWorld} / {itemScope}
                  </span>
                  <span className="text-slate-600 text-[11px]">
                    العدد: <strong className="text-slate-900">{itemCount}</strong> · المرشحون:{" "}
                    <strong className="text-slate-900">{candCount}</strong>
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>
                    المرحلة:{" "}
                    <strong className="text-slate-700 font-mono">
                      {PIPELINE_STAGE_LABELS[item.pipelineStage] ??
                        item.pipelineStage}
                    </strong>{" "}
                    · محاولات: {item.attempts}
                  </span>
                  <span className="font-mono font-bold text-emerald-700">
                    {item.spentSar.toFixed(4)} ر.س
                  </span>
                </div>

                <div
                  className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!(isSelected && reconcilingDetail) && isJobRunnable(item) && (
                    <button
                      type="button"
                      data-testid={`job-run-btn-${item.jobId}`}
                      onClick={() => void handleRunJob(item.jobId)}
                      disabled={busyJobId !== null}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-40"
                    >
                      <Play className="size-3" />
                      <span>
                        {busyJobId === item.jobId && busyAction === "run"
                          ? "جاري التشغيل..."
                          : "تشغيل هذه الدفعة"}
                      </span>
                    </button>
                  )}

                  {!(isSelected && reconcilingDetail) && !isTerminalJobStatus(item.status) &&
                    !item.cancellationRequested && (
                      <button
                        type="button"
                        data-testid={`job-cancel-btn-${item.jobId}`}
                        onClick={() => void handleCancelJob(item.jobId)}
                        disabled={busyJobId !== null}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-40"
                      >
                        إلغاء
                      </button>
                    )}

                  <button
                    type="button"
                    data-testid={`job-handoff-btn-${item.jobId}`}
                    onClick={() =>
                      onHandoffToReview({
                        jobId: item.jobId,
                        worldKey: itemWorld === "—" ? "" : itemWorld,
                        scopeKey: itemScope === "—" ? "" : itemScope,
                        mechanicKey: itemMechanic === "—" ? "" : itemMechanic,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 transition"
                  >
                    <span>مراجعة المرشحين ({candCount})</span>
                  </button>
                </div>
              </div>
            );
          })}

          {nextCursor && (
            <button
              type="button"
              data-testid="button-load-more-jobs"
              onClick={() => void handleLoadMore()}
              disabled={loadingMore}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 transition disabled:opacity-40"
            >
              {loadingMore
                ? "جاري تحميل المزيد..."
                : "تحميل المزيد من الدفعات"}
            </button>
          )}
        </div>

        {/* Right: Job Detail Inspector */}
        <div className="min-w-0 lg:col-span-6">
          {selectedJobId && selectedJobDetailQuery.isLoading && <p role="status">جارٍ تحميل تفاصيل الدفعة…</p>}
          {selectedJobId && selectedJobDetailQuery.isError && (
            <div role="alert" data-testid="job-detail-load-error" className="mb-3 rounded-xl border border-destructive/40 p-4 text-sm">
              <p>{extractApiError(selectedJobDetailQuery.error, "تعذر تحميل تفاصيل الدفعة").status === 404 ? "لم يُعثر على الدفعة." : "تعذر تحميل تفاصيل الدفعة."}</p>
              <button type="button" onClick={() => void selectedJobDetailQuery.refetch()} className="mt-2 rounded-lg border px-3 py-2">إعادة المحاولة</button>
            </div>
          )}
          {!inspectedJob ? (selectedJobDetailQuery.isLoading || selectedJobDetailQuery.isError ? null : (
            <div className="rounded-2xl border border-border/80 bg-slate-50/50 p-8 text-center text-xs text-slate-500">
              <Layers className="size-8 mx-auto mb-2 text-slate-400 stroke-1" />
              <p className="font-semibold text-slate-700">لم يتم اختيار دفعة</p>
              <p className="text-[11px] text-slate-400 mt-1">
                اختر دفعة من القائمة لعرض تفاصيل مواصفتها وتكلفتها وحالتها التنفيذية.
              </p>
            </div>
          )) : (
            <div
              className="rounded-2xl border border-border/80 bg-slate-50/60 p-5 sm:p-6 text-xs text-slate-800 shadow-sm space-y-4"
              data-testid="job-detail-inspector"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {inspectedJob.scopeKey ?? inspectedJob.generationSpec?.scopeKey ?? "الدفعة"} · {inspectedJob.mechanicKey ?? inspectedJob.generationSpec?.mechanicKey ?? "التوليد"}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {JOB_STATUS_LABELS[inspectedJob.status]?.description ?? ""}
                  </p>
                </div>

                <span
                  className={`rounded-full border px-3 py-1 font-semibold ${
                    JOB_STATUS_LABELS[inspectedJob.status]?.badgeClass ??
                    "border-slate-200 bg-slate-100 text-slate-700"
                  }`}
                  data-testid="inspector-job-status"
                >
                  {JOB_STATUS_LABELS[inspectedJob.status]?.label ??
                    inspectedJob.status}
                </span>
              </div>

              {/* Execution & Lifecycle Metadata */}
              <div className="rounded-xl border border-border/80 bg-white p-4 shadow-sm">
                <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-[11px]">
                  <div>
                    <dt className="text-slate-500">الهدف (World / Scope / Mechanic):</dt>
                    <dd className="font-mono font-semibold text-slate-900">
                      {inspectedJob.worldKey ??
                        inspectedJob.generationSpec?.worldKey ??
                        "—"}{" "}
                      /{" "}
                      {inspectedJob.scopeKey ??
                        inspectedJob.generationSpec?.scopeKey ??
                        "—"}{" "}
                      /{" "}
                      {inspectedJob.mechanicKey ??
                        inspectedJob.generationSpec?.mechanicKey ??
                        "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">المرحلة والمحاولات:</dt>
                    <dd className="font-mono font-medium text-slate-900">
                      {PIPELINE_STAGE_LABELS[inspectedJob.pipelineStage] ??
                        inspectedJob.pipelineStage}{" "}
                      (محاولات: {inspectedJob.attempts})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">التكلفة الفعلية والمحجوزة:</dt>
                    <dd className="font-mono text-emerald-700 font-bold">
                      {inspectedJob.spentSar.toFixed(4)} ر.س (
                      {inspectedJob.spentMicros.toLocaleString("en-US")} ميكرو) ·
                      نداءات: {inspectedJob.providerCalls}
                      {inspectedJob.outstandingReservedMicros > 0
                        ? ` · محجوز: ${inspectedJob.outstandingReservedMicros.toLocaleString("en-US")} ميكرو`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">المشرف المنشئ والمنفّذ:</dt>
                    <dd className="font-mono text-slate-700">
                      إنشاء:{" "}
                      {inspectedJob.createdByEmail ||
                        inspectedJob.createdBy ||
                        "—"}{" "}
                      · تشغيل:{" "}
                      {inspectedJob.lastExecutedByEmail ||
                        inspectedJob.lastExecutedBy ||
                        "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Pinned Generation Specification */}
              {inspectedJob.generationSpec ? (
                <details
                  className="rounded-xl border border-border/80 bg-white p-4 shadow-sm text-[11px] space-y-2"
                  data-testid="inspector-generation-spec"
                >
                  <summary className="cursor-pointer font-bold text-slate-900">تفاصيل مواصفة التوليد المثبتة · {inspectedJob.jobId}</summary>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                    <div>
                      <span className="text-slate-500">المزود والنموذج: </span>
                      <span className="font-mono font-medium text-slate-900">
                        {inspectedJob.generationSpec.provider} /{" "}
                        {inspectedJob.generationSpec.generationModel}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">القالب والنمط: </span>
                      <span className="font-mono font-medium text-slate-900">
                        {inspectedJob.generationSpec.promptVersion} (
                        {inspectedJob.generationSpec.answerMode})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">العدد والصعوبة: </span>
                      <span className="font-mono font-medium text-slate-900">
                        {inspectedJob.generationSpec.targetCount} ·{" "}
                        {inspectedJob.generationSpec.difficulty
                          ? (DIFFICULTY_LABELS[
                              inspectedJob.generationSpec.difficulty
                            ] ?? inspectedJob.generationSpec.difficulty)
                          : "بدون صعوبة مخصصة"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">
                        الحرارة وسقف التوكنات:{" "}
                      </span>
                      <span className="font-mono font-medium text-slate-900">
                        {inspectedJob.generationSpec.temperature == null ? "لم تُحدد قيمة Temperature" : `temp=${inspectedJob.generationSpec.temperature}`} · maxTokens=
                        {inspectedJob.generationSpec.maxOutputTokens}
                      </span>
                    </div>
                  </div>
                  {inspectedJob.generationSpec.batchGuidance && (
                    <div className="border-t border-border/60 pt-2 text-slate-700">
                      <span className="text-slate-500 block mb-0.5">التوجيه الإضافي: </span>
                      <p className="whitespace-pre-wrap text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-border/60">
                        {inspectedJob.generationSpec.batchGuidance}
                      </p>
                    </div>
                  )}
                </details>
              ) : (
                <div
                  className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-[11px] text-rose-900"
                  data-testid="inspector-legacy-job-warning"
                >
                  دفعة قديمة بدون مواصفة توليد مثبتة (provenanceComplete =
                  false). يتعذر تشغيلها تلقائياً.
                </div>
              )}

              {/* Candidate Counts */}
              <div className="rounded-xl border border-border/80 bg-white p-4 shadow-sm text-[11px]">
                <h4 className="font-bold text-slate-900 mb-2">
                  ملخص المرشحين ({totalCandidatesCount(inspectedJob.candidates)})
                </h4>
                {Object.keys(inspectedJob.candidates ?? {}).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(inspectedJob.candidates).map(
                      ([statusKey, count]) => (
                        <span
                          key={statusKey}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-slate-800 font-medium"
                        >
                          {statusKey}: <strong className="text-slate-900">{count}</strong>
                        </span>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500">
                    لم يتم توليد مرشحين لهذه الدفعة بعد.
                  </p>
                )}
              </div>

              {inspectedJob.awaitingReviewReason && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 font-medium">
                  سبب انتظار المراجعة: {inspectedJob.awaitingReviewReason}
                </p>
              )}

              {inspectedJob.lastError && (
                <p
                  className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-mono text-rose-900"
                  data-testid="inspector-last-error"
                >
                  آخر خطأ مسجل: {inspectedJob.lastError}
                </p>
              )}

              {/* Inspector Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {reconcilingDetail && <p role="status">جارٍ التحقق من حالة الدفعة قبل إتاحة الإجراءات.</p>}
                {!reconcilingDetail && isJobRunnable(inspectedJob) && (
                  <button
                    type="button"
                    data-testid="inspector-run-job-btn"
                    onClick={() => void handleRunJob(inspectedJob.jobId)}
                    disabled={busyJobId !== null}
                    className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-40"
                  >
                    <Play className="size-3.5" />
                    <span className="min-w-0 break-all">
                      {busyJobId === inspectedJob.jobId && busyAction === "run"
                        ? "جاري تشغيل الدفعة..."
                        : `تشغيل هذه الدفعة الآن (${inspectedJob.jobId})`}
                    </span>
                  </button>
                )}

                {!reconcilingDetail && !isTerminalJobStatus(inspectedJob.status) &&
                  !inspectedJob.cancellationRequested && (
                    <button
                      type="button"
                      data-testid="inspector-cancel-job-btn"
                      onClick={() => void handleCancelJob(inspectedJob.jobId)}
                      disabled={busyJobId !== null}
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-40"
                    >
                      <XCircle className="size-3.5" />
                      <span>إلغاء الدفعة</span>
                    </button>
                  )}

                <button
                  type="button"
                  data-testid="inspector-handoff-review-btn"
                  onClick={() =>
                    onHandoffToReview({
                      jobId: inspectedJob.jobId,
                      worldKey:
                        inspectedJob.worldKey ??
                        inspectedJob.generationSpec?.worldKey ??
                        "",
                      scopeKey:
                        inspectedJob.scopeKey ??
                        inspectedJob.generationSpec?.scopeKey ??
                        "",
                      mechanicKey:
                        inspectedJob.mechanicKey ??
                        inspectedJob.generationSpec?.mechanicKey ??
                        "",
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 transition"
                >
                  <span>
                    فتح مرشحي هذه الدفعة في مساحة المراجعة (
                    {totalCandidatesCount(inspectedJob.candidates)})
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
