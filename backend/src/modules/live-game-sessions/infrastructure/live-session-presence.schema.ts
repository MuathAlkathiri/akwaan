import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * One participant's observed connections, stored apart from the session.
 *
 * Its own collection on purpose. The session document is persisted by replacing
 * its whole `state` under a revision guard, which makes every field inside it
 * owned by the last aggregate that loaded it — fine for teams, turns and
 * readiness, wrong for something written by socket events that hold no
 * aggregate. Keeping presence here means a gameplay save physically cannot
 * address these fields, so it cannot revert them.
 */
@Schema({
  collection: 'live_session_presence',
  timestamps: false,
  versionKey: false,
})
export class LiveSessionPresenceDocument {
  @Prop({ required: true, index: true })
  sessionId!: string;

  @Prop({ required: true })
  participantId!: string;

  /**
   * Transport connection ids currently open, as reported by the gateway.
   *
   * Identities, not a count: `$addToSet`/`$pull` on a specific id makes both
   * the duplicate-subscribe and the late-disconnect-from-a-dead-socket cases
   * correct without any ordering assumption between the two events.
   */
  @Prop({ type: [String], default: [] })
  connections!: string[];

  @Prop()
  lastSeenAt?: Date;
}

export type LiveSessionPresenceMongoDocument =
  HydratedDocument<LiveSessionPresenceDocument>;
export const LiveSessionPresenceSchema = SchemaFactory.createForClass(
  LiveSessionPresenceDocument,
);
// One presence row per participant; every write targets it by this pair.
LiveSessionPresenceSchema.index(
  { sessionId: 1, participantId: 1 },
  { unique: true },
);
