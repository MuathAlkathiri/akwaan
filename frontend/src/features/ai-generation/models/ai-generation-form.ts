import {
  GenerateReviewedQuestionsDtoDifficulty,
  type GenerateReviewedQuestionsDtoDifficulty as Difficulty,
} from "@/api/generated/models";
import { z } from "zod";

export const AI_GENERATION_DEFAULT_COUNT = 2;
export const AI_GENERATION_MAX_COUNT = 20;

export const aiGenerationFormSchema = z.object({
  count: z.coerce
    .number()
    .int("يجب أن يكون عدد الأسئلة رقمًا صحيحًا")
    .min(1, "يجب توليد سؤال واحد على الأقل")
    .max(
      AI_GENERATION_MAX_COUNT,
      `لا يمكن توليد أكثر من ${AI_GENERATION_MAX_COUNT} سؤالًا`,
    ),
  difficulty: z.nativeEnum(GenerateReviewedQuestionsDtoDifficulty),
});

export type AIGenerationFormValues = z.infer<typeof aiGenerationFormSchema>;

export const AI_GENERATION_DEFAULTS: AIGenerationFormValues = {
  count: AI_GENERATION_DEFAULT_COUNT,
  difficulty: GenerateReviewedQuestionsDtoDifficulty.medium,
};

export const AI_GENERATION_DIFFICULTIES: ReadonlyArray<{
  value: Difficulty;
  label: string;
}> = [
  { value: GenerateReviewedQuestionsDtoDifficulty.easy, label: "سهل" },
  { value: GenerateReviewedQuestionsDtoDifficulty.medium, label: "متوسط" },
  { value: GenerateReviewedQuestionsDtoDifficulty.hard, label: "صعب" },
];
