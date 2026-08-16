import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GameplayRuntime,
  GameplayRuntimeState,
} from '../domain/gameplay-runtime';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import { GameplayRuntimeRepository } from '../domain/gameplay-runtime.repository';
import { LiveSessionConcurrencyError } from '../domain/live-session.errors';
import { GameplayRuntimeDocument } from './gameplay-runtime.schema';

@Injectable()
export class MongooseGameplayRuntimeRepository implements GameplayRuntimeRepository {
  constructor(
    @InjectModel(GameplayRuntimeDocument.name)
    private readonly model: Model<GameplayRuntimeDocument>,
    private readonly modes: GameplayModeRegistry,
  ) {}

  async create(runtime: GameplayRuntime): Promise<void> {
    await this.model.create(this.toDocument(runtime.serialize()));
  }

  async findStateById(runtimeId: string): Promise<GameplayRuntimeState | null> {
    const document = await this.model.findOne({ runtimeId }).lean().exec();
    return document ? (document.state as GameplayRuntimeState) : null;
  }

  async findById(runtimeId: string): Promise<GameplayRuntime | null> {
    return this.restore(await this.model.findOne({ runtimeId }).lean().exec());
  }

  async findSessionIdsWithLiveRuntimes(): Promise<string[]> {
    // Newest runtime per session, keeping only sessions whose newest one is
    // still running. An older non-terminal runtime under a newer terminal one
    // is history, not a live challenge, and must not be rearmed.
    const rows = await this.model
      .aggregate<{ _id: string; status: string }>([
        { $sort: { sessionId: 1, createdAt: -1 } },
        {
          $group: {
            _id: '$sessionId',
            status: { $first: '$status' },
          },
        },
        { $match: { status: { $nin: ['completed', 'cancelled'] } } },
      ])
      .exec();
    return rows.map((row) => row._id);
  }

  /** The session's current runtime: the most recently created one. */
  async findBySessionId(sessionId: string): Promise<GameplayRuntime | null> {
    return this.restore(
      await this.model
        .findOne({ sessionId })
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
    );
  }

  async save(
    runtime: GameplayRuntime,
    expectedRevision: number,
  ): Promise<void> {
    const state = runtime.serialize();
    const result = await this.model
      .replaceOne(
        { runtimeId: runtime.id, revision: expectedRevision },
        this.toDocument(state),
      )
      .exec();
    if (result.modifiedCount !== 1) throw new LiveSessionConcurrencyError();
  }

  private restore(
    document: GameplayRuntimeDocument | null,
  ): GameplayRuntime | null {
    if (!document) return null;
    const state = document.state as GameplayRuntimeState;
    return GameplayRuntime.restore(
      state,
      this.modes.resolve(state.modeKey, state.modeVersion),
    );
  }

  private toDocument(state: GameplayRuntimeState) {
    return {
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
    };
  }
}
