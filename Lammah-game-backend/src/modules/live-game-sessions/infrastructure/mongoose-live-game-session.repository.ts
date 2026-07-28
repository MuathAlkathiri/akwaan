import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LiveGameModeRegistry } from '../domain/live-game-mode.registry';
import {
  LiveGameSession,
  LiveGameSessionState,
} from '../domain/live-game-session';
import { LiveGameSessionRepository } from '../domain/live-game-session.repository';
import { LiveSessionConcurrencyError } from '../domain/live-session.errors';
import { ParticipantPresence } from '../application/participant-presence.port';
import { LiveGameSessionDocument } from './live-game-session.schema';

@Injectable()
export class MongooseLiveGameSessionRepository
  implements
    LiveGameSessionRepository,
    ParticipantPresence,
    OnApplicationBootstrap
{
  constructor(
    @InjectModel(LiveGameSessionDocument.name)
    private readonly model: Model<LiveGameSessionDocument>,
    private readonly modes: LiveGameModeRegistry,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.model
      .updateMany(
        {},
        {
          $set: {
            'state.participants.$[].connected': false,
            'state.participants.$[].connectedDeviceCount': 0,
          },
        },
      )
      .exec();
  }

  async create(session: LiveGameSession): Promise<void> {
    await this.model.create(this.toDocument(session.serialize()));
  }

  async findById(sessionId: string): Promise<LiveGameSession | null> {
    const document = await this.model.findOne({ sessionId }).lean().exec();
    if (!document) return null;
    const state = document.state as LiveGameSessionState;
    return LiveGameSession.restore(
      state,
      this.modes.resolve(state.modeKey, state.modeVersion),
    );
  }

  async findByParentQuestion(
    parentGameId: string,
    parentGameQuestionId: string,
  ): Promise<LiveGameSession | null> {
    const document = await this.model
      .findOne({ parentGameId, parentGameQuestionId })
      .lean()
      .exec();
    if (!document) return null;
    const state = document.state as LiveGameSessionState;
    return LiveGameSession.restore(
      state,
      this.modes.resolve(state.modeKey, state.modeVersion),
    );
  }

  async save(
    session: LiveGameSession,
    expectedRevision: number,
  ): Promise<void> {
    const state = session.serialize();
    const result = await this.model
      .replaceOne(
        { sessionId: session.id, revision: expectedRevision },
        this.toDocument(state),
      )
      .exec();
    if (result.modifiedCount !== 1) {
      throw new LiveSessionConcurrencyError();
    }
  }

  async connect(
    sessionId: string,
    actorId: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.model
      .updateOne(
        {
          sessionId,
          'state.participants': {
            $elemMatch: {
              id: actorId,
              removedAt: { $exists: false },
              connectedDeviceCount: { $lt: 2 },
            },
          },
        },
        {
          $inc: { 'state.participants.$.connectedDeviceCount': 1 },
          $set: {
            'state.participants.$.connected': true,
            'state.participants.$.lastSeenAt': now,
          },
        },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  async disconnect(
    sessionId: string,
    actorId: string,
    now: Date,
  ): Promise<void> {
    await this.model
      .updateOne(
        {
          sessionId,
          'state.participants': {
            $elemMatch: { id: actorId, connectedDeviceCount: { $gt: 0 } },
          },
        },
        {
          $inc: { 'state.participants.$.connectedDeviceCount': -1 },
          $set: { 'state.participants.$.lastSeenAt': now },
        },
      )
      .exec();
    await this.model
      .updateOne(
        {
          sessionId,
          'state.participants': {
            $elemMatch: { id: actorId, connectedDeviceCount: { $lte: 0 } },
          },
        },
        {
          $set: {
            'state.participants.$.connected': false,
            'state.participants.$.connectedDeviceCount': 0,
          },
        },
      )
      .exec();
  }

  async touch(
    sessionId: string,
    participantId: string,
    now: Date,
  ): Promise<void> {
    await this.model
      .updateOne(
        {
          sessionId,
          'state.participants.id': participantId,
        },
        {
          $set: { 'state.participants.$.lastSeenAt': now },
        },
      )
      .exec();
  }

  private toDocument(state: LiveGameSessionState) {
    return {
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
    };
  }
}
