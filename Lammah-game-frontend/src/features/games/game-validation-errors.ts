export const GAME_VALIDATION_MESSAGES_AR: Record<string, string> = {
  STANDARD_MISSING_200_QUESTIONS:
    "الفئة القياسية تحتاج سؤالين معتمدين بقيمة 200 نقطة.",
  STANDARD_MISSING_400_QUESTIONS:
    "الفئة القياسية تحتاج سؤالين معتمدين بقيمة 400 نقطة.",
  STANDARD_MISSING_600_QUESTIONS:
    "الفئة القياسية تحتاج سؤالين معتمدين بقيمة 600 نقطة.",
  STANDARD_INVALID_QUESTION_DISTRIBUTION:
    "توزيع أسئلة الفئة القياسية غير صحيح.",
  TOP10_NO_APPROVED_QUESTIONS:
    "فئة Top 10 تحتاج سؤال قائمة مرتبة واحداً معتمداً على الأقل.",
  TOP10_INVALID_ANSWER_COUNT: "سؤال Top 10 يجب أن يحتوي على 10 إجابات.",
  TOP10_INVALID_SCORE_SEQUENCE: "تسلسل نقاط سؤال Top 10 غير صحيح.",
  TOP10_DUPLICATE_ANSWER: "توجد إجابات مكررة في سؤال Top 10.",
  TOP10_INVALID_RANKING: "ترتيب إجابات سؤال Top 10 غير صحيح.",
  TOP10_INVALID_ACCEPTED_ANSWERS:
    "الأسماء البديلة المقبولة في سؤال Top 10 غير صالحة.",
};

export function gameValidationMessageAr(code: unknown): string | undefined {
  return typeof code === "string"
    ? GAME_VALIDATION_MESSAGES_AR[code]
    : undefined;
}
