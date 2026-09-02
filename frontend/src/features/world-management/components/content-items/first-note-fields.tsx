"use client";
import { Input } from "@/components/ui/input";
import type { FirstNoteFormState } from "../../services/content-item-form.service";

export function FirstNoteFields({
  value,
  acceptedAnswers,
  onChange,
  onAcceptedAnswersChange,
}: {
  value: FirstNoteFormState;
  acceptedAnswers: string;
  onChange: (value: FirstNoteFormState) => void;
  onAcceptedAnswersChange: (value: string) => void;
}) {
  const set = (key: keyof FirstNoteFormState, next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <section
      className="space-y-4 rounded-[var(--radius)] border p-4"
      data-testid="first-note-fields"
    >
      <div>
        <label>اسم الأغنية</label>
        <Input
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </div>
      <div>
        <label>نوع الدليل (اختياري)</label>
        <Input
          value={value.clueLabel}
          onChange={(e) => set("clueLabel", e.target.value)}
          placeholder="الفنان / السنة / الألبوم / الحقبة"
        />
      </div>
      <div>
        <label>الدليل السياقي</label>
        <Input
          value={value.clue}
          onChange={(e) => set("clue", e.target.value)}
        />
      </div>
      <div>
        <label>رابط المقطع الصوتي</label>
        <Input
          value={value.audioUrl}
          onChange={(e) => set("audioUrl", e.target.value)}
          dir="ltr"
        />
      </div>
      <div>
        <label>إجابات إضافية مقبولة</label>
        <textarea
          className="min-h-24 w-full rounded-md border p-3"
          value={acceptedAnswers}
          onChange={(e) => onAcceptedAnswersChange(e.target.value)}
        />
      </div>
    </section>
  );
}
