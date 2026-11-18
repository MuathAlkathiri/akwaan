import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';
import { WorldContentFenceService } from '../../world-content/application/permanent-deletion/world-content-fence.service';

/**
 * Runs Match creation inside a transaction that first takes the fence of every
 * World the Match uses — the same fence Admin permanent deletion takes.
 *
 * The caller re-validates its setup inside `run`. If a deletion committed first,
 * that re-validation sees it and fails cleanly; if this commits first, the
 * deletion sees the new Match and blocks; if they overlap, the fence write
 * conflict makes MongoDB abort one and `withTransaction` retries it. A Match can
 * therefore never be created against a World, Scope or mechanic that a
 * concurrent deletion removes.
 */
@Injectable()
export class MatchCreationFence {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly fence: WorldContentFenceService,
  ) {}

  async run(
    worldIds: readonly string[],
    work: (session: ClientSession) => Promise<void>,
  ): Promise<void> {
    await this.fence.ensure(worldIds);
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(
        async () => {
          await this.fence.bump(worldIds, session);
          await work(session);
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      );
    } finally {
      await session.endSession();
    }
  }
}
