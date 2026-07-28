import { randomInt, randomUUID } from 'crypto';
import { LiveSessionDomainError } from './live-session.errors';

export type TeamAssignmentPolicy = 'explicit' | 'balanced' | 'host-assigned';

export interface LiveSessionJoinAccessState {
  id: string;
  sessionId: string;
  publicCode: string;
  normalizedCode: string;
  assignmentPolicy: TeamAssignmentPolicy;
  teamScopeId?: string;
  maximumParticipantCount?: number;
  teamCapacity?: number;
  createdAt: Date;
  expiresAt: Date;
  enabled: boolean;
  revokedAt?: Date;
  createdByActorId: string;
  revokedByActorId?: string;
  failedAttempts: number;
  revision: number;
}

const JOIN_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateJoinCode(length = 7): string {
  return Array.from(
    { length },
    () => JOIN_ALPHABET[randomInt(0, JOIN_ALPHABET.length)],
  ).join('');
}

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase();
}

export class LiveSessionJoinAccess {
  private constructor(private readonly state: LiveSessionJoinAccessState) {}

  static create(input: {
    id?: string;
    sessionId: string;
    publicCode: string;
    assignmentPolicy: TeamAssignmentPolicy;
    teamScopeId?: string;
    maximumParticipantCount?: number;
    teamCapacity?: number;
    createdByActorId: string;
    now: Date;
    expiresAt: Date;
  }): LiveSessionJoinAccess {
    if (input.expiresAt.getTime() <= input.now.getTime()) {
      throw new LiveSessionDomainError(
        'INVALID_JOIN_ACCESS_EXPIRATION',
        'Join access expiration must be in the future',
      );
    }
    return new LiveSessionJoinAccess({
      id: input.id ?? randomUUID(),
      sessionId: input.sessionId,
      publicCode: normalizeJoinCode(input.publicCode),
      normalizedCode: normalizeJoinCode(input.publicCode),
      assignmentPolicy: input.assignmentPolicy,
      teamScopeId: input.teamScopeId,
      maximumParticipantCount: input.maximumParticipantCount,
      teamCapacity: input.teamCapacity,
      createdAt: input.now,
      expiresAt: input.expiresAt,
      enabled: true,
      createdByActorId: input.createdByActorId,
      failedAttempts: 0,
      revision: 0,
    });
  }

  static restore(state: LiveSessionJoinAccessState): LiveSessionJoinAccess {
    return new LiveSessionJoinAccess({
      ...state,
      createdAt: new Date(state.createdAt),
      expiresAt: new Date(state.expiresAt),
      revokedAt: state.revokedAt ? new Date(state.revokedAt) : undefined,
    });
  }

  get id() {
    return this.state.id;
  }

  get sessionId() {
    return this.state.sessionId;
  }

  get revision() {
    return this.state.revision;
  }

  assertAvailable(now: Date): void {
    if (!this.state.enabled || this.state.revokedAt) {
      throw new LiveSessionDomainError(
        'JOIN_ACCESS_REVOKED',
        'Session joining is closed',
      );
    }
    if (now.getTime() >= this.state.expiresAt.getTime()) {
      throw new LiveSessionDomainError(
        'JOIN_ACCESS_EXPIRED',
        'Session join access has expired',
      );
    }
  }

  revoke(actorId: string, now: Date): void {
    if (!this.state.enabled) return;
    this.state.enabled = false;
    this.state.revokedAt = now;
    this.state.revokedByActorId = actorId;
    this.state.revision += 1;
  }

  recordFailure(): void {
    this.state.failedAttempts = Math.min(20, this.state.failedAttempts + 1);
    this.state.revision += 1;
  }

  serialize(): LiveSessionJoinAccessState {
    return LiveSessionJoinAccess.restore(this.state).state;
  }
}
