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

  async findById(runtimeId: string): Promise<GameplayRuntime | null> {
    return this.restore(await this.model.findOne({ runtimeId }).lean().exec());
  }

  async findBySessionId(sessionId: string): Promise<GameplayRuntime | null> {
    return this.restore(await this.model.findOne({ sessionId }).lean().exec());
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
      completedAt: state.completedAt,
      state,
    };
  }
}
