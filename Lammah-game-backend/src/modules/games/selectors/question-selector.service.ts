import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { QuestionRepository } from '../../questions/persistence/question.repository';
import {
  DifficultyLevel,
  Question,
  QuestionGameplayType,
  QuestionPoints,
  QuestionStatus,
} from '../../questions/schemas/question.schema';
import { QuestionMediaAvailabilityPolicy } from '../../questions/application/question-media-availability.policy';
import { BombQuestionPolicy } from '../../questions/application/bomb-question.policy';

@Injectable()
export class QuestionSelectorService {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly mediaAvailability: QuestionMediaAvailabilityPolicy,
    private readonly bombQuestions: BombQuestionPolicy,
  ) {}

  async select(options: {
    categoryId: string;
    points: QuestionPoints;
    isFreeGame: boolean;
    seenQuestionIds: Types.ObjectId[];
  }): Promise<Question[]> {
    const candidates = await this.questions.findEligibleForGame({
      categoryId: options.categoryId,
      points: options.points,
      freeGameOnly: options.isFreeGame,
      questionType: QuestionGameplayType.STANDARD,
    });

    if (options.isFreeGame) return candidates.slice(0, 2);

    const seen = new Set(options.seenQuestionIds.map(String));
    const unseen = candidates.filter(
      (question) => !seen.has(String(question._id)),
    );
    const source = unseen.length >= 2 ? unseen : candidates;
    return this.preferMediaVariety(this.shuffle(source), 2);
  }

  async selectTop10(options: {
    categoryId: string;
    isFreeGame: boolean;
    seenQuestionIds: Types.ObjectId[];
  }): Promise<Question[]> {
    const candidates = await this.questions.findEligibleForGame({
      categoryId: options.categoryId,
      freeGameOnly: options.isFreeGame,
      questionType: QuestionGameplayType.RANKED_LIST,
    });
    const seen = new Set(options.seenQuestionIds.map(String));
    const unseen = candidates.filter(
      (question) => !seen.has(String(question._id)),
    );
    const source = unseen.length >= 6 ? unseen : candidates;
    return options.isFreeGame
      ? source.slice(0, 6)
      : this.shuffle(source).slice(0, 6);
  }

  async selectBomb(options: {
    categoryId: string;
    difficulty: DifficultyLevel;
    seenQuestionIds: Types.ObjectId[];
  }): Promise<Question[]> {
    const candidates = (
      await this.questions.findBombReadinessQuestions(options.categoryId)
    ).filter(
      (question) =>
        question.status === QuestionStatus.APPROVED &&
        question.questionType === QuestionGameplayType.BOMB_SEQUENCE &&
        question.difficulty === options.difficulty &&
        this.bombQuestions.isValid(question.bombContent),
    );
    const seen = new Set(options.seenQuestionIds.map(String));
    const unseen = candidates.filter(
      (question) => !seen.has(String(question._id)),
    );
    return this.shuffle(unseen.length >= 2 ? unseen : candidates).slice(0, 2);
  }

  private shuffle<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [
        shuffled[randomIndex],
        shuffled[index],
      ];
    }
    return shuffled;
  }

  /**
   * Best-effort variety inside the already-correct point bucket.
   * It never removes a candidate or changes the requested bucket.
   */
  private preferMediaVariety(items: Question[], count: number): Question[] {
    const selected: Question[] = [];
    const used = new Set<string>();
    for (const question of items) {
      const type =
        this.mediaAvailability.resolve(question).effectivePresentationType;
      if (used.has(type)) continue;
      selected.push(question);
      used.add(type);
      if (selected.length === count) return selected;
    }
    for (const question of items) {
      if (selected.includes(question)) continue;
      selected.push(question);
      if (selected.length === count) break;
    }
    return selected;
  }
}
