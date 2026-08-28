"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  DISTRIBUTED_MERGES,
  type DistributedFormState,
  type DistributedMergeKey,
  type DistributedSegmentFormState,
} from "../../services/content-item-form.service";

const SEGMENT_LABEL: Record<DistributedSegmentFormState["id"], string> = {
  A: "المعلومة أ",
  B: "المعلومة ب",
  C: "المعلومة ج",
};

export const DISTRIBUTED_SAFETY_CONFIRMATION =
  "راجعت التوزيع، ولا يستطيع لاعب واحد حل اللغز بمفرده.";

/**
 * Authoring a "ركّبها" item.
 *
 * Three fixed segments, the two-player splits the author certifies as safe, and
 * a preview of what each phone will actually show. Everything is submitted as a
 * native mechanicPayload; nothing is encoded into a note or a JSON string field.
 */
export function DistributedInformationFields({
  value,
  onChange,
  answerMode,
}: {
  value: DistributedFormState;
  onChange: (value: DistributedFormState) => void;
  answerMode: string;
}) {
  const set = (patch: Partial<DistributedFormState>) =>
    onChange({ ...value, ...patch });
  const setSegment = (
    id: DistributedSegmentFormState["id"],
    patch: Partial<DistributedSegmentFormState>,
  ) =>
    set({
      segments: value.segments.map((segment) =>
        segment.id === id ? { ...segment, ...patch } : segment,
      ),
    });
  const toggleMerge = (key: DistributedMergeKey) =>
    set({
      mergeKeys: value.mergeKeys.includes(key)
        ? value.mergeKeys.filter((entry) => entry !== key)
        : [...value.mergeKeys, key],
    });

  return (
    <section className="space-y-5 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div>
        <h3 className="font-semibold">إعداد ركّبها</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          سؤال واحد يراه الفريق كله، وثلاث معلومات خاصة تُوزّع على اللاعبين. لا
          يستطيع لاعب واحد حل اللغز بمعلوماته وحدها.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">السؤال العام (عربي)</span>
          <Input
            value={value.publicPromptAr}
            onChange={(event) => set({ publicPromptAr: event.target.value })}
            placeholder="من هو اللاعب؟"
            aria-label="السؤال العام (عربي)"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">
            السؤال العام (إنجليزي، اختياري)
          </span>
          <Input
            value={value.publicPromptEn}
            onChange={(event) => set({ publicPromptEn: event.target.value })}
            aria-label="السؤال العام (إنجليزي)"
          />
        </label>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">المعلومات الخاصة الثلاث</p>
        {value.segments.map((segment) => (
          <div
            key={segment.id}
            className="space-y-2 rounded-lg border bg-background p-3"
          >
            <p className="text-sm font-black text-violet-800">
              {SEGMENT_LABEL[segment.id]}
            </p>
            <Textarea
              value={segment.contentAr}
              onChange={(event) =>
                setSegment(segment.id, { contentAr: event.target.value })
              }
              rows={2}
              aria-label={`${SEGMENT_LABEL[segment.id]} (عربي)`}
              placeholder="المعلومة التي يراها لاعب واحد فقط"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={segment.contentEn}
                onChange={(event) =>
                  setSegment(segment.id, { contentEn: event.target.value })
                }
                aria-label={`${SEGMENT_LABEL[segment.id]} (إنجليزي)`}
                placeholder="اختياري"
              />
              <Input
                value={segment.imageUrl}
                onChange={(event) =>
                  setSegment(segment.id, { imageUrl: event.target.value })
                }
                aria-label={`صورة ${SEGMENT_LABEL[segment.id]}`}
                placeholder="رابط صورة اختياري"
              />
              <Input
                value={segment.audioUrl}
                onChange={(event) =>
                  setSegment(segment.id, { audioUrl: event.target.value })
                }
                aria-label={`صوت ${SEGMENT_LABEL[segment.id]}`}
                placeholder="رابط صوت اختياري"
              />
            </div>
            {segment.imageUrl.trim() && segment.audioUrl.trim() && (
              <p className="text-xs text-muted-foreground">
                عند وجود صورة وصوت معًا، تُعرض الصورة.
              </p>
            )}
          </div>
        ))}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          التوزيع الآمن لفريق من لاعبين
        </legend>
        <p className="text-xs text-muted-foreground">
          يأخذ لاعب معلومتين والآخر المعلومة الباقية. اختر كل توزيع تراه آمناً.
        </p>
        {(Object.keys(DISTRIBUTED_MERGES) as DistributedMergeKey[]).map(
          (key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={value.mergeKeys.includes(key)}
                onCheckedChange={() => toggleMerge(key)}
                aria-label={DISTRIBUTED_MERGES[key].label}
              />
              <span className="font-bold">{DISTRIBUTED_MERGES[key].label}</span>
            </label>
          ),
        )}
      </fieldset>

      <label className="space-y-1 block">
        <span className="text-sm font-medium">ملاحظات المحرّر (اختياري)</span>
        <Textarea
          value={value.explanation}
          onChange={(event) => set({ explanation: event.target.value })}
          rows={2}
          aria-label="ملاحظات المحرّر"
        />
      </label>

      <DistributedPreview value={value} answerMode={answerMode} />

      <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
        <Checkbox
          checked={value.safetyConfirmed}
          onCheckedChange={(checked: boolean | "indeterminate") =>
            set({ safetyConfirmed: checked === true })
          }
          aria-label={DISTRIBUTED_SAFETY_CONFIRMATION}
        />
        <span className="font-bold text-amber-900">
          {DISTRIBUTED_SAFETY_CONFIRMATION}
        </span>
      </label>
    </section>
  );
}

/**
 * What the phones will show. An authoring aid, not a runtime: it uses the same
 * distribution rules the server follows, and never shows the correct answer.
 */
function DistributedPreview({
  value,
  answerMode,
}: {
  value: DistributedFormState;
  answerMode: string;
}) {
  const [teamSize, setTeamSize] = useState<2 | 3>(3);
  const merge = value.mergeKeys.length
    ? DISTRIBUTED_MERGES[value.mergeKeys[0]]
    : undefined;
  const holdings: Array<Array<"A" | "B" | "C">> =
    teamSize === 3
      ? [["A"], ["B"], ["C"]]
      : merge
        ? [merge.first, merge.second]
        : [];
  const segmentOf = (id: "A" | "B" | "C") =>
    value.segments.find((segment) => segment.id === id);
  const contentOf = (id: "A" | "B" | "C") => segmentOf(id)?.contentAr ?? "";

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">معاينة الهواتف</span>
        {([2, 3] as const).map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => setTeamSize(size)}
            aria-pressed={teamSize === size}
            className={cn(
              "rounded-lg px-3 py-1 text-xs font-bold transition",
              teamSize === size
                ? "bg-violet-600 text-white"
                : "bg-muted text-muted-foreground",
            )}
          >
            {size === 2 ? "فريق من لاعبين" : "فريق من 3 لاعبين"}
          </button>
        ))}
      </div>

      {holdings.length ? (
        <ul className="grid gap-3 sm:grid-cols-3">
          {holdings.map((held, index) => (
            <li
              key={index}
              data-preview-phone={index + 1}
              className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3"
            >
              <p className="text-xs font-bold text-violet-700">
                لاعب {index + 1}
              </p>
              <p className="text-sm font-black">
                {value.publicPromptAr || "السؤال العام"}
              </p>
              <p className="text-[11px] font-bold text-amber-800">
                معلوماتك الخاصة
              </p>
              <ul className="space-y-1">
                {held.map((id) => {
                  const segment = segmentOf(id);
                  const hasImage = Boolean(segment?.imageUrl.trim());
                  const hasAudio = !hasImage && Boolean(segment?.audioUrl.trim());
                  return (
                    <li
                      key={id}
                      className="space-y-1 rounded bg-white p-2 text-xs font-bold shadow-sm"
                    >
                      {hasImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={segment!.imageUrl.trim()}
                          alt=""
                          data-testid={`distributed-preview-image-${id}`}
                          className="h-16 w-full rounded object-cover"
                        />
                      )}
                      {hasAudio && (
                        <span
                          data-testid={`distributed-preview-audio-${id}`}
                          className="inline-block rounded bg-violet-100 px-2 py-0.5 text-[10px] text-violet-700"
                        >
                          مقطع صوتي خاص
                        </span>
                      )}
                      <span className="block">
                        {contentOf(id) || `المعلومة ${id}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {index === 0 ? (
                <p className="rounded bg-violet-600 p-2 text-center text-[11px] font-black text-white">
                  أنت المجيب في هذا اللغز
                  <span className="mt-1 block font-bold">
                    {answerMode === "multiple_choice"
                      ? "أزرار الاختيارات"
                      : answerMode === "closest"
                        ? "حقل رقمي"
                        : "حقل نصي"}
                  </span>
                </p>
              ) : (
                <p className="rounded bg-muted p-2 text-center text-[11px] font-bold text-muted-foreground">
                  ناقش معلوماتك مع فريقك
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          اختر توزيعاً آمناً لعرض معاينة فريق من لاعبين.
        </p>
      )}
    </div>
  );
}
