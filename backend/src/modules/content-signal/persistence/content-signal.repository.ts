import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContentSignalDocument } from './content-signal.schema';
import { ContentSignal, ContentSignalKind } from '../domain/content-signal';

export interface ContentSignalTally {
  contentItemId: string;
  challengeTypeKey: string;
  liked: number;
  defect: number;
}

@Injectable()
export class ContentSignalRepository {
  constructor(
    @InjectModel(ContentSignalDocument.name)
    private readonly model: Model<ContentSignalDocument>,
  ) {}

  /**
   * Writes the verdict, or leaves the one already there.
   *
   * A second tap is the same player saying the same thing, so the unique index
   * decides and a duplicate is success rather than an error the phone has to
   * explain.
   */
  async record(signal: ContentSignal): Promise<void> {
    await this.model.updateOne(
      {
        matchId: signal.matchId,
        participantId: signal.participantId,
        contentItemId: signal.contentItemId,
        kind: signal.kind,
      },
      { $setOnInsert: signal },
      { upsert: true },
    );
  }

  /** Every verdict on every item, counted. Small enough to read whole. */
  async tallies(): Promise<ContentSignalTally[]> {
    const rows = await this.model.aggregate<{
      _id: { contentItemId: string; challengeTypeKey: string };
      liked: number;
      defect: number;
    }>([
      {
        $group: {
          _id: {
            contentItemId: '$contentItemId',
            challengeTypeKey: '$challengeTypeKey',
          },
          liked: { $sum: { $cond: [{ $eq: ['$kind', 'liked'] }, 1, 0] } },
          defect: { $sum: { $cond: [{ $eq: ['$kind', 'defect'] }, 1, 0] } },
        },
      },
      { $sort: { defect: -1, liked: -1 } },
    ]);
    return rows.map((row) => ({
      contentItemId: row._id.contentItemId,
      challengeTypeKey: row._id.challengeTypeKey,
      liked: row.liked,
      defect: row.defect,
    }));
  }

  /** The most recent verdicts of one kind, for the day's defect sweep. */
  async recent(
    kind: ContentSignalKind,
    limit: number,
  ): Promise<ContentSignalDocument[]> {
    return this.model
      .find({ kind })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<ContentSignalDocument[]>();
  }
}
