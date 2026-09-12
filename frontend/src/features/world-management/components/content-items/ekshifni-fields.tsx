"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EkshifniBoard } from "@/components/akwaan/ekshifni-board";
import { EkshifniRegionEditor } from "./ekshifni-region-editor";
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
  /** Which windows the preview shows open, so the author can rehearse a turn. */
  const [previewOpen, setPreviewOpen] = useState<number[]>([]);
  const togglePreview = (index: number) =>
    setPreviewOpen((open) =>
      open.includes(index)
        ? open.filter((entry) => entry !== index)
        : [...open, index],
    );
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
      {/* Place the windows by dragging them on the photograph. Six sets of four
          decimals are checkable but not authorable — a producer needs to see
          that window 1 is actually on the eyes before publishing. */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-muted-foreground">
          اسحب المربع لتحريكه، واسحب الزوايا لتغيير حجمه.
        </p>
        <EkshifniRegionEditor
          imageUrl={imageUrl}
          regions={value.regions}
          activeIndex={active}
          onSelect={setActive}
          onChange={(index, box) =>
            setRegion(index, {
              x: String(box.x),
              y: String(box.y),
              width: String(box.width),
              height: String(box.height),
            })
          }
        />
      </div>

      {/* The same board the room sees, from the same component — so what an
          author checks here is the presentation itself, not a second reading of
          the same numbers. */}
      {imageUrl ? (
        <div className="space-y-2" data-testid="ekshifni-runtime-preview">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">
              معاينة اللعب
            </span>
            {value.regions.map((_region, index) => (
              <button
                key={index}
                type="button"
                onClick={() => togglePreview(index)}
                data-testid={`ekshifni-preview-toggle-${index + 1}`}
                aria-pressed={previewOpen.includes(index)}
                className={cn(
                  "akwaan-numeral size-8 rounded-md border text-sm font-black",
                  previewOpen.includes(index)
                    ? "border-brand-gold bg-brand-gold/20"
                    : "border-border bg-card",
                )}
              >
                {index + 1}
              </button>
            ))}
            {previewOpen.length > 0 && (
              <button
                type="button"
                onClick={() => setPreviewOpen([])}
                className="text-xs font-bold text-muted-foreground underline"
              >
                إعادة التغطية
              </button>
            )}
          </div>
          <EkshifniBoard
            url={imageUrl}
            altText="معاينة"
            imageClassName="max-h-80"
            regions={value.regions.map((region, index) => ({
              id: region.localId || `region-${index + 1}`,
              number: index + 1,
              revealed: previewOpen.includes(index),
              shape: {
                x: Number(region.x) || 0,
                y: Number(region.y) || 0,
                width: Number(region.width) || 0,
                height: Number(region.height) || 0,
              },
            }))}
          />
        </div>
      ) : null}

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
