import { Injectable } from '@nestjs/common';
import type {
  FactCandidate,
  PipelineQuestionCandidate,
} from './ai-generation-pipeline.types';

export type LanguageIssueCode =
  | 'OUTPUT_LANGUAGE_MISMATCH'
  | 'OUTPUT_LANGUAGE_MIXED_EXCESSIVELY'
  | 'ANSWER_LANGUAGE_MISMATCH'
  | 'WRONG_ANSWERS_LANGUAGE_MISMATCH'
  | 'EXPLANATION_LANGUAGE_MISMATCH';

export type LanguageValidationResult = {
  detectedLanguage: 'ar' | 'en' | 'mixed' | 'unknown';
  requestedLanguage: 'ar';
  arabicCharacterRatio: number;
  foreignCharacterRatio: number;
  allowedProperNameRatio: number;
  status: 'PASS' | 'REPAIRABLE' | 'FAIL';
  issueCodes: LanguageIssueCode[];
};

@Injectable()
export class LanguageValidatorService {
  validate(
    candidate: PipelineQuestionCandidate,
    fact: FactCandidate,
    requestedLanguage: 'ar',
  ): LanguageValidationResult {
    const allowedNames = this.allowedNames(fact);
    const userFacing = [
      candidate.question,
      candidate.answer,
      ...candidate.acceptedAnswers,
      ...candidate.wrongAnswers,
      candidate.explanation,
    ].join(' ');
    const totals = this.measure(userFacing, allowedNames);
    const question = this.measure(candidate.question, allowedNames);
    const answer = this.measure(candidate.answer, allowedNames);
    const explanation = this.measure(candidate.explanation, allowedNames);
    const wrongAnswers = candidate.wrongAnswers.map((value) =>
      this.measure(value, allowedNames),
    );
    const issueCodes: LanguageIssueCode[] = [];

    if (!this.arabicPass(question)) {
      issueCodes.push(
        question.arabicRatio > 0.15
          ? 'OUTPUT_LANGUAGE_MIXED_EXCESSIVELY'
          : 'OUTPUT_LANGUAGE_MISMATCH',
      );
    }
    if (!this.arabicPass(answer)) issueCodes.push('ANSWER_LANGUAGE_MISMATCH');
    if (
      wrongAnswers.some(
        (result) => result.letters > 0 && !this.arabicPass(result),
      )
    )
      issueCodes.push('WRONG_ANSWERS_LANGUAGE_MISMATCH');
    if (!this.arabicPass(explanation))
      issueCodes.push('EXPLANATION_LANGUAGE_MISMATCH');

    const uniqueIssues = [...new Set(issueCodes)];
    return {
      detectedLanguage: this.detect(totals),
      requestedLanguage,
      arabicCharacterRatio: totals.arabicRatio,
      foreignCharacterRatio: totals.foreignRatio,
      allowedProperNameRatio: totals.allowedRatio,
      status: uniqueIssues.includes('OUTPUT_LANGUAGE_MIXED_EXCESSIVELY')
        ? 'FAIL'
        : uniqueIssues.length
          ? 'REPAIRABLE'
          : 'PASS',
      issueCodes: uniqueIssues,
    };
  }

  private allowedNames(fact: FactCandidate): string[] {
    return [fact.canonicalAnswer, ...fact.acceptedAnswerHints, ...fact.entities]
      .map((value) => value.trim())
      .filter((value) => value.length >= 2);
  }

  private measure(value: string, allowedNames: string[]) {
    let remaining = value ?? '';
    let allowed = 0;
    for (const name of [...allowedNames].sort((a, b) => b.length - a.length)) {
      const expression = new RegExp(this.escape(name), 'giu');
      remaining = remaining.replace(expression, (match) => {
        allowed += this.letterCount(match);
        return ' ';
      });
    }
    remaining = remaining.replace(/\b[A-Z][A-Z0-9]{1,9}\b/g, (match) => {
      allowed += this.letterCount(match);
      return ' ';
    });
    const arabic = (remaining.match(/[\p{Script=Arabic}]/gu) ?? []).length;
    const foreign = Math.max(0, this.letterCount(remaining) - arabic);
    const letters = arabic + foreign;
    const total = letters + allowed;
    return {
      letters,
      arabicRatio: letters ? arabic / letters : total ? 1 : 0,
      foreignRatio: total ? foreign / total : 0,
      allowedRatio: total ? allowed / total : 0,
    };
  }

  private arabicPass(result: ReturnType<LanguageValidatorService['measure']>) {
    return result.letters === 0 || result.arabicRatio >= 0.65;
  }

  private detect(result: ReturnType<LanguageValidatorService['measure']>) {
    if (!result.letters) return 'unknown' as const;
    if (result.arabicRatio >= 0.65) return 'ar' as const;
    if (result.arabicRatio <= 0.15) return 'en' as const;
    return 'mixed' as const;
  }

  private letterCount(value: string) {
    return (value.match(/\p{L}/gu) ?? []).length;
  }

  private escape(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
