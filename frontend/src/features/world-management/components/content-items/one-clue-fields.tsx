"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  ONE_CLUE_VALUES,
  type OneClueFormState,
} from "../../services/content-item-form.service";

const CLUE_LABELS = [
  "الدليل الأول",
  "الدليل الثاني",
  "الدليل الثالث",
  "الدليل الرابع",
  "الدليل الخامس",
] as const;

export function OneClueFields({
  value,
  acceptedAnswers,
  onChange,
  onAcceptedAnswersChange,
}: {
  value: OneClueFormState;
  acceptedAnswers: string;
  onChange: (value: OneClueFormState) => void;
  onAcceptedAnswersChange: (value: string) => void;
}) {
  const setClue = (index: number, text: string) =>
    onChange({
      ...value,
      clues: ONE_CLUE_VALUES.map((_score, position) =>
        position === index ? text : (value.clues[position] ?? ""),
      ),
    });

  return (
    <section
      className="space-y-4 rounded-xl border p-3"
      data-testid="one-clue-fields"
    >
      <div>
        <label className="mb-1.5 block text-sm font-semibold">
          الإجابة المستهدفة
        </label>
        <Input
          value={value.targetAnswer}
          placeholder="كريستيانو رونالدو"
          onChange={(event) =>
            onChange({ ...value, targetAnswer: event.target.value })
          }
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold">
          الإجابات المقبولة
        </label>
        <Textarea
          rows={3}
          value={acceptedAnswers}
          placeholder={"رونالدو\nCristiano Ronaldo"}
          onChange={(event) => onAcceptedAnswersChange(event.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          صيغة في كل سطر. تُستخدم لمطابقة الطرق الصحيحة لكتابة الإجابة.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">الأدلة الخمسة</h3>
          <p className="text-xs text-muted-foreground">
            رتّب المعرفة من الأصعب إلى الأوضح.
          </p>
        </div>
        {ONE_CLUE_VALUES.map((score, index) => (
          <div key={score} className="border-s border-border ps-3">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="text-sm font-medium">
                {CLUE_LABELS[index]}
              </label>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {score} نقاط
              </span>
            </div>
            <Textarea
              rows={2}
              aria-label={CLUE_LABELS[index]}
              value={value.clues[index] ?? ""}
              onChange={(event) => setClue(index, event.target.value)}
            />
            {index === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                الأصعب — معلومة مفيدة للمتابع العميق
              </p>
            )}
            {index === 4 && (
              <p className="mt-1 text-xs text-muted-foreground">
                الأوضح — يجب أن يقرّب الإجابة كثيرًا دون ذكرها
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
