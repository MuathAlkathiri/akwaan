"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  LAQATHA_VALUES,
  type LaqathaClueFormState,
  type LaqathaClueModality,
  type LaqathaFormState,
} from "../../services/content-item-form.service";

const CLUE_LABELS = [
  "الدليل الأول",
  "الدليل الثاني",
  "الدليل الثالث",
  "الدليل الرابع",
  "الدليل الخامس",
] as const;

const MODALITY_LABEL: Record<LaqathaClueModality, string> = {
  text: "نص",
  image: "صورة",
  audio: "صوت",
};

export function LaqathaFields({
  value,
  acceptedAnswers,
  onChange,
  onAcceptedAnswersChange,
}: {
  value: LaqathaFormState;
  acceptedAnswers: string;
  onChange: (value: LaqathaFormState) => void;
  onAcceptedAnswersChange: (value: string) => void;
}) {
  const setClue = (index: number, patch: Partial<LaqathaClueFormState>) =>
    onChange({
      ...value,
      clues: LAQATHA_VALUES.map((_score, position) =>
        position === index
          ? {
              ...(value.clues[position] ?? {
                modality: "text" as LaqathaClueModality,
                text: "",
                mediaUrl: "",
              }),
              ...patch,
            }
          : (value.clues[position] ?? {
              modality: "text" as LaqathaClueModality,
              text: "",
              mediaUrl: "",
            }),
      ),
    });

  return (
    <section
      className="space-y-4 rounded-xl border p-3"
      data-testid="laqatha-fields"
    >
      <div>
        <label className="mb-1.5 block text-sm font-semibold">
          اسم الفيلم (الإجابة المستهدفة)
        </label>
        <Input
          value={value.targetAnswer}
          placeholder="الأسد الملك"
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
          placeholder={"الاسد الملك\nThe Lion King"}
          onChange={(event) => onAcceptedAnswersChange(event.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          صيغة في كل سطر. تُستخدم لمطابقة الطرق الصحيحة لكتابة اسم الفيلم.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">الأدلة الخمسة</h3>
          <p className="text-xs text-muted-foreground">
            رتّب الأدلة من الأصعب إلى الأوضح. كل دليل نص أو صورة أو صوت.
          </p>
        </div>
        {LAQATHA_VALUES.map((score, index) => {
          const clue = value.clues[index] ?? {
            modality: "text" as LaqathaClueModality,
            text: "",
            mediaUrl: "",
          };
          return (
            <div
              key={score}
              className="border-s border-border ps-3"
              data-testid={`laqatha-field-${index + 1}`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="text-sm font-medium">
                  {CLUE_LABELS[index]}
                </label>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {score} نقاط
                </span>
              </div>
              <div className="mb-2">
                <Select
                  value={clue.modality}
                  onValueChange={(next: string) =>
                    setClue(index, {
                      modality: next as LaqathaClueModality,
                    })
                  }
                >
                  <SelectTrigger aria-label={`نوع ${CLUE_LABELS[index]}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["text", "image", "audio"] as const).map((modality) => (
                      <SelectItem key={modality} value={modality}>
                        {MODALITY_LABEL[modality]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {clue.modality === "text" ? (
                <Textarea
                  rows={2}
                  aria-label={CLUE_LABELS[index]}
                  value={clue.text}
                  onChange={(event) =>
                    setClue(index, { text: event.target.value })
                  }
                />
              ) : (
                <Input
                  aria-label={`${CLUE_LABELS[index]} — رابط الوسائط`}
                  placeholder={
                    clue.modality === "image"
                      ? "https://…/clue.webp"
                      : "https://…/clue.mp3"
                  }
                  value={clue.mediaUrl}
                  onChange={(event) =>
                    setClue(index, { mediaUrl: event.target.value })
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
