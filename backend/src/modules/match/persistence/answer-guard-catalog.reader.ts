import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { GuardCatalogEntry } from '../../../common/utils/answer-collision-guard.util';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
} from '../../world-content/domain/world-content.constants';
import { ContentItem } from '../../world-content/schemas/content-item.schema';

/**
 * Above this many items a World's guard is not built and its questions are
 * judged exactly. A guard built from a truncated catalog would be a guard with
 * holes in it, which is worse than no guard.
 */
export const ANSWER_GUARD_CATALOG_CEILING = 5_000;

/** The database is told to give up on the read after this long. */
export const ANSWER_GUARD_READ_TIMEOUT_MS = 1_500;

/**
 * The collision domain an answer guard is built from: every READY `match` item
 * of one World, reduced to its id and accepted answers.
 *
 * Read-only, projected, World-bounded and never truncated — `list` stops at the
 * Admin page size, which would silently drop siblings. Read once per drawn
 * question, and only while typo tolerance is switched on; never per answer.
 */
@Injectable()
export class AnswerGuardCatalogReader {
  constructor(
    @InjectModel(ContentItem.name) private readonly model: Model<ContentItem>,
  ) {}

  /** `undefined` when the World is beyond the ceiling: no guard, exact only. */
  async readyMatchAnswers(
    worldId: string,
  ): Promise<GuardCatalogEntry[] | undefined> {
    const rows = await this.model
      .find(
        {
          worldId: new Types.ObjectId(worldId),
          status: ContentItemStatus.READY,
          'answerPayload.mode': ChallengeAnswerMode.MATCH,
        },
        { _id: 1, 'answerPayload.acceptedAnswers': 1 },
      )
      .limit(ANSWER_GUARD_CATALOG_CEILING + 1)
      .maxTimeMS(ANSWER_GUARD_READ_TIMEOUT_MS)
      .lean<
        Array<{
          _id: Types.ObjectId;
          answerPayload?: { acceptedAnswers?: unknown };
        }>
      >()
      .exec();
    if (rows.length > ANSWER_GUARD_CATALOG_CEILING) return undefined;
    return rows.map((row) => ({
      id: String(row._id),
      acceptedAnswers: Array.isArray(row.answerPayload?.acceptedAnswers)
        ? (row.answerPayload.acceptedAnswers as unknown[]).filter(
            (answer): answer is string => typeof answer === 'string',
          )
        : [],
    }));
  }
}
