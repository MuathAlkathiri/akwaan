import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  WorldContentReferenceGuard,
  WorldContentReferenceKind,
  WorldContentReferenceRegistry,
} from '../../world-content/application/world-content-reference.registry';
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
    const filter = {
      [this.fieldByKind[kind]]: new Types.ObjectId(id),
    } as FilterQuery<Question>;
    return this.questions.countDocuments(filter).exec();
  }
}
