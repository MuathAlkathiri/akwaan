import { Inject, Injectable } from '@nestjs/common';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
  OwnedSessionRef,
  OwnedSessionStatus,
} from '../../live-game-sessions/domain/live-game-session.repository';
import { ScoringService } from '../../scoring/application/scoring.service';
import { MatchStatus } from '../domain/match.constants';
import {
  MATCH_REPOSITORY,
  MatchListRecord,
  MatchRepository,
} from '../persistence/match.repository';

const RESUMABLE_SESSION_STATUSES: readonly OwnedSessionStatus[] = [
  'active',
  'paused',
];

export type MatchResumeState =
  'resumable' | 'session_expired' | 'session_terminal';

export function classifyMatchResumeState(input: {
  matchStatus: string;
  sessionStatus: OwnedSessionStatus;
  expiresAt: Date;
  now: Date;
}): MatchResumeState {
  if (
    input.matchStatus === MatchStatus.ACTIVE &&
    input.now.getTime() >= input.expiresAt.getTime()
  ) {
    return 'session_expired';
  }
  if (
    input.matchStatus === MatchStatus.ACTIVE &&
    RESUMABLE_SESSION_STATUSES.includes(input.sessionStatus)
  ) {
    return 'resumable';
  }
  return 'session_terminal';
}

export interface MyMatchSummary {
  matchId: string;
  liveSessionId: string;
  status: string;
  stage: string;
  resumeState: MatchResumeState;
  resumable: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  teams: Array<{
    id: string;
    name: string;
    signedScore: number;
    displayScore: number;
  }>;
  occurrences: Array<{
    occurrenceIndex: number;
    worldId: string;
    selectedScopeIds: string[];
  }>;
  progress: { completedChallenges: number; totalChallenges: number };
  result?: { winnerTeamId: string | null; tie: boolean };
}

export interface MyMatchesPage {
  active: MyMatchSummary[];
  completed: MyMatchSummary[];
  pagination: {
    page: number;
    limit: number;
    completedTotal: number;
    hasMore: boolean;
  };
}

@Injectable()
export class ListMyMatches {
  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository,
    private readonly scoring: ScoringService,
  ) {}

  async execute(input: {
    controllerActorId: string;
    page: number;
    limit: number;
    now?: Date;
  }): Promise<MyMatchesPage> {
    const refs = await this.sessions.findOwnedSessionRefs(
      input.controllerActorId,
    );
    const bySession = new Map(refs.map((ref) => [ref.sessionId, ref]));
    const page = await this.matches.findListPageBySessionIds({
      sessionIds: refs.map((ref) => ref.sessionId),
      page: input.page,
      limit: input.limit,
    });
    const now = input.now ?? new Date();
    return {
      active: page.active.flatMap((match) => {
        const session = bySession.get(match.liveSessionId);
        return session ? [this.compose(match, session, now)] : [];
      }),
      completed: page.completed.flatMap((match) => {
        const session = bySession.get(match.liveSessionId);
        return session ? [this.compose(match, session, now)] : [];
      }),
      pagination: {
        page: input.page,
        limit: input.limit,
        completedTotal: page.completedTotal,
        hasMore: input.page * input.limit < page.completedTotal,
      },
    };
  }

  private compose(
    match: MatchListRecord,
    session: OwnedSessionRef,
    now: Date,
  ): MyMatchSummary {
    const ledger = this.scoring.restoreLedger(match.scoreEvents);
    const resumeState = classifyMatchResumeState({
      matchStatus: match.status,
      sessionStatus: session.status,
      expiresAt: session.expiresAt,
      now,
    });
    const teams = match.teams.map((team) => ({
      id: team.id,
      name: team.name,
      signedScore: ledger.signedTotal(team.id),
      displayScore: ledger.displayTotal(team.id),
    }));
    const completedChallenges = match.occurrences.reduce(
      (total, occurrence) =>
        total +
        Object.values(occurrence.slots ?? {}).filter(
          (slot) => slot?.status === 'completed',
        ).length,
      0,
    );
    const totalChallenges = match.occurrences.reduce(
      (total, occurrence) => total + Object.keys(occurrence.slots ?? {}).length,
      0,
    );
    const best = teams.length
      ? Math.max(...teams.map((team) => team.signedScore))
      : 0;
    const leaders = teams.filter((team) => team.signedScore === best);
    return {
      matchId: match.matchId,
      liveSessionId: match.liveSessionId,
      status: match.status,
      stage: match.stage,
      resumeState,
      resumable: resumeState === 'resumable',
      createdAt: match.createdAt.toISOString(),
      updatedAt: match.updatedAt.toISOString(),
      ...(match.completedAt
        ? { completedAt: match.completedAt.toISOString() }
        : {}),
      teams,
      occurrences: match.occurrences.map((occurrence) => ({
        occurrenceIndex: occurrence.index,
        worldId: occurrence.worldId,
        selectedScopeIds: [...occurrence.selectedScopeIds],
      })),
      progress: { completedChallenges, totalChallenges },
      ...(match.status === MatchStatus.COMPLETED
        ? {
            result: {
              winnerTeamId: leaders.length === 1 ? leaders[0].id : null,
              tie: leaders.length !== 1,
            },
          }
        : {}),
    };
  }
}
