"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelJob,
  type EngineJobListResponse,
  type EngineJobStatus,
  getJobStatus,
  listJobs,
  runJob,
} from "./api";
import {
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
  const [extraPages, setExtraPages] = useState<EngineJobStatus[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

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

  // Reset appended cursor pages whenever the status filter or first page reloads
  useEffect(() => {
    setExtraPages([]);
    setNextCursor(jobsQuery.data?.nextCursor ?? null);
  }, [jobsQuery.data, statusFilter]);

  const allJobs = useMemo(() => {
    const firstPage = jobsQuery.data?.items ?? [];
    if (extraPages.length === 0) return firstPage;
    const seen = new Set(firstPage.map((j) => j.jobId));
    const merged = [...firstPage];
    for (const row of extraPages) {
      if (!seen.has(row.jobId)) {
        seen.add(row.jobId);
        merged.push(row);
      }
    }
    return merged;
  }, [jobsQuery.data, extraPages]);

  // Auto-select the first job if none is selected
  useEffect(() => {
    if (!selectedJobId && allJobs.length > 0) {
      onSelectJobId(allJobs[0].jobId);
    }
  }, [selectedJobId, allJobs, onSelectJobId]);

  const selectedJobDetailQuery = useQuery<EngineJobStatus>({
    queryKey: ["content-engine-job-detail", selectedJobId],
    queryFn: () => getJobStatus(selectedJobId!),
    enabled: Boolean(selectedJobId),
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      if (
        (busyJobId && busyJobId === selectedJobId && busyAction === "run") ||
        st === "leased"
      ) {
        return JOBS_POLL_INTERVAL_MS;
      }
      return false;
    },
  });

  const inspectedJob = useMemo(() => {
    if (selectedJobDetailQuery.data) return selectedJobDetailQuery.data;
    if (!selectedJobId) return null;
    return allJobs.find((j) => j.jobId === selectedJobId) ?? null;
  }, [selectedJobDetailQuery.data, selectedJobId, allJobs]);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = await listJobs({
        cursor: nextCursor,
        limit: 20,
        status: statusFilter || undefined,
      });
      setExtraPages((prev) => [...prev, ...nextPage.items]);
      setNextCursor(nextPage.nextCursor);
    } catch (err) {
      const extracted = extractApiError(err, "تعذر تحميل المزيد من الدفعات");
      setFeedback({
        type: "error",
        code: extracted.code,
        message: extracted.message,
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRunJob = useCallback(
    async (jobId: string) => {
      if (!jobId || actionLockRef.current || busyJobId !== null) return;
      actionLockRef.current = true;
      setBusyJobId(jobId);
      setBusyAction("run");
      setFeedback(null);

      try {
        const result = await runJob(jobId);
        const latest = await getJobStatus(jobId);
        queryClient.setQueryData(["content-engine-job-detail", jobId], latest);
        void queryClient.invalidateQueries({
          queryKey: ["content-engine-jobs"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["content-engine-candidates"],
        });

        setFeedback({
          type: "info",
          message: result.alreadyRunning
            ? `الدفعة (${jobId}) قيد التشغيل بالفعل.`
            : `تم تنفيذ الدفعة (${jobId}) بنجاح — الحالة الحالية: ${
                JOB_STATUS_LABELS[latest.status]?.label ?? latest.status
              }.`,
        });
      } catch (err) {
        const extracted = extractApiError(err, "فشل تشغيل الدفعة");
        try {
          const recovered = await getJobStatus(jobId);
          queryClient.setQueryData(
            ["content-engine-job-detail", jobId],
            recovered,
          );
          void queryClient.invalidateQueries({
            queryKey: ["content-engine-jobs"],
          });
          setFeedback({
            type: "error",
            code: extracted.code,
            message: extracted.isTimeoutOrNetwork
              ? `انتهت مهلة الطلب أو انقطع الاتصال؛ تمت إعادة قراءة حالة الدفعة (${recovered.status}) دون إعادة تشغيل مدفوع تلقائي: ${extracted.message}`
              : extracted.message,
          });
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
        await cancelJob(jobId);
        const latest = await getJobStatus(jobId);
        queryClient.setQueryData(["content-engine-job-detail", jobId], latest);
        void queryClient.invalidateQueries({
          queryKey: ["content-engine-jobs"],
        });
        setFeedback({
          type: "info",
          message: `تم تسجيل طلب إلغاء الدفعة (${jobId}) — الحالة الحالية: ${
            JOB_STATUS_LABELS[latest.status]?.label ?? latest.status
          }.`,
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
      className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/70 p-5"
      data-testid="jobs-history-panel"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">
            سجل دفعات التوليد ومراقبة التشغيل
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            متابعة الدفعات الحديثة، تشغيل الدفعة المحددة بالمعرّف فقط، الإلغاء،
            والانتقال المباشر لمراجعة المرشحين.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-zinc-300">
            <span>الحالة:</span>
            <select
              data-testid="jobs-filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
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
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500"
          >
            تحديث السجل
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mb-4 rounded-lg border p-3 text-xs ${
            feedback.type === "error"
              ? "border-red-500/40 bg-red-950/40 text-red-200"
              : "border-sky-500/40 bg-sky-950/40 text-sky-200"
          }`}
          data-testid="jobs-feedback-banner"
        >
          {feedback.code && (
            <span className="ml-2 rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px]">
              {feedback.code}
            </span>
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Jobs List */}
        <div className="min-w-0 space-y-2 lg:col-span-6">
          {jobsQuery.isLoading && (
            <p className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-400">
              جاري تحميل سجل الدفعات...
            </p>
          )}

          {!jobsQuery.isLoading && allJobs.length === 0 && (
            <p
              className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-400"
              data-testid="jobs-empty-state"
            >
              لا توجد دفعات مطابقة للفلتر الحالي.
            </p>
          )}

          {allJobs.map((item) => {
            const isSelected = item.jobId === selectedJobId;
            const statusMeta = JOB_STATUS_LABELS[item.status] ?? {
              label: item.status,
              description: "",
              badgeClass: "border-zinc-700 bg-zinc-900 text-zinc-200",
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
                onClick={() => onSelectJobId(item.jobId)}
                className={`cursor-pointer rounded-xl border p-3.5 text-xs transition ${
                  isSelected
                    ? "border-amber-500/70 bg-amber-950/20"
                    : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-amber-300">
                    {item.jobId}
                  </span>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                    data-testid={`job-status-${item.jobId}`}
                  >
                    {isRunningThis
                      ? "قيد التشغيل (Running)"
                      : statusMeta.label}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-zinc-300">
                  <span className="font-mono">
                    {itemWorld} / {itemScope} / {itemMechanic}
                  </span>
                  <span>
                    العدد المطلوب: <strong>{itemCount}</strong> · المرشحون:{" "}
                    <strong>{candCount}</strong>
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                  <span>
                    المرحلة:{" "}
                    {PIPELINE_STAGE_LABELS[item.pipelineStage] ??
                      item.pipelineStage}{" "}
                    · محاولات: {item.attempts}
                  </span>
                  <span className="font-mono text-emerald-300">
                    {item.spentSar.toFixed(4)} ر.س
                  </span>
                </div>

                <div
                  className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-zinc-800/80 pt-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isJobRunnable(item) && (
                    <button
                      type="button"
                      data-testid={`job-run-btn-${item.jobId}`}
                      onClick={() => void handleRunJob(item.jobId)}
                      disabled={busyJobId !== null}
                      className="rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
                    >
                      {busyJobId === item.jobId && busyAction === "run"
                        ? "جاري التشغيل..."
                        : "تشغيل هذه الدفعة"}
                    </button>
                  )}

                  {!isTerminalJobStatus(item.status) &&
                    !item.cancellationRequested && (
                      <button
                        type="button"
                        data-testid={`job-cancel-btn-${item.jobId}`}
                        onClick={() => void handleCancelJob(item.jobId)}
                        disabled={busyJobId !== null}
                        className="rounded-md border border-red-500/40 bg-red-950/40 px-2.5 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-950/70 disabled:opacity-40"
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
                    className="rounded-md bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/30"
                  >
                    مراجعة المرشحين ({candCount})
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
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
            >
              {loadingMore
                ? "جاري تحميل المزيد..."
                : "تحميل المزيد من الدفعات"}
            </button>
          )}
        </div>

        {/* Right: Job Detail Inspector */}
        <div className="min-w-0 lg:col-span-6">
          {!inspectedJob ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center text-xs text-zinc-400">
              اختر دفعة من القائمة لعرض تفاصيل مواصفتها وتكلفتها وحالتها.
            </div>
          ) : (
            <div
              className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300"
              data-testid="job-detail-inspector"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    تفاصيل الدفعة:{" "}
                    <span className="font-mono text-amber-300">
                      {inspectedJob.jobId}
                    </span>
                  </h3>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    {JOB_STATUS_LABELS[inspectedJob.status]?.description ?? ""}
                  </p>
                </div>

                <span
                  className={`rounded-md border px-2.5 py-1 font-semibold ${
                    JOB_STATUS_LABELS[inspectedJob.status]?.badgeClass ??
                    "border-zinc-700 bg-zinc-900 text-zinc-200"
                  }`}
                  data-testid="inspector-job-status"
                >
                  {JOB_STATUS_LABELS[inspectedJob.status]?.label ??
                    inspectedJob.status}
                </span>
              </div>

              {/* Execution & Lifecycle Metadata */}
              <dl className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3 text-[11px] sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-400">الهدف (World / Scope / Mechanic):</dt>
                  <dd className="font-mono font-semibold text-white">
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
                  <dt className="text-zinc-400">المرحلة والمحاولات:</dt>
                  <dd className="font-mono text-zinc-200">
                    {PIPELINE_STAGE_LABELS[inspectedJob.pipelineStage] ??
                      inspectedJob.pipelineStage}{" "}
                    (محاولات: {inspectedJob.attempts})
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-400">التكلفة الفعلية والمحجوزة:</dt>
                  <dd className="font-mono text-emerald-300">
                    {inspectedJob.spentSar.toFixed(4)} ر.س (
                    {inspectedJob.spentMicros.toLocaleString("en-US")} ميكرو) ·
                    نداءات: {inspectedJob.providerCalls}
                    {inspectedJob.outstandingReservedMicros > 0
                      ? ` · محجوز: ${inspectedJob.outstandingReservedMicros.toLocaleString("en-US")} ميكرو`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-400">المشرف المنشئ والمنفّذ:</dt>
                  <dd className="font-mono text-zinc-200">
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

              {/* Pinned Generation Specification */}
              {inspectedJob.generationSpec ? (
                <div
                  className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3 text-[11px]"
                  data-testid="inspector-generation-spec"
                >
                  <h4 className="font-semibold text-white">
                    مواصفة التوليد المثبتة (Pinned Generation Specification v
                    {inspectedJob.generationSpec.specVersion})
                  </h4>
                  <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <div>
                      <span className="text-zinc-400">المزود والنموذج: </span>
                      <span className="font-mono text-zinc-200">
                        {inspectedJob.generationSpec.provider} /{" "}
                        {inspectedJob.generationSpec.generationModel}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400">القالب والنمط: </span>
                      <span className="font-mono text-zinc-200">
                        {inspectedJob.generationSpec.promptVersion} (
                        {inspectedJob.generationSpec.answerMode})
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400">العدد والصعوبة: </span>
                      <span className="font-mono text-zinc-200">
                        {inspectedJob.generationSpec.targetCount} ·{" "}
                        {inspectedJob.generationSpec.difficulty
                          ? (DIFFICULTY_LABELS[
                              inspectedJob.generationSpec.difficulty
                            ] ?? inspectedJob.generationSpec.difficulty)
                          : "بدون صعوبة مخصصة"}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400">
                        الحرارة وسقف التوكنات:{" "}
                      </span>
                      <span className="font-mono text-zinc-200">
                        temp={inspectedJob.generationSpec.temperature} · maxTokens=
                        {inspectedJob.generationSpec.maxOutputTokens}
                      </span>
                    </div>
                  </div>
                  {inspectedJob.generationSpec.batchGuidance && (
                    <div className="mt-2 border-t border-zinc-800 pt-2">
                      <span className="text-zinc-400">التوجيه الإضافي: </span>
                      <p className="mt-0.5 whitespace-pre-wrap text-zinc-200">
                        {inspectedJob.generationSpec.batchGuidance}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="mt-3 rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-[11px] text-red-200"
                  data-testid="inspector-legacy-job-warning"
                >
                  دفعة قديمة بدون مواصفة توليد مثبتة (provenanceComplete =
                  false). يتعذر تشغيلها تلقائياً.
                </div>
              )}

              {/* Candidate Counts */}
              <div className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3 text-[11px]">
                <h4 className="font-semibold text-white">
                  ملخص المرشحين ({totalCandidatesCount(inspectedJob.candidates)})
                </h4>
                {Object.keys(inspectedJob.candidates ?? {}).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(inspectedJob.candidates).map(
                      ([statusKey, count]) => (
                        <span
                          key={statusKey}
                          className="rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1 font-mono text-zinc-200"
                        >
                          {statusKey}: <strong>{count}</strong>
                        </span>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-zinc-400">
                    لم يتم توليد مرشحين لهذه الدفعة بعد.
                  </p>
                )}
              </div>

              {inspectedJob.awaitingReviewReason && (
                <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/30 p-2.5 text-amber-200">
                  سبب انتظار المراجعة: {inspectedJob.awaitingReviewReason}
                </p>
              )}

              {inspectedJob.lastError && (
                <p
                  className="mt-3 rounded-lg border border-red-500/40 bg-red-950/40 p-2.5 font-mono text-red-200"
                  data-testid="inspector-last-error"
                >
                  آخر خطأ مسجل: {inspectedJob.lastError}
                </p>
              )}

              {/* Inspector Actions */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
                {isJobRunnable(inspectedJob) && (
                  <button
                    type="button"
                    data-testid="inspector-run-job-btn"
                    onClick={() => void handleRunJob(inspectedJob.jobId)}
                    disabled={busyJobId !== null}
                    className="rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
                  >
                    {busyJobId === inspectedJob.jobId && busyAction === "run"
                      ? "جاري تشغيل الدفعة..."
                      : `تشغيل هذه الدفعة الآن (${inspectedJob.jobId})`}
                  </button>
                )}

                {!isTerminalJobStatus(inspectedJob.status) &&
                  !inspectedJob.cancellationRequested && (
                    <button
                      type="button"
                      data-testid="inspector-cancel-job-btn"
                      onClick={() => void handleCancelJob(inspectedJob.jobId)}
                      disabled={busyJobId !== null}
                      className="rounded-lg border border-red-500/40 bg-red-950/40 px-3.5 py-2 text-xs font-semibold text-red-200 hover:bg-red-950/70 disabled:opacity-40"
                    >
                      إلغاء الدفعة
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
                  className="rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
                >
                  فتح مرشحي هذه الدفعة في مساحة المراجعة (
                  {totalCandidatesCount(inspectedJob.candidates)})
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
