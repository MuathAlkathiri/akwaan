import { randomUUID } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  Question,
  QuestionGameplayType,
  RankedListDefinition,
} from '../schemas/question.schema';

export const TOP_10_ENTRY_POINTS = [
  10, 20, 30, 40, 50, 60, 70, 90, 100, 130,
] as const;
export const TOP_10_MAX_POINTS = 600;
export const TOP_10_TURN_SECONDS = 20;
export const TOP_10_MAX_STRIKES = 3;

type RankedInput = {
  questionType?: QuestionGameplayType;
  question?: string;
  text?: { ar: string; en?: string };
  maxPoints?: number;
  turnDurationSeconds?: number;
  maxStrikesPerTeam?: number;
  rankedList?: {
    displayName?: { ar: string; en?: string };
    entries: Array<{
      id?: string;
      clientId?: string;
      rank?: number;
      answer: { ar: string; en?: string };
      aliases?: string[];
      points?: number;
    }>;
  };
};

@Injectable()
export class RankedListQuestionPolicy {
  normalize(input: RankedInput, existing?: Question): Record<string, unknown> {
    const questionType =
      input.questionType ??
      existing?.questionType ??
      QuestionGameplayType.STANDARD;
    if (questionType !== QuestionGameplayType.RANKED_LIST) {
      if (input.rankedList)
        this.fail(
          'RANKED_LIST_NOT_ALLOWED',
          'rankedList requires questionType ranked_list.',
        );
      return { questionType };
    }

    const definition = input.rankedList ?? existing?.rankedList;
    if (!definition)
      this.fail(
        'RANKED_LIST_REQUIRED',
        'A ranked-list definition is required.',
      );
    if (input.maxPoints !== undefined && input.maxPoints !== TOP_10_MAX_POINTS)
      this.fail(
        'RANKED_LIST_MAX_POINTS_INVALID',
        `Top 10 maxPoints must equal ${TOP_10_MAX_POINTS}.`,
      );
    const existingIds = new Map(
      (existing?.rankedList?.entries ?? []).map((entry, index) => [
        index,
        entry.id,
      ]),
    );
    const rankedList: RankedListDefinition = {
      displayName: {
        ar: definition.displayName?.ar?.trim() || 'توب 10',
        en: definition.displayName?.en?.trim() || 'Top 10',
      },
      entries: definition.entries.map((entry, index) => ({
        id: entry.id?.trim() || existingIds.get(index) || randomUUID(),
        rank: index + 1,
        answer: {
          ar: entry.answer.ar?.trim(),
          ...(entry.answer.en?.trim() ? { en: entry.answer.en.trim() } : {}),
        },
        aliases: (entry.aliases ?? []).map((alias) => alias.trim()),
        points: TOP_10_ENTRY_POINTS[index],
      })),
    };
    this.validate(
      rankedList,
      input.rankedList
        ? input.rankedList.entries.map((entry) => entry.clientId)
        : [],
    );
    const text = {
      ar:
        input.text?.ar?.trim() ||
        input.question?.trim() ||
        existing?.text?.ar ||
        existing?.question,
      ...(input.text?.en?.trim() || existing?.text?.en
        ? { en: input.text?.en?.trim() || existing?.text?.en }
        : {}),
    };
    if (!text.ar)
      this.fail(
        'RANKED_LIST_ARABIC_QUESTION_REQUIRED',
        'Arabic question text is required.',
      );

    return {
      questionType,
      text,
      question: text.ar,
      maxPoints: TOP_10_MAX_POINTS,
      turnDurationSeconds: TOP_10_TURN_SECONDS,
      maxStrikesPerTeam:
        input.maxStrikesPerTeam ??
        existing?.maxStrikesPerTeam ??
        TOP_10_MAX_STRIKES,
      rankedList,
      points: TOP_10_MAX_POINTS,
      score: TOP_10_MAX_POINTS,
    };
  }

  validate(
    definition: RankedListDefinition,
    clientIds: Array<string | undefined> = [],
  ): void {
    const entries = definition.entries;
    if (entries.length !== 10)
      this.fail(
        'RANKED_LIST_ENTRY_COUNT_INVALID',
        'Top 10 requires exactly 10 entries.',
      );
    const owners = new Map<
      string,
      { entryIndex: number; entryId: string; value: string }
    >();
    const conflicts: Array<Record<string, unknown>> = [];
    for (const [index, entry] of entries.entries()) {
      if (
        entry.rank !== index + 1 ||
        entry.points !== TOP_10_ENTRY_POINTS[index]
      )
        this.fail(
          'RANKED_LIST_SYSTEM_VALUES_INVALID',
          'Rank and points must use the backend-owned Top 10 preset.',
        );
      if (!entry.answer.ar?.trim() && !entry.answer.en?.trim())
        this.fail(
          'RANKED_LIST_ANSWER_REQUIRED',
          `Rank ${entry.rank} requires a canonical answer.`,
        );
      const canonical = [entry.answer.ar, entry.answer.en].filter(
        (value): value is string => Boolean(value?.trim()),
      );
      const local = new Map<string, { value: string; kind: string }>();
      for (const [valueIndex, item] of [
        ...canonical.map((item) => ({ value: item, kind: 'canonical' })),
        ...entry.aliases.map((item) => ({ value: item, kind: 'alias' })),
      ].entries()) {
        const { value, kind } = item;
        const normalized = normalizeAnswer(value);
        if (!normalized) {
          conflicts.push({
            code: 'BLANK_ALIAS',
            entryIndex: index,
            clientId: clientIds[index] ?? entry.id,
            conflictingValue: value,
            normalizedValue: normalized,
          });
          continue;
        }
        const localOwner = local.get(normalized);
        if (localOwner) {
          conflicts.push({
            code:
              localOwner.kind === 'canonical' || valueIndex < canonical.length
                ? 'ALIAS_EQUALS_CANONICAL'
                : 'DUPLICATE_ALIAS',
            entryIndex: index,
            clientId: clientIds[index] ?? entry.id,
            conflictingEntryIndex: index,
            conflictingClientId: clientIds[index] ?? entry.id,
            conflictingValue: value,
            normalizedValue: normalized,
          });
          continue;
        }
        local.set(normalized, { value, kind });
        const owner = owners.get(normalized);
        if (owner && owner.entryIndex !== index)
          conflicts.push({
            code: 'CROSS_ENTRY_ALIAS_CONFLICT',
            entryIndex: index,
            clientId: clientIds[index] ?? entry.id,
            conflictingEntryIndex: owner.entryIndex,
            conflictingClientId: clientIds[owner.entryIndex] ?? owner.entryId,
            conflictingValue: value,
            normalizedValue: normalized,
          });
        else
          owners.set(normalized, {
            entryIndex: index,
            entryId: entry.id,
            value,
          });
      }
    }
    if (conflicts.length)
      throw new BadRequestException({
        code: 'RANKED_LIST_ACCEPTED_ANSWER_CONFLICT',
        message:
          'Ranked-list canonical answers and aliases must be unique after normalization.',
        conflicts,
      });
    const total = entries.reduce((sum, entry) => sum + entry.points, 0);
    if (total !== TOP_10_MAX_POINTS)
      this.fail(
        'RANKED_LIST_POINTS_TOTAL_INVALID',
        `Top 10 entry points must total exactly ${TOP_10_MAX_POINTS}; received ${total}.`,
      );
  }

  private fail(code: string, message: string): never {
    throw new BadRequestException({ code, message });
  }
}
