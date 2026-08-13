import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  WorldContentReferenceGuard,
  WorldContentReferenceKind,
  WorldContentReferenceRegistry,
} from '../../world-content/application/world-content-reference.registry';
import { WorldContentReferenceDetail } from '../../world-content/domain/world-content.errors';
import { Question } from '../schemas/question.schema';

/**
 * DEPRECATED BRIDGE — remove with the legacy question authoring flow.
 *
 * Legacy questions carry World Content classification fields until they are
 * migrated into Content Items. This guard lets the World Content domain refuse a
 * delete that would orphan them, without the new domain importing the legacy
 * Question model: the dependency points legacy -> world-content only.
 */
@Injectable()
export class LegacyQuestionWorldReferenceGuard
  implements WorldContentReferenceGuard, OnModuleInit
{
  readonly source = 'legacy-questions';

  /** `contentCategoryId` is the legacy field name for a Scope reference. */
  private readonly fieldByKind: Record<WorldContentReferenceKind, string> = {
    world: 'worldId',
    scope: 'contentCategoryId',
    challengeType: 'challengeTypeId',
  };

  constructor(
    @InjectModel(Question.name) private readonly questions: Model<Question>,
    private readonly registry: WorldContentReferenceRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  countReferences(
    kind: WorldContentReferenceKind,
    id: string,
  ): Promise<number> {
    return this.questions.countDocuments(this.filterFor(kind, id)).exec();
  }

  /**
   * Names the blocking questions so an admin can open or clean them instead of
   * guessing. A legacy question often has no text yet, so the id is the label.
   */
  async describeReferences(
    kind: WorldContentReferenceKind,
    id: string,
  ): Promise<WorldContentReferenceDetail[]> {
    const documents = await this.questions
      .find(this.filterFor(kind, id))
      .select({ text: 1, status: 1 })
      .limit(20)
      .lean()
      .exec();
    return documents.map((document) => ({
      source: this.source,
      id: String(document._id),
      label: String(document.text ?? '').trim() || 'سؤال بدون نص',
      ...(document.status ? { status: String(document.status) } : {}),
    }));
  }

  private filterFor(
    kind: WorldContentReferenceKind,
    id: string,
  ): FilterQuery<Question> {
    return {
      [this.fieldByKind[kind]]: new Types.ObjectId(id),
    } as FilterQuery<Question>;
  }
}
