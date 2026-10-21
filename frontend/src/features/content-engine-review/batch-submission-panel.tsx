"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelJob,
  getJobStatus,
  preflightJob,
  runNextJob,
  submitJob,
  type EngineJobStatus,
  type EnginePreflight,
} from "./api";

/**
 * Starting a batch, from inside the review workspace.
 *
 * Deliberately not a second screen: the people who approve candidates are the
 * people who ask for them, and splitting that across two places would mean
 * reviewing a batch without being able to see what it cost to make.
 *
 * The order of controls is the order of the decision — describe the batch, see
 * the price, then commit. Submit stays disabled until a preflight has actually
 * been run, so nobody spends without having been shown the estimate.
 */
export function BatchSubmissionPanel({
  onJobSubmitted,
}: {
  onJobSubmitted?: (jobId: string) => void;
}) {
  const [form, setForm] = useState({
    mechanicKey: "read-your-opponent",
    worldKey: "video-games",
    scopeKey: "overwatch",
    targetCount: 10,
  });
  const [preflight, setPreflight] = useState<EnginePreflight>();
  const [status, setStatus] = useState<EngineJobStatus>();
  const [jobId, setJobId] = useState<string>();
  const [busy, setBusy] = useState<"idle" | "preflight" | "submit" | "run">("idle");

  const sar = (micros?: number) =>
    micros === undefined ? "—" : `${(micros / 1_000_000).toFixed(2)} ر.س`;

  const guard = async (phase: typeof busy, work: () => Promise<void>) => {
    // One in-flight action at a time. The server is idempotent regardless, but
    // a disabled button is the honest signal that something is happening.
    if (busy !== "idle") return;
    setBusy(phase);
    try {
      await work();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: unknown } } })?.response?.data
          ?.message ?? (error as Error).message;
      toast.error(typeof message === "string" ? message : "فشل الطلب");
    } finally {
      setBusy("idle");
    }
  };

  return (
    <div className="space-y-4" data-testid="engine-batch-panel">
      <div className="grid gap-3 md:grid-cols-4">
        {(["mechanicKey", "worldKey", "scopeKey"] as const).map((key) => (
          <label key={key} className="space-y-1 text-sm">
            <span className="font-semibold">{key}</span>
            <Input
              data-testid={`engine-${key}`}
              value={form[key]}
              onChange={(event) => {
                setForm({ ...form, [key]: event.target.value });
                // A changed combination invalidates the price that was shown.
                setPreflight(undefined);
              }}
            />
          </label>
        ))}
        <label className="space-y-1 text-sm">
          <span className="font-semibold">عدد المرشحين</span>
          <Input
            data-testid="engine-target-count"
            type="number"
            min={1}
            max={50}
            value={form.targetCount}
            onChange={(event) => {
              setForm({ ...form, targetCount: Number(event.target.value) });
              setPreflight(undefined);
            }}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="engine-preflight"
          disabled={busy !== "idle"}
          onClick={() =>
            guard("preflight", async () => {
              const result = await preflightJob(form);
              setPreflight(result);
              if (!result.resolvable) toast.error(result.blockedReason ?? "غير قابل للتأليف");
            })
          }
        >
          تقدير التكلفة
        </Button>

        <Button
          type="button"
          data-testid="engine-submit"
          // Never submit without having shown a price for a resolvable combination.
          disabled={busy !== "idle" || !preflight?.resolvable}
          onClick={() =>
            guard("submit", async () => {
              const result = await submitJob(form);
              setJobId(result.jobId);
              onJobSubmitted?.(result.jobId);
              toast.success(result.created ? "تم إنشاء الدفعة" : "الدفعة موجودة مسبقًا");
            })
          }
        >
          إرسال الدفعة
        </Button>

        <Button
          type="button"
          variant="outline"
          data-testid="engine-run"
          disabled={busy !== "idle"}
          onClick={() =>
            guard("run", async () => {
              const result = await runNextJob();
              if (result.alreadyRunning) {
                toast.message("هناك تشغيل جارٍ بالفعل");
                return;
              }
              if (!result.jobId) {
                toast.message("لا توجد دفعات في الانتظار");
                return;
              }
              setJobId(result.jobId);
              setStatus(await getJobStatus(result.jobId));
              toast.success("اكتمل التشغيل");
            })
          }
        >
          تشغيل الدفعة التالية
        </Button>

        {jobId && (
          <>
            <Button
              type="button"
              variant="outline"
              data-testid="engine-refresh-status"
              disabled={busy !== "idle"}
              onClick={() => guard("run", async () => setStatus(await getJobStatus(jobId)))}
            >
              تحديث الحالة
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="engine-cancel"
              disabled={busy !== "idle"}
              onClick={() =>
                guard("run", async () => {
                  await cancelJob(jobId);
                  setStatus(await getJobStatus(jobId));
                  toast.success("تم طلب الإلغاء");
                })
              }
            >
              إلغاء
            </Button>
          </>
        )}
      </div>

      {preflight && (
        <div
          data-testid="engine-preflight-result"
          className="rounded-lg border p-3 text-sm"
        >
          <p>
            التكلفة التقديرية: <strong>{sar(preflight.estimatedMicros)}</strong> ·
            المتبقي هذا الشهر: <strong>{sar(preflight.budget.availableMicros)}</strong>
          </p>
          <p className="text-muted-foreground">
            {/* Stated plainly: an estimate is not a bill, and the caps bound
                what may be reserved, not what a provider ultimately charges. */}
            تقدير فقط — السقف يحد الحجز وليس فاتورة المزوّد.
          </p>
          {!preflight.pricingConfigured && (
            <p className="font-semibold text-destructive">
              لا يوجد تسعير مُهيّأ — سيُرفض الحجز.
            </p>
          )}
          {!preflight.liveProviderEnabled && (
            <p className="text-muted-foreground">
              الوضع المباشر غير مُفعّل — لن تُرسل أي طلبات مدفوعة.
            </p>
          )}
        </div>
      )}

      {status && (
        <dl
          data-testid="engine-job-status"
          className="grid gap-2 rounded-lg border p-3 text-sm md:grid-cols-4"
        >
          <div>
            <dt className="text-muted-foreground">الحالة</dt>
            <dd className="font-semibold">{status.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">المرحلة</dt>
            <dd className="font-semibold">{status.pipelineStage}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">المحاولات</dt>
            <dd className="font-semibold">{status.attempts}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">الإنفاق</dt>
            <dd className="font-semibold">{sar(status.spentMicros)}</dd>
          </div>
          {status.lastError && (
            <div className="md:col-span-4">
              <dt className="text-muted-foreground">آخر خطأ</dt>
              <dd className="font-semibold text-destructive">{status.lastError}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
