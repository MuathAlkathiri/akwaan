import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BackendInstanceLeaseDocument } from './backend-instance-lease.schema';

/** Why a bounded database operation did not complete. */
export type LeaseFailureKind =
  | 'deadline'
  | 'server-selection'
  | 'network'
  | 'server-time-limit'
  | 'operation-timeout'
  | 'other';

export class LeaseOperationError extends Error {
  constructor(
    readonly kind: LeaseFailureKind,
    readonly operation: string,
    cause: unknown,
  ) {
    super(
      `${operation} failed (${kind}): ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = 'LeaseOperationError';
  }
}

/**
 * Distinguishes the failure classes the driver reports, so a log says whether
 * no server was reachable, the transport failed, the server hit `maxTimeMS`,
 * or our own deadline expired first.
 */
export function classifyLeaseFailure(error: unknown): LeaseFailureKind {
  const name = (error as { name?: string } | null)?.name ?? '';
  const code = (error as { code?: number } | null)?.code;
  if (name === 'LeaseDeadlineError') return 'deadline';
  if (name === 'MongoServerSelectionError') return 'server-selection';
  if (name === 'MongoNetworkError' || name === 'MongoNetworkTimeoutError') {
    return 'network';
  }
  if (name === 'MongoOperationTimeoutError') return 'operation-timeout';
  if (code === 50) return 'server-time-limit';
  return 'other';
}

class LeaseDeadlineError extends Error {
  constructor(ms: number) {
    super(`no reply within ${ms}ms`);
    this.name = 'LeaseDeadlineError';
  }
}

/** Status of one owner's lease, judged with the database server's clock. */
export interface OwnerLeaseStatus {
  owner: string;
  /** false when no lease document exists for the owner. */
  exists: boolean;
  /** true when the lease is older than the threshold (or missing). */
  stale: boolean;
}

@Injectable()
export class MongooseInstanceLeaseRepository {
  constructor(
    @InjectModel(BackendInstanceLeaseDocument.name)
    private readonly model: Model<BackendInstanceLeaseDocument>,
  ) {}

  /** Runs one operation under a server limit and an application deadline. */
  private async bounded<T>(
    operation: string,
    deadlineMs: number,
    work: () => Promise<T>,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new LeaseDeadlineError(deadlineMs)),
            deadlineMs,
          );
          timer.unref?.();
        }),
      ]);
    } catch (error) {
      throw new LeaseOperationError(
        classifyLeaseFailure(error),
        operation,
        error,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Creates or refreshes this instance's lease with the server's clock. */
  async heartbeat(input: {
    instanceId: string;
    commit?: string;
    deadlineMs: number;
  }): Promise<void> {
    await this.bounded('lease heartbeat', input.deadlineMs, () =>
      this.model
        .updateOne(
          { _id: input.instanceId },
          {
            $currentDate: { lastSeenAt: true },
            $setOnInsert: {
              kind: 'instance',
              protocol: 2,
              startedAt: new Date(),
              ...(input.commit ? { commit: input.commit } : {}),
            },
          },
          { upsert: true },
        )
        .setOptions({ maxTimeMS: input.deadlineMs })
        .exec(),
    );
  }

  /**
   * Lease status for the given owners. A missing document is reported as
   * `exists: false, stale: true`; freshness uses `$$NOW` on the server.
   */
  async status(input: {
    owners: string[];
    staleAfterMs: number;
    deadlineMs: number;
  }): Promise<Map<string, OwnerLeaseStatus>> {
    const result = new Map<string, OwnerLeaseStatus>();
    if (!input.owners.length) return result;
    const rows = await this.bounded('lease status', input.deadlineMs, () =>
      this.model
        .aggregate<{ _id: string; stale: boolean }>([
          { $match: { _id: { $in: input.owners }, kind: 'instance' } },
          {
            $project: {
              stale: {
                $gt: [
                  { $subtract: ['$$NOW', '$lastSeenAt'] },
                  input.staleAfterMs,
                ],
              },
            },
          },
        ])
        .option({ maxTimeMS: input.deadlineMs })
        .exec(),
    );
    for (const owner of input.owners) {
      result.set(owner, { owner, exists: false, stale: true });
    }
    for (const row of rows) {
      result.set(row._id, { owner: row._id, exists: true, stale: row.stale });
    }
    return result;
  }

  async release(instanceId: string, deadlineMs: number): Promise<void> {
    await this.bounded('lease release', deadlineMs, () =>
      this.model
        .deleteOne({ _id: instanceId, kind: 'instance' })
        .setOptions({ maxTimeMS: deadlineMs })
        .exec(),
    );
  }

  /** Housekeeping: drops instance leases dead for longer than `olderThanMs`. */
  async deleteExpired(
    olderThanMs: number,
    deadlineMs: number,
  ): Promise<number> {
    const result = await this.bounded('lease cleanup', deadlineMs, () =>
      this.model
        .deleteMany({
          kind: 'instance',
          $expr: {
            $gt: [{ $subtract: ['$$NOW', '$lastSeenAt'] }, olderThanMs],
          },
        })
        .setOptions({ maxTimeMS: deadlineMs })
        .exec(),
    );
    return result.deletedCount ?? 0;
  }

  async isPurgeConsumed(nonce: string, deadlineMs: number): Promise<boolean> {
    const found = await this.bounded('purge marker read', deadlineMs, () =>
      this.model
        .exists({ _id: `legacy-purge:${nonce}`, kind: 'legacy-purge' })
        .setOptions({ maxTimeMS: deadlineMs })
        .exec(),
    );
    return Boolean(found);
  }

  /**
   * Atomically claims a purge nonce. Exactly one caller can insert the marker;
   * every other caller (a concurrent instance, a redeploy) gets false.
   */
  async claimPurge(input: {
    nonce: string;
    instanceId: string;
    commit: string;
    deadlineMs: number;
  }): Promise<boolean> {
    try {
      await this.bounded('purge marker claim', input.deadlineMs, () =>
        this.model.create({
          _id: `legacy-purge:${input.nonce}`,
          kind: 'legacy-purge',
          commit: input.commit,
          consumedAt: new Date(),
          consumedBy: input.instanceId,
        }),
      );
      return true;
    } catch (error) {
      const cause = (error as { message?: string }).message ?? '';
      if (/E11000|duplicate key/i.test(cause)) return false;
      throw error;
    }
  }
}
