import { Injectable } from '@nestjs/common';
import type {
  FactCandidate,
  PipelineQuestionCandidate,
} from './ai-generation-pipeline.types';
import type { SourceQuestionCandidate } from '../domain/question-source.types';

@Injectable()
export class DuplicateDetectionService {
  private readonly batch = new Set<string>();
  reset() {
    this.batch.clear();
  }
  check(
    candidate: PipelineQuestionCandidate,
    fact: FactCandidate,
    persisted: Array<{ question: string; correctAnswer?: string }>,
  ): string[] {
    const questionKey = `question:${this.norm(candidate.question)}`;
    const answerKey = `answer:${this.norm(candidate.answer)}`;
    const excerptKey = `excerpt:${this.norm(fact.source.excerpt)}`;
    if (
      this.batch.has(questionKey) ||
      this.batch.has(answerKey) ||
      this.batch.has(excerptKey)
    )
      return ['DUPLICATE_IN_BATCH'];
    if (
      persisted.some(
        (item) =>
          this.norm(item.question) === this.norm(candidate.question) ||
          this.similarity(item.question, candidate.question) >= 0.82,
      )
    )
      return ['DUPLICATE_EXACT'];
    if (
      persisted.some(
        (item) =>
          item.correctAnswer &&
          this.norm(item.correctAnswer) === this.norm(candidate.answer),
      )
    )
      return ['DUPLICATE_SEMANTIC'];
    this.batch.add(questionKey);
    this.batch.add(answerKey);
    this.batch.add(excerptKey);
    return [];
  }

  checkSource(
    candidate: PipelineQuestionCandidate,
    source: SourceQuestionCandidate,
    persisted: Array<{ question: string; correctAnswer?: string }>,
  ): string[] {
    const keys = [
      `source:${source.sourceId}:${source.sourceQuestionId}`,
      `fingerprint:${source.fingerprint}`,
      `original:${source.normalizedQuestion}`,
      `question:${this.norm(candidate.question)}`,
      `answer:${this.norm(candidate.answer)}`,
    ];
    if (keys.some((key) => this.batch.has(key))) return ['DUPLICATE_IN_BATCH'];
    if (
      persisted.some(
        (item) =>
          this.norm(item.question) === this.norm(candidate.question) ||
          this.similarity(item.question, candidate.question) >= 0.82,
      )
    )
      return ['DUPLICATE_EXACT'];
    if (
      persisted.some(
        (item) =>
          item.correctAnswer &&
          this.norm(item.correctAnswer) === this.norm(candidate.answer),
      )
    )
      return ['DUPLICATE_SEMANTIC'];
    keys.forEach((key) => this.batch.add(key));
    return [];
  }

  checkGenerated(
    candidate: PipelineQuestionCandidate,
    persisted: Array<{ question: string; correctAnswer?: string }>,
  ): string[] {
    const questionKey = `question:${this.norm(candidate.question)}`;
    const answerKey = `answer:${this.norm(candidate.answer)}`;
    if (this.batch.has(questionKey) || this.batch.has(answerKey))
      return ['DUPLICATE_IN_BATCH'];
    if (
      persisted.some(
        (item) =>
          this.norm(item.question) === this.norm(candidate.question) ||
          this.similarity(item.question, candidate.question) >= 0.82,
      )
    )
      return ['DUPLICATE_EXACT'];
    if (
      persisted.some(
        (item) =>
          item.correctAnswer &&
          this.norm(item.correctAnswer) === this.norm(candidate.answer),
      )
    )
      return ['DUPLICATE_SEMANTIC'];
    this.batch.add(questionKey);
    this.batch.add(answerKey);
    return [];
  }

  scoreSource(
    candidate: Pick<PipelineQuestionCandidate, 'question' | 'answer'> | null,
    source: SourceQuestionCandidate,
    persisted: Array<{ question: string; correctAnswer?: string }>,
    peers: SourceQuestionCandidate[] = [],
  ): number {
    const question = candidate?.question ?? source.originalQuestion;
    const answer = candidate?.answer ?? source.originalCorrectAnswer;
    const scores = [
      ...persisted.map((item) =>
        Math.max(
          this.similarity(item.question, question),
          item.correctAnswer ? this.similarity(item.correctAnswer, answer) : 0,
        ),
      ),
      ...peers
        .filter((peer) => peer.fingerprint !== source.fingerprint)
        .map((peer) =>
          Math.max(
            this.similarity(peer.originalQuestion, question),
            this.similarity(peer.originalCorrectAnswer, answer),
          ),
        ),
    ];
    return Number(Math.max(0, ...scores).toFixed(4));
  }

  private similarity(left: string, right: string): number {
    const a = this.trigrams(this.norm(left));
    const b = this.trigrams(this.norm(right));
    if (!a.size || !b.size) return 0;
    let overlap = 0;
    for (const token of a) if (b.has(token)) overlap += 1;
    return (2 * overlap) / (a.size + b.size);
  }

  private trigrams(value: string): Set<string> {
    if (value.length < 3) return new Set(value ? [value] : []);
    return new Set(
      Array.from({ length: value.length - 2 }, (_, index) =>
        value.slice(index, index + 3),
      ),
    );
  }
  private norm(value: string) {
    return value
      .toLowerCase()
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/[^\u0600-\u06ffA-Za-z0-9]+/g, '');
  }
}
