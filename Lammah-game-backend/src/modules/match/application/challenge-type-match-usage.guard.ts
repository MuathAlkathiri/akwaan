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

/** Match usage is split so completed history never blocks authoring cleanup. */
@Injectable()
export class ChallengeTypeMatchUsageGuard
  implements WorldContentReferenceGuard, OnModuleInit
{
  readonly source = 'persisted-matches-active';

  constructor(
    @InjectModel(MatchDocument.name)
    private readonly matches: Model<MatchDocument>,
    private readonly registry: WorldContentReferenceRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
    this.registry.register({
      source: 'persisted-matches-historical',
      countReferences: (kind, id, identity) =>
        this.countHistorical(kind, id, identity),
    });
    this.registry.register({
      source: 'persisted-matches-unsafe-history',
      countReferences: (kind, id, identity) =>
        this.countUnsafeHistory(kind, id, identity),
    });
  }

  countReferences(
    kind: WorldContentReferenceKind,
    id: string,
    identity?: { slug?: string },
  ): Promise<number> {
    if (kind !== 'challengeType') return Promise.resolve(0);
    const dependencies = this.dependencies(id, identity?.slug);
    return this.matches
      .countDocuments({ status: MatchStatus.ACTIVE, $or: dependencies })
      .exec();
  }

  private countHistorical(
    kind: WorldContentReferenceKind,
    id: string,
    identity?: { slug?: string },
  ): Promise<number> {
    if (kind !== 'challengeType') return Promise.resolve(0);
    return this.matches
      .countDocuments({
        status: MatchStatus.COMPLETED,
        $or: this.resultIdentity(id, identity?.slug),
      })
      .exec();
  }

  private countUnsafeHistory(
    kind: WorldContentReferenceKind,
    id: string,
    identity?: { slug?: string },
  ): Promise<number> {
    if (kind !== 'challengeType') return Promise.resolve(0);
    const identityClauses = [
      { challengeTypeId: id },
      ...(identity?.slug ? [{ challengeKey: identity.slug }] : []),
    ];
    return this.matches
      .countDocuments({
        status: MatchStatus.COMPLETED,
        challengeResults: {
          $elemMatch: {
            $and: [
              { $or: identityClauses },
              {
                $or: [
                  { challengeTypeId: { $exists: false } },
                  { challengeTypeId: '' },
                  { challengeKey: { $exists: false } },
                  { challengeKey: '' },
                ],
              },
            ],
          },
        },
      })
      .exec();
  }

  private resultIdentity(id: string, slug?: string) {
    return [
      { 'challengeResults.challengeTypeId': id },
      ...(slug ? [{ 'challengeResults.challengeKey': slug }] : []),
    ];
  }

  private dependencies(id: string, slug?: string) {
    return [
      ...this.resultIdentity(id, slug),
      { 'currentChallenge.challengeTypeId': id },
      { 'pendingChallenge.challengeTypeId': id },
      { 'configuredBoardPositions.challengeTypeId': id },
      ...(slug
        ? [
            { 'currentChallenge.challengeKey': slug },
            { 'pendingChallenge.challengeTypeSlug': slug },
            { 'configuredBoardPositions.challengeTypeSlug': slug },
          ]
        : []),
    ];
  }
}
