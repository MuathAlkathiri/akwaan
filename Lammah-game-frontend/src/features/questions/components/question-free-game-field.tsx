"use client";

import type { UseFormRegister } from "react-hook-form";

import type { QuestionFormData } from "@/features/questions/models/question-form-schema";

interface QuestionFreeGameFieldProps {
  register: UseFormRegister<QuestionFormData>;
}

export function QuestionFreeGameField({
  register,
}: QuestionFreeGameFieldProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          {...register("isFreeGameQuestion")}
        />

        سؤال للعبة المجانية
      </label>

      <p className="text-xs text-muted-foreground">
        تتم مطابقة الإجابات المقبولة بعد التطبيع. يجب مراجعة اقتراحات
        الذكاء الاصطناعي قبل الحفظ.
      </p>
    </div>
  );
}