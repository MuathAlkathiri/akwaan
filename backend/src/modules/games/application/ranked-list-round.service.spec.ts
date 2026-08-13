import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  Question,
  QuestionGameplayType,
  QuestionStatus,
} from '../../questions/schemas/question.schema';
import { TOP_10_ENTRY_POINTS } from '../../questions/application/ranked-list-question.policy';
import { SubscriptionStatus, UserRole } from '../../users/schemas/user.schema';
import { GameActionPolicy } from '../policies/game-action.policy';
import { GameLifecyclePolicy } from '../policies/game-lifecycle.policy';
import { Game, GameStatus } from '../schemas/game.schema';
import { RankedListRoundService } from './ranked-list-round.service';

describe('RankedListRoundService', () => {
  const questionId = new Types.ObjectId();
  const otherQuestionId = new Types.ObjectId();
  const user = {
    id: new Types.ObjectId().toString(),
    fullName: 'Admin',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    subscriptionStatus: SubscriptionStatus.ACTIVE,
    freeGamesUsed: 0,
  };
  let game: Game;
  let question: Question;
  let service: RankedListRoundService;
  let save: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    save = jest.fn().mockResolvedValue(undefined);
    game = {
      owner: new Types.ObjectId(),
      status: GameStatus.ACTIVE,
      currentTurnTeamIndex: 0,
      teams: [
        { _id: 'team-a', name: 'فريق أ', members: [], score: 0 },
        { _id: 'team-b', name: 'فريق ب', members: [], score: 0 },
      ],
      board: [
        {
          category: new Types.ObjectId(),
          questions: [
            {
              question: questionId,
              points: 600,
              isAnswered: false,
              isAnswerRevealed: false,
            },
            {
              question: otherQuestionId,
              points: 600,
              isAnswered: false,
              isAnswerRevealed: false,
            },
          ],
        },
      ],
      rankedListRounds: [],
      save,
    } as unknown as Game;
    question = {
      _id: questionId,
      status: QuestionStatus.APPROVED,
      questionType: QuestionGameplayType.RANKED_LIST,
      turnDurationSeconds: 20,
      maxStrikesPerTeam: 3,
      rankedList: {
        displayName: { ar: 'توب 10', en: 'Top 10' },
        entries: TOP_10_ENTRY_POINTS.map((points, index) => ({
          id: `entry-${index + 1}`,
          rank: index + 1,
          answer: {
            ar: index === 0 ? 'كريستيانو رونالدو' : `لاعب ${index + 1}`,
            en: index === 0 ? 'Cristiano Ronaldo' : `Player ${index + 1}`,
          },
          aliases: index === 0 ? ['رونالدو', 'cr7'] : [`p${index + 1}`],
          points,
        })),
      },
    } as unknown as Question;
    service = new RankedListRoundService(
      { findById: jest.fn().mockResolvedValue(game) } as never,
      { findDocumentById: jest.fn().mockResolvedValue(question) } as never,
      new GameActionPolicy(),
      new GameLifecyclePolicy(),
    );
  });

  afterEach(() => jest.useRealTimers());

  const start = () => service.start('game-1', String(questionId), user);
  const submit = (answer: string, sequence: number) =>
    service.submit(
      'game-1',
      String(questionId),
      { answer, expectedTurnSequence: sequence },
      user,
    );

  it('starts with hidden entries, persisted timer, strikes, and scores', async () => {
    const result = await start();
    expect(result.outcome).toBe('started');
    expect(result.state.entries).toHaveLength(10);
    expect(result.state.entries.every((entry) => !('answer' in entry))).toBe(
      true,
    );
    expect(result.state.teams).toEqual([
      expect.objectContaining({ strikes: 0, temporaryScore: 0 }),
      expect.objectContaining({ strikes: 0, temporaryScore: 0 }),
    ]);
    expect(result.state.turnDurationSeconds).toBe(20);
    expect(result.state.turnExpiresAt).toBe('2026-01-01T00:00:20.000Z');
  });

  it('restarts the active turn timer when the question is reopened', async () => {
    await start();
    jest.setSystemTime(new Date('2026-01-01T00:00:12.000Z'));

    const reopened = await start();

    expect(reopened.state.turnSequence).toBe(2);
    expect(reopened.state.turnExpiresAt).toBe('2026-01-01T00:00:32.000Z');
    expect(reopened.state.teams[0].strikes).toBe(0);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('matches Arabic, English, and aliases exactly, scores temporarily, and switches turns', async () => {
    await start();
    const result = await submit('  كِريستيانو   رونالدو! ', 1);
    expect(result).toMatchObject({
      outcome: 'correct',
      matchedEntry: { rank: 1, points: 10 },
      state: {
        activeTeamIndex: 1,
        teams: [{ temporaryScore: 10 }, { temporaryScore: 0 }],
      },
    });
    expect(game.teams[0].score).toBe(0);
    const second = await submit('p2', 2);
    expect(second.outcome).toBe('correct');
    expect(second.state.collectedScore).toBe(30);
  });

  it('does not penalize, switch, or reset the timer for an already discovered entry', async () => {
    await start();
    await submit('cr7', 1);
    const expires = game.rankedListRounds[0].turnExpiresAt;
    const result = await submit('Cristiano Ronaldo', 2);
    expect(result.outcome).toBe('already_discovered');
    expect(result.strikeApplied).toBe(false);
    expect(result.state.activeTeamIndex).toBe(1);
    expect(game.rankedListRounds[0].turnExpiresAt).toEqual(expires);
  });

  it('rejects empty answers without changing state', async () => {
    await start();
    await expect(submit('   ', 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(game.rankedListRounds[0].teams[0].strikes).toBe(0);
    expect(game.rankedListRounds[0].turnSequence).toBe(1);
  });

  it('applies an incorrect strike, rejects unsafe similarity, and switches turns', async () => {
    await start();
    const result = await submit('رونالدينيو', 1);
    expect(result).toMatchObject({
      outcome: 'incorrect',
      strikeApplied: true,
      state: { activeTeamIndex: 1 },
    });
    expect(result.state.teams[0].strikes).toBe(1);
    expect(result.state.collectedScore).toBe(0);
  });

  it('uses backend expiry, applies a strike, switches, and ignores stale expiry', async () => {
    await start();
    jest.setSystemTime(new Date('2026-01-01T00:00:21.000Z'));
    const expired = await service.expire(
      'game-1',
      String(questionId),
      { expectedTurnSequence: 1 },
      user,
    );
    expect(expired.outcome).toBe('timeout');
    expect(expired.state.teams[0].strikes).toBe(1);
    const stale = await service.expire(
      'game-1',
      String(questionId),
      { expectedTurnSequence: 1 },
      user,
    );
    expect(stale.outcome).toBe('stale_turn');
    expect(stale.state.teams[0].strikes).toBe(1);
  });

  it('eliminates after three strikes, skips that team, and lets the survivor continue', async () => {
    await start();
    await submit('خطأ 1', 1);
    await submit('p2', 2);
    await submit('خطأ 3', 3);
    await submit('p4', 4);
    await submit('خطأ 5', 5);
    expect(game.rankedListRounds[0].teams[0].eliminated).toBe(true);
    expect(game.rankedListRounds[0].activeTeamIndex).toBe(1);
    const next = await submit('p6', 6);
    expect(next.state.activeTeamIndex).toBe(1);
  });

  it('completes after all entries, reveals remaining state, and awards only the winner once', async () => {
    await start();
    for (let index = 1; index <= 10; index += 1)
      await submit(index === 1 ? 'cr7' : `p${index}`, index);
    const round = game.rankedListRounds[0];
    expect(round.status).toBe('completed');
    expect(game.board[0].questions[0].isAnswered).toBe(true);
    expect(game.board[0].questions[1].isAnswered).toBe(false);
    expect(game.rankedListRounds[0].revealedEntries).toHaveLength(10);
    expect(game.teams[1].score).toBe(340);
    expect(game.teams[0].score).toBe(0);
    const state = await service.getState('game-1', String(questionId), user);
    expect(state.entries.every((entry) => entry.answer)).toBe(true);
    expect(state.outcome).toMatchObject({
      type: 'winner',
      winnerTeamId: 'team-b',
      awardedPointsByTeam: { 'team-a': 0, 'team-b': 340 },
    });
    expect(state.collectedScore).toBe(600);
    const again = await service.finalize('game-1', String(questionId), user);
    expect(again.outcome).toBe('round_completed');
    expect(game.teams[1].score).toBe(340);
  });

  it('completes when both teams are eliminated and a tie awards zero', async () => {
    await start();
    for (let index = 1; index <= 6; index += 1)
      await submit(`wrong ${index}`, index);
    const result = await service.getState('game-1', String(questionId), user);
    expect(result.status).toBe('completed');
    expect(result.outcome).toEqual({
      type: 'tie',
      awardedPointsByTeam: { 'team-a': 0, 'team-b': 0 },
    });
    expect(game.teams.map((team) => team.score)).toEqual([0, 0]);
    expect(result.entries.every((entry) => entry.answer)).toBe(true);
    expect(result.entries.every((entry) => entry.revealed)).toBe(true);
    expect(
      result.entries.every((entry) => entry.claimedByTeamId === undefined),
    ).toBe(true);
  });

  it('preserves state on refresh and prevents duplicate scoring', async () => {
    await start();
    await submit('cr7', 1);
    const refreshed = await service.getState(
      'game-1',
      String(questionId),
      user,
    );
    expect(refreshed.turnSequence).toBe(2);
    expect(refreshed.entries[0]).toMatchObject({
      revealed: true,
      claimedByTeamId: 'team-a',
    });
    await submit('cr7', 2);
    expect(game.rankedListRounds[0].teams[0].temporaryScore).toBe(10);
  });

  it('maps optimistic concurrency failures without double-awarding', async () => {
    save.mockRejectedValueOnce(
      Object.assign(new Error('changed'), { name: 'VersionError' }),
    );
    await expect(start()).rejects.toBeInstanceOf(ConflictException);
    expect(game.teams.map((team) => team.score)).toEqual([0, 0]);
  });
});
