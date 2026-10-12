import { Injectable } from '@nestjs/common';
import { QuestionRepository } from '../persistence/question.repository';
import {
  ARABIC_DUPLICATE_THRESHOLD,
  arabicTextSimilarity,
  normalizeArabicText,
} from '../../../common/utils/arabic-text-similarity.util';

export interface DuplicateMatch {
  questionId: string;
  question: string;
  similarity: number;
  categoryId: string;
}

@Injectable()
export class QuestionDuplicateDetectionService {
  constructor(private readonly questions: QuestionRepository) {}

  async check(input: {
    question: string;
    categoryId?: string;
    global?: boolean;
    excludeId?: string;
  }) {
    const normalized = this.normalize(input.question);
    const candidates = await this.questions.findDuplicateCandidates(
      input.global ? undefined : input.categoryId,
      input.excludeId,
    );
    const matches = candidates
      .map((candidate) => ({
        questionId: String(candidate._id),
        question: candidate.question,
        similarity: this.similarity(
          normalized,
          this.normalize(candidate.question),
        ),
        categoryId: String(candidate.category),
      }))
      .filter((candidate) => candidate.similarity >= ARABIC_DUPLICATE_THRESHOLD)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 10);
    return {
      exactMatch: matches.some((match) => match.similarity === 1),
      highestSimilarity: matches[0]?.similarity ?? 0,
      matches,
    };
  }

  /** Kept as the service's public API; the algorithm itself is now shared. */
  normalize(value: string): string {
    return normalizeArabicText(value);
  }

  private similarity(left: string, right: string): number {
    return arabicTextSimilarity(left, right);
  }
}
