"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import * as api from "./api";
import {
  MediaEventHistory,
  MediaPreview,
  MediaRecordRows,
} from "./candidate-media-viewer";
import type {
  CandidateMediaFinding,
  CandidateMediaReadiness,
  CandidateMediaSlot,
  CandidateMediaSlotDescriptor,
  ReviewCandidate,
} from "./types";

/**
 * §30.22 Phase 3B-1 — media review for one candidate.
 *
 * Media decisions are separate from text review: every action here is CAS'd on
 * `mediaReviewRevision` and the server never touches the text revision or
 * assessment. Approval readiness is never computed here — the server's
 * `reviewEligibility` (and its `mediaReadiness`) is the authority; this panel
 * only shows it and offers the media actions the server allows.
 */

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

const REJECTION_REASONS: Array<{ code: string; label: string }> = [
  { code: "WRONG_SUBJECT", label: "الصورة لا تطابق السؤال" },
  { code: "ANSWER_LEAKAGE", label: "تكشف الإجابة" },
  { code: "LOW_QUALITY", label: "جودة منخفضة" },
  { code: "WRONG_FRAMING", label: "تأطير غير مناسب" },
  { code: "UNSAFE_OR_INAPPROPRIATE", label: "غير لائقة" },
  { code: "OTHER", label: "سبب آخر" },
];

const UNSUPPORTED_REASON_LABELS: Record<string, string> = {
  AUDIO_UPLOAD_NOT_SUPPORTED:
    "رفع الصوت غير مدعوم بعد في محرك المحتوى؛ هذه الخانة لا يمكن تعبئتها من هنا.",
  ODD_PIECE_V2_IMAGE_FIELDS_NOT_SUPPORTED:
    "صور «القطعة الغريبة» V2 تحتاج أبعادًا واتجاهًا ومصدرًا لا يحددها الرفع اليدوي بعد؛ التعبئة من هنا غير مدعومة.",
  UPLOAD_NOT_ACCEPTED: "هذه الخانة لا تقبل الرفع اليدوي.",
};

const RIGHTS_LABELS: Record<string, string> = {
  CLEARED: "حقوق مُخلاة",
  UNKNOWN: "حقوق غير معروفة",
  PENDING: "حقوق قيد المراجعة",
  EXPIRED: "حقوق منتهية الصلاحية",
  BLOCKED: "حقوق محظورة",
};

const FAILURE_REASON_LABELS: Record<string, string> = {
  MEDIA_DISCOVERY_NO_CONFIDENT_MATCH:
    "ما لقينا صورة نتأكد إنها للموضوع نفسه. اختر من المقترحات تحت أو ارفع صورة.",
  MEDIA_DISCOVERY_NO_RESULT: "البحث ما لقى أي صورة. ارفع صورة من عندك.",
  MEDIA_DISCOVERY_UNAVAILABLE:
    "مصادر الصور ما ردّت وقت البحث. ارفع صورة أو جرّب دفعة ثانية.",
  MEDIA_ANSWER_VISIBLE_IN_ALL:
    "كل الصور اللي لقيناها مكتوب فيها شي يكشف الإجابة. ارفع صورة بدون كتابة، أو اختر من المقترحات لو تشوف إنها تمشي.",
  MEDIA_INTENT_MISSING: "السؤال ما حدد وش لازم يظهر في الصورة. ارفع صورة من عندك.",
};

const PROVIDER_LABELS: Record<string, string> = {
  wikidata: "ويكي بيانات",
  "wikimedia-commons": "ويكيميديا كومنز",
  "brave-search": "بحث الويب (Brave)",
};

const CONFLICT_NOTICE =
  "تغيّرت وسائط هذا المرشح أثناء عملك. أُعيد تحميله؛ راجع الحالة الحالية واتخذ القرار من جديد.";

type ActionError = { message: string; conflict: boolean; code?: string };

function toActionError(err: unknown): ActionError {
  const response = (
    err as {
      response?: {
        status?: number;
        data?: { message?: string | string[]; code?: string };
      };
    }
  )?.response;
  const raw = response?.data?.message;
  const message = Array.isArray(raw)
    ? raw.join(" — ")
    : typeof raw === "string"
      ? raw
      : err instanceof Error && err.message
        ? err.message
        : "تعذر تنفيذ العملية.";
  return {
    message,
    conflict: response?.status === 409,
    code: typeof response?.data?.code === "string" ? response.data.code : undefined,
  };
}

/** Registry slots first, then any plan entry the contract does not know. */
function slotRows(
  readiness: CandidateMediaReadiness,
  plan: CandidateMediaSlot[],
): Array<{
  slotKey: string;
  descriptor: CandidateMediaSlotDescriptor | null;
  slot: CandidateMediaSlot | null;
}> {
  const descriptors =
    readiness.slots ??
    readiness.requiredSlotKeys.map((slotKey) => ({
      slotKey,
      purpose: "gameplay" as const,
      required: true,
      mediaType: "image" as const,
      uploadSupported: true,
      uploadUnsupportedReason: null,
    }));
  const known = new Set(descriptors.map((descriptor) => descriptor.slotKey));
  return [
    ...descriptors.map((descriptor) => ({
      slotKey: descriptor.slotKey,
      descriptor,
      slot: plan.find((entry) => entry.slotKey === descriptor.slotKey) ?? null,
    })),
    ...plan
      .filter((entry) => !known.has(entry.slotKey))
      .map((entry) => ({ slotKey: entry.slotKey, descriptor: null, slot: entry })),
  ];
}

export function CandidateMediaPanel({
  candidate,
}: {
  candidate: ReviewCandidate;
}) {
  // Held here, outside the revision-keyed slot cards: the reload a conflict
  // triggers remounts the cards (discarding the stale form), and must not
  // discard the explanation of why the reviewer has to decide again.
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const readiness = candidate.reviewEligibility?.mediaReadiness;
  // Candidates outside the media contract keep exactly the review they had.
  if (!readiness?.governed) return null;

  const revision = candidate.mediaReviewRevision ?? 0;
  const lockedReason = candidate.publishedContentItemId
    ? "أُنشئت المسودة؛ الوسائط مقفلة."
    : candidate.reviewStatus === "approved"
      ? "المرشح معتمد؛ الوسائط مقفلة. يمكن فقط الإقرار بتغيّر حالة الحقوق؛ ولتغيير الوسائط عدّل المرشح أولًا لإلغاء الاعتماد."
      : candidate.reviewStatus === "rejected"
        ? "المرشح مرفوض؛ لا تُقبل تغييرات على الوسائط."
        : null;
  const rows = slotRows(readiness, candidate.mediaPlan ?? []);

  return (
    <section
      aria-labelledby="candidate-media-heading"
      className="rounded-lg border bg-card p-4"
      data-testid="candidate-media-panel"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 id="candidate-media-heading" className="text-base font-semibold">
          وسائط المرشح
        </h3>
        <Badge
          variant={readiness.ready ? "secondary" : "destructive"}
          data-testid="media-readiness"
        >
          {readiness.ready ? "الوسائط جاهزة" : "الوسائط غير جاهزة"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          مراجعة الوسائط رقم {revision} · منفصلة عن مراجعة النص
        </span>
      </div>

      {!readiness.ready && (
        <ul
          className="mb-3 list-disc space-y-1 ps-5 text-sm text-destructive"
          data-testid="media-blockers"
        >
          {readiness.blockers.map((finding) => (
            <li key={`${finding.slotKey}-${finding.code}`}>
              <span className="font-mono">{finding.slotKey}</span> —{" "}
              {finding.message}
            </li>
          ))}
        </ul>
      )}

      {conflictNotice && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-amber-500/10 p-2 text-sm"
          data-testid="media-conflict-notice"
        >
          {conflictNotice}
        </p>
      )}

      {lockedReason && (
        <p
          className="mb-3 rounded-md bg-muted p-2 text-sm"
          data-testid="media-locked"
        >
          {lockedReason}
        </p>
      )}

      <div className="space-y-3">
        {rows.map((row) => (
          <MediaSlotCard
            // A new media revision discards any half-made decision.
            key={`${row.slotKey}-${revision}`}
            candidate={candidate}
            revision={revision}
            locked={Boolean(lockedReason)}
            // Rights can change after text approval; acknowledging them is the
            // one media action still open until the DRAFT exists.
            rightsAckOpen={
              !candidate.publishedContentItemId &&
              candidate.reviewStatus !== "rejected"
            }
            descriptor={row.descriptor}
            slot={row.slot}
            slotKey={row.slotKey}
            findings={[
              ...readiness.blockers.filter((f) => f.slotKey === row.slotKey),
              ...readiness.warnings.filter((f) => f.slotKey === row.slotKey),
            ]}
            onConflict={() => setConflictNotice(CONFLICT_NOTICE)}
            onActionSucceeded={() => setConflictNotice(null)}
          />
        ))}
      </div>

      <div className="mt-3">
        <MediaEventHistory events={candidate.mediaEvents ?? []} />
      </div>
    </section>
  );
}

/** The answer-visibility check, said plainly. Silent when nobody looked. */
function VisualCheckNote({
  check,
  attached = false,
}: {
  check?: { status: string; evidence?: string } | null;
  attached?: boolean;
}) {
  if (!check || check.status === "unchecked") return null;
  if (check.status === "leaks") {
    return (
      <p
        className="mt-1 rounded bg-red-50 p-1 text-xs font-semibold text-red-700"
        data-testid="media-visual-leak"
      >
        تكشف الإجابة{check.evidence ? `: ${check.evidence}` : ""}
      </p>
    );
  }
  return attached ? (
    <p className="mt-1 text-xs text-emerald-700" data-testid="media-visual-clear">
      فحصناها: ما فيها كتابة تكشف الإجابة. القرار الأخير لك.
    </p>
  ) : null;
}

function MediaSlotCard({
  candidate,
  revision,
  locked,
  rightsAckOpen,
  descriptor,
  slot,
  slotKey,
  findings,
  onConflict,
  onActionSucceeded,
}: {
  candidate: ReviewCandidate;
  revision: number;
  locked: boolean;
  rightsAckOpen: boolean;
  descriptor: CandidateMediaSlotDescriptor | null;
  slot: CandidateMediaSlot | null;
  slotKey: string;
  findings: CandidateMediaFinding[];
  onConflict: () => void;
  onActionSucceeded: () => void;
}) {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [reasonCode, setReasonCode] = useState("WRONG_SUBJECT");
  const [explanation, setExplanation] = useState("");
  const [ackNote, setAckNote] = useState("");
  const [error, setError] = useState<ActionError | null>(null);

  const detailKey = ["content-engine-review-detail", candidate.candidateId];
  const onSuccess = (updated: ReviewCandidate) => {
    setError(null);
    onActionSucceeded();
    client.setQueryData(detailKey, updated);
    void client.invalidateQueries({ queryKey: ["content-engine-review"] });
  };
  const onError = (err: unknown) => {
    const failure = toActionError(err);
    // Someone else changed this candidate's media: reload it. The new
    // revision remounts this card, so the decision has to be made again; the
    // panel keeps the notice that says so.
    if (failure.conflict && failure.code === "MEDIA_REVISION_CONFLICT") {
      setError(null);
      onConflict();
      void client.invalidateQueries({ queryKey: detailKey });
      return;
    }
    setError(failure);
    if (failure.conflict) void client.invalidateQueries({ queryKey: detailKey });
  };

  const mutation = useMutation({
    mutationFn: (
      action:
        | { kind: "attach"; file: File }
        | { kind: "suggestion"; downloadUrl: string }
        | { kind: "approve" }
        | { kind: "reject"; reasonCode: string; explanation: string }
        | { kind: "acknowledge"; note: string },
    ) => {
      switch (action.kind) {
        case "attach":
          return api.attachCandidateMedia(
            candidate.candidateId,
            slotKey,
            revision,
            action.file,
          );
        case "suggestion":
          return api.chooseCandidateMediaSuggestion(
            candidate.candidateId,
            slotKey,
            {
              expectedMediaReviewRevision: revision,
              downloadUrl: action.downloadUrl,
            },
          );
        case "approve":
          return api.reviewCandidateMedia(candidate.candidateId, slotKey, {
            expectedMediaReviewRevision: revision,
            status: "approved",
          });
        case "reject":
          return api.reviewCandidateMedia(candidate.candidateId, slotKey, {
            expectedMediaReviewRevision: revision,
            status: "rejected",
            reasonCode: action.reasonCode,
            explanation: action.explanation,
          });
        case "acknowledge":
          return api.acknowledgeCandidateMediaRights(
            candidate.candidateId,
            slotKey,
            { expectedMediaReviewRevision: revision, note: action.note },
          );
      }
    },
    onSuccess,
    onError,
  });

  const required = descriptor ? descriptor.required : (slot?.required ?? false);
  const gameplay = descriptor
    ? descriptor.purpose === "gameplay"
    : slot?.purpose === "gameplay";
  const assetUrl = slot?.status === "resolved" ? slot.asset?.url?.trim() : "";
  const reviewIsCurrent = Boolean(
    slot?.review && assetUrl && slot.review.assetUrl === assetUrl,
  );
  const rightsStatus = slot?.rights?.status ?? (assetUrl ? "UNKNOWN" : null);
  // Unacknowledged on a drafted asset it is a blocker; once acknowledged (or
  // when the draft does not carry the asset) it is a warning.
  const rightsWarning = findings.find(
    (finding) =>
      finding.code === "MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED" ||
      finding.code === "MEDIA_RIGHTS_NOT_CLEARED",
  );
  const rightsAckRequired =
    rightsWarning?.code === "MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED";
  const uploadSupported = descriptor ? descriptor.uploadSupported : false;
  const busy = mutation.isPending;

  return (
    <article
      // Gameplay media is the question's stimulus; decorative artwork is not.
      className={`rounded-md border p-3 ${
        required && gameplay
          ? "border-primary/40 bg-primary/5"
          : "border-dashed bg-muted/30"
      }`}
      data-purpose={required && gameplay ? "gameplay" : "decorative"}
      data-testid={`media-slot-${slotKey}`}
    >
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{slotKey}</span>
        {required && gameplay ? (
          <Badge data-testid="media-slot-purpose">وسائط لعب مطلوبة</Badge>
        ) : (
          <Badge variant="outline" data-testid="media-slot-purpose">
            عمل فني زخرفي (اختياري)
          </Badge>
        )}
        {descriptor && (
          <span className="text-xs text-muted-foreground">
            {descriptor.mediaType === "audio" ? "صوت" : "صورة"}
          </span>
        )}
        {!descriptor && (
          <Badge variant="outline">خارج عقد الوسائط — لا يُحتسب</Badge>
        )}
      </header>

      {!slot ? (
        <p className="text-sm text-muted-foreground" data-testid="media-slot-missing">
          لا توجد وسائط لهذه الخانة بعد.
        </p>
      ) : !assetUrl ? (
        <p className="text-sm text-muted-foreground" data-testid="media-slot-waiting">
          {FAILURE_REASON_LABELS[slot.failureReason ?? ""] ??
            `الحالة: ${slot.status}${slot.failureReason ? ` (${slot.failureReason})` : ""}`}
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          <MediaPreview url={assetUrl} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">المصدر</dt>
            <dd data-testid="media-slot-provenance">
              {slot.provenance?.acquisition ?? "—"} ·{" "}
              {slot.provenance?.provider ?? "—"}
            </dd>
            {slot.provenance?.sourceUrl && (
              <>
                <dt className="text-muted-foreground">الرابط الأصلي</dt>
                <dd className="break-all font-mono">{slot.provenance.sourceUrl}</dd>
              </>
            )}
            {slot.provenance?.retrievedAt && (
              <>
                <dt className="text-muted-foreground">وقت الجلب</dt>
                <dd>{slot.provenance.retrievedAt}</dd>
              </>
            )}
            {slot.asset?.width && slot.asset?.height && (
              <>
                <dt className="text-muted-foreground">الأبعاد</dt>
                <dd>
                  {slot.asset.width}×{slot.asset.height}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">الحقوق</dt>
            <dd>
              <Badge
                variant={
                  rightsStatus === "BLOCKED"
                    ? "destructive"
                    : rightsStatus === "CLEARED"
                      ? "secondary"
                      : "outline"
                }
                data-testid="media-slot-rights"
              >
                {RIGHTS_LABELS[rightsStatus ?? "UNKNOWN"] ?? rightsStatus}
              </Badge>
            </dd>
            <MediaRecordRows slot={slot} />
            <dt className="text-muted-foreground">مراجعة الوسائط</dt>
            <dd data-testid="media-slot-review">
              {reviewIsCurrent
                ? slot.review!.status === "approved"
                  ? `معتمدة (${slot.review!.actorEmail})`
                  : slot.review!.status === "rejected"
                    ? `مرفوضة (${slot.review!.actorEmail}): ${slot.review!.explanation ?? ""}`
                    : "بانتظار المراجعة"
                : "بانتظار المراجعة"}
            </dd>
          </dl>
        </div>
      )}

      {rightsStatus === "BLOCKED" && (
        <p
          role="alert"
          className="mt-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive"
          data-testid="media-rights-blocked"
        >
          الحقوق محظورة: مانع صارم للاعتماد. استبدل الوسائط أو صحّح سجل الحقوق
          بالأدلة؛ لا يمكن الإقرار بهذا التحذير.
        </p>
      )}
      {rightsWarning && (
        <p
          className="mt-2 rounded-md bg-amber-500/10 p-2 text-sm"
          data-testid="media-rights-warning"
        >
          {rightsWarning.acknowledged
            ? `تم الإقرار بحالة الحقوق (${rightsWarning.rightsStatus}). الإقرار لا يغيّر حالة الترخيص.`
            : rightsAckRequired
              ? `حالة الحقوق ${rightsWarning.rightsStatus}: مانع للاعتماد وإنشاء المسودة حتى يقرّ المشرف صراحة. الإقرار لا يُخلي الحقوق.`
              : `حالة الحقوق ${rightsWarning.rightsStatus}: تحذير؛ هذه الوسائط لا تُنقل إلى المسودة.`}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive"
          data-testid="media-action-error"
        >
          {error.message}
        </p>
      )}

      {assetUrl && <VisualCheckNote check={slot?.visualCheck} attached />}

      {!locked && (slot?.suggestions?.length ?? 0) > 0 && (
        <section className="mt-3" data-testid="media-suggestions">
          <h4 className="mb-1 text-sm font-semibold">
            صور مقترحة ({slot?.suggestions?.length})
          </h4>
          <p className="mb-2 text-xs text-muted-foreground">
            {assetUrl
              ? "لو الصورة الحالية ما تناسب، اختر وحدة من هذي. الاختيار يلغي اعتماد الصورة الحالية والإقرار بحقوقها."
              : "اختر الصورة اللي تناسب السؤال، وبعدها راجعها واعتمدها."}
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slot?.suggestions?.map((suggestion) => (
              <li
                key={suggestion.downloadUrl}
                className="space-y-1 rounded-md border bg-background p-2"
                data-testid="media-suggestion"
              >
                {/* A remote preview only; the stored copy is made on choosing. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={suggestion.previewUrl ?? suggestion.downloadUrl}
                  alt={suggestion.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-28 w-full rounded object-cover"
                />
                <p className="truncate text-xs" title={suggestion.title}>
                  {suggestion.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {PROVIDER_LABELS[suggestion.provider] ?? suggestion.provider} ·{" "}
                  {suggestion.width}×{suggestion.height}
                </p>
                <VisualCheckNote check={suggestion.visualCheck} />
                {suggestion.provider === "brave-search" && (
                  <p className="text-xs text-amber-700" data-testid="media-suggestion-web">
                    من بحث الويب: الترخيص غير معروف، تأكد من المصدر قبل ما تعتمدها.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      mutation.mutate({
                        kind: "suggestion",
                        downloadUrl: suggestion.downloadUrl,
                      })
                    }
                  >
                    استخدم هذي
                  </Button>
                  <a
                    href={suggestion.pageUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs underline"
                  >
                    المصدر والترخيص
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!locked && descriptor && !uploadSupported && (
        <p
          className="mt-2 rounded-md bg-muted p-2 text-sm"
          data-testid="media-slot-unsupported"
        >
          {UNSUPPORTED_REASON_LABELS[descriptor.uploadUnsupportedReason ?? ""] ??
            "تعبئة هذه الخانة غير مدعومة بعد."}
        </p>
      )}

      {!locked && descriptor && uploadSupported && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              aria-label={`ملف صورة للخانة ${slotKey}`}
              className="max-w-xs"
              disabled={busy}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              size="sm"
              disabled={!file || busy}
              onClick={() => file && mutation.mutate({ kind: "attach", file })}
            >
              {assetUrl ? "استبدال الصورة" : "رفع الصورة"}
            </Button>
            {assetUrl && (
              <span className="text-xs text-muted-foreground">
                الاستبدال يلغي اعتماد الوسائط والإقرار بالحقوق الحاليين.
              </span>
            )}
          </div>

          {assetUrl && !reviewIsCurrent && rightsStatus !== "BLOCKED" && (
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => mutation.mutate({ kind: "approve" })}
              >
                اعتماد الوسائط
              </Button>
            </div>
          )}

          {assetUrl && !(reviewIsCurrent && slot?.review?.status === "rejected") && (
            <fieldset className="space-y-2" disabled={busy}>
              <legend className="text-sm font-medium">رفض الوسائط</legend>
              <select
                aria-label="سبب الرفض"
                className="rounded-md border bg-background px-2 py-1 text-sm"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
              >
                {REJECTION_REASONS.map((reason) => (
                  <option key={reason.code} value={reason.code}>
                    {reason.label}
                  </option>
                ))}
              </select>
              <Textarea
                aria-label="شرح رفض الوسائط"
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={!explanation.trim() || busy}
                onClick={() =>
                  mutation.mutate({
                    kind: "reject",
                    reasonCode,
                    explanation: explanation.trim(),
                  })
                }
              >
                رفض الوسائط
              </Button>
            </fieldset>
          )}

        </div>
      )}

      {rightsAckOpen && descriptor && rightsAckRequired && (
        <fieldset className="mt-3 space-y-2" disabled={busy}>
          <legend className="text-sm font-medium">الإقرار بتحذير الحقوق</legend>
          <Textarea
            aria-label="ملاحظة الإقرار بالحقوق"
            value={ackNote}
            onChange={(event) => setAckNote(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!ackNote.trim() || busy}
            onClick={() =>
              mutation.mutate({ kind: "acknowledge", note: ackNote.trim() })
            }
          >
            أقر بالتحذير (لا يغيّر حالة الترخيص)
          </Button>
        </fieldset>
      )}
    </article>
  );
}
