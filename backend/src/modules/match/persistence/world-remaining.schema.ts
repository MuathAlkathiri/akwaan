import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * How much of a World is still new to one account.
 *
 * A summary, deliberately. The honest number — questions this account has not
 * yet exhausted — can always be derived from the exposure ledger and the
 * catalogue, but deriving it costs a scan of both, and the home page asks for
 * it once per World on every visit. So the work moves from read time, which
 * happens constantly, to write time, which happens only when a player is
 * actually shown something.
 *
 * A question counts as spent only once it has been seen in EVERY challenge it
 * can be played through. That follows the exposure ledger's own rule: the same
 * fact asked a different way is a different experience, so it is still owed to
 * the player. A counter that spent an item on first sight would be quicker to
 * maintain and would tell the player they have less left than they do.
 *
 * Being a summary, it can drift — an item added or retired in the admin panel
 * changes the truth without touching this. `totalReady` is kept so a changed
 * catalogue is noticed, and `rebuiltAt` so a stale one can be refused.
 */
@Schema({ collection: 'world_remaining', timestamps: true, versionKey: false })
export class WorldRemainingDocument {
  @Prop({ required: true, index: true })
  accountId!: string;

  @Prop({ required: true })
  worldId!: string;

  /** Questions this account has not yet exhausted in this World. */
  @Prop({ required: true, min: 0 })
  remaining!: number;

  /** Playable questions the World held when this was last rebuilt. */
  @Prop({ required: true, min: 0 })
  totalReady!: number;

  /** Of those, how many this account has used up entirely. */
  @Prop({ required: true, min: 0 })
  exhausted!: number;

  @Prop({ type: Date, required: true })
  rebuiltAt!: Date;
}

export type WorldRemainingHydrated = HydratedDocument<WorldRemainingDocument>;

export const WorldRemainingSchema = SchemaFactory.createForClass(
  WorldRemainingDocument,
);

// One summary per account per World, and the lookup the home page makes.
WorldRemainingSchema.index({ accountId: 1, worldId: 1 }, { unique: true });
