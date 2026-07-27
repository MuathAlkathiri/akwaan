import { z } from "zod";
import { parseTimeToSeconds } from "./media-time";

export const questionFormSchema = z
  .object({
    authoringType: z.enum(["text", "image", "audio", "video", "top10"]),
    categoryId: z.string().min(1, "الفئة مطلوبة"),
    question: z.string().min(1, "السؤال مطلوب"),
    questionEn: z.string().optional(),
    answer: z.string().optional(),
    explanation: z.string().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    points: z.enum(["200", "400", "600"]),
    status: z.enum(["draft", "approved", "rejected"]),
    isFreeGameQuestion: z.boolean(),
    audioKind: z.enum([
      "identify_song",
      "identify_artist",
      "identify_character",
      "identify_voice",
      "identify_game",
      "identify_movie",
      "identify_dialogue_source",
      "identify_sound_effect",
      "custom",
    ]),
    searchQuery: z.string().optional(),
    targetName: z.string().optional(),
    sourceTitle: z.string().optional(),
    audioLanguage: z.string().optional(),
    clipDurationTime: z.string().optional(),
    clipStartTime: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.authoringType !== "top10" && !value.answer?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answer"],
        message: "الإجابة مطلوبة",
      });
    }

    if (!["audio", "video"].includes(value.authoringType)) return;

    for (const [field, input] of [
      ["clipStartTime", value.clipStartTime],
      ["clipDurationTime", value.clipDurationTime],
    ] as const) {
      if (!input?.trim()) continue;

      try {
        parseTimeToSeconds(input);
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "استخدم التنسيق MM:SS وثوانٍ بين 00 و59",
        });
      }
    }

    if (!value.clipDurationTime?.trim()) return;

    try {
      const duration = parseTimeToSeconds(value.clipDurationTime);
      const [minimum, maximum] =
        value.authoringType === "video" ? [5, 15] : [3, 20];

      if (duration < minimum || duration > maximum) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["clipDurationTime"],
          message: `المدة يجب أن تكون بين ${minimum} و${maximum} ثانية`,
        });
      }
    } catch {
      // خطأ التنسيق تمت إضافته مسبقًا.
    }
  });

export type QuestionFormData = z.infer<typeof questionFormSchema>;