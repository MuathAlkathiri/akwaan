import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  CONTENT_SIGNAL_KINDS,
  CONTENT_SIGNAL_SOURCES,
  ContentSignalKind,
  ContentSignalSource,
} from '../domain/content-signal';

/**
 * One player's verdict on one question, in one Match.
 *
 * Kept apart from the ContentItem it is about: a verdict is an event with a
 * time and an author, and folding it into a counter on the item would throw
 * away who said it and when, which is the whole of its value when a question
 * turns out to be wrong and you need to know how long it had been wrong.
 */
@Schema({ collection: 'content_signals', timestamps: true, versionKey: false })
export class ContentSignalDocument {
  @Prop({ required: true, index: true })
  contentItemId!: string;

  @Prop({ required: true })
  challengeTypeKey!: string;

  @Prop({ required: true })
  ownerAccountId!: string;

  @Prop({ required: true })
  participantId!: string;

  @Prop({ required: true })
  matchId!: string;

  @Prop({ required: true, enum: CONTENT_SIGNAL_KINDS })
  kind!: ContentSignalKind;

  @Prop({ required: true, enum: CONTENT_SIGNAL_SOURCES })
  source!: ContentSignalSource;
}

export type ContentSignalHydrated = HydratedDocument<ContentSignalDocument>;

export const ContentSignalSchema =
  SchemaFactory.createForClass(ContentSignalDocument);

// One phone, one item, one verdict of each kind: a second tap changes nothing
// rather than counting twice, and the same player may both enjoy a question
// and report that its image is broken.
ContentSignalSchema.index(
  { matchId: 1, participantId: 1, contentItemId: 1, kind: 1 },
  { unique: true },
);

// Reading a question's verdicts, which is how the catalog is curated.
ContentSignalSchema.index({ contentItemId: 1, kind: 1 });

// Newest defects first, which is how a broken question is found the same day.
ContentSignalSchema.index({ kind: 1, createdAt: -1 });
