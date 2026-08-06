import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import {
  GameplayTransactionContext,
  GameplayTransactionUnitOfWork,
} from '../application/gameplay-transaction.unit-of-work';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import {
  GameplayRuntime,
  GameplayRuntimeState,
} from '../domain/gameplay-runtime';
import { LiveGameModeRegistry } from '../domain/live-game-mode.registry';
import {
  LiveGameSession,
  LiveGameSessionState,
} from '../domain/live-game-session';
import { LiveSessionConcurrencyError } from '../domain/live-session.errors';
import { GameplayRuntimeDocument } from './gameplay-runtime.schema';
import { LiveGameSessionDocument } from './live-game-session.schema';

@Injectable()
export class MongooseGameplayTransactionUnitOfWork implements GameplayTransactionUnitOfWork {
  private readonly logger = new Logger(
    MongooseGameplayTransactionUnitOfWork.name,
  );

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(LiveGameSessionDocument.name)
    private readonly sessions: Model<LiveGameSessionDocument>,
    @InjectModel(GameplayRuntimeDocument.name)
    private readonly runtimes: Model<GameplayRuntimeDocument>,
    private readonly sessionModes: LiveGameModeRegistry,
    private readonly gameplayModes: GameplayModeRegistry,
  ) {}

  async execute<T>(
    work: (context: GameplayTransactionContext) => Promise<T>,
  ): Promise<T> {
    const mongoSession = await this.connection.startSession();
    const transactionId = mongoSession.id?.id?.toString('hex');
    const startedAt = Date.now();
    this.logger.log({ event: 'gameplay_transaction_started', transactionId });
    try {
      let result: T | undefined;
      await mongoSession.withTransaction(async () => {
        result = await work(this.context(mongoSession));
      });
      if (result === undefined) {
        throw new Error('Gameplay transaction completed without a result');
      }
      this.logger.log({
        event: 'gameplay_transaction_committed',
        transactionId,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      this.logger.error({
        event: 'gameplay_transaction_aborted',
        transactionId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    } finally {
      await mongoSession.endSession();
    }
  }

  private context(mongoSession: ClientSession): GameplayTransactionContext {
    return {
      findSession: async (sessionId) => {
        const document = await this.sessions
          .findOne({ sessionId })
          .session(mongoSession)
          .lean()
          .exec();
        if (!document) return null;
        const state = document.state as LiveGameSessionState;
        return LiveGameSession.restore(
          state,
          this.sessionModes.resolve(state.modeKey, state.modeVersion),
        );
      },
      findRuntime: async (sessionId) => {
        const document = await this.runtimes
          .findOne({ sessionId })
          // A Match plays several runtimes per session; the newest is the live one.
          .sort({ createdAt: -1 })
          .session(mongoSession)
          .lean()
          .exec();
        if (!document) return null;
        const state = document.state as GameplayRuntimeState;
        return GameplayRuntime.restore(
          state,
          this.gameplayModes.resolve(state.modeKey, state.modeVersion),
        );
      },
      saveSession: async (session, expectedRevision) => {
        const state = session.serialize();
        const result = await this.sessions
          .replaceOne(
            { sessionId: state.id, revision: expectedRevision },
            {
              sessionId: state.id,
              parentGameId: state.parentGameId,
              parentGameQuestionId: state.parentGameQuestionId,
              status: state.status,
              modeKey: state.modeKey,
              modeVersion: state.modeVersion,
              controllerActorId: state.controllerActorId,
              revision: state.revision,
              expiresAt: state.expiresAt,
              state,
            },
            { session: mongoSession },
          )
          .exec();
        if (result.modifiedCount !== 1) {
          throw new LiveSessionConcurrencyError();
        }
      },
      saveRuntime: async (runtime, expectedRevision) => {
        const state = runtime.serialize();
        const result = await this.runtimes
          .replaceOne(
            { runtimeId: state.id, revision: expectedRevision },
            {
              runtimeId: state.id,
              sessionId: state.sessionId,
              modeKey: state.modeKey,
              modeVersion: state.modeVersion,
              status: state.status,
              revision: state.revision,
              activeRoundId: state.activeRound?.id,
              expiresAt: state.expiresAt,
              createdAt: state.createdAt,
              completedAt: state.completedAt,
              state,
            },
            { session: mongoSession },
          )
          .exec();
        if (result.modifiedCount !== 1) {
          throw new LiveSessionConcurrencyError();
        }
      },
    };
  }
}
