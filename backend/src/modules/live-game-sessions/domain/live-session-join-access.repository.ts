import { LiveSessionJoinAccess } from './live-session-join-access';

export const LIVE_SESSION_JOIN_ACCESS_REPOSITORY = Symbol(
  'LIVE_SESSION_JOIN_ACCESS_REPOSITORY',
);

export interface LiveSessionJoinAccessRepository {
  create(access: LiveSessionJoinAccess): Promise<void>;
  findCurrentBySessionId(
    sessionId: string,
  ): Promise<LiveSessionJoinAccess | null>;
  findByCode(normalizedCode: string): Promise<LiveSessionJoinAccess | null>;
  save(access: LiveSessionJoinAccess, expectedRevision: number): Promise<void>;
}
