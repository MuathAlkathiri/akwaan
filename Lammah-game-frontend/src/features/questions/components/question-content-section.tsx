"use client";

import type {
  FieldErrors,
  UseFormRegister,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  AcceptedAnswersEditor,
} from "./accepted-answers-editor";
import type { QuestionFormData } from "@/features/questions/models/question-form-schema";

interface QuestionContentSectionProps {
  values: QuestionFormData;
  register: UseFormRegister<QuestionFormData>;
  errors: FieldErrors<QuestionFormData>;
  isTop10: boolean;

  acceptedAnswers: string[];
  onAcceptedAnswersChange: (answers: string[]) => void;

  onGenerateAliases: () => void;
  isGeneratingAliases: boolean;
}

export function QuestionContentSection({
  values,
  register,
  errors,
  isTop10,
  acceptedAnswers,
  onAcceptedAnswersChange,
  onGenerateAliases,
  isGeneratingAliases,
}: QuestionContentSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>محتوى السؤال</CardTitle>
      </CardHeader>

      <CardContent
        className="space-y-4"
        data-testid="standard-answer-section"
      >
        <div>
          <label className="mb-2 block text-sm font-medium">
            السؤال
          </label>

          <Textarea {...register("question")} />

          {errors.question && (
            <p className="mt-1 text-sm text-destructive">
              {errors.question.message}
            </p>
          )}
        </div>

        {isTop10 && (
          <div>
            <label className="mb-2 block text-sm font-medium">
              السؤال بالإنجليزية (اختياري)
            </label>

            <Input
              dir="ltr"
              {...register("questionEn")}
            />
          </div>
        )}

        {!isTop10 && (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium">
                الإجابة الأساسية
              </label>

              <Input {...register("answer")} />

              {errors.answer && (
                <p className="mt-1 text-sm text-destructive">
                  {errors.answer.message}
                </p>
              )}
            </div>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="font-medium">
                  الإجابات المقبولة
                </label>

                <Button
                  type="button"
                  variant="outline"
                  onClick={onGenerateAliases}
                  disabled={
                    isGeneratingAliases ||
                    !values.answer?.trim() ||
                    !values.question.trim()
                  }
                >
                  {isGeneratingAliases
                    ? "جاري التوليد..."
                    : "توليد الإجابات المقبولة"}
                </Button>
              </div>

              <AcceptedAnswersEditor
                values={acceptedAnswers}
                onChange={onAcceptedAnswersChange}
              />
            </section>
          </>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium">
            الشرح
          </label>

          <Textarea {...register("explanation")} />
        </div>
      </CardContent>
    </Card>
  );
}