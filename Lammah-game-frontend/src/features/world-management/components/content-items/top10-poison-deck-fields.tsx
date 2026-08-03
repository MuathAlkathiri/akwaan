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
import type {
  Top10CardFormState,
  Top10FormState,
} from "../../services/content-item-form.service";
import type { Top10Variant } from "../../types";

export function Top10PoisonDeckFields({
  value,
  onChange,
}: {
  value: Top10FormState;
  onChange: (value: Top10FormState) => void;
}) {
  const set = (patch: Partial<Top10FormState>) =>
    onChange({ ...value, ...patch });
  const setCard = (index: number, patch: Partial<Top10CardFormState>) =>
    set({
      cards: value.cards.map((card, position) =>
        position === index ? { ...card, ...patch } : card,
      ),
    });

  return (
    <section className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div>
        <h3 className="font-semibold">طريقة لعب أفضل 10</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          اختر النسخة المعتادة أو نسخة البطاقات التي يقرر فيها كل فريق: يحتفظ
          بالبطاقة أم يرسلها لخصمه.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">نسخة التحدي</label>
        <Select
          value={value.variant}
          onValueChange={(variant: string) =>
            set({ variant: variant as Top10Variant })
          }
        >
          <SelectTrigger aria-label="نسخة تحدي أفضل 10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="classic">أفضل 10 المعتادة</SelectItem>
            <SelectItem value="poison-deck">خذها أو دسّها</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.variant === "poison-deck" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="عنوان القائمة">
              <Input
                value={value.title}
                placeholder="مثال: أكثر 10 أندية تحقيقاً للبطولات"
                onChange={(event) => set({ title: event.target.value })}
              />
            </Field>
            <Field label="تعليمات تظهر للاعبين">
              <Input
                value={value.instruction}
                placeholder="احتفظ بالبطاقة أو أرسلها لخصمك"
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
            <Field label="تاريخ البيانات (اختياري)">
              <Input
                type="date"
                value={value.asOfDate}
                onChange={(event) => set({ asOfDate: event.target.value })}
              />
            </Field>
          </div>

          <div>
            <h4 className="font-medium">البطاقات الأربع عشرة</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              عيّن ترتيباً مختلفاً من 1 إلى 10 لعشر بطاقات، واجعل أربع بطاقات
              مضللة. الصورة اختيارية لكل بطاقة.
            </p>
          </div>

          <div className="space-y-3">
            {value.cards.map((card, index) => (
              <div
                key={card.id}
                className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[3rem_1fr_1fr_9rem]"
              >
                <div className="flex h-10 items-center justify-center rounded-md bg-muted text-sm font-bold">
                  {index + 1}
                </div>
                <Input
                  aria-label={`اسم البطاقة ${index + 1}`}
                  value={card.label}
                  placeholder="اسم البطاقة"
                  onChange={(event) =>
                    setCard(index, { label: event.target.value })
                  }
                />
                <Input
                  aria-label={`صورة البطاقة ${index + 1}`}
                  value={card.imageUrl}
                  placeholder="رابط صورة (اختياري)"
                  onChange={(event) =>
                    setCard(index, { imageUrl: event.target.value })
                  }
                />
                <Select
                  value={card.classification}
                  onValueChange={(classification: string) =>
                    setCard(index, {
                      classification:
                        classification as Top10CardFormState["classification"],
                    })
                  }
                >
                  <SelectTrigger aria-label={`تصنيف البطاقة ${index + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, rank) => (
                      <SelectItem key={rank + 1} value={String(rank + 1)}>
                        المرتبة {rank + 1}
                      </SelectItem>
                    ))}
                    <SelectItem value="decoy">بطاقة مضللة</SelectItem>
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
        </>
      )}
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
