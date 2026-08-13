import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LiveSessionJoinAccess } from '../domain/live-session-join-access';
import {
  LIVE_SESSION_JOIN_ACCESS_REPOSITORY,
  LiveSessionJoinAccessRepository,
} from '../domain/live-session-join-access.repository';
import { LiveGameSession } from '../domain/live-game-session';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import {
  LiveSessionDomainError,
  LiveSessionForbiddenError,
  LiveSessionNotFoundError,
} from '../domain/live-session.errors';
import { LiveSessionActor } from './live-session-actor';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import {
  LiveGameSessionSnapshot,
  LiveGameSessionSnapshotMapper,
} from './live-game-session.snapshot';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from './live-session-transition.publisher';
import { ParticipantCredentialService } from './participant-credential.service';
import { normalizeJoinCode } from '../domain/live-session-join-access';
import { BombCountdownScheduler } from './bomb-countdown.scheduler';
import { LiveSessionSnapshotComposer } from './live-session-snapshot.composer';

export interface JoinedLiveParticipant {
  sessionId: string;
  participantId: string;
  credential: string;
  credentialExpiresAt: string;
  snapshot: LiveGameSessionSnapshot;
}

@Injectable()
export class JoinLiveSession {
  constructor(
    @Inject(LIVE_SESSION_JOIN_ACCESS_REPOSITORY)
    private readonly accesses: LiveSessionJoinAccessRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly credentials: ParticipantCredentialService,
    private readonly snapshotComposer: LiveSessionSnapshotComposer,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
  ) {}

  async execute(input: {
    joinCode: string;
    displayName: string;
    requestedTeamId?: string;
    joinRequestId: string;
    device?: { label?: string; platform?: string };
  }): Promise<JoinedLiveParticipant> {
    const access = await this.accesses.findByCode(
      normalizeJoinCode(input.joinCode),
    );
    if (!access) {
      throw new LiveSessionDomainError(
        'JOIN_ACCESS_UNAVAILABLE',
        'Session join access is unavailable',
      );
    }
    const now = this.clock.now();
    access.assertAvailable(now);
    const session = await this.sessions.findById(access.sessionId);
    if (!session) throw new LiveSessionNotFoundError(access.sessionId);
    const state = session.serialize();
    const existing = state.participants.find(
      (participant) =>
        participant.joinRequestId === input.joinRequestId &&
        !participant.removedAt,
    );
    if (existing && existing.role !== 'controller') {
      return this.result(session, existing.id, existing.role, now);
    }
    const accessState = access.serialize();
    const activePlayers = state.participants.filter(
      (participant) =>
        participant.role === 'team-player' && !participant.removedAt,
    );
    if (
      accessState.maximumParticipantCount !== undefined &&
      activePlayers.length >= accessState.maximumParticipantCount
    ) {
      throw new LiveSessionDomainError(
        'SESSION_FULL',
        'Session participant capacity has been reached',
      );
    }
    const teamId = this.assignTeam(session, access, input.requestedTeamId);
    if (
      teamId &&
      accessState.teamCapacity !== undefined &&
      activePlayers.filter((participant) => participant.teamId === teamId)
        .length >= accessState.teamCapacity
    ) {
      throw new LiveSessionDomainError(
        'TEAM_FULL',
        'Selected team capacity has been reached',
      );
    }
    const previousRevision = session.revision;
    const participant = session.enrollParticipant({
      id: randomUUID(),
      displayName: input.displayName,
      teamId,
      role: 'team-player',
      joinRequestId: input.joinRequestId,
      device: input.device,
      now,
    });
    session.completeCommand(input.joinRequestId, now);
    await this.sessions.save(session, previousRevision);
    const result = await this.result(
      session,
      participant.id,
      'team-player',
      now,
    );
    this.publisher.publish('live-session:participant-joined', result.snapshot, {
      participantId: participant.id,
    });
    return result;
  }

  private assignTeam(
    session: LiveGameSession,
    access: LiveSessionJoinAccess,
    requestedTeamId?: string,
  ): string | undefined {
    const sessionState = session.serialize();
    const accessState = access.serialize();
    const eligibleTeams = sessionState.teams.filter(
      (team) =>
        team.active &&
        (!accessState.teamScopeId || team.id === accessState.teamScopeId),
    );
    if (accessState.assignmentPolicy === 'host-assigned') return undefined;
    if (accessState.assignmentPolicy === 'explicit') {
      if (
        !requestedTeamId ||
        !eligibleTeams.some((team) => team.id === requestedTeamId)
      ) {
        throw new LiveSessionDomainError(
          'TEAM_SELECTION_REQUIRED',
          'Select an eligible team',
        );
      }
      return requestedTeamId;
    }
    return eligibleTeams
      .map((team, index) => ({
        id: team.id,
        index,
        count: sessionState.participants.filter(
          (participant) =>
            participant.role === 'team-player' &&
            !participant.removedAt &&
            participant.teamId === team.id,
        ).length,
      }))
      .sort(
        (left, right) => left.count - right.count || left.index - right.index,
      )
      .at(0)?.id;
  }

  private async result(
    session: LiveGameSession,
    participantId: string,
    role: 'team-player' | 'observer',
    now: Date,
  ): Promise<JoinedLiveParticipant> {
    const participant = session.participantById(participantId);
    const issued = await this.credentials.issue({
      sessionId: session.id,
      participantId,
      role,
      credentialVersion: participant.credentialVersion,
    });
    return {
      sessionId: session.id,
      participantId,
      credential: issued.credential,
      credentialExpiresAt: issued.expiresAt,
      snapshot: await this.snapshotComposer.compose(
        session,
        {
          kind: 'participant',
          actorId: participantId,
          participantId,
          sessionId: session.id,
          role,
          credentialVersion: participant.credentialVersion,
        },
        now,
      ),
    };
  }
}

@Injectable()
export class ReconnectLiveParticipant {
  constructor(
    private readonly credentials: ParticipantCredentialService,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly snapshotComposer: LiveSessionSnapshotComposer,
  ) {}

  async execute(credential: string): Promise<JoinedLiveParticipant> {
    const actor = await this.credentials.authenticate(credential);
    if (actor.kind !== 'participant') throw new LiveSessionForbiddenError();
    const session = await this.sessions.findById(actor.sessionId);
    if (!session) throw new LiveSessionNotFoundError(actor.sessionId);
    const issued = await this.credentials.issue({
      sessionId: actor.sessionId,
      participantId: actor.participantId,
      role: actor.role,
      credentialVersion: actor.credentialVersion,
    });
    return {
      sessionId: actor.sessionId,
      participantId: actor.participantId,
      credential: issued.credential,
      credentialExpiresAt: issued.expiresAt,
      snapshot: await this.snapshotComposer.compose(
        session,
        actor,
        this.clock.now(),
      ),
    };
  }
}

@Injectable()
export class SetParticipantReadiness {
  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly snapshots: LiveGameSessionSnapshotMapper,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
    private readonly countdown: BombCountdownScheduler,
  ) {}

  async execute(input: {
    actor: LiveSessionActor;
    ready: boolean;
    expectedRevision: number;
    commandId: string;
  }) {
    if (input.actor.kind !== 'participant') {
      throw new LiveSessionForbiddenError();
    }
    const session = await this.sessions.findById(input.actor.sessionId);
    if (!session) throw new LiveSessionNotFoundError(input.actor.sessionId);
    if (session.isDuplicate(input.commandId)) {
      return this.snapshots.toSnapshot(
        session,
        input.actor.participantId,
        this.clock.now(),
      );
    }
    session.assertRevision(input.expectedRevision);
    const previousRevision = session.revision;
    const now = this.clock.now();
    session.setParticipantReady(input.actor.participantId, input.ready, now);
    let countdownEndsAt: Date | undefined;
    if (
      input.ready &&
      session.serialize().modeKey === 'bomb' &&
      session
        .serialize()
        .teams.filter((team) => team.active)
        .every((team) =>
          session
            .serialize()
            .participants.some(
              (participant) =>
                participant.role === 'team-player' &&
                participant.teamId === team.id &&
                participant.ready &&
                participant.connected &&
                !participant.removedAt,
            ),
        )
    ) {
      session.beginCountdown(now, 3_000);
      countdownEndsAt = session.serialize().countdownEndsAt;
    }
    session.completeCommand(input.commandId, now);
    await this.sessions.save(session, previousRevision);
    const snapshot = this.snapshots.toSnapshot(
      session,
      input.actor.participantId,
      now,
    );
    this.publisher.publish('live-session:participant-ready-changed', snapshot, {
      participantId: input.actor.participantId,
    });
    if (countdownEndsAt) {
      this.countdown.schedule(session.id, countdownEndsAt);
    }
    return snapshot;
  }
}

abstract class HostParticipantMutation {
  constructor(
    protected readonly sessions: LiveGameSessionRepository,
    protected readonly clock: LiveSessionClock,
    protected readonly snapshots: LiveGameSessionSnapshotMapper,
    protected readonly publisher: LiveSessionTransitionPublisher,
  ) {}

  protected async mutate(input: {
    sessionId: string;
    actorId: string;
    participantId: string;
    expectedRevision: number;
    commandId: string;
    event: string;
    action: (session: LiveGameSession, now: Date) => void;
  }) {
    const session = await this.sessions.findById(input.sessionId);
    if (!session) throw new LiveSessionNotFoundError(input.sessionId);
    if (session.controllerActorId !== input.actorId) {
      throw new LiveSessionForbiddenError();
    }
    if (session.isDuplicate(input.commandId)) {
      return this.snapshots.toSnapshot(
        session,
        input.actorId,
        this.clock.now(),
      );
    }
    session.assertRevision(input.expectedRevision);
    const previousRevision = session.revision;
    const now = this.clock.now();
    input.action(session, now);
    session.completeCommand(input.commandId, now);
    await this.sessions.save(session, previousRevision);
    const snapshot = this.snapshots.toSnapshot(session, input.actorId, now);
    this.publisher.publish(input.event, snapshot, {
      participantId: input.participantId,
    });
    return snapshot;
  }
}

@Injectable()
export class AssignParticipantTeam extends HostParticipantMutation {
  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY) sessions: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) clock: LiveSessionClock,
    snapshots: LiveGameSessionSnapshotMapper,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    publisher: LiveSessionTransitionPublisher,
    @Inject(LIVE_SESSION_JOIN_ACCESS_REPOSITORY)
    private readonly accesses: LiveSessionJoinAccessRepository,
  ) {
    super(sessions, clock, snapshots, publisher);
  }

  async execute(input: {
    sessionId: string;
    actorId: string;
    participantId: string;
    teamId: string;
    expectedRevision: number;
    commandId: string;
  }) {
    const session = await this.sessions.findById(input.sessionId);
    if (!session) throw new LiveSessionNotFoundError(input.sessionId);
    const access = await this.accesses.findCurrentBySessionId(input.sessionId);
    const teamCapacity = access?.serialize().teamCapacity;
    if (
      teamCapacity !== undefined &&
      session
        .serialize()
        .participants.filter(
          (participant) =>
            participant.role === 'team-player' &&
            !participant.removedAt &&
            participant.teamId === input.teamId &&
            participant.id !== input.participantId,
        ).length >= teamCapacity
    ) {
      throw new LiveSessionDomainError(
        'TEAM_FULL',
        'Selected team capacity has been reached',
      );
    }
    return this.mutate({
      ...input,
      event: 'live-session:participant-team-changed',
      action: (session, now) =>
        session.assignParticipantTeam(input.participantId, input.teamId, now),
    });
  }
}

@Injectable()
export class RemoveLiveParticipant extends HostParticipantMutation {
  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY) sessions: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) clock: LiveSessionClock,
    snapshots: LiveGameSessionSnapshotMapper,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    publisher: LiveSessionTransitionPublisher,
  ) {
    super(sessions, clock, snapshots, publisher);
  }

  execute(input: {
    sessionId: string;
    actorId: string;
    participantId: string;
    expectedRevision: number;
    commandId: string;
  }) {
    return this.mutate({
      ...input,
      event: 'live-session:participant-removed',
      action: (session, now) =>
        session.removeParticipant(input.participantId, now),
    });
  }
}

@Injectable()
export class RevokeParticipantCredential extends HostParticipantMutation {
  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY) sessions: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) clock: LiveSessionClock,
    snapshots: LiveGameSessionSnapshotMapper,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    publisher: LiveSessionTransitionPublisher,
  ) {
    super(sessions, clock, snapshots, publisher);
  }

  execute(input: {
    sessionId: string;
    actorId: string;
    participantId: string;
    expectedRevision: number;
    commandId: string;
  }) {
    return this.mutate({
      ...input,
      event: 'live-session:participant-credential-revoked',
      action: (session, now) =>
        session.revokeParticipantCredential(input.participantId, now),
    });
  }
}
