import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Backend instance leases, and one-time legacy-presence purge markers.
 *
 * An `instance` lease proves a backend process is alive: it refreshes
 * `lastSeenAt` with the database server's clock (`$currentDate`), and other
 * instances judge staleness with `$$NOW`, so no two processes ever compare
 * their own clocks. Liveness is always computed from that timestamp; there is
 * deliberately no TTL index (TTL deletion is a periodic background pass, not a
 * liveness signal), and lookups are by `_id`, so no secondary index is needed.
 *
 * A `legacy-purge` marker records that one operator-issued purge nonce was
 * consumed, so a redeploy of the same commit with the same setting never
 * purges again.
 */
@Schema({
  collection: 'backend_instance_leases',
  timestamps: false,
  versionKey: false,
})
export class BackendInstanceLeaseDocument {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true, enum: ['instance', 'legacy-purge'] })
  kind!: 'instance' | 'legacy-purge';

  /** Presence protocol the instance speaks (2 = owner-scoped ids). */
  @Prop()
  protocol?: number;

  @Prop()
  commit?: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  lastSeenAt?: Date;

  @Prop()
  consumedAt?: Date;

  @Prop()
  consumedBy?: string;
}

export type BackendInstanceLeaseMongoDocument =
  HydratedDocument<BackendInstanceLeaseDocument>;
export const BackendInstanceLeaseSchema = SchemaFactory.createForClass(
  BackendInstanceLeaseDocument,
);
