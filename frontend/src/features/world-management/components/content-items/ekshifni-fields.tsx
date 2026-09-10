"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import {
  EKSHIFNI_REGION_ROLES,
  EKSHIFNI_ROLE_LABEL,
  type EkshifniFormState,
  type EkshifniRegionRole,
} from "../../services/content-item-form.service";

/**
 * Authoring the six windows onto one celebrity.
 *
 * Geometry is entered as a fraction of the image rather than in pixels, because
 * the same authored mask has to land on the same eye on a television and on a
 * 390-wide phone. The role is the author's own vocabulary — it is what makes it
 * checkable that the six windows cover a face rather than six patches of
 * background — and a player never sees it: on the board these become the numbers
 * 1 to 6, in this order.
 */
export function EkshifniFields({
  value,
  acceptedAnswers,
  imageUrl,
  onChange,
  onAcceptedAnswersChange,
}: {
  value: EkshifniFormState;
  acceptedAnswers: string;
  /** The item's own canonical image, so the boxes can be placed against it. */
  imageUrl?: string;
  onChange: (next: EkshifniFormState) => void;
  onAcceptedAnswersChange: (next: string) => void;
}) {
  const [active, setActive] = useState(0);
  const setRegion = (
    index: number,
    patch: Partial<EkshifniFormState["regions"][number]>,
  ) =>
    onChange({
      ...value,
      regions: value.regions.map((region, regionIndex) =>
        regionIndex === index ? { ...region, ...patch } : region,
      ),
    });

  return (
    <section
      className="space-y-4 rounded-xl border p-4"
      data-testid="ekshifni-fields"
      dir="rtl"
    >
      <div>
        <h3 className="font-bold">اكشفني</h3>
        <p className="text-xs text-muted-foreground">
          ستة أجزاء تُكشف فوق صورة المشهور. الأبعاد نسبة من الصورة (بين 0 و 1)
          حتى تظهر نفس المنطقة على الشاشة والجوال. أرقام اللاعبين 1 إلى 6 تتبع
          هذا الترتيب — نوع الجزء لا يظهر لأحد.
        </p>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-semibold">اسم المشهور (الإجابة المستهدفة)</span>
        <Input
          value={value.targetAnswer}
          onChange={(event) =>
            onChange({ ...value, targetAnswer: event.target.value })
          }
          placeholder="فيروز"
          data-testid="ekshifni-target-answer"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-semibold">الإجابات المقبولة</span>
        <Textarea
          rows={3}
          value={acceptedAnswers}
          placeholder={"فيروز\nنهاد حداد\nFairuz"}
          onChange={(event) => onAcceptedAnswersChange(event.target.value)}
          data-testid="ekshifni-accepted-answers"
        />
        <p className="text-xs text-muted-foreground">
          صيغة في كل سطر. تُستخدم لمطابقة الطرق الصحيحة لكتابة اسم المشهور.
        </p>
      </label>
      {/* Numbers on a photograph, at the size the room will see them. Six sets
          of four decimals are checkable but not authorable — a producer needs to
          see that box 1 is actually on the eyes before publishing. */}
      <EkshifniGeometryPreview
        imageUrl={imageUrl}
        regions={value.regions}
        activeIndex={active}
        onSelect={setActive}
      />

      <div className="grid gap-3 md:grid-cols-2">
        {value.regions.map((region, index) => (
          <fieldset
            key={index}
            onFocusCapture={() => setActive(index)}
            className={cn(
              "grid gap-2 rounded-lg border p-3",
              active === index && "border-primary ring-1 ring-primary/40",
            )}
            data-testid={`ekshifni-region-${index + 1}`}
          >
            <legend className="px-1 text-sm font-bold">
              الجزء {index + 1}
            </legend>
            <Input
              aria-label={`معرف الجزء ${index + 1}`}
              value={region.localId}
              onChange={(event) =>
                setRegion(index, { localId: event.target.value })
              }
              placeholder="region-1"
              dir="ltr"
            />
            <select
              aria-label={`نوع الجزء ${index + 1}`}
              value={region.role}
              onChange={(event) =>
                setRegion(index, {
                  role: event.target.value as EkshifniRegionRole,
                })
              }
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {EKSHIFNI_REGION_ROLES.map((role) => (
                <option key={role} value={role}>
                  {EKSHIFNI_ROLE_LABEL[role]}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-4 gap-2">
              {/* Labelled above the field, not in the placeholder: a placeholder
                  disappears the moment the box has a value, which is exactly
                  when an author is comparing four decimals. */}
              {(
                [
                  ["x", "س"],
                  ["y", "ص"],
                  ["width", "العرض"],
                  ["height", "الارتفاع"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="space-y-1">
                  <span className="block text-[11px] font-bold text-muted-foreground">
                    {label}
                  </span>
                  <Input
                    aria-label={`${label} للجزء ${index + 1}`}
                    value={region[key]}
                    onChange={(event) =>
                      setRegion(index, { [key]: event.target.value })
                    }
                    placeholder="0.00"
                    inputMode="decimal"
                    dir="ltr"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}

/**
 * The six boxes, drawn on the picture they belong to.
 *
 * Read-only on purpose: the numbers in the fields stay the single source of
 * truth, and this only shows the author what those numbers mean. Selecting a box
 * scrolls attention to that region rather than editing it, so there is no second
 * way to author geometry and no chance of the two disagreeing.
 */
function EkshifniGeometryPreview({
  imageUrl,
  regions,
  activeIndex,
  onSelect,
}: {
  imageUrl?: string;
  regions: EkshifniFormState["regions"];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const src = getMediaUrl(imageUrl) || "";
  const fraction = (raw: string) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0;
  };
  if (!src) {
    return (
      <p
        className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground"
        data-testid="ekshifni-preview-empty"
      >
        أضف صورة المشهور أولاً لتشوف مواضع الأجزاء عليها.
      </p>
    );
  }
  return (
    <div
      className="relative mx-auto inline-block max-w-full overflow-hidden rounded-lg border"
      data-testid="ekshifni-preview"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="صورة المشهور" className="block max-h-80 w-auto" />
      {regions.map((region, index) => (
        <button
          type="button"
          key={index}
          onClick={() => onSelect(index)}
          data-testid={`ekshifni-preview-region-${index + 1}`}
          className={cn(
            "absolute grid place-items-center rounded border-2 text-lg font-black",
            activeIndex === index
              ? "border-brand-gold bg-brand-gold/30 text-foreground"
              : "border-primary/70 bg-primary/40 text-primary-foreground",
          )}
          style={{
            left: `${fraction(region.x) * 100}%`,
            top: `${fraction(region.y) * 100}%`,
            width: `${fraction(region.width) * 100}%`,
            height: `${fraction(region.height) * 100}%`,
          }}
        >
          {index + 1}
        </button>
      ))}
    </div>
  );
}
