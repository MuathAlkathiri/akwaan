import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ParticipantPresence,
  StoredPresenceEntry,
} from '../application/participant-presence.port';
import {
  PRESENCE_INSTANCE,
  PresenceInstance,
} from '../application/presence-instance';
import {
  MAX_PARTICIPANT_CONNECTIONS,
  ParticipantPresenceProjection,
  presenceProjection,
} from '../domain/participant-presence';
import {
  ownedConnectionId,
  parsePresenceConnection,
} from '../domain/presence-connection-id';
import { LiveSessionPresenceDocument } from './live-session-presence.schema';

/**
 * The sole owner of participant presence.
 *
 * Every write is a single conditional Mongo update on one presence row, so two
 * concurrent socket events cannot lose each other's effect and no session or
 * gameplay save can address these fields at all.
 *
 * Entries are owner-scoped (`<instanceId>:<socketId>`). There is no boot-time
 * reset: a new instance no longer clears connections that belong to another
 * instance still serving players (the zero-downtime deploy overlap). A dead
 * owner's entries are removed by `PresenceOwnershipService`, one exact stored
 * value at a time, once its lease has stopped.
 */
@Injectable()
export class MongooseParticipantPresenceRepository implements ParticipantPresence {
  constructor(
    @InjectModel(LiveSessionPresenceDocument.name)
    private readonly model: Model<LiveSessionPresenceDocument>,
    @Inject(PRESENCE_INSTANCE)
    private readonly instance: PresenceInstance,
  ) {}

  private own(socketId: string): string {
    return ownedConnectionId(this.instance.instanceId, socketId);
  }

  async connect(input: {
    sessionId: string;
    participantId: string;
    connectionId: string;
    now: Date;
  }): Promise<boolean> {
    const entry = this.own(input.connectionId);
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
            { connections: entry },
            {
              [`connections.${MAX_PARTICIPANT_CONNECTIONS - 1}`]: {
                $exists: false,
              },
            },
          ],
        },
        {
          $addToSet: { connections: entry },
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
                { connections: entry },
                {
                  [`connections.${MAX_PARTICIPANT_CONNECTIONS - 1}`]: {
                    $exists: false,
                  },
                },
              ],
            },
            {
              $addToSet: { connections: entry },
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
  }): Promise<boolean> {
    // Removes exactly the connection that closed, owned by this instance. A
    // late callback from a socket that already died pulls an id that is either
    // absent or its own, so a newer connection for the same participant is
    // untouched — the case a counter could never express.
    const entry = this.own(input.connectionId);
    const result = await this.model
      .updateOne(
        {
          sessionId: input.sessionId,
          participantId: input.participantId,
          connections: entry,
        },
        {
          $pull: { connections: entry },
          $set: { lastSeenAt: input.now },
        },
      )
      .exec();
    return (result?.modifiedCount ?? 0) > 0;
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

  async connectionIds(sessionId: string): Promise<Set<string>> {
    const rows = await this.model
      .find({ sessionId }, { connections: 1, _id: 0 })
      .lean()
      .exec();
    const ids = new Set<string>();
    for (const row of rows) {
      for (const entry of row.connections ?? []) {
        ids.add(parsePresenceConnection(entry).socketId);
      }
    }
    return ids;
  }

  async removeExact(input: StoredPresenceEntry): Promise<boolean> {
    const result = await this.model
      .updateOne(
        {
          sessionId: input.sessionId,
          participantId: input.participantId,
          connections: input.entry,
        },
        { $pull: { connections: input.entry } },
      )
      .exec();
    return (result?.modifiedCount ?? 0) > 0;
  }

  async listEntries(): Promise<StoredPresenceEntry[]> {
    const rows = await this.model
      .find(
        { 'connections.0': { $exists: true } },
        { sessionId: 1, participantId: 1, connections: 1, _id: 0 },
      )
      .lean()
      .exec();
    return rows.flatMap((row) =>
      (row.connections ?? []).map((entry) => ({
        sessionId: row.sessionId,
        participantId: row.participantId,
        entry,
      })),
    );
  }

  async entriesFor(
    sessionId: string,
    participantId: string,
  ): Promise<string[]> {
    const row = await this.model
      .findOne({ sessionId, participantId }, { connections: 1, _id: 0 })
      .lean()
      .exec();
    return [...(row?.connections ?? [])];
  }
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}
