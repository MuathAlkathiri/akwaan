import { Injectable } from '@nestjs/common';

export type WordingIssueCode =
  | 'QUESTION_TOO_LONG'
  | 'QUESTION_MULTIPLE_IDEAS'
  | 'QUESTION_ACADEMIC_STYLE'
  | 'QUESTION_CONTAINS_EXPLANATION'
  | 'QUESTION_CONTAINS_PARENTHESES'
  | 'QUESTION_ROBOTIC_RIDDLE_STYLE'
  | 'QUESTION_VAGUE'
  | 'QUESTION_ANSWER_LEAKAGE';

export const QUESTION_WORDING_POLICY = {
  ar: {
    preferredMin: 8,
    preferredMax: 18,
    softMax: 22,
    hardMax: 28,
    characterMax: 160,
  },
  en: {
    preferredMin: 6,
    preferredMax: 16,
    softMax: 20,
    hardMax: 25,
    characterMax: 140,
  },
} as const;

const ACADEMIC_PATTERNS = [
  /بناءً على ما سبق/i,
  /بناء على (?:الأحداث|المعلومات|ما سبق)/i,
  /في ضوء المعلومات/i,
  /أي من الآتي/i,
  /يُ?عر[ّ]?ف بأنه/i,
  /يتمثل في/i,
  /والمقصود هنا/i,
  /مع العلم أن/i,
  /في سياق (?:القصة|الأحداث)/i,
];

const EXPLANATION_PATTERNS = [
  /وذلك (?:لأن|بسبب)/i,
  /حيث (?:إن|أن|يُ|يتم)/i,
  /والذي (?:يعني|يُعد|يعتبر)/i,
  /أي بمعنى/i,
];

const ROBOTIC_RIDDLE_PATTERNS = [
  /(?:من|ما)\s+(?:هو|هي)\s+(?:الشخصية|الشخص|العنصر|الكائن|الأسترالطي|الاستراتيجي)\s+(?:الذي|التي)/i,
  /(?:الشخصية|الشخص|العنصر|الكائن)\s+(?:الذي|التي)\s+(?:يمتلك|تمتلك|يتميز|تتميز|يرتبط|ترتبط|يحمل|تحمل)/i,
  /(?:دائمًا|دائماً)\s+عن\s+الأسرار/i,
  /خلف\s+الكواليس/i,
  /قراءة\s+(?:الأحداث|الماضية)/i,
];

@Injectable()
export class QuestionWordingService {
  countWords(value: string) {
    return (
      value.trim().match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)?.length ?? 0
    );
  }

  validate(
    question: string,
    correctAnswer: string,
    language: 'ar' | 'en' = 'ar',
  ) {
    const issues = new Set<WordingIssueCode>();
    const policy = QUESTION_WORDING_POLICY[language];
    const words = this.countWords(question);
    const punctuation = question.match(/[؟?!]/g)?.length ?? 0;
    const internalSentences =
      question.replace(/[؟?!]+\s*$/, '').match(/[.!؟!]/g)?.length ?? 0;
    const conjunctions = question.match(/(?:،|,|\sو(?=\S))/g)?.length ?? 0;

    if (words > policy.softMax || question.length > policy.characterMax)
      issues.add('QUESTION_TOO_LONG');
    if (
      words > policy.hardMax ||
      internalSentences > 0 ||
      punctuation > 1 ||
      conjunctions > 3
    )
      issues.add('QUESTION_MULTIPLE_IDEAS');
    if (ACADEMIC_PATTERNS.some((pattern) => pattern.test(question)))
      issues.add('QUESTION_ACADEMIC_STYLE');
    if (EXPLANATION_PATTERNS.some((pattern) => pattern.test(question)))
      issues.add('QUESTION_CONTAINS_EXPLANATION');
    if (/[([][^\])]+[\])]/.test(question))
      issues.add('QUESTION_CONTAINS_PARENTHESES');
    if (ROBOTIC_RIDDLE_PATTERNS.some((pattern) => pattern.test(question)))
      issues.add('QUESTION_ROBOTIC_RIDDLE_STYLE');
    if (words < 4 || /^(ما هذا|من هذا|ما هي|ما هو)؟?$/i.test(question.trim()))
      issues.add('QUESTION_VAGUE');

    const normalizedQuestion = this.comparable(question);
    const normalizedAnswer = this.comparable(correctAnswer);
    if (
      normalizedAnswer.length >= 3 &&
      normalizedQuestion.includes(normalizedAnswer)
    )
      issues.add('QUESTION_ANSWER_LEAKAGE');

    return {
      wordCount: words,
      characterCount: question.length,
      issues: [...issues],
      withinPreferredRange:
        words >= policy.preferredMin && words <= policy.preferredMax,
    };
  }

  needsRepair(issues: WordingIssueCode[]) {
    return issues.some((issue) => issue !== 'QUESTION_VAGUE');
  }

  safelyShorten(question: string) {
    let result = question.trim();
    for (const pattern of ACADEMIC_PATTERNS)
      result = result.replace(
        new RegExp(`^${pattern.source}[،,:؛]?\\s*`, 'i'),
        '',
      );
    result = result
      .replace(/^(?:في عالم|ضمن عالم)\s+[^،,]{2,35}[،,]\s*/i, '')
      .replace(/\s*[([][^\])]+[\])]\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*[؟?]+\s*$/, '')
      .trim();
    return result ? `${result}؟` : question;
  }

  buildRepairPrompt(input: {
    question: string;
    correctAnswer: string;
    difficulty: string;
    gameMode: string;
  }) {
    return `Shorten one Arabic party-game question. Return JSON only: {"question":"..."}.
Keep the exact factual meaning, correct answer, difficulty, and game mode. Do not add facts or alter asset needs.
Write one natural, direct question readable aloud in under 6 seconds. Remove introductions, explanations, parentheses, repeated clues, and academic wording. Preserve enough detail for one unambiguous answer. Hardness comes from knowledge, not sentence length.
Make it sound like a human host, not a translated encyclopedia riddle. Prefer direct patterns such as "مين..." / "وش..." / "أي..." when they fit. Avoid "الشخصية التي..." and long relative clauses.
Correct answer (do not include it in the question): ${input.correctAnswer}
Difficulty: ${input.difficulty}
Game mode: ${input.gameMode}
Question: ${input.question}`;
  }

  parseRepairResponse(response: string) {
    const cleaned = response
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned) as { question?: unknown };
    return typeof parsed.question === 'string' ? parsed.question.trim() : '';
  }

  private comparable(value: string) {
    return value
      .normalize('NFKD')
      .replace(/[\u064b-\u065f\u0670]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '')
      .toLowerCase();
  }
}
