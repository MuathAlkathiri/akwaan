"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

    const firstWorld =
      options.worlds.find((w) => w.eligible) ?? options.worlds[0];
    if (!firstWorld) return;

    const firstScope = pickDefaultScope(firstWorld);
    const firstMechanic = pickDefaultMechanic(firstScope);

    setWorldKey(firstWorld.worldKey);
    setScopeKey(firstScope?.scopeKey ?? "");
    setMechanicKey(firstMechanic?.mechanicKey ?? "");
    setDifficulty(
      firstMechanic?.supportsDifficultySelection
        ? (firstMechanic.defaultDifficulty ?? "mixed")
        : "",
    );
    setTargetCountInput((current) => {
      if (current !== "5") return current;
      const defaultCount = Math.min(
        Math.max(5, options.limits.minTargetCount),
        options.limits.maxTargetCount,
      );
      return String(defaultCount);
    });
  }, [options]);

  // Sync recovered initialJobId if provided by parent workspace
  useEffect(() => {
    if (initialJobId && initialJobId !== activeJobId) {
      setActiveJobId(initialJobId);
    }
  }, [initialJobId, activeJobId]);

  const updateActiveJobId = useCallback(
    (nextJobId: string | null) => {
      setActiveJobId(nextJobId);
      onActiveJobIdChange?.(nextJobId);
    },
    [onActiveJobIdChange],
  );

  // Load job status whenever activeJobId is set and job is not yet loaded or differs
  useEffect(() => {
    if (!activeJobId) return;
    if (job?.jobId === activeJobId) return;

    let cancelled = false;
    void (async () => {
      try {
        const status = await getJobStatus(activeJobId);
        if (!cancelled) {
          setJob(status);
          onJobUpdated?.(status);
        }
      } catch (err) {
        if (!cancelled) {
          const extracted = extractApiError(err, "تعذر تحميل حالة الدفعة");
          setError(extracted.message);
          setErrorCode(extracted.code ?? null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeJobId, job?.jobId, onJobUpdated]);

  // Bounded polling while a job is leased (running) or while synchronous run is in flight
  const shouldPollActiveJob = Boolean(
    activeJobId &&
      (busy === "run" ||
        (job && job.status === "leased" && !isTerminalJobStatus(job.status))),
  );

  useEffect(() => {
    if (!activeJobId || !shouldPollActiveJob) return;

    const timer = setInterval(() => {
      void (async () => {
        try {
          const latest = await getJobStatus(activeJobId);
          setJob(latest);
          onJobUpdated?.(latest);
        } catch {
          // Ignore transient polling errors while in flight
        }
      })();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [activeJobId, shouldPollActiveJob, onJobUpdated]);

  const mechanicCatalogByKey = useMemo(() => {
    const map = new Map<string, EngineAuthoringOptions["mechanics"][number]>();
    for (const m of options?.mechanics ?? []) {
      map.set(m.mechanicKey, m);
    }
    return map;
  }, [options]);

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

  const selectedMechanicCatalog = useMemo(
    () => (mechanicKey ? mechanicCatalogByKey.get(mechanicKey) : undefined),
    [mechanicCatalogByKey, mechanicKey],
  );

  const minTargetCount = options?.limits.minTargetCount ?? 1;
  const maxTargetCount = options?.limits.maxTargetCount ?? 10;
  const maxGuidanceLength = options?.limits.maxBatchGuidanceLength ?? 1000;

  const parsedTargetCount = useMemo(() => {
    const trimmed = targetCountInput.trim();
    if (!trimmed) return NaN;
    const num = Number(trimmed);
    return Number.isInteger(num) ? num : NaN;
  }, [targetCountInput]);

  const targetCountValidationError = useMemo(() => {
    if (!Number.isFinite(parsedTargetCount)) {
      return `يرجى إدخال عدد صحيح بين ${minTargetCount} و ${maxTargetCount}.`;
    }
    if (parsedTargetCount < minTargetCount) {
      return `العدد المطلوب (${parsedTargetCount}) أقل من الحد الأدنى المسموح (${minTargetCount}).`;
    }
    if (parsedTargetCount > maxTargetCount) {
      return `العدد المطلوب (${parsedTargetCount}) يتجاوز السعة القصوى المسموحة للدفعة (${maxTargetCount}). لن يتم اقتطاعه تلقائياً.`;
    }
    return null;
  }, [parsedTargetCount, minTargetCount, maxTargetCount]);

  const guidanceValidationError = useMemo(() => {
    if (batchGuidance.length > maxGuidanceLength) {
      return `التوجيه الإضافي يتجاوز الحد الأقصى المسموح (${batchGuidance.length} / ${maxGuidanceLength} حرف).`;
    }
    return null;
  }, [batchGuidance.length, maxGuidanceLength]);

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

  const handleWorldChange = (nextWorldKey: string) => {
    setWorldKey(nextWorldKey);
    const nextWorld = options?.worlds.find((w) => w.worldKey === nextWorldKey);
    const nextScope = pickDefaultScope(nextWorld);
    const nextMechanic = pickDefaultMechanic(nextScope);

    setScopeKey(nextScope?.scopeKey ?? "");
    setMechanicKey(nextMechanic?.mechanicKey ?? "");
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

    setMechanicKey(nextMechanic?.mechanicKey ?? "");
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
      updateActiveJobId(submitted.jobId);
      onJobSubmitted?.(submitted.jobId);
      const latestStatus = await getJobStatus(submitted.jobId);
      setJob(latestStatus);
      onJobUpdated?.(latestStatus);
      void queryClient.invalidateQueries({ queryKey: ["content-engine-jobs"] });
      setInfoMessage(
        submitted.created
          ? `تم تسجيل الدفعة بنجاح (${submitted.jobId}). يمكنك الآن تشغيل هذه الدفعة تحديداً.`
          : `تم استرجاع الدفعة المطابقة الموجودة مسبقاً (${submitted.jobId}) بفضل ضمان عدم التكرار (Idempotency).`,
      );
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

  const handleRunExactJob = async (targetJobId?: string) => {
    const idToRun = targetJobId ?? job?.jobId ?? activeJobId;
    if (!idToRun || inFlightLockRef.current || busy !== null) return;

    inFlightLockRef.current = true;
    setBusy("run");
    setError(null);
    setErrorCode(null);
    setInfoMessage(null);

    try {
      const runResult = await runJob(idToRun);
      const refreshed = await getJobStatus(idToRun);
      setJob(refreshed);
      onJobUpdated?.(refreshed);
      void queryClient.invalidateQueries({ queryKey: ["content-engine-jobs"] });
      void queryClient.invalidateQueries({
        queryKey: ["content-engine-candidates"],
      });

      if (runResult.alreadyRunning) {
        setInfoMessage(`الدفعة (${idToRun}) قيد التشغيل بالفعل.`);
      } else if (refreshed.status === "awaiting_review") {
        setInfoMessage(
          `اكتمل توليد وفحص الدفعة (${idToRun}) وهي الآن جاهزة للمراجعة البشرية.`,
        );
      }
    } catch (err) {
      const extracted = extractApiError(err, "فشل تشغيل الدفعة");
      // Handle request timeouts or ambiguous client errors by re-reading job status
      // rather than automatically retrying paid execution.
      try {
        const recovered = await getJobStatus(idToRun);
        setJob(recovered);
        onJobUpdated?.(recovered);
        void queryClient.invalidateQueries({
          queryKey: ["content-engine-jobs"],
        });
        if (extracted.isTimeoutOrNetwork) {
          setError(
            `انتهت مهلة الطلب أو انقطع الاتصال أثناء التشغيل؛ تمت إعادة قراءة حالة الدفعة (${recovered.status}) دون إعادة تشغيل مدفوع تلقائي: ${extracted.message}`,
          );
        } else {
          setError(extracted.message);
        }
        setErrorCode(extracted.code ?? null);
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
        badgeClass: "border-zinc-700 bg-zinc-900 text-zinc-200",
      })
    : null;

  const candidateTotal = totalCandidatesCount(job?.candidates);

  return (
    <section
      className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/70 p-5"
      data-testid="batch-submission-panel"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">
            استوديو توليد المحتوى — إعداد الدفعة والفحص المسبق
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            يتم اشتقاق العوالم والنطاقات والميكانيكيات وحدود السعة مباشرةً من الخادم.
            الفحص المسبق للقراءة فقط، والتشغيل يستهدف الدفعة المحددة بالمعرّف فقط.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {options?.engine && (
            <>
              <span
                className={`rounded-md border px-2.5 py-1 font-medium ${
                  options.engine.engineEnabled
                    ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                    : "border-red-500/40 bg-red-950/40 text-red-200"
                }`}
                data-testid="engine-enabled-badge"
              >
                المحرك: {options.engine.engineEnabled ? "مفعّل" : "معطّل"}
              </span>
              <span
                className={`rounded-md border px-2.5 py-1 font-medium ${
                  options.engine.liveProviderEnabled
                    ? "border-sky-500/40 bg-sky-950/30 text-sky-200"
                    : "border-zinc-700 bg-zinc-950 text-zinc-300"
                }`}
                data-testid="live-provider-badge"
              >
                المزود الحي:{" "}
                {options.engine.liveProviderEnabled ? "مفعّل" : "غير مفعّل"}
              </span>
              {options.engine.provider && (
                <span className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 font-mono text-zinc-300">
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
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-amber-500/50 hover:text-amber-200"
            >
              عرض سجل الدفعات الكامل
            </button>
          )}
        </div>
      </div>

      {optionsQuery.isLoading && (
        <div
          className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400"
          data-testid="options-loading"
        >
          جاري تحميل خيارات التأليف القانونية من الخادم...
        </div>
      )}

      {optionsQuery.isError && (
        <div
          className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200"
          data-testid="options-error"
        >
          تعذر تحميل خيارات التأليف من الخادم:{" "}
          {extractApiError(optionsQuery.error, "خطأ في الاتصال").message}
        </div>
      )}

      {options?.engine && !options.engine.submissionReady && (
        <div
          className="mb-4 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200"
          data-testid="engine-readiness-warning"
        >
          <span className="font-semibold">تنبيه جاهزية المحرك: </span>
          <span className="font-mono">
            {options.engine.blockedCode ?? "ENGINE_NOT_READY"}
          </span>{" "}
          — {options.engine.blockedReason ?? "إعدادات المزود أو التسعير غير مكتملة."}
        </div>
      )}

      {/* Generation Configuration Form */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {/* 1. World Selector */}
        <label className="block min-w-0 text-xs text-zinc-300">
          <span className="font-semibold">العالم (World)</span>
          <select
            data-testid="select-world"
            value={worldKey}
            onChange={(e) => handleWorldChange(e.target.value)}
            disabled={!options || options.worlds.length === 0}
            className="mt-1 w-full max-w-full min-w-0 truncate rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
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
        <label className="block min-w-0 text-xs text-zinc-300">
          <span className="font-semibold">النطاق (Scope)</span>
          <select
            data-testid="select-scope"
            value={scopeKey}
            onChange={(e) => handleScopeChange(e.target.value)}
            disabled={availableScopes.length === 0}
            className="mt-1 w-full max-w-full min-w-0 truncate rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
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
        <label className="block min-w-0 text-xs text-zinc-300">
          <span className="font-semibold">الميكانيكية (Mechanic)</span>
          <select
            data-testid="select-mechanic"
            value={mechanicKey}
            onChange={(e) => handleMechanicChange(e.target.value)}
            disabled={availableMechanics.length === 0}
            className="mt-1 w-full max-w-full min-w-0 truncate rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
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

        {/* 4. Candidate Count Input (constrained by server limits, never silently truncated) */}
        <div className="min-w-0 text-xs text-zinc-300">
          <label htmlFor="target-count-input" className="font-semibold">
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
            className={`mt-1 w-full rounded-lg border bg-zinc-950 px-3 py-2 text-sm text-white ${
              targetCountValidationError
                ? "border-red-500/70"
                : "border-zinc-700"
            }`}
          />
          <p
            className="mt-1 text-[11px] text-zinc-400"
            data-testid="target-count-capacity"
          >
            سعة التوليد المسموحة من الخادم: {minTargetCount} إلى {maxTargetCount}{" "}
            مرشحات لكل دفعة.
          </p>
          {targetCountValidationError && (
            <p
              className="mt-1 text-[11px] text-red-300"
              data-testid="target-count-error"
            >
              {targetCountValidationError}
            </p>
          )}
        </div>
      </div>

      {/* Selected Mechanic Metadata, Off-Board Status & Difficulty Selection */}
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Difficulty selector or deferred explanation */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-xs">
          {selectedMechanic?.supportsDifficultySelection ? (
            <div>
              <label
                htmlFor="difficulty-select"
                className="block font-semibold text-zinc-200"
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
                className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
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
                    className="mt-1.5 text-[11px] text-zinc-400"
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
            <div data-testid="difficulty-deferred-note">
              <span className="font-semibold text-zinc-300">
                مستوى الصعوبة:{" "}
              </span>
              <span className="text-zinc-400">
                تحديد الصعوبة غير متاح لهذه الميكانيكية في هذه المرحلة
                {selectedMechanic?.difficultyDeferredReason
                  ? ` (${selectedMechanic.difficultyDeferredReason})`
                  : ""}
                .
              </span>
            </div>
          )}

          {/* Board presence / Off-board authoring status */}
          {selectedMechanic && (
            <div
              className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-800/80 pt-2 text-[11px]"
              data-testid="mechanic-board-status"
            >
              <span className="text-zinc-400">
                الفئة:{" "}
                <strong className="text-zinc-200">
                  {selectedMechanic.category === "signature"
                    ? "ميكانيكية مميزة (Signature)"
                    : "قياسية (Standard)"}
                </strong>
              </span>
              {selectedMechanic.answerMode && (
                <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-zinc-300">
                  نمط الإجابة: {selectedMechanic.answerMode}
                </span>
              )}
              {selectedMechanic.onBoard ? (
                <span className="rounded border border-emerald-500/30 bg-emerald-950/30 px-2 py-0.5 text-emerald-200">
                  مربوطة على لوحة العالم ({selectedMechanic.boardSlotKeys.join(", ")})
                </span>
              ) : selectedMechanic.offBoardAuthoringAllowed ? (
                <span
                  className="rounded border border-amber-500/30 bg-amber-950/30 px-2 py-0.5 text-amber-200"
                  data-testid="off-board-allowed-badge"
                >
                  تأليف خارج اللوحة مسموح (Off-board Authoring Allowed)
                </span>
              ) : null}
            </div>
          )}
        </div>

        {/* Optional Batch Guidance Textarea */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="batch-guidance-textarea"
              className="font-semibold text-zinc-200"
            >
              توجيه إضافي للدفعة (اختياري)
            </label>
            <span
              className={`font-mono text-[11px] ${
                guidanceValidationError ? "text-red-300" : "text-zinc-400"
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
            className={`mt-1.5 w-full rounded-lg border bg-zinc-900 px-3 py-2 text-xs text-white placeholder:text-zinc-500 ${
              guidanceValidationError
                ? "border-red-500/70"
                : "border-zinc-700"
            }`}
          />
          <p
            className="mt-1 text-[11px] text-zinc-400"
            data-testid="batch-guidance-subordinate-note"
          >
            تنبيه: التوجيه الإضافي اختياري (بحد أقصى {maxGuidanceLength} حرف)
            ويخضع دائماً لقواعد المهارات القانونية (Canonical Skills) وقواعد
            الميكانيكية والنطاق؛ لا يمكنه تجاوزها أو تعديل صيغة الإجابة.
          </p>
          {guidanceValidationError && (
            <p
              className="mt-1 text-[11px] text-red-300"
              data-testid="batch-guidance-error"
            >
              {guidanceValidationError}
            </p>
          )}
        </div>
      </div>

      {/* Server Eligibility Diagnostics for Current Selection & Disabled Options */}
      {selectionBlockedDiagnostic && (
        <div
          className="mt-3 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200"
          data-testid="selection-blocked-diagnostic"
        >
          <p className="font-semibold">
            هذا الاختيار غير مؤهل للتوليد حسب قواعد الخادم:{" "}
            <span className="font-mono">{selectionBlockedDiagnostic.code}</span>
          </p>
          <p className="mt-1 font-mono text-[11px] text-red-300">
            {selectionBlockedDiagnostic.reason}
          </p>
        </div>
      )}

      {disabledMechanicsInScope.length > 0 && (
        <details
          className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400"
          data-testid="disabled-mechanics-diagnostics"
        >
          <summary className="cursor-pointer font-medium text-zinc-300">
            تشخيصات الميكانيكيات غير المؤهلة في هذا النطاق (
            {disabledMechanicsInScope.length})
          </summary>
          <ul className="mt-2 space-y-1 text-[11px]">
            {disabledMechanicsInScope.map((m) => (
              <li key={m.mechanicKey} className="font-mono text-zinc-400">
                <strong className="text-zinc-200">{m.mechanicKey}</strong>:{" "}
                <span className="text-amber-300">
                  {m.blockedCode ?? "BLOCKED"}
                </span>{" "}
                — {m.blockedReason ?? "غير متاح"}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Action Buttons: Preflight, Submit, Exact-Job Run */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="button-preflight"
          onClick={handlePreflight}
          disabled={!canRunPreflight}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-40"
        >
          {busy === "preflight"
            ? "جاري الفحص المسبق..."
            : "1. فحص القابلية والتكلفة (Preflight)"}
        </button>

        <button
          type="button"
          data-testid="button-submit-job"
          onClick={handleSubmitJob}
          disabled={!canSubmitJob}
          className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
        >
          {busy === "submit"
            ? "جاري تسجيل الدفعة..."
            : "2. اعتماد الخطة وتسجيل الدفعة"}
        </button>

        {job && (
          <button
            type="button"
            data-testid="button-run-exact-job"
            onClick={() => handleRunExactJob(job.jobId)}
            disabled={busy !== null || !isJobRunnable(job)}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            {busy === "run" || job.status === "leased"
              ? `جاري تشغيل الدفعة (${job.jobId})...`
              : `3. تشغيل هذه الدفعة الآن (${job.jobId})`}
          </button>
        )}

        {job && !isTerminalJobStatus(job.status) && !job.cancellationRequested && (
          <button
            type="button"
            data-testid="button-cancel-job"
            onClick={handleCancelJob}
            disabled={busy !== null}
            className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-950/70 disabled:opacity-40"
          >
            {busy === "cancel" ? "جاري الإلغاء..." : "إلغاء الدفعة"}
          </button>
        )}
      </div>

      {/* Plan Drift Alert */}
      {planDriftMessage && (
        <div
          className="mt-3 rounded-lg border border-amber-500/50 bg-amber-950/50 p-3 text-xs text-amber-200"
          data-testid="plan-drift-alert"
        >
          {planDriftMessage}
        </div>
      )}

      {/* General Error Alert */}
      {error && (
        <div
          className="mt-3 rounded-lg border border-red-500/40 bg-red-950/50 p-3 text-xs text-red-200"
          data-testid="batch-error-alert"
        >
          {errorCode && (
            <span className="ml-2 rounded bg-red-900/60 px-1.5 py-0.5 font-mono text-[11px] text-red-100">
              {errorCode}
            </span>
          )}
          <span>{error}</span>
        </div>
      )}

      {/* Info Message */}
      {infoMessage && (
        <div
          className="mt-3 rounded-lg border border-sky-500/40 bg-sky-950/40 p-3 text-xs text-sky-200"
          data-testid="batch-info-alert"
        >
          {infoMessage}
        </div>
      )}

      {/* Preflight & Cost UX Panel */}
      {preflight && (
        <div
          className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300"
          data-testid="preflight-results"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md border px-2.5 py-1 font-semibold ${
                  preflight.resolvable && preflight.submissionReady !== false
                    ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-200"
                    : "border-red-500/40 bg-red-950/40 text-red-200"
                }`}
                data-testid="preflight-status-badge"
              >
                {preflight.resolvable && preflight.submissionReady !== false
                  ? "الفحص المسبق صالح وجاهز للتسجيل"
                  : preflight.resolvable
                    ? "السياق قابل للحل لكن التسجيل محجوب"
                    : "الفحص المسبق مرفوض"}
              </span>

              {preflight.generationSpec && (
                <span className="rounded bg-zinc-900 px-2 py-1 font-mono text-zinc-300">
                  الإصدار: v{preflight.generationSpec.specVersion} · القالب:{" "}
                  {preflight.generationSpec.promptVersion} · النمط:{" "}
                  {preflight.generationSpec.answerMode}
                </span>
              )}
            </div>

            {preflight.planDigest && (
              <span
                className="font-mono text-[11px] text-zinc-400"
                data-testid="preflight-plan-digest"
              >
                بصمة الخطة (planDigest): {preflight.planDigest.slice(0, 16)}…
              </span>
            )}
          </div>

          {/* Blocking Diagnostics & Rule Conflicts */}
          {(preflight.blockedReason ||
            preflight.diagnostic ||
            (preflight.ruleConflicts && preflight.ruleConflicts.length > 0)) && (
            <div
              className="mt-3 rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-red-200"
              data-testid="preflight-blocking-diagnostic"
            >
              <p className="font-semibold">
                سبب الحجب ({preflight.blockedCode ?? preflight.diagnostic?.code ?? "BLOCKED"}):
              </p>
              <p className="mt-1 font-mono text-[11px]">
                {preflight.blockedReason ?? preflight.diagnostic?.message}
              </p>
              {preflight.ruleConflicts && preflight.ruleConflicts.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pr-4 text-[11px]">
                  {preflight.ruleConflicts.map((conflict, idx) => (
                    <li key={idx}>
                      <strong>{conflict.field}</strong>: {conflict.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Detailed Preflight Metrics Grid */}
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* Column 1: Model, Provider & Spec */}
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3">
              <h3 className="font-semibold text-white">
                المزود ومواصفة التوليد
              </h3>
              <dl className="mt-2 space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-400">المزود (Provider):</dt>
                  <dd className="font-mono text-zinc-200">
                    {preflight.generationSpec?.provider ??
                      options?.engine.provider ??
                      "غير محدد"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-400">نموذج التوليد:</dt>
                  <dd className="font-mono text-zinc-200">
                    {preflight.generationSpec?.generationModel ??
                      options?.engine.generationModel ??
                      "غير محدد"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-400">نموذج محكّم الجودة:</dt>
                  <dd className="font-mono text-zinc-200">
                    {preflight.generationSpec?.qualityModel ??
                      options?.engine.qualityModel ??
                      "غير محدد"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-400">العدد والصعوبة:</dt>
                  <dd className="font-mono text-zinc-200">
                    {preflight.generationSpec?.targetCount ?? parsedTargetCount}{" "}
                    مرشحات
                    {preflight.generationSpec?.difficulty
                      ? ` · ${preflight.generationSpec.difficulty}`
                      : " · بدون صعوبة مخصصة"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-400">حالة المحرك / المزود الحي:</dt>
                  <dd className="text-zinc-200">
                    {preflight.engineEnabled ? "المحرك مفعّل" : "المحرك معطّل"} ·{" "}
                    {preflight.liveProviderEnabled
                      ? "المزود الحي مفعّل"
                      : "المزود الحي معطّل"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Column 2: Cost Breakdown (Generation vs Conditional Quality Judge vs Ceiling) */}
            <div
              className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3"
              data-testid="preflight-cost-breakdown"
            >
              <h3 className="font-semibold text-white">
                تفصيل التكلفة التقديرية
              </h3>
              <dl className="mt-2 space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-400">تكلفة التوليد الأساسية:</dt>
                  <dd
                    className="font-mono text-zinc-200"
                    data-testid="cost-generation-micros"
                  >
                    {formatSarFromMicros(preflight.generationEstimatedMicros)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-400">
                    مخصص محكّم الجودة الشرطي
                    {preflight.judgeEligible === false
                      ? " (غير مفعّل حالياً)"
                      : " (مفعّل)"}
                    :
                  </dt>
                  <dd
                    className="font-mono text-zinc-200"
                    data-testid="cost-conditional-judge-micros"
                  >
                    {formatSarFromMicros(
                      preflight.conditionalJudgeEstimatedMicros,
                    )}
                  </dd>
                </div>
                {preflight.maxJudgeEstimatedMicros !== undefined && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-400">
                      السقف الأقصى لمحكّم الجودة (للتسعير):
                    </dt>
                    <dd className="font-mono text-zinc-400">
                      {formatSarFromMicros(preflight.maxJudgeEstimatedMicros)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-2 border-t border-zinc-800 pt-1.5 font-semibold">
                  <dt className="text-amber-200">السقف التقديري الإجمالي:</dt>
                  <dd
                    className="font-mono text-amber-300"
                    data-testid="cost-total-ceiling"
                  >
                    {typeof preflight.estimatedSar === "number"
                      ? `${preflight.estimatedSar.toFixed(4)} ر.س (${(preflight.estimatedMicros ?? 0).toLocaleString("en-US")} ميكرو)`
                      : formatSarFromMicros(preflight.estimatedMicros)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-400">التسعير معرّف:</dt>
                  <dd className="text-zinc-200">
                    {preflight.pricingConfigured ? "نعم" : "لا (مفقود)"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Column 3: Budget Constraints (Monthly & Per-Batch) */}
            <div
              className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3"
              data-testid="preflight-budget-constraints"
            >
              <h3 className="font-semibold text-white">
                قيود الميزانية الشهرية والدفعة
              </h3>
              <dl className="mt-2 space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-400">الفترة المحاسبية:</dt>
                  <dd className="font-mono text-zinc-200">
                    {preflight.budget.periodKey}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-400">الرصيد المتاح شهرياً:</dt>
                  <dd className="font-mono text-emerald-300">
                    {formatSarFromMicros(preflight.budget.availableMicros)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-400">السقف الشهري الكلي:</dt>
                  <dd className="font-mono text-zinc-200">
                    {formatSarFromMicros(preflight.budget.capMicros)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-400">ضمن سقف الدفعة الواحدة:</dt>
                  <dd
                    className={
                      preflight.withinBatchCap === false
                        ? "font-semibold text-red-300"
                        : "text-emerald-300"
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
                  <dt className="text-zinc-400">ضمن الميزانية الشهرية:</dt>
                  <dd
                    className={
                      preflight.withinMonthlyBudget === false
                        ? "font-semibold text-red-300"
                        : "text-emerald-300"
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
      )}

      {/* Active Job Status & Handoff Card */}
      {job && (
        <div
          className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300"
          data-testid="active-job-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white">الدفعة النشطة:</span>
              <span
                className="rounded bg-zinc-900 px-2 py-1 font-mono text-amber-300"
                data-testid="active-job-id"
              >
                {job.jobId}
              </span>
              {jobStatusMeta && (
                <span
                  className={`rounded-md border px-2.5 py-1 font-semibold ${jobStatusMeta.badgeClass}`}
                  data-testid="active-job-status-badge"
                >
                  {jobStatusMeta.label}
                </span>
              )}
              <span className="rounded bg-zinc-900 px-2 py-1 text-zinc-300">
                المرحلة:{" "}
                <strong className="font-mono">
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
                className="rounded-lg bg-amber-500/20 px-3 py-1.5 font-semibold text-amber-200 hover:bg-amber-500/30"
              >
                فتح المرشحين في مساحة المراجعة ({candidateTotal})
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-zinc-800/80 pt-3 md:grid-cols-4">
            <div>
              <span className="text-zinc-400">الهدف: </span>
              <span className="font-mono text-zinc-200">
                {job.worldKey ?? job.generationSpec?.worldKey ?? worldKey} /{" "}
                {job.scopeKey ?? job.generationSpec?.scopeKey ?? scopeKey} /{" "}
                {job.mechanicKey ??
                  job.generationSpec?.mechanicKey ??
                  mechanicKey}
              </span>
            </div>
            <div>
              <span className="text-zinc-400">المحاولات والنداءات: </span>
              <span className="font-mono text-zinc-200">
                محاولات: {job.attempts} · نداءات المزود: {job.providerCalls}
              </span>
            </div>
            <div>
              <span className="text-zinc-400">الإنفاق الفعلي: </span>
              <span className="font-mono text-emerald-300">
                {job.spentSar.toFixed(4)} ر.س
              </span>
              {job.outstandingReservedMicros > 0 && (
                <span className="mr-1 font-mono text-amber-300">
                  (محجوز: {formatSarFromMicros(job.outstandingReservedMicros)})
                </span>
              )}
            </div>
            <div>
              <span className="text-zinc-400">تفصيل المرشحين: </span>
              <span className="font-mono text-zinc-200">
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
              className="mt-2 rounded border border-red-500/40 bg-red-950/30 p-2 text-red-200"
              data-testid="job-provenance-warning"
            >
              هذه الدفعة القديمة تفتقر إلى مواصفة توليد مكتملة (
              JOB_PROVENANCE_INSUFFICIENT) ولا يمكن تشغيلها حفاظاً على سلامة
              التتبع.
            </p>
          )}

          {job.awaitingReviewReason && (
            <p className="mt-2 text-amber-300">
              سبب التوقف للمراجعة: {job.awaitingReviewReason}
            </p>
          )}

          {job.lastError && (
            <p
              className="mt-2 rounded border border-red-500/40 bg-red-950/30 p-2 font-mono text-red-300"
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
