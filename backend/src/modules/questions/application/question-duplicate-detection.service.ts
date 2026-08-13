import { Injectable } from '@nestjs/common';
import { QuestionRepository } from '../persistence/question.repository';

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
      .filter((candidate) => candidate.similarity >= 0.72)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 10);
    return {
      exactMatch: matches.some((match) => match.similarity === 1),
      highestSimilarity: matches[0]?.similarity ?? 0,
      matches,
    };
  }

  normalize(value: string): string {
    return value
      .trim()
      .toLocaleLowerCase('ar')
      .normalize('NFKC')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ىئ]/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ة/g, 'ه')
      .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private similarity(left: string, right: string): number {
    if (left === right) return 1;
    const a = this.trigrams(left);
    const b = this.trigrams(right);
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    for (const token of a) if (b.has(token)) intersection += 1;
    return Number((intersection / (a.size + b.size - intersection)).toFixed(4));
  }

  private trigrams(value: string): Set<string> {
    const padded = `  ${value}  `;
    return new Set(
      Array.from({ length: Math.max(0, padded.length - 2) }, (_, index) =>
        padded.slice(index, index + 3),
      ),
    );
  }
}
