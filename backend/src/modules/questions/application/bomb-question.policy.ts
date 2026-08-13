import { BadRequestException, Injectable } from '@nestjs/common';
import { CategoryGameplayMode } from '../../categories/schemas/category.schema';
import {
  BombQuestionContent,
  Question,
  QuestionGameplayType,
} from '../schemas/question.schema';
import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';

export const BOMB_MIN_ITEMS = 10;
export const BOMB_MAX_ITEMS = 15;
export const BOMB_MAX_ANSWERS = 10;
export const BOMB_MAX_ANSWER_LENGTH = 120;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class BombQuestionPolicy {
  normalize(input: {
    categoryMode: CategoryGameplayMode;
    questionType?: QuestionGameplayType;
    bombContent?: BombQuestionContent;
    existing?: Question;
  }): BombQuestionContent | undefined {
    const questionType =
      input.questionType ??
      input.existing?.questionType ??
      QuestionGameplayType.STANDARD;
    const bombContent = input.bombContent ?? input.existing?.bombContent;
    if (input.categoryMode === CategoryGameplayMode.BOMB) {
      if (questionType !== QuestionGameplayType.BOMB_SEQUENCE) {
        this.fail(
          'BOMB_SEQUENCE_REQUIRED',
          'Bomb categories require bomb-sequence questions.',
        );
      }
      if (!bombContent) {
        this.fail('BOMB_CONTENT_REQUIRED', 'Bomb content is required.');
      }
    } else if (
      questionType === QuestionGameplayType.BOMB_SEQUENCE ||
      bombContent
    ) {
      this.fail(
        'BOMB_CONTENT_NOT_ALLOWED',
        'Bomb content is allowed only in Bomb categories.',
      );
    }
    if (!bombContent) return undefined;
    if (
      bombContent.items.length < BOMB_MIN_ITEMS ||
      bombContent.items.length > BOMB_MAX_ITEMS
    ) {
      this.fail(
        'INVALID_BOMB_ITEM_COUNT',
        `Bomb questions require ${BOMB_MIN_ITEMS}–${BOMB_MAX_ITEMS} items.`,
      );
    }
    const ids = new Set<string>();
    return {
      items: bombContent.items.map((item, order) => {
        if (!UUID_PATTERN.test(item.id) || ids.has(item.id)) {
          this.fail(
            ids.has(item.id)
              ? 'DUPLICATE_BOMB_ITEM_ID'
              : 'INVALID_BOMB_ITEM_ID',
            'Every Bomb item requires a unique UUID.',
          );
        }
        ids.add(item.id);
        if (
          !item.image?.url?.startsWith('/uploads/questions/bomb-items/') ||
          !item.image.storageKey?.startsWith('uploads/questions/bomb-items/') ||
          item.image.storageKey.includes('..')
        ) {
          this.fail(
            'BOMB_ITEM_IMAGE_REQUIRED',
            'Every Bomb item requires a managed image.',
          );
        }
        if (
          !Array.isArray(item.acceptedAnswers) ||
          item.acceptedAnswers.length < 1 ||
          item.acceptedAnswers.length > BOMB_MAX_ANSWERS
        ) {
          this.fail(
            'BOMB_ITEM_ANSWER_REQUIRED',
            `Each item requires 1–${BOMB_MAX_ANSWERS} accepted answers.`,
          );
        }
        const seen = new Set<string>();
        const acceptedAnswers = item.acceptedAnswers.map((answer) => {
          const display = answer.trim().replace(/\s+/g, ' ');
          const normalized = normalizeAnswer(display);
          if (!normalized || display.length > BOMB_MAX_ANSWER_LENGTH) {
            this.fail(
              'INVALID_BOMB_ITEM_ANSWER',
              `Accepted answers must be 1–${BOMB_MAX_ANSWER_LENGTH} characters.`,
            );
          }
          if (seen.has(normalized)) {
            this.fail(
              'DUPLICATE_ACCEPTED_ANSWER',
              'Accepted answers must be unique after normalization.',
            );
          }
          seen.add(normalized);
          return display;
        });
        return {
          id: item.id,
          order,
          image: {
            url: item.image.url,
            storageKey: item.image.storageKey,
            mimetype: item.image.mimetype,
            size: item.image.size,
          },
          acceptedAnswers,
          ...(item.altText?.trim() ? { altText: item.altText.trim() } : {}),
          ...(item.note?.trim() ? { note: item.note.trim() } : {}),
        };
      }),
    };
  }

  isValid(content?: BombQuestionContent): boolean {
    if (!content) return false;
    try {
      this.normalize({
        categoryMode: CategoryGameplayMode.BOMB,
        questionType: QuestionGameplayType.BOMB_SEQUENCE,
        bombContent: content,
      });
      return true;
    } catch {
      return false;
    }
  }

  private fail(code: string, message: string): never {
    throw new BadRequestException({ code, message });
  }
}
