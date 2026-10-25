"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  cancelJob,
  type EngineAuthoringOptions,
  type EngineJobRequest,
  type EngineJobStatus,
  type EnginePreflight,
  type EngineScopeMechanicOption,
  type EngineScopeOption,
  type EngineWorldOption,
  getAuthoringOptions,
  getJobStatus,
  normalizeBatchGuidanceInput,
  preflightJob,
  type RyoRequestedDifficulty,
  runJob,
  submitJob,
} from "./api";
import {
  DIFFICULTY_LABELS,
  extractApiError,
  formatSarFromMicros,
  isJobRunnable,
  isTerminalJobStatus,
  JOB_STATUS_LABELS,
  PIPELINE_STAGE_LABELS,
  totalCandidatesCount,
} from "./job-status-helpers";

const POLL_INTERVAL_MS = 2_000;

export interface BatchSubmissionSelection {
  jobId: string;
  worldKey: string;
  scopeKey: string;
  mechanicKey?: string;
}

export interface BatchSubmissionPanelProps {
  /** Called when the operator chooses to load a batch's candidates into the review queue. */
  onBatchReady?: (selection: BatchSubmissionSelection) => void;
  /** Called when a job is submitted/resolved. */
  onJobSubmitted?: (jobId: string) => void;
  /** Optional callback when a job is created/submitted or updated. */
  onJobUpdated?: (job: EngineJobStatus) => void;
  /** Optional callback to switch to the full Jobs history surface. */
  onOpenJobsSurface?: (jobId?: string) => void;
  /** Optional initial or recovered jobId to inspect/monitor on mount. */
  initialJobId?: string | null;
  /** Optional callback when the active jobId changes (for URL/session persistence). */
  onActiveJobIdChange?: (jobId: string | null) => void;
}

const pickDefaultScope = (
  world: EngineWorldOption | undefined,
): EngineScopeOption | undefined => {
  if (!world || world.scopes.length === 0) return undefined;
  return world.scopes.find((s) => s.eligible) ?? world.scopes[0];
};

const pickDefaultMechanic = (
  scope: EngineScopeOption | undefined,
): EngineScopeMechanicOption | undefined => {
  if (!scope || scope.mechanics.length === 0) return undefined;
  return scope.mechanics.find((m) => m.eligible) ?? scope.mechanics[0];
};

/**
 * Operator panel for configuring a generation request from server-derived options,
 * running a read-only preflight, submitting an exact generation specification,
 * and executing/monitoring that exact job.
 */
export function BatchSubmissionPanel({
  onBatchReady,
  onJobSubmitted,
  onJobUpdated,
  onOpenJobsSurface,
  initialJobId = null,
  onActiveJobIdChange,
}: BatchSubmissionPanelProps) {
  const queryClient = useQueryClient();

  const optionsQuery = useQuery<EngineAuthoringOptions>({
    queryKey: ["content-engine-options"],
    queryFn: getAuthoringOptions,
  });
  const options = optionsQuery.data;

  const [worldKey, setWorldKey] = useState("");
  const [scopeKey, setScopeKey] = useState("");
  const [mechanicKey, setMechanicKey] = useState("");
  const [targetCountInput, setTargetCountInput] = useState("5");
  const [difficulty, setDifficulty] = useState<RyoRequestedDifficulty | "">(
    "mixed",
  );
  const [batchGuidance, setBatchGuidance] = useState("");

  const [preflight, setPreflight] = useState<EnginePreflight | null>(null);
  const [planDriftMessage, setPlanDriftMessage] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(initialJobId);
  const [job, setJob] = useState<EngineJobStatus | null>(null);
  const [busy, setBusy] = useState<
    "preflight" | "submit" | "run" | "cancel" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Synchronous lock to prevent duplicate submit/run clicks in the same event tick
  const inFlightLockRef = useRef(false);
  const initializedFromOptionsRef = useRef(false);

  // Initialize selections from server-derived options once loaded
  useEffect(() => {
    if (!options || initializedFromOptionsRef.current) return;
    initializedFromOptionsRef.current = true;

    const firstEligibleWorld =
      options.worlds.find((w) => w.eligible) ?? options.worlds[0];
    const initialWorldKey = firstEligibleWorld?.worldKey ?? "";
    const defaultScope = pickDefaultScope(firstEligibleWorld);
    const initialScopeKey = defaultScope?.scopeKey ?? "";
    const defaultMechanic = pickDefaultMechanic(defaultScope);
    const initialMechanicKey = defaultMechanic?.mechanicKey ?? "";

    setWorldKey(initialWorldKey);
    setScopeKey(initialScopeKey);
    setMechanicKey(initialMechanicKey);
    setDifficulty(
      defaultMechanic?.supportsDifficultySelection
        ? (defaultMechanic.defaultDifficulty ?? "mixed")
        : "",
    );
  }, [options]);

  // Keep activeJobId and parent state in sync
  useEffect(() => {
    if (initialJobId && initialJobId !== activeJobId) {
      setActiveJobId(initialJobId);
    }
  }, [initialJobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleActiveJobChange = useCallback(
    (newJobId: string | null) => {
      setActiveJobId(newJobId);
      onActiveJobIdChange?.(newJobId);
    },
    [onActiveJobIdChange],
  );

  // Fetch and poll the active job until terminal
  useEffect(() => {
    if (!activeJobId) {
      setJob(null);
      return;
    }

    let isCancelled = false;

    const fetchCurrent = async () => {
      try {
        const fetched = await getJobStatus(activeJobId);
        if (!isCancelled) {
          setJob(fetched);
          onJobUpdated?.(fetched);
        }
      } catch (err) {
        if (!isCancelled) {
          const extracted = extractApiError(err, "فشل جلب حالة الدفعة");
          setError(extracted.message);
          setErrorCode(extracted.code ?? null);
        }
      }
    };

    void fetchCurrent();

    const interval = setInterval(() => {
      if (job && isTerminalJobStatus(job.status)) {
        clearInterval(interval);
        return;
      }
      void fetchCurrent();
    }, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [activeJobId, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived options lookups
  const selectedWorld = useMemo(
    () => options?.worlds.find((w) => w.worldKey === worldKey),
    [options, worldKey],
  );

  const availableScopes = useMemo(
    () => selectedWorld?.scopes ?? [],
    [selectedWorld],
  );

  const selectedScope = useMemo(
    () => availableScopes.find((s) => s.scopeKey === scopeKey),
    [availableScopes, scopeKey],
  );

  const availableMechanics = useMemo(
    () => selectedScope?.mechanics ?? [],
    [selectedScope],
  );

  const selectedMechanic = useMemo(
    () => availableMechanics.find((m) => m.mechanicKey === mechanicKey),
    [availableMechanics, mechanicKey],
  );

  const mechanicCatalogByKey = useMemo(() => {
    const map = new Map<string, EngineAuthoringOptions["mechanics"][0]>();
    for (const m of options?.mechanics ?? []) {
      map.set(m.mechanicKey, m);
    }
    return map;
  }, [options?.mechanics]);

  const selectedMechanicCatalog = useMemo(
    () => (mechanicKey ? mechanicCatalogByKey.get(mechanicKey) : undefined),
    [mechanicCatalogByKey, mechanicKey],
  );

  // Validation bounds
  const minTargetCount = options?.limits.minTargetCount ?? 1;
  const maxTargetCount = options?.limits.maxTargetCount ?? 10;
  const maxGuidanceLength = options?.limits.maxBatchGuidanceLength ?? 1000;

  const parsedTargetCount = useMemo(() => {
    const n = Number(targetCountInput);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return Number.NaN;
    return n;
  }, [targetCountInput]);

  const targetCountValidationError = useMemo(() => {
    if (targetCountInput.trim() === "") {
      return "يرجى تحديد عدد المرشحات المطلوبة.";
    }
    if (Number.isNaN(parsedTargetCount)) {
      return "يجب أن يكون العدد رقمًا صحيحًا.";
    }
    if (parsedTargetCount < minTargetCount) {
      return `الحد الأدنى لعدد المرشحات هو ${minTargetCount}.`;
    }
    if (parsedTargetCount > maxTargetCount) {
      return `سعة الدفعة المدعومة من الخادم هي ${maxTargetCount} مرشحات كحد أقصى (تم إدخال ${parsedTargetCount}).`;
    }
    return null;
  }, [targetCountInput, parsedTargetCount, minTargetCount, maxTargetCount]);

  const guidanceValidationError = useMemo(() => {
    if (batchGuidance.length > maxGuidanceLength) {
      return `التوجيه الإضافي يتجاوز الحد الأقصى (${batchGuidance.length} / ${maxGuidanceLength} حرف).`;
    }
    return null;
  }, [batchGuidance, maxGuidanceLength]);

  const selectionBlockedDiagnostic = useMemo(() => {
    if (selectedWorld && !selectedWorld.eligible && selectedWorld.blockedReason) {
      return {
        code: selectedWorld.blockedCode ?? "WORLD_BLOCKED",
        reason: selectedWorld.blockedReason,
      };
    }
    if (selectedScope && !selectedScope.eligible && selectedScope.blockedReason) {
      return {
        code: selectedScope.blockedCode ?? "SCOPE_BLOCKED",
        reason: selectedScope.blockedReason,
      };
    }
    if (
      selectedMechanic &&
      !selectedMechanic.eligible &&
      selectedMechanic.blockedReason
    ) {
      return {
        code: selectedMechanic.blockedCode ?? "MECHANIC_BLOCKED",
        reason: selectedMechanic.blockedReason,
      };
    }
    return null;
  }, [selectedWorld, selectedScope, selectedMechanic]);

  const invalidatePreflight = useCallback(() => {
    setPreflight(null);
    setError(null);
    setErrorCode(null);
    setInfoMessage(null);
  }, []);

  // Cascading change handlers
  const handleWorldChange = (nextWorldKey: string) => {
    setWorldKey(nextWorldKey);
    const nextWorld = options?.worlds.find((w) => w.worldKey === nextWorldKey);
    const nextScope = pickDefaultScope(nextWorld);
    const nextScopeKey = nextScope?.scopeKey ?? "";
    setScopeKey(nextScopeKey);
    const nextMechanic = pickDefaultMechanic(nextScope);
    const nextMechanicKey = nextMechanic?.mechanicKey ?? "";
    setMechanicKey(nextMechanicKey);
    setDifficulty(
      nextMechanic?.supportsDifficultySelection
        ? (nextMechanic.defaultDifficulty ?? "mixed")
        : "",
    );
    setPlanDriftMessage(null);
    invalidatePreflight();
  };

  const handleScopeChange = (nextScopeKey: string) => {
    setScopeKey(nextScopeKey);
    const nextScope = availableScopes.find((s) => s.scopeKey === nextScopeKey);
    const nextMechanic = pickDefaultMechanic(nextScope);
    const nextMechanicKey = nextMechanic?.mechanicKey ?? "";
    setMechanicKey(nextMechanicKey);
    setDifficulty(
      nextMechanic?.supportsDifficultySelection
        ? (nextMechanic.defaultDifficulty ?? "mixed")
        : "",
    );
    setPlanDriftMessage(null);
    invalidatePreflight();
  };

  const handleMechanicChange = (nextMechanicKey: string) => {
    setMechanicKey(nextMechanicKey);
    const nextMechanic = availableMechanics.find(
      (m) => m.mechanicKey === nextMechanicKey,
    );
    setDifficulty(
      nextMechanic?.supportsDifficultySelection
        ? (nextMechanic.defaultDifficulty ?? "mixed")
        : "",
    );
    setPlanDriftMessage(null);
    invalidatePreflight();
  };

  const handleTargetCountChange = (raw: string) => {
    setTargetCountInput(raw);
    setPlanDriftMessage(null);
    invalidatePreflight();
  };

  const handleDifficultyChange = (nextDifficulty: RyoRequestedDifficulty) => {
    setDifficulty(nextDifficulty);
    setPlanDriftMessage(null);
    invalidatePreflight();
  };

  const handleGuidanceChange = (nextGuidance: string) => {
    setBatchGuidance(nextGuidance);
    setPlanDriftMessage(null);
    invalidatePreflight();
  };

  const buildRequestPayload = (): EngineJobRequest => {
    const normalizedGuidance = normalizeBatchGuidanceInput(batchGuidance);
    const payload: EngineJobRequest = {
      worldKey,
      scopeKey,
      mechanicKey,
      targetCount: parsedTargetCount,
    };
    if (selectedMechanic?.supportsDifficultySelection && difficulty) {
      payload.difficulty = difficulty;
    }
    if (normalizedGuidance !== undefined) {
      payload.batchGuidance = normalizedGuidance;
    }
    return payload;
  };

  const canRunPreflight =
    Boolean(worldKey && scopeKey && mechanicKey) &&
    !targetCountValidationError &&
    !guidanceValidationError &&
    busy === null;

  const canSubmitJob =
    canRunPreflight &&
    !selectionBlockedDiagnostic &&
    Boolean(
      preflight &&
        preflight.resolvable &&
        preflight.submissionReady !== false &&
        preflight.planDigest,
    );

  const handlePreflight = async () => {
    if (!canRunPreflight || inFlightLockRef.current) return;
    inFlightLockRef.current = true;
    setBusy("preflight");
    setError(null);
    setErrorCode(null);
    setPlanDriftMessage(null);
    setInfoMessage(null);
    try {
      const result = await preflightJob(buildRequestPayload());
      setPreflight(result);
    } catch (err) {
      setPreflight(null);
      const extracted = extractApiError(err, "فشل الفحص المسبق");
      setError(extracted.message);
      setErrorCode(extracted.code ?? null);
    } finally {
      inFlightLockRef.current = false;
      setBusy(null);
    }
  };

  const handleSubmitJob = async () => {
    if (
      !canSubmitJob ||
      !preflight?.planDigest ||
      inFlightLockRef.current
    ) {
      return;
    }
    inFlightLockRef.current = true;
    setBusy("submit");
    setError(null);
    setErrorCode(null);
    setPlanDriftMessage(null);
    setInfoMessage(null);
    try {
      const submitted = await submitJob({
        ...buildRequestPayload(),
        planDigest: preflight.planDigest,
      });
      handleActiveJobChange(submitted.jobId);
      onJobSubmitted?.(submitted.jobId);
      const fetched = await getJobStatus(submitted.jobId);
      setJob(fetched);
      onJobUpdated?.(fetched);
      void queryClient.invalidateQueries({ queryKey: ["content-engine-jobs"] });
      if (submitted.created) {
        setInfoMessage(
          `تم تسجيل الدفعة بنجاح بنسخة مواصفات v${submitted.specVersion ?? 1} (${submitted.jobId}).`,
        );
      } else {
        setInfoMessage(
          `تم استرجاع الدفعة الحالية المتطابقة تماماً مع هذه المواصفة (${submitted.jobId}).`,
        );
      }
    } catch (err) {
      const extracted = extractApiError(err, "تعذر تسجيل الدفعة");
      if (
        extracted.status === 409 ||
        extracted.code === "PREFLIGHT_PLAN_DRIFT" ||
        extracted.message.includes("PREFLIGHT_PLAN_DRIFT")
      ) {
        setPreflight(null);
        setPlanDriftMessage(
          `تغيرت خطة الفحص المسبق أو إعدادات الخادم (PREFLIGHT_PLAN_DRIFT): ${extracted.message}. تم إبطال الفحص القديم؛ يرجى تشغيل الفحص المسبق من جديد قبل الإنشاء.`,
        );
      } else {
        setError(extracted.message);
        setErrorCode(extracted.code ?? null);
      }
    } finally {
      inFlightLockRef.current = false;
      setBusy(null);
    }
  };

  const handleRunExactJob = async (explicitJobId?: string) => {
    const targetId = explicitJobId ?? job?.jobId ?? activeJobId;
    if (!targetId || inFlightLockRef.current || busy !== null) return;
    inFlightLockRef.current = true;
    setBusy("run");
    setError(null);
    setErrorCode(null);
    setInfoMessage(null);
    try {
      const runOutcome = await runJob(targetId);
      const refreshed = await getJobStatus(targetId);
      setJob(refreshed);
      onJobUpdated?.(refreshed);
      void queryClient.invalidateQueries({ queryKey: ["content-engine-jobs"] });
      void queryClient.invalidateQueries({
        queryKey: ["content-engine-candidates"],
      });
      if (runOutcome.alreadyRunning) {
        setInfoMessage(
          `الدفعة (${targetId}) قيد التشغيل بالفعل ولا يمكن بدء تشغيل موازٍ.`,
        );
      } else if (refreshed.status === "awaiting_review") {
        setInfoMessage(
          `اكتمل تشغيل الدفعة (${targetId}) وجاهزة لمراجعة المرشحين.`,
        );
      }
    } catch (err) {
      const extracted = extractApiError(err, "فشل تشغيل الدفعة");
      try {
        const fallbackStatus = await getJobStatus(targetId);
        setJob(fallbackStatus);
        onJobUpdated?.(fallbackStatus);
        void queryClient.invalidateQueries({
          queryKey: ["content-engine-jobs"],
        });
        if (extracted.isTimeoutOrNetwork) {
          setError(
            `استغرق تشغيل الدفعة وقتاً أطول من المتوقع، لكن تم التحقق من حالتها بالخادم دون إعادة تشغيل مدفوع تلقائي: ${extracted.message}`,
          );
        } else {
          setError(extracted.message);
          setErrorCode(extracted.code ?? null);
        }
      } catch {
        setError(extracted.message);
        setErrorCode(extracted.code ?? null);
      }
    } finally {
      inFlightLockRef.current = false;
      setBusy(null);
    }
  };

  const handleCancelJob = async () => {
    const idToCancel = job?.jobId ?? activeJobId;
    if (!idToCancel || inFlightLockRef.current || busy !== null) return;
    inFlightLockRef.current = true;
    setBusy("cancel");
    setError(null);
    setErrorCode(null);
    try {
      await cancelJob(idToCancel);
      const refreshed = await getJobStatus(idToCancel);
      setJob(refreshed);
      onJobUpdated?.(refreshed);
      void queryClient.invalidateQueries({ queryKey: ["content-engine-jobs"] });
      setInfoMessage(`تم إرسال طلب إلغاء الدفعة (${idToCancel}).`);
    } catch (err) {
      const extracted = extractApiError(err, "تعذر إلغاء الدفعة");
      setError(extracted.message);
      setErrorCode(extracted.code ?? null);
    } finally {
      inFlightLockRef.current = false;
      setBusy(null);
    }
  };

  const disabledMechanicsInScope = useMemo(
    () => availableMechanics.filter((m) => !m.eligible),
    [availableMechanics],
  );

  const jobStatusMeta = job
    ? (JOB_STATUS_LABELS[job.status] ?? {
        label: job.status,
        description: "",
        badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
      })
    : null;

  const candidateTotal = totalCandidatesCount(job?.candidates);

  return (
    <section
      className="mb-8 rounded-2xl border border-border/80 bg-white p-6 sm:p-8 shadow-sm space-y-6 text-foreground"
      data-testid="batch-submission-panel"
    >
      {/* Header and Engine Readiness Badges */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            استوديو توليد المحتوى
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            اشتقاق العوالم والنطاقات والميكانيكيات القانونية مباشرةً من الخادم مع الفحص المسبق للتكلفة والميزانية.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {options?.engine && (
            <>
              <span
                className={`rounded-full border px-3 py-1 font-semibold transition ${
                  options.engine.engineEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-100 text-slate-700"
                }`}
                data-testid="engine-enabled-badge"
              >
                المحرك: {options.engine.engineEnabled ? "مفعّل" : "معطّل"}
              </span>
              <span
                className={`rounded-full border px-3 py-1 font-semibold transition ${
                  options.engine.liveProviderEnabled
                    ? "border-sky-200 bg-sky-50 text-sky-800"
                    : "border-slate-200 bg-slate-100 text-slate-600"
                }`}
                data-testid="live-provider-badge"
              >
                المزود الحي:{" "}
                {options.engine.liveProviderEnabled ? "مفعّل" : "غير مفعّل"}
              </span>
              {options.engine.provider && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-slate-700">
                  {options.engine.provider} /{" "}
                  {options.engine.generationModel ?? "—"}
                </span>
              )}
            </>
          )}
          {onOpenJobsSurface && (
            <button
              type="button"
              onClick={() => onOpenJobsSurface(activeJobId ?? undefined)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-amber-400 hover:bg-amber-50/40 hover:text-amber-900 transition"
            >
              <Layers className="size-3.5 text-slate-500" />
              عرض سجل الدفعات الكامل
            </button>
          )}
        </div>
      </div>

      {/* Loading Skeleton */}
      {optionsQuery.isLoading && (
        <div
          className="rounded-xl border border-border/70 bg-slate-50/50 p-6 space-y-3"
          data-testid="options-loading"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <div className="size-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <span>جاري تحميل خيارات التأليف القانونية من الخادم...</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 pt-1">
            <div className="h-10 animate-pulse rounded-lg bg-slate-200/70" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-200/70" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-200/70" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-200/70" />
          </div>
        </div>
      )}

      {/* Actionable Error State with Retry Button */}
      {optionsQuery.isError && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50/70 p-5 text-rose-900 shadow-sm"
          data-testid="options-error"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-rose-900">
                  تعذر تحميل خيارات التأليف من الخادم
                </h3>
                <p className="mt-1 text-xs text-rose-700 leading-relaxed">
                  {extractApiError(optionsQuery.error, "خطأ في الاتصال بالخادم").message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void optionsQuery.refetch()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 shadow-sm hover:bg-rose-100/50 transition"
            >
              <RefreshCw className="size-3.5" />
              إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {/* Engine Readiness Warning */}
      {options?.engine && !options.engine.submissionReady && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 shadow-sm"
          data-testid="engine-readiness-warning"
        >
          <span className="font-semibold">تنبيه جاهزية المحرك: </span>
          <span className="font-mono font-medium">
            {options.engine.blockedCode ?? "ENGINE_NOT_READY"}
          </span>{" "}
          — {options.engine.blockedReason ?? "إعدادات المزود أو التسعير غير مكتملة."}
        </div>
      )}

      {/* Stepper: 3-Step Guided Workflow */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs" data-testid="studio-stepper">
        <div
          className={`flex items-center gap-3 rounded-xl border p-3 transition ${
            mechanicKey && !selectionBlockedDiagnostic
              ? "border-emerald-200 bg-emerald-50/50 text-emerald-950"
              : "border-amber-400 bg-amber-50/40 text-amber-950"
          }`}
        >
          <div
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg font-bold text-xs ${
              mechanicKey && !selectionBlockedDiagnostic
                ? "bg-emerald-600 text-white"
                : "bg-amber-500 text-white"
            }`}
          >
            1
          </div>
          <div>
            <p className="font-bold">الخطوة 1: إعداد التركيبة والتوجيه</p>
            <p className="text-[11px] text-slate-500">العالم، النطاق، الميكانيكية، والعدد</p>
          </div>
        </div>

        <div
          className={`flex items-center gap-3 rounded-xl border p-3 transition ${
            preflight && preflight.resolvable && preflight.submissionReady !== false
              ? "border-emerald-200 bg-emerald-50/50 text-emerald-950"
              : preflight
                ? "border-amber-300 bg-amber-50/40 text-amber-950"
                : "border-slate-200 bg-slate-50/70 text-slate-600"
          }`}
        >
          <div
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg font-bold text-xs ${
              preflight && preflight.resolvable && preflight.submissionReady !== false
                ? "bg-emerald-600 text-white"
                : preflight
                  ? "bg-amber-500 text-white"
                  : "bg-slate-300 text-slate-700"
            }`}
          >
            2
          </div>
          <div>
            <p className="font-bold">الخطوة 2: الفحص المسبق والميزانية</p>
            <p className="text-[11px] text-slate-500">التكلفة التقديرية، الرصيد، والجاهزية</p>
          </div>
        </div>

        <div
          className={`flex items-center gap-3 rounded-xl border p-3 transition ${
            job && isTerminalJobStatus(job.status)
              ? "border-emerald-200 bg-emerald-50/50 text-emerald-950"
              : job
                ? "border-sky-300 bg-sky-50/40 text-sky-950"
                : "border-slate-200 bg-slate-50/70 text-slate-600"
          }`}
        >
          <div
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg font-bold text-xs ${
              job && isTerminalJobStatus(job.status)
                ? "bg-emerald-600 text-white"
                : job
                  ? "bg-sky-600 text-white"
                  : "bg-slate-300 text-slate-700"
            }`}
          >
            3
          </div>
          <div>
            <p className="font-bold">الخطوة 3: اعتماد الخطة والتوليد</p>
            <p className="text-[11px] text-slate-500">تسجيل الدفعة، التشغيل، ومراجعة المرشحين</p>
          </div>
        </div>
      </div>

      {/* Selected Target Summary Pill */}
      {selectedWorld && selectedScope && selectedMechanic && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/30 px-4 py-2.5 text-xs text-slate-800"
          data-testid="selected-target-summary"
        >
          <span className="font-bold text-amber-900">الملخص المختار:</span>
          <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-700">
            العالم: <strong className="text-slate-900">{selectedWorld.name ?? selectedWorld.worldKey}</strong>
          </span>
          <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-700">
            النطاق: <strong className="text-slate-900">{selectedScope.name ?? selectedScope.scopeKey}</strong>
          </span>
          <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-700">
            الميكانيكية: <strong className="text-slate-900">{selectedMechanicCatalog?.name ?? selectedMechanic.mechanicKey}</strong>
          </span>
          <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-700">
            العدد: <strong className="text-slate-900">{targetCountInput} مرشحات</strong>
          </span>
          {selectedMechanic.supportsDifficultySelection && (
            <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-700">
              الصعوبة: <strong className="text-slate-900">{DIFFICULTY_LABELS[difficulty] ?? difficulty}</strong>
            </span>
          )}
        </div>
      )}

      {/* Generation Configuration Form */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-amber-500/10 text-xs font-bold text-amber-700">
            1
          </span>
          <h3 className="text-sm font-bold text-slate-900">
            إعداد التركيبة والتوجيه (Configuration)
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* 1. World Selector */}
          <label className="block min-w-0 text-xs">
            <span className="font-semibold text-slate-700">العالم (World)</span>
            <select
              data-testid="select-world"
              value={worldKey}
              onChange={(e) => handleWorldChange(e.target.value)}
              disabled={!options || options.worlds.length === 0}
              className="mt-1.5 h-10 w-full max-w-full min-w-0 truncate rounded-xl border border-input bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-slate-50 disabled:text-slate-400"
            >
              {!options?.worlds?.length && (
                <option value="">لا توجد عوالم متاحة</option>
              )}
              {options?.worlds.map((world) => (
                <option key={world.worldKey} value={world.worldKey}>
                  {world.name
                    ? `${world.name} (${world.worldKey})`
                    : world.worldKey}
                  {!world.eligible
                    ? ` — غير مؤهل (${world.blockedCode ?? "BLOCKED"})`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          {/* 2. Scope Selector (filtered by selected World) */}
          <label className="block min-w-0 text-xs">
            <span className="font-semibold text-slate-700">النطاق (Scope)</span>
            <select
              data-testid="select-scope"
              value={scopeKey}
              onChange={(e) => handleScopeChange(e.target.value)}
              disabled={availableScopes.length === 0}
              className="mt-1.5 h-10 w-full max-w-full min-w-0 truncate rounded-xl border border-input bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-slate-50 disabled:text-slate-400"
            >
              {availableScopes.length === 0 && (
                <option value="">لا توجد نطاقات لهذا العالم</option>
              )}
              {availableScopes.map((scope) => (
                <option key={scope.scopeKey} value={scope.scopeKey}>
                  {scope.name
                    ? `${scope.name} (${scope.scopeKey})`
                    : scope.scopeKey}
                  {!scope.eligible
                    ? ` — غير مؤهل (${scope.blockedCode ?? "BLOCKED"})`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          {/* 3. Mechanic Selector (filtered by eligibility & capability in selected Scope) */}
          <label className="block min-w-0 text-xs">
            <span className="font-semibold text-slate-700">الميكانيكية (Mechanic)</span>
            <select
              data-testid="select-mechanic"
              value={mechanicKey}
              onChange={(e) => handleMechanicChange(e.target.value)}
              disabled={availableMechanics.length === 0}
              className="mt-1.5 h-10 w-full max-w-full min-w-0 truncate rounded-xl border border-input bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-slate-50 disabled:text-slate-400"
            >
              {availableMechanics.length === 0 && (
                <option value="">لا توجد ميكانيكيات متاحة</option>
              )}
              {availableMechanics.map((mechanic) => {
                const catalogItem = mechanicCatalogByKey.get(mechanic.mechanicKey);
                const displayName = catalogItem?.name
                  ? `${catalogItem.name} (${mechanic.mechanicKey})`
                  : mechanic.mechanicKey;
                const boardNote = mechanic.onBoard
                  ? `على اللوحة: ${mechanic.boardSlotKeys.join(",")}`
                  : mechanic.offBoardAuthoringAllowed
                    ? "خارج اللوحة مسموح"
                    : "";
                const blockedNote = !mechanic.eligible
                  ? `غير متاح: ${mechanic.blockedCode ?? "BLOCKED"}`
                  : "";
                const suffix = [boardNote, blockedNote]
                  .filter(Boolean)
                  .join(" | ");
                return (
                  <option
                    key={mechanic.mechanicKey}
                    value={mechanic.mechanicKey}
                  >
                    {suffix ? `${displayName} — ${suffix}` : displayName}
                  </option>
                );
              })}
            </select>
          </label>

          {/* 4. Candidate Count Input */}
          <div className="min-w-0 text-xs">
            <label htmlFor="target-count-input" className="font-semibold text-slate-700">
              عدد المرشحين المطلوب ({minTargetCount}–{maxTargetCount})
            </label>
            <input
              id="target-count-input"
              data-testid="input-target-count"
              type="number"
              min={minTargetCount}
              max={maxTargetCount}
              step={1}
              value={targetCountInput}
              onChange={(e) => handleTargetCountChange(e.target.value)}
              className={`mt-1.5 h-10 w-full rounded-xl border bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
                targetCountValidationError
                  ? "border-rose-400 ring-1 ring-rose-300"
                  : "border-input"
              }`}
            />
            <p
              className="mt-1 text-[11px] text-slate-500"
              data-testid="target-count-capacity"
            >
              سعة التوليد المسموحة: {minTargetCount} إلى {maxTargetCount} مرشحات لكل دفعة.
            </p>
            {targetCountValidationError && (
              <p
                className="mt-1 text-[11px] font-medium text-rose-600"
                data-testid="target-count-error"
              >
                {targetCountValidationError}
              </p>
            )}
          </div>
        </div>

        {/* Selected Mechanic Metadata, Off-Board Status & Difficulty Selection */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Difficulty selector or deferred explanation */}
          <div className="rounded-xl border border-border/80 bg-slate-50/60 p-4 text-xs">
            {selectedMechanic?.supportsDifficultySelection ? (
              <div>
                <label
                  htmlFor="difficulty-select"
                  className="block font-semibold text-slate-800"
                >
                  مستوى الصعوبة المطلوب (Read Your Opponent)
                </label>
                <select
                  id="difficulty-select"
                  data-testid="select-difficulty"
                  value={difficulty || "mixed"}
                  onChange={(e) =>
                    handleDifficultyChange(
                      e.target.value as RyoRequestedDifficulty,
                    )
                  }
                  className="mt-1.5 h-10 w-full rounded-xl border border-input bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  {(selectedMechanic.supportedDifficulties.length > 0
                    ? selectedMechanic.supportedDifficulties
                    : (["mixed", "easy", "medium", "relatively_difficult"] as const)
                  ).map((diffKey) => (
                    <option key={diffKey} value={diffKey}>
                      {DIFFICULTY_LABELS[diffKey] ?? diffKey}
                    </option>
                  ))}
                </select>
                {difficulty === "mixed" &&
                  selectedMechanicCatalog?.experimentalDifficultyDistribution && (
                    <p
                      className="mt-1.5 text-[11px] text-slate-500"
                      data-testid="ryo-mixed-distribution"
                    >
                      التوزيع التجريبي للوضع المختلط: سهل{" "}
                      {
                        selectedMechanicCatalog.experimentalDifficultyDistribution
                          .easy
                      }
                      % · متوسط{" "}
                      {
                        selectedMechanicCatalog.experimentalDifficultyDistribution
                          .medium
                      }
                      % · صعب نسبياً{" "}
                      {selectedMechanicCatalog.experimentalDifficultyDistribution
                        .relativelyDifficult ??
                        selectedMechanicCatalog.experimentalDifficultyDistribution
                          .relatively_difficult}
                      %
                    </p>
                  )}
              </div>
            ) : (
              <div data-testid="difficulty-deferred-note" className="space-y-1">
                <span className="font-semibold text-slate-800">
                  مستوى الصعوبة:{" "}
                </span>
                <p className="text-slate-600">
                  تحديد الصعوبة غير متاح لهذه الميكانيكية في هذه المرحلة
                  {selectedMechanic?.difficultyDeferredReason
                    ? ` (${selectedMechanic.difficultyDeferredReason})`
                    : ""}
                  .
                </p>
              </div>
            )}

            {/* Board presence / Off-board authoring status */}
            {selectedMechanic && (
              <div
                className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-[11px]"
                data-testid="mechanic-board-status"
              >
                <span className="text-slate-600">
                  الفئة:{" "}
                  <strong className="text-slate-900">
                    {selectedMechanic.category === "signature"
                      ? "ميكانيكية مميزة (Signature)"
                      : "قياسية (Standard)"}
                  </strong>
                </span>
                {selectedMechanic.answerMode && (
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-slate-700">
                    نمط الإجابة: {selectedMechanic.answerMode}
                  </span>
                )}
                {selectedMechanic.onBoard ? (
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800 font-medium">
                    مربوطة على لوحة العالم ({selectedMechanic.boardSlotKeys.join(", ")})
                  </span>
                ) : selectedMechanic.offBoardAuthoringAllowed ? (
                  <span
                    className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800 font-medium"
                    data-testid="off-board-allowed-badge"
                  >
                    تأليف خارج اللوحة مسموح (Off-board Authoring Allowed)
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Optional Batch Guidance Textarea */}
          <div className="rounded-xl border border-border/80 bg-slate-50/60 p-4 text-xs">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="batch-guidance-textarea"
                className="font-semibold text-slate-800"
              >
                توجيه إضافي للدفعة (اختياري)
              </label>
              <span
                className={`font-mono text-[11px] ${
                  guidanceValidationError ? "text-rose-600 font-bold" : "text-slate-400"
                }`}
                data-testid="batch-guidance-counter"
              >
                {batchGuidance.length} / {maxGuidanceLength}
              </span>
            </div>
            <textarea
              id="batch-guidance-textarea"
              data-testid="textarea-batch-guidance"
              rows={2}
              value={batchGuidance}
              onChange={(e) => handleGuidanceChange(e.target.value)}
              placeholder="مثال: ركز على زوايا غير تقليدية أو حقب زمنية محددة ضمن هذا النطاق..."
              className={`mt-1.5 w-full rounded-xl border bg-white p-3 text-xs text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 placeholder:text-slate-400 ${
                guidanceValidationError
                  ? "border-rose-400 ring-1 ring-rose-300"
                  : "border-input"
              }`}
            />
            <p
              className="mt-1 text-[11px] text-slate-500 leading-relaxed"
              data-testid="batch-guidance-subordinate-note"
            >
              تنبيه: التوجيه الإضافي اختياري (بحد أقصى {maxGuidanceLength} حرف)
              ويخضع دائماً لقواعد المهارات القانونية (Canonical Skills) وقواعد
              الميكانيكية والنطاق؛ لا يمكنه تجاوزها أو تعديل صيغة الإجابة.
            </p>
            {guidanceValidationError && (
              <p
                className="mt-1 text-[11px] font-medium text-rose-600"
                data-testid="batch-guidance-error"
              >
                {guidanceValidationError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Server Eligibility Diagnostics */}
      {selectionBlockedDiagnostic && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-900 shadow-sm"
          data-testid="selection-blocked-diagnostic"
        >
          <p className="font-semibold">
            هذا الاختيار غير مؤهل للتوليد حسب قواعد الخادم:{" "}
            <span className="font-mono">{selectionBlockedDiagnostic.code}</span>
          </p>
          <p className="mt-1 font-mono text-[11px] text-rose-700">
            {selectionBlockedDiagnostic.reason}
          </p>
        </div>
      )}

      {disabledMechanicsInScope.length > 0 && (
        <details
          className="rounded-xl border border-border/80 bg-slate-50/40 px-4 py-3 text-xs text-slate-600 transition"
          data-testid="disabled-mechanics-diagnostics"
        >
          <summary className="cursor-pointer font-medium text-slate-800 hover:text-slate-950">
            تشخيصات الميكانيكيات غير المؤهلة في هذا النطاق ({disabledMechanicsInScope.length})
          </summary>
          <ul className="mt-2.5 space-y-1.5 text-[11px] pr-2">
            {disabledMechanicsInScope.map((m) => (
              <li key={m.mechanicKey} className="font-mono text-slate-600">
                <strong className="text-slate-900">{m.mechanicKey}</strong>:{" "}
                <span className="text-amber-800 font-semibold">
                  {m.blockedCode ?? "BLOCKED"}
                </span>{" "}
                — {m.blockedReason ?? "غير متاح"}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Plan Drift Alert */}
      {planDriftMessage && (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 shadow-sm"
          data-testid="plan-drift-alert"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
            <span className="font-medium">{planDriftMessage}</span>
          </div>
        </div>
      )}

      {/* General Error Alert (deduplicated against preflight blocking reason) */}
      {error && (!preflight?.blockedReason || error !== preflight.blockedReason) && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-900 shadow-sm"
          data-testid="batch-error-alert"
        >
          {errorCode && (
            <span className="ml-2 rounded-md bg-rose-200/80 px-2 py-0.5 font-mono text-[11px] text-rose-900 font-semibold">
              {errorCode}
            </span>
          )}
          <span>{error}</span>
        </div>
      )}

      {/* Info Message */}
      {infoMessage && (
        <div
          className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-xs text-sky-900 shadow-sm"
          data-testid="batch-info-alert"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-sky-600" />
            <span>{infoMessage}</span>
          </div>
        </div>
      )}

      {/* Preflight & Cost UX Panel */}
      {preflight && (
        <div
          className="rounded-2xl border border-border/80 bg-slate-50/60 p-5 sm:p-6 shadow-sm text-xs text-slate-800 space-y-4"
          data-testid="preflight-results"
        >
          {/* Header & Primary 4-Question Cards */}
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-amber-500/10 text-[11px] font-bold text-amber-700">
                2
              </span>
              <h3 className="font-bold text-slate-900 text-sm">
                نتائج الفحص المسبق والتحقق من الميزانية (Preflight & Budget Validation)
              </h3>
            </div>
            <span
              className={`rounded-full border px-3 py-1 font-semibold ${
                preflight.resolvable && preflight.submissionReady !== false
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
              data-testid="preflight-status-badge"
            >
              {preflight.resolvable && preflight.submissionReady !== false
                ? "الفحص المسبق صالح وجاهز للتسجيل"
                : preflight.resolvable
                  ? "السياق قابل للحل لكن التسجيل محجوب"
                  : "الفحص المسبق مرفوض"}
            </span>
          </div>

          {/* Primary View: 4 Key Decision Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: هل الدفعة جاهزة؟ */}
            <div className="rounded-xl border border-border/80 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                هل الدفعة جاهزة؟
              </span>
              <div className="flex items-center gap-2">
                {preflight.resolvable && preflight.submissionReady !== false ? (
                  <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 text-sm">
                    <CheckCircle2 className="size-4" />
                    جاهزة للتسجيل والتشغيل
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-bold text-amber-700 text-sm">
                    <AlertTriangle className="size-4" />
                    التشغيل محجوب حالياً
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {preflight.resolvable && preflight.submissionReady !== false
                  ? "شروط القواعد والميزانية مستوفاة"
                  : "يلزم استيفاء شروط التسعير أو التفعيل"}
              </p>
            </div>

            {/* Card 2: كم التكلفة المتوقعة؟ */}
            <div className="rounded-xl border border-border/80 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                كم التكلفة المتوقعة؟
              </span>
              <div className="text-base font-bold text-amber-700 font-mono">
                {typeof preflight.estimatedSar === "number"
                  ? `~ ${preflight.estimatedSar.toFixed(4)} ر.س`
                  : typeof preflight.estimatedMicros === "number"
                    ? `~ ${(preflight.estimatedMicros / 1_000_000).toFixed(4)} ر.س`
                    : "غير متاح"}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                سقف تقديري أقصى (غير ملزم كحد أدنى)
              </p>
            </div>

            {/* Card 3: كم الميزانية المتبقية؟ */}
            <div className="rounded-xl border border-border/80 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                كم الميزانية المتبقية؟
              </span>
              <div className="text-base font-bold text-emerald-700 font-mono">
                {typeof preflight.budget?.availableMicros === "number"
                  ? `${(preflight.budget.availableMicros / 1_000_000).toFixed(4)} ر.س`
                  : "غير متاح"}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                من أصل{" "}
                {typeof preflight.budget?.capMicros === "number"
                  ? `${(preflight.budget.capMicros / 1_000_000).toFixed(4)} ر.س`
                  : "—"}{" "}
                للفترة
              </p>
            </div>

            {/* Card 4: المزود والنموذج */}
            <div className="rounded-xl border border-border/80 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                المزود ونموذج التوليد
              </span>
              <div className="text-sm font-bold text-slate-900 truncate">
                {preflight.generationSpec?.provider ??
                  options?.engine.provider ??
                  "غير محدد"}
              </div>
              <p className="mt-1 text-[11px] font-mono text-slate-600 truncate">
                {preflight.generationSpec?.generationModel ??
                  options?.engine.generationModel ??
                  "لم يُحدد"}
              </p>
            </div>
          </div>

          {/* Actionable Blocker Message (Answers: ما الذي يمنع التشغيل؟) */}
          {(preflight.blockedReason ||
            preflight.diagnostic ||
            (preflight.ruleConflicts && preflight.ruleConflicts.length > 0)) && (
            <div
              className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-950"
              data-testid="preflight-blocking-diagnostic"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-900">
                    ما الذي يمنع التشغيل؟ ({preflight.blockedCode ?? preflight.diagnostic?.code ?? "BLOCKED"}):
                  </p>
                  <p className="leading-relaxed font-medium">
                    {preflight.blockedReason ?? preflight.diagnostic?.message}
                  </p>
                  {preflight.ruleConflicts && preflight.ruleConflicts.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-1 pr-4 text-[11px] text-amber-800">
                      {preflight.ruleConflicts.map((conflict, idx) => (
                        <li key={idx}>
                          <strong>{conflict.field}</strong>: {conflict.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Collapsible Advanced Technical Details & Token Accounting */}
          <details
            className="rounded-xl border border-border/80 bg-slate-50/50 p-4 text-xs text-slate-700 transition"
            data-testid="preflight-advanced-details"
          >
            <summary className="cursor-pointer font-semibold text-slate-800 hover:text-slate-950 flex items-center justify-between">
              <span>تفاصيل تقنية متقدمة ومحاسبة الرموز (Advanced Technical Details & Token Accounting)</span>
              <span className="text-[11px] font-normal text-slate-500">انقر للعرض / الإخفاء</span>
            </summary>

            <div className="mt-4 pt-3 border-t border-border/60 space-y-4">
              {/* Identifiers & Digests */}
              <div className="flex flex-wrap items-center gap-2">
                {preflight.generationSpec && (
                  <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] text-slate-700">
                    الإصدار: v{preflight.generationSpec.specVersion} · القالب:{" "}
                    {preflight.generationSpec.promptVersion} · النمط:{" "}
                    {preflight.generationSpec.answerMode}
                  </span>
                )}

                {preflight.planDigest && (
                  <span
                    className="font-mono text-[11px] text-slate-600 rounded-lg border border-slate-200 bg-white px-2.5 py-1"
                    data-testid="preflight-plan-digest"
                  >
                    بصمة الخطة (planDigest): {preflight.planDigest.slice(0, 16)}…
                  </span>
                )}
              </div>

              {/* Detailed Metrics Grid */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Column 1: Model, Provider & Spec */}
                <div className="rounded-xl border border-border/80 bg-white p-4 shadow-sm">
                  <h4 className="font-bold text-slate-900 border-b border-border/60 pb-2">
                    المزود ومواصفة التوليد
                  </h4>
                  <dl className="mt-2.5 space-y-1.5 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">المزود (Provider):</dt>
                      <dd className="font-mono font-medium text-slate-900">
                        {preflight.generationSpec?.provider ??
                          options?.engine.provider ??
                          "غير محدد"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">نموذج التوليد:</dt>
                      <dd className="font-mono font-medium text-slate-900">
                        {preflight.generationSpec?.generationModel ??
                          options?.engine.generationModel ??
                          "غير محدد"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">نموذج محكّم الجودة:</dt>
                      <dd className="font-mono font-medium text-slate-900">
                        {preflight.generationSpec?.qualityModel ??
                          options?.engine.qualityModel ??
                          "غير محدد"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">العدد والصعوبة:</dt>
                      <dd className="font-mono font-medium text-slate-900">
                        {preflight.generationSpec?.targetCount ?? parsedTargetCount}{" "}
                        مرشحات
                        {preflight.generationSpec?.difficulty
                          ? ` · ${preflight.generationSpec.difficulty}`
                          : " · بدون صعوبة مخصصة"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">حالة المحرك / المزود الحي:</dt>
                      <dd className="text-slate-900 font-medium">
                        {preflight.engineEnabled ? "المحرك مفعّل" : "المحرك معطّل"} ·{" "}
                        {preflight.liveProviderEnabled
                          ? "المزود الحي مفعّل"
                          : "المزود الحي معطّل"}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Column 2: Cost Breakdown */}
                <div
                  className="rounded-xl border border-border/80 bg-white p-4 shadow-sm"
                  data-testid="preflight-cost-breakdown"
                >
                  <h4 className="font-bold text-slate-900 border-b border-border/60 pb-2">
                    تفصيل التكلفة التقديرية
                  </h4>
                  <dl className="mt-2.5 space-y-1.5 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">تكلفة التوليد الأساسية:</dt>
                      <dd
                        className="font-mono font-medium text-slate-900"
                        data-testid="cost-generation-micros"
                      >
                        {formatSarFromMicros(preflight.generationEstimatedMicros)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">
                        مخصص محكّم الجودة الشرطي
                        {preflight.judgeEligible === false
                          ? " (غير مفعّل حالياً)"
                          : " (مفعّل)"}
                        :
                      </dt>
                      <dd
                        className="font-mono font-medium text-slate-900"
                        data-testid="cost-conditional-judge-micros"
                      >
                        {formatSarFromMicros(
                          preflight.conditionalJudgeEstimatedMicros,
                        )}
                      </dd>
                    </div>
                    {preflight.maxJudgeEstimatedMicros !== undefined && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">
                          السقف الأقصى لمحكّم الجودة:
                        </dt>
                        <dd className="font-mono text-slate-500">
                          {formatSarFromMicros(preflight.maxJudgeEstimatedMicros)}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-2 border-t border-border/60 pt-2 font-semibold">
                      <dt className="text-amber-900">السقف التقديري الإجمالي:</dt>
                      <dd
                        className="font-mono text-amber-700 font-bold"
                        data-testid="cost-total-ceiling"
                      >
                        {typeof preflight.estimatedSar === "number"
                          ? `${preflight.estimatedSar.toFixed(4)} ر.س (${(preflight.estimatedMicros ?? 0).toLocaleString("en-US")} ميكرو)`
                          : formatSarFromMicros(preflight.estimatedMicros)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">التسعير معرّف:</dt>
                      <dd className="text-slate-900 font-medium">
                        {preflight.pricingConfigured ? "نعم" : "لا (مفقود)"}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Column 3: Budget Constraints */}
                <div
                  className="rounded-xl border border-border/80 bg-white p-4 shadow-sm"
                  data-testid="preflight-budget-constraints"
                >
                  <h4 className="font-bold text-slate-900 border-b border-border/60 pb-2">
                    قيود الميزانية الشهرية والدفعة
                  </h4>
                  <dl className="mt-2.5 space-y-1.5 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">الفترة المحاسبية:</dt>
                      <dd className="font-mono font-medium text-slate-900">
                        {preflight.budget.periodKey}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">الرصيد المتاح شهرياً:</dt>
                      <dd className="font-mono text-emerald-700 font-semibold">
                        {formatSarFromMicros(preflight.budget.availableMicros)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">السقف الشهري الكلي:</dt>
                      <dd className="font-mono font-medium text-slate-900">
                        {formatSarFromMicros(preflight.budget.capMicros)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">ضمن سقف الدفعة الواحدة:</dt>
                      <dd
                        className={
                          preflight.withinBatchCap === false
                            ? "font-semibold text-rose-700"
                            : "text-emerald-700 font-semibold"
                        }
                      >
                        {preflight.withinBatchCap === undefined
                          ? "غير محسوب"
                          : preflight.withinBatchCap
                            ? "نعم (ضمن الحد)"
                            : "لا (يتجاوز سقف الدفعة)"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">ضمن الميزانية الشهرية:</dt>
                      <dd
                        className={
                          preflight.withinMonthlyBudget === false
                            ? "font-semibold text-rose-700"
                            : "text-emerald-700 font-semibold"
                        }
                      >
                        {preflight.withinMonthlyBudget === undefined
                          ? "غير محسوب"
                          : preflight.withinMonthlyBudget
                            ? "نعم (ضمن المتاح)"
                            : "لا (يتجاوز الرصيد الشهري)"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Action Trigger Buttons: Preflight, Submit, Exact-Job Run */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          data-testid="button-preflight"
          onClick={handlePreflight}
          disabled={!canRunPreflight}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50 transition disabled:opacity-40"
        >
          {busy === "preflight" ? (
            <>
              <div className="size-3.5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              <span>جاري الفحص المسبق...</span>
            </>
          ) : (
            <>
              <Sparkles className="size-4 text-amber-500" />
              <span>1. فحص القابلية والتكلفة (Preflight)</span>
            </>
          )}
        </button>

        <button
          type="button"
          data-testid="button-submit-job"
          onClick={handleSubmitJob}
          disabled={!canSubmitJob}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 transition disabled:opacity-40"
        >
          {busy === "submit" ? (
            <>
              <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>جاري تسجيل الدفعة...</span>
            </>
          ) : (
            <>
              <Send className="size-4" />
              <span>2. اعتماد الخطة وتسجيل الدفعة</span>
            </>
          )}
        </button>

        {job && (
          <button
            type="button"
            data-testid="button-run-exact-job"
            onClick={() => handleRunExactJob(job.jobId)}
            disabled={busy !== null || !isJobRunnable(job)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-40"
          >
            {busy === "run" || job.status === "leased" ? (
              <>
                <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>جاري تشغيل الدفعة ({job.jobId})...</span>
              </>
            ) : (
              <>
                <Play className="size-4" />
                <span>3. تشغيل هذه الدفعة الآن ({job.jobId})</span>
              </>
            )}
          </button>
        )}

        {job && !isTerminalJobStatus(job.status) && !job.cancellationRequested && (
          <button
            type="button"
            data-testid="button-cancel-job"
            onClick={handleCancelJob}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-40"
          >
            <XCircle className="size-4" />
            <span>{busy === "cancel" ? "جاري الإلغاء..." : "إلغاء الدفعة"}</span>
          </button>
        )}
      </div>

      {/* Active Job Status & Handoff Card */}
      {job && (
        <div
          className="rounded-2xl border border-border/80 bg-slate-50/70 p-5 shadow-sm text-xs text-slate-800 space-y-3"
          data-testid="active-job-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">الدفعة النشطة:</span>
              <span
                className="rounded-lg border border-amber-200 bg-white px-2.5 py-1 font-mono font-bold text-amber-800"
                data-testid="active-job-id"
              >
                {job.jobId}
              </span>
              {jobStatusMeta && (
                <span
                  className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${jobStatusMeta.badgeClass}`}
                  data-testid="active-job-status-badge"
                >
                  {jobStatusMeta.label}
                </span>
              )}
              <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                المرحلة:{" "}
                <strong className="font-mono font-semibold text-slate-900">
                  {PIPELINE_STAGE_LABELS[job.pipelineStage] ??
                    job.pipelineStage}
                </strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="button-handoff-candidates"
                onClick={() => {
                  onJobSubmitted?.(job.jobId);
                  onBatchReady?.({
                    jobId: job.jobId,
                    worldKey:
                      job.worldKey ??
                      job.generationSpec?.worldKey ??
                      worldKey,
                    scopeKey:
                      job.scopeKey ??
                      job.generationSpec?.scopeKey ??
                      scopeKey,
                    mechanicKey:
                      job.mechanicKey ??
                      job.generationSpec?.mechanicKey ??
                      mechanicKey,
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 font-semibold text-white shadow-sm hover:bg-amber-600 transition"
              >
                <span>فتح المرشحين في مساحة المراجعة ({candidateTotal})</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
            <div className="rounded-xl border border-border/60 bg-white p-3">
              <span className="text-slate-500 block mb-1">الهدف القانوني: </span>
              <span className="font-mono text-slate-900 font-semibold">
                {job.worldKey ?? job.generationSpec?.worldKey ?? worldKey} /{" "}
                {job.scopeKey ?? job.generationSpec?.scopeKey ?? scopeKey} /{" "}
                {job.mechanicKey ??
                  job.generationSpec?.mechanicKey ??
                  mechanicKey}
              </span>
            </div>
            <div className="rounded-xl border border-border/60 bg-white p-3">
              <span className="text-slate-500 block mb-1">المحاولات والنداءات: </span>
              <span className="font-mono text-slate-900">
                محاولات: {job.attempts} · نداءات: {job.providerCalls}
              </span>
            </div>
            <div className="rounded-xl border border-border/60 bg-white p-3">
              <span className="text-slate-500 block mb-1">الإنفاق الفعلي: </span>
              <span className="font-mono text-emerald-700 font-bold">
                {job.spentSar.toFixed(4)} ر.س
              </span>
              {job.outstandingReservedMicros > 0 && (
                <span className="mr-1 font-mono text-amber-700 text-[11px] block mt-0.5">
                  (محجوز: {formatSarFromMicros(job.outstandingReservedMicros)})
                </span>
              )}
            </div>
            <div className="rounded-xl border border-border/60 bg-white p-3">
              <span className="text-slate-500 block mb-1">تفصيل المرشحين: </span>
              <span className="font-mono text-slate-900">
                {Object.keys(job.candidates ?? {}).length > 0
                  ? Object.entries(job.candidates)
                      .map(([st, cnt]) => `${st}: ${cnt}`)
                      .join(" · ")
                  : "لا يوجد مرشحون بعد"}
              </span>
            </div>
          </div>

          {job.provenanceComplete === false && (
            <p
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800 font-medium"
              data-testid="job-provenance-warning"
            >
              هذه الدفعة القديمة تفتقر إلى مواصفة توليد مكتملة (
              JOB_PROVENANCE_INSUFFICIENT) ولا يمكن تشغيلها حفاظاً على سلامة
              التتبع.
            </p>
          )}

          {job.awaitingReviewReason && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 font-medium">
              سبب التوقف للمراجعة: {job.awaitingReviewReason}
            </p>
          )}

          {job.lastError && (
            <p
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-mono text-rose-800"
              data-testid="active-job-error"
            >
              آخر خطأ: {job.lastError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
