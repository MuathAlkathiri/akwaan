import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { decodeHTML } from 'entities';
import type { SourceQuestionCandidate } from '../domain/question-source.types';

export type RawSourceQuestion = {
  sourceId: string;
  sourceUrl: string;
  sourceLicense?: string;
  sourceCategory: string;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  type: 'multiple' | 'boolean';
  difficulty: 'easy' | 'medium' | 'hard';
};

@Injectable()
export class SourceQuestionNormalizerService {
  normalize(raw: RawSourceQuestion): SourceQuestionCandidate | null {
    const question = this.clean(raw.question);
    const correct = this.clean(raw.correctAnswer);
    const incorrect = raw.incorrectAnswers.map((value) => this.clean(value));
    if (!question || !correct || incorrect.some((value) => !value)) return null;
    if (!/\p{L}|\p{N}/u.test(question) || !/\p{L}|\p{N}/u.test(correct))
      return null;
    const answerKeys = [correct, ...incorrect].map((value) => this.key(value));
    if (new Set(answerKeys).size !== answerKeys.length) return null;
    const fingerprint = this.hash(
      [raw.sourceId, this.key(question), this.key(correct)].join('|'),
    );
    return {
      sourceId: raw.sourceId,
      sourceQuestionId: fingerprint,
      sourceUrl: raw.sourceUrl,
      sourceLicense: raw.sourceLicense,
      fetchedAt: new Date().toISOString(),
      sourceCategory: this.clean(raw.sourceCategory),
      originalQuestion: question,
      originalCorrectAnswer: correct,
      originalIncorrectAnswers: incorrect,
      originalType: raw.type,
      originalDifficulty: raw.difficulty,
      normalizedQuestion: this.key(question),
      normalizedCorrectAnswer: this.key(correct),
      normalizedIncorrectAnswers: incorrect.map((value) => this.key(value)),
      fingerprint,
    };
  }

  deduplicate(candidates: SourceQuestionCandidate[]) {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      if (seen.has(candidate.fingerprint)) return false;
      seen.add(candidate.fingerprint);
      return true;
    });
  }

  clean(value: string): string {
    return this.decodeHtml(String(value ?? ''))
      .normalize('NFKC')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  key(value: string): string {
    return this.clean(value)
      .toLocaleLowerCase('en')
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex').slice(0, 32);
  }

  private decodeHtml(value: string) {
    return decodeHTML(value);
  }
}
