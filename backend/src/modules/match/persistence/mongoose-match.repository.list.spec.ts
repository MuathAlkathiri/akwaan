import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { ScoringService } from '../../scoring/application/scoring.service';
import { MatchStatus } from '../domain/match.constants';
import { MongooseMatchRepository } from './mongoose-match.repository';

const OWNER_SESSION_IDS = ['session-a', 'session-b'];
const PROJECTION_KEYS = [
  'matchId',
  'liveSessionId',
  'status',
  'stage',
  'teams',
  'occurrences',
  'scoreEvents',
  'createdAt',
  'updatedAt',
  'completedAt',
];

function row(input: {
  matchId: string;
  liveSessionId: string;
  status: MatchStatus;
  completedAt?: string;
}) {
  return {
    ...input,
    stage: input.status === MatchStatus.ACTIVE ? 'board' : 'match_complete',
    teams: [],
    occurrences: [],
    scoreEvents: [],
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    updatedAt: new Date('2026-08-26T10:00:00.000Z'),
  };
}

describe('MongooseMatchRepository My Games list query', () => {
  it('uses only supplied session ids and applies active/history selection and pagination', async () => {
    const activeRows = [
      row({
        matchId: 'active-owned',
        liveSessionId: 'session-a',
        status: MatchStatus.ACTIVE,
      }),
    ];
    const completedRows = [
      row({
        matchId: 'completed-newest',
        liveSessionId: 'session-b',
        status: MatchStatus.COMPLETED,
        completedAt: '2026-08-26T09:00:00.000Z',
      }),
      row({
        matchId: 'completed-older',
        liveSessionId: 'session-a',
        status: MatchStatus.COMPLETED,
        completedAt: '2026-08-25T09:00:00.000Z',
      }),
    ];
    const activeExec = jest.fn().mockResolvedValue(activeRows);
    const activeLean = jest.fn(() => ({ exec: activeExec }));
    const activeSort = jest.fn(() => ({ lean: activeLean }));
    const completedExec = jest.fn().mockResolvedValue(completedRows);
    const completedLean = jest.fn(() => ({ exec: completedExec }));
    const completedLimit = jest.fn(() => ({ lean: completedLean }));
    const completedSkip = jest.fn(() => ({ limit: completedLimit }));
    const completedSort = jest.fn(() => ({ skip: completedSkip }));
    const find = jest
      .fn()
      .mockReturnValueOnce({ sort: activeSort })
      .mockReturnValueOnce({ sort: completedSort });
    const countDocuments = jest.fn().mockResolvedValue(12);
    const repository = new MongooseMatchRepository(
      { find, countDocuments } as never,
      new ScoringService(new ScoringRuleRegistry()),
    );

    const result = await repository.findListPageBySessionIds({
      sessionIds: OWNER_SESSION_IDS,
      page: 2,
      limit: 2,
    });

    const ownerFilter = { liveSessionId: { $in: OWNER_SESSION_IDS } };
    expect(find).toHaveBeenNthCalledWith(
      1,
      { ...ownerFilter, status: MatchStatus.ACTIVE },
      expect.objectContaining(
        Object.fromEntries(PROJECTION_KEYS.map((key) => [key, 1])),
      ),
    );
    expect(find).toHaveBeenNthCalledWith(
      2,
      { ...ownerFilter, status: MatchStatus.COMPLETED },
      expect.any(Object),
    );
    expect(activeSort).toHaveBeenCalledWith({ updatedAt: -1, matchId: -1 });
    expect(completedSort).toHaveBeenCalledWith({
      completedAt: -1,
      matchId: -1,
    });
    expect(completedSkip).toHaveBeenCalledWith(2);
    expect(completedLimit).toHaveBeenCalledWith(2);
    expect(countDocuments).toHaveBeenCalledWith({
      ...ownerFilter,
      status: MatchStatus.COMPLETED,
    });
    expect(result.active.map((match) => match.matchId)).toEqual([
      'active-owned',
    ]);
    expect(result.completed.map((match) => match.matchId)).toEqual([
      'completed-newest',
      'completed-older',
    ]);
    expect(result.completedTotal).toBe(12);

    const projection = find.mock.calls[0][1] as Record<string, number>;
    expect(Object.keys(projection).sort()).toEqual([...PROJECTION_KEYS].sort());
    expect(projection).not.toHaveProperty('currentChallenge');
    expect(projection).not.toHaveProperty('processedCommandIds');
    expect(projection).not.toHaveProperty('challengeResults');
  });

  it('does not query Match storage when the owner has no session ids', async () => {
    const find = jest.fn();
    const countDocuments = jest.fn();
    const repository = new MongooseMatchRepository(
      { find, countDocuments } as never,
      new ScoringService(new ScoringRuleRegistry()),
    );

    await expect(
      repository.findListPageBySessionIds({
        sessionIds: [],
        page: 1,
        limit: 10,
      }),
    ).resolves.toEqual({ active: [], completed: [], completedTotal: 0 });
    expect(find).not.toHaveBeenCalled();
    expect(countDocuments).not.toHaveBeenCalled();
  });
});
