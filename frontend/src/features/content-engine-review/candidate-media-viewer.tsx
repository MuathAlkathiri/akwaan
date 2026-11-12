"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getMediaUrl } from "@/lib/api/media-url";
import type { CandidateMediaEvent, CandidateMediaSlot } from "./types";

/**
 * §30.22 Phase 3B-3 — read-only presentation for the media panel: the
 * full-size viewer, the provenance and rights record, and the media history.
 *
 * Nothing here is inferred. A field the server did not send is either omitted
 * or shown as "not recorded"; it is never filled with a plausible value.
 */

/** Deliberately neutral: an alt text naming the subject would leak the answer. */
const NEUTRAL_ALT = "معاينة وسائط المرشح";
const NOT_RECORDED = "غير مسجّل";

/**
 * Thumbnail that opens a full-size viewer. "Fit" scales the whole image into
 * the viewport; "actual size" shows it pixel for pixel in a scrollable frame.
 * Both keep the native aspect ratio — nothing is cropped or stretched.
 */
export function MediaPreview({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const src = getMediaUrl(url);

  return (
    <>
      <button
        type="button"
        className="group relative block rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(true)}
        aria-label="عرض الصورة بالحجم الكامل"
        data-testid="media-preview-open"
      >
        {/* Backend-hosted upload; next/image cannot optimize arbitrary origins. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={NEUTRAL_ALT}
          className="max-h-48 max-w-xs object-contain"
          data-testid="media-slot-preview"
        />
        <span className="absolute bottom-1 start-1 rounded bg-background/80 px-1.5 py-0.5 text-[11px]">
          تكبير
        </span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setActualSize(false);
        }}
      >
        <DialogContent
          // Explicit width: a dialog sized to its content would shrink the
          // "fit" view to a fraction of the screen.
          className="max-h-[95vh] w-[95vw] max-w-[95vw] sm:max-w-[95vw]"
          data-testid="media-preview-dialog"
        >
          <DialogTitle>الصورة بالحجم الكامل</DialogTitle>
          <DialogDescription>
            {natural
              ? `الأبعاد الفعلية: ${natural.width}×${natural.height} بكسل`
              : "جارٍ تحميل الصورة…"}
          </DialogDescription>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={actualSize ? "outline" : "default"}
              aria-pressed={!actualSize}
              onClick={() => setActualSize(false)}
              data-testid="media-preview-fit"
            >
              ملاءمة الشاشة
            </Button>
            <Button
              type="button"
              size="sm"
              variant={actualSize ? "default" : "outline"}
              aria-pressed={actualSize}
              onClick={() => setActualSize(true)}
              data-testid="media-preview-actual"
            >
              الحجم الفعلي (1:1)
            </Button>
          </div>
          <div
            className={
              actualSize
                ? "max-h-[75vh] w-full overflow-auto rounded border"
                : "flex max-h-[75vh] w-full justify-center"
            }
            data-testid="media-preview-frame"
            data-mode={actualSize ? "actual" : "fit"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={NEUTRAL_ALT}
              onLoad={(event) =>
                setNatural({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              // Fit: bounded by the frame, ratio preserved. Actual: intrinsic
              // pixels, scrolled rather than scaled.
              className={
                actualSize
                  ? "max-w-none"
                  : "max-h-[75vh] max-w-full object-contain"
              }
              style={
                actualSize && natural
                  ? { width: natural.width, height: natural.height }
                  : undefined
              }
              data-testid="media-preview-full"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Rows for what the server recorded about the asset's origin and rights. */
export function MediaRecordRows({ slot }: { slot: CandidateMediaSlot }) {
  const provenance = slot.provenance;
  const rights = slot.rights;
  const rows: Array<{ label: string; value: string; testId: string; mono?: boolean }> = [];
  if (provenance?.finalUrl && provenance.finalUrl !== provenance.sourceUrl) {
    rows.push({ label: "الرابط النهائي", value: provenance.finalUrl, testId: "media-record-final-url", mono: true });
  }
  if (provenance?.redirects?.length) {
    rows.push({ label: "عمليات التحويل", value: String(provenance.redirects.length), testId: "media-record-redirects" });
  }
  if (typeof provenance?.byteSize === "number") {
    rows.push({ label: "الحجم", value: `${provenance.byteSize} بايت`, testId: "media-record-size" });
  }
  if (slot.asset?.sha256) {
    rows.push({ label: "بصمة SHA-256", value: `${slot.asset.sha256.slice(0, 16)}…`, testId: "media-record-sha", mono: true });
  }
  if (provenance?.model) {
    rows.push({ label: "النموذج", value: provenance.model, testId: "media-record-model", mono: true });
  }
  // Licence and holder are shown exactly as recorded, or as not recorded.
  rows.push({
    label: "ملاحظة الترخيص (من المصدر)",
    value: provenance?.licenceNote || NOT_RECORDED,
    testId: "media-record-licence-note",
  });
  rows.push({
    label: "الترخيص المسجّل",
    value: rights?.licence || NOT_RECORDED,
    testId: "media-record-licence",
  });
  rows.push({
    label: "صاحب الحقوق",
    value: rights?.rightsHolder || NOT_RECORDED,
    testId: "media-record-rights-holder",
  });
  rows.push({
    label: "مصدر حالة الحقوق",
    value:
      rights?.source === "media-rights"
        ? "سجل الحقوق"
        : rights?.source === "provider"
          ? "مزوّد الوسائط"
          : "لا يوجد سجل حقوق",
    testId: "media-record-rights-source",
  });
  if (slot.rightsAcknowledgement) {
    rows.push({
      label: "الإقرار بالحقوق",
      value: `${slot.rightsAcknowledgement.rightsStatus} · ${slot.rightsAcknowledgement.actorEmail} · ${slot.rightsAcknowledgement.note}`,
      testId: "media-record-acknowledgement",
    });
  }
  return (
    <>
      {rows.map((row) => (
        <div key={row.testId} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd
            className={row.mono ? "break-all font-mono" : undefined}
            data-testid={row.testId}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </>
  );
}

const EVENT_LABELS: Record<CandidateMediaEvent["action"], string> = {
  media_attached: "إرفاق وسائط",
  media_reviewed: "قرار مراجعة الوسائط",
  media_rights_acknowledged: "إقرار بالحقوق",
  media_reviews_invalidated: "سحب قرارات الوسائط بعد تعديل السؤال",
};

/** One factual sentence per event, built only from fields the event carries. */
function eventDetail(event: CandidateMediaEvent): string {
  const details = event.details ?? {};
  const parts: string[] = [];
  if (typeof details.status === "string") parts.push(`القرار: ${details.status}`);
  if (typeof details.reasonCode === "string") parts.push(`السبب: ${details.reasonCode}`);
  if (typeof details.rightsStatus === "string") parts.push(`حالة الحقوق: ${details.rightsStatus}`);
  if (details.afterApproval === true) parts.push("بعد اعتماد النص");
  const superseded = details.superseded as { assetUrl?: string | null } | null | undefined;
  if (superseded?.assetUrl) parts.push("استبدل وسائط سابقة");
  if (typeof details.reason === "string") parts.push(details.reason);
  return parts.join(" · ");
}

/** The candidate's media history, newest first. */
export function MediaEventHistory({ events }: { events: CandidateMediaEvent[] }) {
  if (!events.length) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="media-events-empty">
        لا يوجد سجل وسائط بعد.
      </p>
    );
  }
  const ordered = [...events].sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );
  return (
    <details className="rounded-md border p-2 text-sm" data-testid="media-events">
      <summary className="cursor-pointer font-medium">
        سجل الوسائط ({events.length})
      </summary>
      <ol className="mt-2 space-y-1.5">
        {ordered.map((event, index) => (
          <li
            key={`${event.occurredAt}-${index}`}
            className="text-xs"
            data-testid="media-event"
          >
            <span className="font-medium">{EVENT_LABELS[event.action] ?? event.action}</span>
            {" · "}
            <span className="font-mono">{event.slotKeys.join(", ")}</span>
            {" · "}
            {event.actorEmail}
            {" · "}
            <time dateTime={event.occurredAt}>{event.occurredAt}</time>
            {" · "}
            مراجعة الوسائط {event.mediaReviewRevision}
            {eventDetail(event) ? ` — ${eventDetail(event)}` : ""}
          </li>
        ))}
      </ol>
    </details>
  );
}
