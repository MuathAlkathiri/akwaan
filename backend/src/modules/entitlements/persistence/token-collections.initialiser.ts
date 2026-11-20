import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TokenLedgerEntryDocument } from './token-ledger-entry.schema';
import { TokenBalanceDocument } from './token-balance.schema';

/**
 * Makes both token collections exist before anything tries to write to them.
 *
 * MongoDB will not create a collection inside a multi-document transaction,
 * and the very first spend runs inside one — the Match's. On a database that
 * has never held a token, that first Match would fail to start, and so would
 * every other until something created the collections by accident. The whole
 * game would be down for a reason that looks nothing like its cause.
 *
 * Mongoose usually gets there first by building indexes on startup, which
 * creates the collections as a side effect. "Usually" is the problem: it is
 * asynchronous, it is disabled in some configurations, and what it protects
 * here is the first Match ever played on a new database — including the one
 * the VPS migration will start with.
 */
@Injectable()
export class TokenCollectionsInitialiser implements OnModuleInit {
  private readonly logger = new Logger(TokenCollectionsInitialiser.name);

  constructor(
    @InjectModel(TokenLedgerEntryDocument.name)
    private readonly entries: Model<TokenLedgerEntryDocument>,
    @InjectModel(TokenBalanceDocument.name)
    private readonly balances: Model<TokenBalanceDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([
      this.ensure(this.entries.collection.name, () =>
        this.entries.createCollection(),
      ),
      this.ensure(this.balances.collection.name, () =>
        this.balances.createCollection(),
      ),
    ]);
  }

  private async ensure(name: string, create: () => Promise<unknown>) {
    try {
      await create();
    } catch (error) {
      // Already there is the normal case on every start but the first.
      if (isNamespaceExists(error)) return;
      // Not fatal to boot: a read-only replica or a restricted user can refuse
      // this and the collection may still exist. Spending would fail loudly if
      // it does not, and a server that will not start helps nobody.
      this.logger.warn({
        event: 'token_collection_ensure_failed',
        collection: name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

const isNamespaceExists = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'codeName' in error &&
  (error as { codeName?: unknown }).codeName === 'NamespaceExists';
