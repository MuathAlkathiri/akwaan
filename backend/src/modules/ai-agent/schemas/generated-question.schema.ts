import { z } from 'zod';

export const QuestionSourceSchema = z.enum(['text', 'image', 'audio', 'video']);

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);

export const GeneratedQuestionSchema = z.object({
  question: z
    .string()
    .min(10, 'Question is too short')
    .max(500, 'Question is too long'),
  answer: z
    .string()
    .min(1, 'Answer cannot be empty')
    .max(500, 'Answer is too long'),
  explanation: z
    .string()
    .min(5, 'Explanation is too short')
    .max(500, 'Explanation is too long'),
  difficulty: DifficultySchema,
  points: z
    .enum(['200', '400', '600'])
    .or(z.number().refine((n) => [200, 400, 600].includes(n))),
  type: QuestionSourceSchema.default('text').optional(),
});

export const GeneratedQuestionsArraySchema = z.array(GeneratedQuestionSchema);

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;
export type GeneratedQuestionsArray = z.infer<
  typeof GeneratedQuestionsArraySchema
>;
