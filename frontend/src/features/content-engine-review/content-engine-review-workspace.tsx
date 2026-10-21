"use client";

import { useMemo, useState } from "react";
import { BatchSubmissionPanel } from "./batch-submission-panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, FilePlus2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/components/ui/toast";
import { PageHeader, SectionCard } from "@/components/shared";
import { EntityFormDialog } from "@/features/world-management/components/shared/entity-form-dialog";
import { ContentItemForm } from "@/features/world-management/components/content-items/content-item-form";
import type { ContentItem } from "@/features/world-management/types";
import * as api from "./api";
import type { FactualState, QualityRubric, ReviewCandidate } from "./types";

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
  "near-certain": "شبه مؤكد — يعرفه الجميع تقريبًا",
  likely: "مرجّح — يعرفه أغلب الفرق",
  even: "متكافئ — نحو النصف",
  unlikely: "غير مرجّح — أغلب الفرق لا تعرفه",
  "near-impossible": "شبه مستحيل — لا يكاد أحد يعرفه",
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

export function ContentEngineReviewWorkspace() {
  const client = useQueryClient();
  const [filters, setFilters] = useState({
    jobId: "",
    worldKey: "",
    scopeKey: "",
    status: "pending",
  });
  const [selectedId, setSelectedId] = useState<string>();
  const [editOpen, setEditOpen] = useState(false);
  const [factualState, setFactualState] = useState<FactualState>("UNRESOLVED");
  const [factualExplanation, setFactualExplanation] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [quality, setQuality] = useState(qualityDefaults);
  const [decisionExplanation, setDecisionExplanation] = useState("");
  const [rejectionReason, setRejectionReason] = useState("LOW_QUALITY");
  const [overrideExplanation, setOverrideExplanation] = useState("");

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

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["content-engine-review"] });
    await client.invalidateQueries({
      queryKey: ["content-engine-review-detail", selectedId],
    });
  };
  const action = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      await refresh();
      showToast({ message: "تم حفظ قرار المراجعة." });
    },
    onError: () =>
      showToast({
        type: "error",
        message: "تعذر حفظ القرار. قد يكون المرشح تغيّر لدى مراجع آخر.",
      }),
  });

  const candidate = detail.data;
  const editable = useMemo(
    () => (candidate ? toEditableContentItem(candidate) : null),
    [candidate],
  );

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <PageHeader
        title="مراجعة محرك المحتوى"
        description="قرار الإنسان هو المرجع. لا ينتقل أي مرشح إلى اللعب من هذه الشاشة."
      />

      <SectionCard
        title="طلب دفعة جديدة"
        description="اختر التركيبة، شاهد التقدير، ثم أرسل. التشغيل يدوي دائمًا."
      >
        <BatchSubmissionPanel
          onJobSubmitted={(jobId) => setFilters({ ...filters, jobId })}
        />
      </SectionCard>

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
              onClick={() => setSelectedId(row.candidateId)}
              className="rounded-xl border p-4 text-right transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">
                  {row.draft?.prompt?.ar ?? "مرشح بلا سؤال"}
                </span>
                <span className="rounded-full bg-muted px-2 py-1 text-xs">
                  {row.reviewStatus}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {row.job?.worldKey} / {row.job?.scopeKey} ·{" "}
                {row.job?.mechanicKey}
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

      {candidate && (
        <>
          <SectionCard
            title="تفاصيل المرشح"
            description={`Revision ${candidate.reviewRevision} · ${candidate.status}`}
            actions={
              editable ? (
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="me-2 size-4" /> تعديل بالمحرر المعتمد
                </Button>
              ) : undefined
            }
          >
            <p className="text-lg font-bold">{candidate.draft?.prompt?.ar}</p>
            <pre
              className="overflow-x-auto rounded-xl bg-muted p-3 text-xs"
              dir="ltr"
            >
              {JSON.stringify(candidate.draft?.answerPayload, null, 2)}
            </pre>
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
                  <div className="space-y-1" data-testid="candidate-distractor-rationale">
                    <p className="text-xs text-muted-foreground">
                      مبرّر الخيارات الخاطئة — هل كلٌّ منها مُقنع فعلًا؟
                    </p>
                    <ul className="list-disc space-y-1 pe-5 text-sm">
                      {candidate.authoring!.distractorRationale!.map((entry) => (
                        <li key={entry.optionId}>
                          <span className="text-muted-foreground">
                            {optionLabel(candidate, entry.optionId)}:{" "}
                          </span>
                          {entry.why}
                        </li>
                      ))}
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
              <p className="rounded-lg bg-muted p-3 text-sm">
                تكلفة الدفعة: {spending.data.spentSar.toFixed(4)} ر.س · محجوز:{" "}
                {spending.data.reservedSar.toFixed(4)} ر.س
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="التقييم البشري"
            description="الروابط والتفسير محفوظة مع هوية المراجع والتوقيت"
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
                <option key={state}>{state}</option>
              ))}
            </select>
            <Input
              placeholder="رابط الدليل"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
            />
            <Textarea
              placeholder="تفسير التحقق الواقعي"
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
              placeholder="شرح معيار الجودة"
              value={quality.explanation}
              onChange={(event) =>
                setQuality((current) => ({
                  ...current,
                  explanation: event.target.value,
                }))
              }
            />
            <Button
              disabled={action.isPending}
              onClick={() =>
                action.mutate(() =>
                  api.assessCandidate(candidate.candidateId, {
                    expectedRevision: candidate.reviewRevision,
                    factualState,
                    factualExplanation,
                    evidence: evidenceUrl ? [{ url: evidenceUrl }] : [],
                    quality,
                  }),
                )
              }
            >
              حفظ التقييم
            </Button>
          </SectionCard>

          <SectionCard
            title="القرار"
            description="أي تعارض واقعي يحتاج حلاً صريحاً قبل الاعتماد"
          >
            <Textarea
              placeholder="تفسير القرار"
              value={decisionExplanation}
              onChange={(event) => setDecisionExplanation(event.target.value)}
            />
            {candidate.humanAssessment?.factualState !== "SUPPORTED" && (
              <Textarea
                placeholder="تفسير حل التعارض أو عدم كفاية الدليل"
                value={overrideExplanation}
                onChange={(event) => setOverrideExplanation(event.target.value)}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  action.isPending || candidate.reviewStatus === "rejected"
                }
                onClick={() =>
                  action.mutate(() =>
                    api.approveCandidate(candidate.candidateId, {
                      expectedRevision: candidate.reviewRevision,
                      explanation: decisionExplanation,
                      ...(candidate.humanAssessment?.factualState ===
                      "SUPPORTED"
                        ? {}
                        : {
                            factualOverrideCode: "ACCEPTED_WITH_EVIDENCE",
                            factualOverrideExplanation: overrideExplanation,
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
                  <option key={reason}>{reason}</option>
                ))}
              </select>
              <Button
                variant="destructive"
                disabled={
                  action.isPending || Boolean(candidate.publishedContentItemId)
                }
                onClick={() =>
                  action.mutate(() =>
                    api.rejectCandidate(candidate.candidateId, {
                      expectedRevision: candidate.reviewRevision,
                      reasonCode: rejectionReason,
                      explanation: decisionExplanation,
                    }),
                  )
                }
              >
                <X className="me-2 size-4" /> رفض
              </Button>
              <Button
                variant="outline"
                disabled={
                  action.isPending ||
                  candidate.reviewStatus !== "approved" ||
                  Boolean(candidate.publishedContentItemId)
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
                <FilePlus2 className="me-2 size-4" /> إنشاء مسودة Canonical
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="سجل التدقيق">
            {candidate.reviewEvents.map((event, index) => (
              <p
                key={`${event.revision}-${event.action}-${index}`}
                className="text-sm"
              >
                {event.action} · {event.actorEmail} ·{" "}
                {new Date(event.occurredAt).toLocaleString("ar-SA")}
              </p>
            ))}
          </SectionCard>

          <EntityFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            title="تعديل المرشح"
          >
            {editable && (
              <ContentItemForm
                key={`${candidate.candidateId}-${candidate.reviewRevision}`}
                worldId={editable.worldId}
                contentItem={editable}
                submitLabel="حفظ المرشح وإعادة التحقق"
                onSubmitOverride={async (draft) => {
                  await api.editCandidate(candidate.candidateId, {
                    expectedRevision: candidate.reviewRevision,
                    draft,
                    factualClaims: candidate.factualClaims,
                    explanation: "Edited in the canonical ContentItem editor",
                  });
                  await refresh();
                }}
                onSuccess={() => setEditOpen(false)}
              />
            )}
          </EntityFormDialog>
        </>
      )}
    </main>
  );
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
