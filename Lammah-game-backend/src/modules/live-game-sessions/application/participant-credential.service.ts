import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import {
  LiveSessionForbiddenError,
  LiveSessionNotFoundError,
} from '../domain/live-session.errors';
import { LiveSessionActor } from './live-session-actor';

interface ParticipantCredentialPayload {
  tokenKind: 'live-participant';
  sub: string;
  sessionId: string;
  participantId: string;
  role: 'team-player' | 'observer';
  credentialVersion: number;
}

@Injectable()
export class ParticipantCredentialService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
  ) {}

  async issue(input: {
    sessionId: string;
    participantId: string;
    role: 'team-player' | 'observer';
    credentialVersion: number;
  }): Promise<{ credential: string; expiresAt: string }> {
    const expiresInSeconds = 24 * 60 * 60;
    const credential = await this.jwt.signAsync(
      {
        tokenKind: 'live-participant',
        sub: input.participantId,
        ...input,
      },
      { expiresIn: expiresInSeconds },
    );
    return {
      credential,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000).toISOString(),
    };
  }

  async authenticate(token: string): Promise<LiveSessionActor> {
    let payload: ParticipantCredentialPayload;
    try {
      payload = await this.jwt.verifyAsync<ParticipantCredentialPayload>(token);
    } catch {
      throw new LiveSessionForbiddenError();
    }
    if (
      payload.tokenKind !== 'live-participant' ||
      payload.sub !== payload.participantId
    ) {
      throw new LiveSessionForbiddenError();
    }
    const session = await this.sessions.findById(payload.sessionId);
    if (!session) throw new LiveSessionNotFoundError(payload.sessionId);
    const participant = session.participantById(payload.participantId);
    if (
      participant.removedAt ||
      participant.role !== payload.role ||
      participant.credentialVersion !== payload.credentialVersion
    ) {
      throw new LiveSessionForbiddenError();
    }
    return {
      kind: 'participant',
      actorId: participant.id,
      sessionId: payload.sessionId,
      participantId: participant.id,
      role: payload.role,
      credentialVersion: payload.credentialVersion,
    };
  }
}
