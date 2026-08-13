"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  TOP5_RANKED_COUNT,
  type Top5EntryFormState,
  type Top5FormState,
} from "../../services/content-item-form.service";

/**
 * Authoring one Top 5 item.
 *
 * Ten entries, each classified once as a rank or a trap. There is no separate
 * trap list to keep in sync with the ranked list, and no variant selector —
 * "أفضل 5" has exactly one way to be played. The server enforces the counts; this
 * form only makes the right shape easy to reach.
 */
export function Top5Fields({
  value,
  onChange,
}: {
  value: Top5FormState;
  onChange: (value: Top5FormState) => void;
}) {
  const set = (patch: Partial<Top5FormState>) =>
    onChange({ ...value, ...patch });
  const setEntry = (index: number, patch: Partial<Top5EntryFormState>) =>
    set({
      entries: value.entries.map((entry, position) =>
        position === index ? { ...entry, ...patch } : entry,
      ),
    });

  const rankedCount = value.entries.filter(
    (entry) => entry.classification !== "trap",
  ).length;

  return (
    <section className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div>
        <h3 className="font-semibold">محتوى أفضل 5</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          عشرة مداخل: خمسة حقيقية بترتيب من 1 إلى 5، وخمسة فخاخ. يقرر كل فريق في
          دوره أن يحتفظ بالبطاقة أو يدسّها لخصمه.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان القائمة">
          <Input
            value={value.title}
            placeholder="مثال: أكثر 5 أندية تحقيقاً للبطولات"
            onChange={(event) => set({ title: event.target.value })}
          />
        </Field>
        <Field label="تعليمات تظهر للاعبين">
          <Input
            value={value.instruction}
            placeholder="احتفظ بها أو دسّها للخصم"
            onChange={(event) => set({ instruction: event.target.value })}
          />
        </Field>
        <Field label="أساس الترتيب">
          <Input
            value={value.rankingBasis}
            placeholder="مثال: عدد البطولات الرسمية"
            onChange={(event) => set({ rankingBasis: event.target.value })}
          />
        </Field>
        <Field label="المصدر">
          <Input
            value={value.sourceLabel}
            placeholder="اسم الجهة أو التقرير الرسمي"
            onChange={(event) => set({ sourceLabel: event.target.value })}
          />
        </Field>
        <Field label="رابط المصدر">
          <Input
            type="url"
            value={value.sourceUrl}
            placeholder="https://example.com/ranking"
            onChange={(event) => set({ sourceUrl: event.target.value })}
          />
        </Field>
        <Field label="تاريخ البيانات">
          <Input
            type="date"
            value={value.asOfDate}
            onChange={(event) => set({ asOfDate: event.target.value })}
          />
        </Field>
      </div>

      <div>
        <h4 className="font-medium">المداخل العشرة</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          عيّن ترتيباً مختلفاً من 1 إلى {TOP5_RANKED_COUNT} لخمسة مداخل، واجعل
          الخمسة الباقية فخاخاً. الصورة اختيارية.
        </p>
        {rankedCount !== TOP5_RANKED_COUNT && (
          <p className="mt-1 text-xs font-bold text-amber-700" role="status">
            المرتّبة الآن: {rankedCount} من {TOP5_RANKED_COUNT}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {value.entries.map((entry, index) => (
          <div
            key={entry.id}
            className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[3rem_1fr_1fr_9rem]"
          >
            <div className="flex h-10 items-center justify-center rounded-md bg-muted text-sm font-bold">
              {index + 1}
            </div>
            <Input
              aria-label={`اسم المدخل ${index + 1}`}
              value={entry.label}
              placeholder="اسم المدخل"
              onChange={(event) =>
                setEntry(index, { label: event.target.value })
              }
            />
            <Input
              aria-label={`صورة المدخل ${index + 1}`}
              value={entry.imageUrl}
              placeholder="رابط صورة (اختياري)"
              onChange={(event) =>
                setEntry(index, { imageUrl: event.target.value })
              }
            />
            <Select
              value={entry.classification}
              onValueChange={(classification: string) =>
                setEntry(index, {
                  classification:
                    classification as Top5EntryFormState["classification"],
                })
              }
            >
              <SelectTrigger aria-label={`تصنيف المدخل ${index + 1}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: TOP5_RANKED_COUNT }, (_, rank) => (
                  <SelectItem key={rank + 1} value={String(rank + 1)}>
                    المرتبة {rank + 1}
                  </SelectItem>
                ))}
                <SelectItem value="trap">فخ</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <Field label="شرح النتيجة (اختياري)">
        <Textarea
          value={value.explanation}
          rows={3}
          placeholder="معلومة مختصرة تساعد المقدّم عند كشف الإجابات"
          onChange={(event) => set({ explanation: event.target.value })}
        />
      </Field>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
