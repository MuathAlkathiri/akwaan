import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ParticipantPresence } from '../application/participant-presence.port';
import {
  MAX_PARTICIPANT_CONNECTIONS,
  ParticipantPresenceProjection,
  presenceProjection,
} from '../domain/participant-presence';
import { LiveSessionPresenceDocument } from './live-session-presence.schema';

/**
 * The sole owner of participant presence.
 *
 * Every write is a single conditional Mongo update on one presence row, so two
 * concurrent socket events cannot lose each other's effect and no session or
 * gameplay save can address these fields at all.
 */
@Injectable()
export class MongooseParticipantPresenceRepository
  implements ParticipantPresence, OnApplicationBootstrap
{
  constructor(
    @InjectModel(LiveSessionPresenceDocument.name)
    private readonly model: Model<LiveSessionPresenceDocument>,
  ) {}

  /**
   * No connection outlives the process that held it, so every recorded one is
   * a lie the moment this boots. Clearing beats leaving players permanently
   * "connected" to a socket that no longer exists.
   *
   * This is correct only while exactly one backend instance exists, because it
   * clears every session rather than the ones this process owned. That
   * constraint is not introduced here and is not the first thing a second
   * instance would break: socket.io runs on its default in-process adapter with
   * no Redis, so rooms and broadcasts are already per-process, and the deadline
   * and countdown schedulers already hold their timers in memory. A second
   * instance would lose realtime delivery entirely before this mattered.
   * Instance-scoped presence belongs with that work, not ahead of it.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.clearAll();
  }

  async connect(input: {
    sessionId: string;
    participantId: string;
    connectionId: string;
    now: Date;
  }): Promise<boolean> {
    // Two conditions in one atomic update. `$addToSet` makes a repeated
    // subscribe from the same socket a no-op rather than an extra device, and
    // the size guard refuses a genuinely new device beyond the limit. Because
    // both are evaluated by the server against the stored array, two sockets
    // racing to claim the last slot cannot both win.
    const result = await this.model
      .updateOne(
        {
          sessionId: input.sessionId,
          participantId: input.participantId,
          $or: [
            { connections: input.connectionId },
            {
              [`connections.${MAX_PARTICIPANT_CONNECTIONS - 1}`]: {
                $exists: false,
              },
            },
          ],
        },
        {
          $addToSet: { connections: input.connectionId },
          $set: { lastSeenAt: input.now },
          $setOnInsert: {
            sessionId: input.sessionId,
            participantId: input.participantId,
          },
        },
        { upsert: true },
      )
      .exec()
      .catch((error: unknown) => {
        // A concurrent upsert for the same pair loses the unique index race.
        // The row it lost to is the row this call wanted, so retry once against
        // the now-existing document rather than failing a legitimate connect.
        if (!isDuplicateKey(error)) throw error;
        return this.model
          .updateOne(
            {
              sessionId: input.sessionId,
              participantId: input.participantId,
              $or: [
                { connections: input.connectionId },
                {
                  [`connections.${MAX_PARTICIPANT_CONNECTIONS - 1}`]: {
                    $exists: false,
                  },
                },
              ],
            },
            {
              $addToSet: { connections: input.connectionId },
              $set: { lastSeenAt: input.now },
            },
          )
          .exec();
      });
    return (result?.modifiedCount ?? 0) + (result?.upsertedCount ?? 0) > 0;
  }

  async disconnect(input: {
    sessionId: string;
    participantId: string;
    connectionId: string;
    now: Date;
  }): Promise<void> {
    // Removes exactly the connection that closed. A late callback from a socket
    // that already died pulls an id that is either absent or its own, so a
    // newer connection for the same participant is untouched — the case a
    // counter could never express.
    await this.model
      .updateOne(
        { sessionId: input.sessionId, participantId: input.participantId },
        {
          $pull: { connections: input.connectionId },
          $set: { lastSeenAt: input.now },
        },
      )
      .exec();
  }

  async touch(
    sessionId: string,
    participantId: string,
    now: Date,
  ): Promise<void> {
    // Liveness only. It deliberately cannot make anybody connected: presence
    // follows connections, and a heartbeat is evidence about one that already
    // exists.
    await this.model
      .updateOne({ sessionId, participantId }, { $set: { lastSeenAt: now } })
      .exec();
  }

  async read(
    sessionId: string,
  ): Promise<Map<string, ParticipantPresenceProjection>> {
    const rows = await this.model.find({ sessionId }).lean().exec();
    return new Map(
      rows.map((row) => [
        row.participantId,
        presenceProjection({
          participantId: row.participantId,
          connections: row.connections ?? [],
          ...(row.lastSeenAt ? { lastSeenAt: row.lastSeenAt } : {}),
        }),
      ]),
    );
  }

  async clearAll(): Promise<void> {
    await this.model.updateMany({}, { $set: { connections: [] } }).exec();
  }
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}
