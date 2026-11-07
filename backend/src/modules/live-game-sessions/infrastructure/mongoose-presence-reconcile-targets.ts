import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GameplayRuntimeDocument } from './gameplay-runtime.schema';

/** Which persisted runtime a reconciliation verdict was reached against. */
export interface RuntimeFingerprint {
  sessionId: string;
  runtimeId: string;
  revision: number;
}

const TERMINAL_RUNTIME_STATUSES = ['completed', 'cancelled'];

/**
 * Presence-only reads over `gameplay_runtimes`.
 *
 * Kept apart from `GameplayRuntimeRepository.findSessionIdsWithLiveRuntimes`
 * on purpose: the deadline scheduler's rearm deliberately sees every
 * non-terminal runtime, while presence reconciliation must not spend a pass on
 * a session nobody can play any more. These reads never restore a runtime
 * through its plugin, so an unrestorable document is still fingerprinted.
 */
@Injectable()
export class MongoosePresenceReconcileTargets {
  constructor(
    @InjectModel(GameplayRuntimeDocument.name)
    private readonly model: Model<GameplayRuntimeDocument>,
  ) {}

  /**
   * The newest runtime of every session that is still playable: not terminal
   * and not past `expiresAt`. A runtime's `expiresAt` is copied from its
   * session at creation, and a session's expiry is fixed at creation and never
   * extended; past it every session command is refused (`SESSION_EXPIRED`), so
   * nothing presence could reconcile there can matter. The `expiresAt` match
   * runs first, on its index, so abandoned history is never even grouped.
   */
  async playable(now: Date): Promise<RuntimeFingerprint[]> {
    const rows = await this.model
      .aggregate<{
        _id: string;
        runtimeId: string;
        revision: number;
        status: string;
        expiresAt: Date;
      }>([
        { $match: { expiresAt: { $gt: now } } },
        { $sort: { sessionId: 1, createdAt: -1 } },
        {
          $group: {
            _id: '$sessionId',
            runtimeId: { $first: '$runtimeId' },
            revision: { $first: '$revision' },
            status: { $first: '$status' },
          },
        },
        { $match: { status: { $nin: TERMINAL_RUNTIME_STATUSES } } },
      ])
      .exec();
    return rows.map((row) => ({
      sessionId: row._id,
      runtimeId: row.runtimeId,
      revision: row.revision,
    }));
  }

  /**
   * The newest runtime of each given session, whatever its status, or nothing
   * for a session without one. Used to tell whether a quarantined session's
   * persisted state has changed since the verdict.
   *
   * Grouped over every runtime of those sessions, not only unexpired ones, so a
   * newer expired runtime is never shadowed by an older one.
   */
  async fingerprints(sessionIds: string[]): Promise<RuntimeFingerprint[]> {
    if (!sessionIds.length) return [];
    const rows = await this.model
      .aggregate<{ _id: string; runtimeId: string; revision: number }>([
        { $match: { sessionId: { $in: sessionIds } } },
        { $sort: { sessionId: 1, createdAt: -1 } },
        {
          $group: {
            _id: '$sessionId',
            runtimeId: { $first: '$runtimeId' },
            revision: { $first: '$revision' },
          },
        },
      ])
      .exec();
    return rows.map((row) => ({
      sessionId: row._id,
      runtimeId: row.runtimeId,
      revision: row.revision,
    }));
  }
}
