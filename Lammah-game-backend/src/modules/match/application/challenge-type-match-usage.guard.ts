import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WorldContentReferenceGuard,
  WorldContentReferenceKind,
  WorldContentReferenceRegistry,
} from '../../world-content/application/world-content-reference.registry';
import { MatchStatus } from '../domain/match.constants';
import { MatchDocument } from '../persistence/match.schema';

/** Persisted gameplay—not authoring—is the deletion-history boundary. */
@Injectable()
export class ChallengeTypeMatchUsageGuard
  implements WorldContentReferenceGuard, OnModuleInit
{
  readonly source = 'persisted-matches';

  constructor(
    @InjectModel(MatchDocument.name)
    private readonly matches: Model<MatchDocument>,
    private readonly registry: WorldContentReferenceRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  countReferences(
    kind: WorldContentReferenceKind,
    id: string,
    identity?: { slug?: string },
  ): Promise<number> {
    if (kind !== 'challengeType') return Promise.resolve(0);
    const slug = identity?.slug;
    const executed = [
      { 'challengeResults.challengeTypeId': id },
      { 'currentChallenge.challengeTypeId': id },
      { 'pendingChallenge.challengeTypeId': id },
      ...(slug
        ? [
            { 'challengeResults.challengeKey': slug },
            { 'currentChallenge.challengeKey': slug },
            { 'pendingChallenge.challengeTypeSlug': slug },
          ]
        : []),
    ];
    const activeDependency = [
      { 'configuredBoardPositions.challengeTypeId': id },
      ...(slug ? [{ 'configuredBoardPositions.challengeTypeSlug': slug }] : []),
    ];
    return this.matches
      .countDocuments({
        $or: [
          ...executed,
          { status: MatchStatus.ACTIVE, $or: activeDependency },
        ],
      })
      .exec();
  }
}
