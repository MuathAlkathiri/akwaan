import { Injectable } from '@nestjs/common';
import {
  LiveGameSession,
  LiveSessionStatus,
} from '../domain/live-game-session';
import { TeamClock } from '../domain/team-clock';
import { GameplayRuntimeSnapshot } from './gameplay-runtime.snapshot';

export interface LiveGameSessionSnapshot {
  sessionId: string;
  parentGameId?: string;
  parentGameQuestionId?: string;
  mode: { key: string; version: number };
  status: LiveSessionStatus;
  revision: number;
  serverTimestamp: string;
  activeTeamId?: string;
  round: { number: number };
  currentTurn?: {
    sequence: number;
    teamId: string;
    startedAt: string;
    endedAt?: string;
    transitionReason: string;
  };
  teams: Array<{
    id: string;
    name: string;
    active: boolean;
    clock: {
      allocatedMs: number;
      consumedMs: number;
      remainingMs: number;
      startedAt?: string;
      running: boolean;
      expired: boolean;
    };
  }>;
  participants: Array<{
    id: string;
    displayName: string;
    role: string;
    teamId?: string;
    ready: boolean;
    joinedAt: string;
    presence: 'connected' | 'temporarily-disconnected' | 'stale' | 'removed';
    connected: boolean;
    connectedDeviceCount: number;
    lastSeenAt: string;
  }>;
  readiness: {
    canMarkSessionReady: boolean;
    readyPlayers: number;
    totalPlayers: number;
    readyTeamIds: string[];
  };
  gameplay?: GameplayRuntimeSnapshot;
  result?: {
    reason: string;
    winnerTeamId?: string;
    finishedAt: string;
    metadata?: Record<string, string | number | boolean>;
  };
  bombResult?: {
    winnerTeamId: string;
    winnerTeamName: string;
    loserTeamId: string;
    loserTeamName: string;
    completionReason: 'time_expired' | 'items_completed';
    finalRemainingTimes: Record<string, number>;
  };
  availableActions: string[];
  createdAt: string;
  startedAt?: string;
  countdownEndsAt?: string;
  lastTransitionAt: string;
  expiresAt: string;
}

@Injectable()
export class LiveGameSessionSnapshotMapper {
  toSnapshot(
    session: LiveGameSession,
    actorId: string,
    now: Date,
  ): LiveGameSessionSnapshot {
    const state = session.serialize();
    const isController = state.controllerActorId === actorId;
    const actorParticipant = state.participants.find(
      (participant) => participant.id === actorId && !participant.removedAt,
    );
    const status =
      !['finished', 'cancelled', 'expired'].includes(state.status) &&
      now.getTime() >= state.expiresAt.getTime()
        ? 'expired'
        : state.status;
    return {
      sessionId: state.id,
      parentGameId: state.parentGameId,
      parentGameQuestionId: state.parentGameQuestionId,
      mode: { key: state.modeKey, version: state.modeVersion },
      status,
      revision: state.revision,
      serverTimestamp: now.toISOString(),
      activeTeamId: state.activeTeamId,
      round: { number: state.currentRound },
      currentTurn: state.currentTurn
        ? {
            ...state.currentTurn,
            startedAt: state.currentTurn.startedAt.toISOString(),
            endedAt: state.currentTurn.endedAt?.toISOString(),
          }
        : undefined,
      teams: state.teams.map((team) => {
        const clock = TeamClock.restore(team.clock);
        const remainingMs = clock.remainingMs(now);
        return {
          id: team.id,
          name: team.name,
          active: team.active,
          clock: {
            allocatedMs: team.clock.allocatedMs,
            consumedMs: team.clock.consumedMs,
            remainingMs,
            startedAt: team.clock.startedAt?.toISOString(),
            running:
              team.clock.running && remainingMs > 0 && status === 'active',
            expired: remainingMs === 0,
          },
        };
      }),
      participants: state.participants.map((participant) => ({
        id: participant.id,
        displayName: participant.displayName,
        role: participant.role,
        teamId: participant.teamId,
        ready: participant.ready,
        joinedAt: participant.joinedAt.toISOString(),
        presence: participant.removedAt
          ? 'removed'
          : participant.connected
            ? 'connected'
            : now.getTime() - participant.lastSeenAt.getTime() < 2 * 60_000
              ? 'temporarily-disconnected'
              : 'stale',
        connected: participant.connected,
        connectedDeviceCount: participant.connectedDeviceCount,
        lastSeenAt: participant.lastSeenAt.toISOString(),
      })),
      readiness: this.readiness(state),
      result: state.result
        ? {
            ...state.result,
            finishedAt: state.result.finishedAt.toISOString(),
          }
        : undefined,
      bombResult: this.bombResult(state, now),
      availableActions: isController
        ? this.controllerActions(
            status,
            Boolean(state.activeTeamId),
            this.readiness(state).canMarkSessionReady,
          )
        : actorParticipant?.role === 'team-player' &&
            ['waiting', 'ready'].includes(status)
          ? [
              actorParticipant.ready
                ? 'participant-not-ready'
                : 'participant-ready',
            ]
          : [],
      createdAt: state.createdAt.toISOString(),
      startedAt: state.startedAt?.toISOString(),
      countdownEndsAt: state.countdownEndsAt?.toISOString(),
      lastTransitionAt: state.lastTransitionAt.toISOString(),
      expiresAt: state.expiresAt.toISOString(),
    };
  }

  private bombResult(
    state: ReturnType<LiveGameSession['serialize']>,
    now: Date,
  ): LiveGameSessionSnapshot['bombResult'] {
    if (
      state.modeKey !== 'bomb' ||
      state.status !== 'finished' ||
      !state.result?.winnerTeamId
    )
      return undefined;
    const winner = state.teams.find(
      (team) => team.id === state.result?.winnerTeamId,
    );
    const loser = state.teams.find(
      (team) => team.active && team.id !== state.result?.winnerTeamId,
    );
    if (!winner || !loser) return undefined;
    return {
      winnerTeamId: winner.id,
      winnerTeamName: winner.name,
      loserTeamId: loser.id,
      loserTeamName: loser.name,
      completionReason:
        state.result.reason === 'bomb-clock-expired'
          ? 'time_expired'
          : 'items_completed',
      finalRemainingTimes: Object.fromEntries(
        state.teams.map((team) => [
          team.id,
          TeamClock.restore(team.clock).remainingMs(now),
        ]),
      ),
    };
  }

  private controllerActions(
    status: LiveSessionStatus,
    hasActiveTurn: boolean,
    canMarkSessionReady: boolean,
  ): string[] {
    if (status === 'waiting') {
      return canMarkSessionReady ? ['ready', 'cancel'] : ['cancel'];
    }
    if (status === 'ready') return ['start', 'cancel'];
    if (status === 'active') {
      const actions = hasActiveTurn
        ? ['pause', 'pause-turn', 'end-turn', 'switch-turn', 'finish', 'cancel']
        : ['pause', 'start-turn', 'finish', 'cancel'];
      return ['runtime:create', ...actions];
    }
    if (status === 'paused') return ['resume', 'finish', 'cancel'];
    return [];
  }

  private readiness(state: ReturnType<LiveGameSession['serialize']>) {
    const players = state.participants.filter(
      (participant) =>
        participant.role === 'team-player' && !participant.removedAt,
    );
    const readyTeamIds = state.teams
      .filter(
        (team) =>
          team.active &&
          players.some(
            (participant) =>
              participant.teamId === team.id && participant.ready,
          ),
      )
      .map((team) => team.id);
    return {
      canMarkSessionReady:
        players.length === 0 ||
        state.teams
          .filter((team) => team.active)
          .every((team) => readyTeamIds.includes(team.id)),
      readyPlayers: players.filter((participant) => participant.ready).length,
      totalPlayers: players.length,
      readyTeamIds,
    };
  }
}
