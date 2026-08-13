import { Injectable } from '@nestjs/common';

@Injectable()
export class WrongAnswerRepairService {
  needsRepair(correctAnswer: string, wrongAnswers: string[]): boolean {
    return this.normalizeWrongAnswers(correctAnswer, wrongAnswers).length !== 3;
  }

  normalizeWrongAnswers(
    correctAnswer: string,
    wrongAnswers: string[],
  ): string[] {
    const normalizedCorrectAnswer =
      this.normalizeComparableAnswer(correctAnswer);
    const seen = new Set<string>();
    const repaired: string[] = [];

    for (const answer of wrongAnswers) {
      const comparable = this.normalizeComparableAnswer(answer);

      if (
        !comparable ||
        comparable === normalizedCorrectAnswer ||
        seen.has(comparable)
      ) {
        continue;
      }

      seen.add(comparable);
      repaired.push(answer.trim());
    }

    return repaired.slice(0, 3);
  }

  buildRepairPrompt(input: {
    categoryName: string;
    question: string;
    correctAnswer: string;
    wrongAnswers: string[];
  }): string {
    return `You repair Arabic multiple-choice quiz wrong answers.
Return JSON only. Do not include markdown.

Category: "${input.categoryName}"
Question: "${input.question}"
Correct answer: "${input.correctAnswer}"
Existing wrong answers: ${JSON.stringify(input.wrongAnswers)}

Rules:
- Return exactly 3 wrong answers.
- They must be plausible but clearly wrong.
- Do not repeat the correct answer.
- Do not duplicate answers.
- Use natural Arabic when Arabic is appropriate.

Return exactly:
{
  "wrongAnswers": ["...", "...", "..."]
}`;
  }

  parseRepairResponse(response: string): string[] {
    const parsed = JSON.parse(this.cleanJson(response)) as unknown;

    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { wrongAnswers?: unknown }).wrongAnswers)
    ) {
      return (parsed as { wrongAnswers: unknown[] }).wrongAnswers.filter(
        (answer): answer is string => typeof answer === 'string',
      );
    }

    throw new Error('Repair response must include wrongAnswers array');
  }

  private cleanJson(response: string): string {
    let jsonString = response.trim();

    if (jsonString.startsWith('```json')) {
      jsonString = jsonString
        .replace(/^```json\s*/i, '')
        .replace(/\s*```$/, '');
    } else if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const firstObjectIndex = jsonString.indexOf('{');
    const lastObjectIndex = jsonString.lastIndexOf('}');

    if (firstObjectIndex >= 0 && lastObjectIndex >= firstObjectIndex) {
      jsonString = jsonString.slice(firstObjectIndex, lastObjectIndex + 1);
    }

    return jsonString.trim();
  }

  private normalizeComparableAnswer(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }
}
