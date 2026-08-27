import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { ScoringService } from '../../scoring/application/scoring.service';
import { LiveGameSessionRepository } from '../../live-game-sessions/domain/live-game-session.repository';
import {
  MatchListRecord,
  MatchRepository,
} from '../persistence/match.repository';
import {
  classifyMatchResumeState,
  ListMyMatches,
} from './list-my-matches.use-case';

const NOW = new Date('2026-08-26T10:00:00.000Z');

function record(overrides: Partial<MatchListRecord> = {}): MatchListRecord {
  return {
    matchId: 'match-a',
    liveSessionId: 'session-a',
    status: 'active',
    stage: 'board',
    teams: [
      { id: 'team-1', name: 'الفريق الأول' },
      { id: 'team-2', name: 'الفريق الثاني' },
    ],
    occurrences: [0, 1, 2].map((index) => ({
      index,
      worldId: `world-${index}`,
      selectedScopeIds: ['a', 'b', 'c', 'd'].map(
        (scope) => `scope-${index}-${scope}`,
      ),
      slots: {
        slot_1: { status: index === 0 ? 'completed' : 'available' },
        slot_2: { status: 'available' },
        slot_3: { status: 'available' },
        slot_4: { status: 'available' },
      },
    })),
    scoreEvents: [],
    createdAt: new Date('2026-08-25T10:00:00.000Z'),
    updatedAt: new Date('2026-08-26T09:00:00.000Z'),
    ...overrides,
  };
}

describe('ListMyMatches', () => {
  it('classifies lifecycle state without calling an expired Match completed', () => {
    expect(
      classifyMatchResumeState({
        matchStatus: 'active',
        sessionStatus: 'active',
        expiresAt: new Date(NOW.getTime() + 60_000),
        now: NOW,
      }),
    ).toBe('resumable');
    expect(
      classifyMatchResumeState({
        matchStatus: 'active',
        sessionStatus: 'active',
        expiresAt: new Date(NOW.getTime() - 1),
        now: NOW,
      }),
    ).toBe('session_expired');
    expect(
      classifyMatchResumeState({
        matchStatus: 'completed',
        sessionStatus: 'finished',
        expiresAt: new Date(NOW.getTime() + 60_000),
        now: NOW,
      }),
    ).toBe('session_terminal');
    expect(
      classifyMatchResumeState({
        matchStatus: 'cancelled',
        sessionStatus: 'cancelled',
        expiresAt: new Date(NOW.getTime() + 60_000),
        now: NOW,
      }),
    ).toBe('session_terminal');
  });

  it.each(['waiting', 'ready'] as const)(
    'does not offer Resume for the pre-Match %s session state',
    (sessionStatus) => {
      // Normal unified creation marks the session ready and starts it before it
      // creates the Match. These are setup states, not resumable Match states.
      expect(
        classifyMatchResumeState({
          matchStatus: 'active',
          sessionStatus,
          expiresAt: new Date(NOW.getTime() + 60_000),
          now: NOW,
        }),
      ).toBe('session_terminal');
    },
  );

  it('uses only owner-scoped session ids and returns a safe, non-mutating summary', async () => {
    const active = record();
    const completed = record({
      matchId: 'match-complete',
      liveSessionId: 'session-complete',
      status: 'completed',
      stage: 'match_complete',
      completedAt: NOW,
    });
    const before = JSON.stringify({ active, completed });
    const findPage = jest.fn().mockResolvedValue({
      active: [active],
      completed: [completed],
      completedTotal: 11,
    });
    const sessions = {
      findOwnedSessionRefs: jest.fn().mockResolvedValue([
        {
          sessionId: 'session-a',
          status: 'active',
          expiresAt: new Date(NOW.getTime() + 60_000),
        },
        {
          sessionId: 'session-complete',
          status: 'finished',
          expiresAt: new Date(NOW.getTime() + 60_000),
        },
      ]),
    } as unknown as LiveGameSessionRepository;
    const useCase = new ListMyMatches(
      sessions,
      { findListPageBySessionIds: findPage } as unknown as MatchRepository,
      new ScoringService(new ScoringRuleRegistry()),
    );

    const result = await useCase.execute({
      controllerActorId: 'user-a',
      page: 1,
      limit: 10,
      now: NOW,
    });

    expect(sessions.findOwnedSessionRefs).toHaveBeenCalledWith('user-a');
    expect(findPage).toHaveBeenCalledWith({
      sessionIds: ['session-a', 'session-complete'],
      page: 1,
      limit: 10,
    });
    expect(result.active[0]).toMatchObject({
      liveSessionId: 'session-a',
      resumable: true,
      progress: { completedChallenges: 1, totalChallenges: 12 },
    });
    expect(result.completed[0].result).toEqual({
      winnerTeamId: null,
      tie: true,
    });
    expect(result.pagination).toEqual({
      page: 1,
      limit: 10,
      completedTotal: 11,
      hasMore: true,
    });
    expect(JSON.stringify({ active, completed })).toBe(before);
    const wire = JSON.stringify(result);
    expect(wire).not.toContain('reconnectToken');
    expect(wire).not.toContain('participants');
    expect(wire).not.toContain('answer');
    expect(wire).not.toContain('currentChallenge');
  });

  it('never queries or returns another controller session', async () => {
    const findPage = jest.fn().mockResolvedValue({
      active: [],
      completed: [],
      completedTotal: 0,
    });
    const useCase = new ListMyMatches(
      {
        findOwnedSessionRefs: () =>
          Promise.resolve([
            {
              sessionId: 'session-b',
              status: 'active',
              expiresAt: new Date(NOW.getTime() + 60_000),
            },
          ]),
      } as unknown as LiveGameSessionRepository,
      { findListPageBySessionIds: findPage } as unknown as MatchRepository,
      new ScoringService(new ScoringRuleRegistry()),
    );

    await useCase.execute({
      controllerActorId: 'user-b',
      page: 1,
      limit: 10,
      now: NOW,
    });

    expect(findPage.mock.calls[0][0].sessionIds).toEqual(['session-b']);
    expect(findPage.mock.calls[0][0].sessionIds).not.toContain('session-a');
  });
});
