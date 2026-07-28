import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LiveSessionJoinAccess,
  LiveSessionJoinAccessState,
} from '../domain/live-session-join-access';
import { LiveSessionJoinAccessRepository } from '../domain/live-session-join-access.repository';
import { LiveSessionConcurrencyError } from '../domain/live-session.errors';
import { LiveSessionJoinAccessDocument } from './live-session-join-access.schema';

@Injectable()
export class MongooseLiveSessionJoinAccessRepository implements LiveSessionJoinAccessRepository {
  constructor(
    @InjectModel(LiveSessionJoinAccessDocument.name)
    private readonly model: Model<LiveSessionJoinAccessDocument>,
  ) {}

  async create(access: LiveSessionJoinAccess): Promise<void> {
    await this.model.create(this.toDocument(access.serialize()));
  }

  async findCurrentBySessionId(
    sessionId: string,
  ): Promise<LiveSessionJoinAccess | null> {
    const document = await this.model
      .findOne({ sessionId, enabled: true })
      .sort({ expiresAt: -1 })
      .lean()
      .exec();
    return document
      ? LiveSessionJoinAccess.restore(
          document.state as LiveSessionJoinAccessState,
        )
      : null;
  }

  async findByCode(
    normalizedCode: string,
  ): Promise<LiveSessionJoinAccess | null> {
    const document = await this.model.findOne({ normalizedCode }).lean().exec();
    return document
      ? LiveSessionJoinAccess.restore(
          document.state as LiveSessionJoinAccessState,
        )
      : null;
  }

  async save(
    access: LiveSessionJoinAccess,
    expectedRevision: number,
  ): Promise<void> {
    const state = access.serialize();
    const result = await this.model
      .replaceOne(
        { accessId: access.id, revision: expectedRevision },
        this.toDocument(state),
      )
      .exec();
    if (result.modifiedCount !== 1) {
      throw new LiveSessionConcurrencyError();
    }
  }

  private toDocument(state: LiveSessionJoinAccessState) {
    return {
      accessId: state.id,
      sessionId: state.sessionId,
      normalizedCode: state.normalizedCode,
      enabled: state.enabled,
      expiresAt: state.expiresAt,
      revision: state.revision,
      state,
    };
  }
}
