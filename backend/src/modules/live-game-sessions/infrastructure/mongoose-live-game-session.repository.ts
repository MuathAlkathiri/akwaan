import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LiveGameModeRegistry } from '../domain/live-game-mode.registry';
import {
  LiveGameSession,
  LiveGameSessionState,
} from '../domain/live-game-session';
import {
  LiveGameSessionRepository,
  OwnedSessionStatus,
  OwnedSessionRef,
} from '../domain/live-game-session.repository';
import { LiveSessionConcurrencyError } from '../domain/live-session.errors';
import {
  PARTICIPANT_PRESENCE,
  ParticipantPresence,
} from '../application/participant-presence.port';
import { LiveGameSessionDocument } from './live-game-session.schema';
import { toPersistedState } from './live-session-state.persistence';

@Injectable()
export class MongooseLiveGameSessionRepository implements LiveGameSessionRepository {
  constructor(
    @InjectModel(LiveGameSessionDocument.name)
    private readonly model: Model<LiveGameSessionDocument>,
    private readonly modes: LiveGameModeRegistry,
    @Inject(PARTICIPANT_PRESENCE)
    private readonly presence: ParticipantPresence,
  ) {}

  async create(session: LiveGameSession): Promise<void> {
    await this.model.create(this.toDocument(session.serialize()));
  }

  async findById(sessionId: string): Promise<LiveGameSession | null> {
    const document = await this.model.findOne({ sessionId }).lean().exec();
    return this.restore(document?.state as LiveGameSessionState | undefined);
  }

  async findByParentQuestion(
    parentGameId: string,
    parentGameQuestionId: string,
  ): Promise<LiveGameSession | null> {
    const document = await this.model
      .findOne({ parentGameId, parentGameQuestionId })
      .lean()
      .exec();
    return this.restore(document?.state as LiveGameSessionState | undefined);
  }

  async findOwnedSessionRefs(
    controllerActorId: string,
  ): Promise<OwnedSessionRef[]> {
    const rows = await this.model
      .find({ controllerActorId }, { sessionId: 1, status: 1, expiresAt: 1 })
      .lean()
      .exec();
    return rows.map((row) => ({
      sessionId: row.sessionId,
      status: row.status as OwnedSessionStatus,
      expiresAt: new Date(row.expiresAt),
    }));
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

  /** Restores an aggregate and merges the presence the server actually observes. */
  private async restore(
    state: LiveGameSessionState | undefined,
  ): Promise<LiveGameSession | null> {
    if (!state) return null;
    const session = LiveGameSession.restore(
      state,
      this.modes.resolve(state.modeKey, state.modeVersion),
    );
    session.applyPresence(await this.presence.read(state.id));
    return session;
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
      // Presence is removed here, not merely ignored: the replacement written
      // to Mongo contains no `connected`, `connectedDeviceCount` or
      // `lastSeenAt`, so this save has no opinion about them to impose.
      state: toPersistedState(state),
    };
  }
}
