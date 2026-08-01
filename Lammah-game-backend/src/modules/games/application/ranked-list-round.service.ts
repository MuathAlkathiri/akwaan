import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { QuestionRepository } from '../../questions/persistence/question.repository';
import { QuestionGameplayType } from '../../questions/schemas/question.schema';
import { GameRepository } from '../persistence/game.repository';
import { GameActionPolicy } from '../policies/game-action.policy';
import { GameLifecyclePolicy } from '../policies/game-lifecycle.policy';
import {
  Game,
  GameStatus,
  RankedListOutcomeType,
  RankedListRoundState,
  RankedListRoundStatus,
} from '../schemas/game.schema';
import {
  ExpireRankedListTurnDto,
  SubmitRankedListAnswerDto,
} from '../dto/ranked-list-round.dto';
import {
  TOP_10_MAX_POINTS,
  TOP_10_TURN_SECONDS,
} from '../../questions/application/ranked-list-question.policy';

export type RankedListActionOutcome =
  | 'started'
  | 'correct'
  | 'incorrect'
  | 'already_discovered'
  | 'timeout'
  | 'round_completed'
  | 'stale_turn';

export interface RankedListActionResult {
  outcome: RankedListActionOutcome;
  strikeApplied?: boolean;
  matchedEntry?: { id: string; rank: number; answer: string; points: number };
  state: ReturnType<RankedListRoundService['publicState']>;
  result?: ReturnType<RankedListRoundService['publicState']>['outcome'];
}

@Injectable()
export class RankedListRoundService {
  constructor(
    private readonly games: GameRepository,
    private readonly questions: QuestionRepository,
    private readonly actions: GameActionPolicy,
    private readonly lifecycle: GameLifecyclePolicy,
  ) {}

  async start(
    gameId: string,
    questionId: string,
    user: AuthenticatedUser,
  ): Promise<RankedListActionResult> {
    const game = await this.requiredGame(gameId, user);
    const existing = this.findRound(game, questionId);
    if (existing) {
      if (existing.status === RankedListRoundStatus.COMPLETED)
        return this.action('round_completed', game, existing);

      // Opening the question starts a fresh timed turn. The browser owns no
      // background timer while the host is on the board, so never carry an
      // old expiry across navigation or refresh.
      const now = new Date();
      existing.turnStartedAt = now;
      existing.turnExpiresAt = new Date(
        now.getTime() + existing.turnDurationSeconds * 1000,
      );
      existing.turnSequence += 1;
      await this.save(game);
      return this.action('started', game, existing);
    }
    const boardQuestion = this.actions.findQuestion(
      game,
      new Types.ObjectId(questionId),
    );
    this.actions.assertUnanswered(boardQuestion);
    const snapshot = boardQuestion.snapshot;
    const question =
      snapshot?.questionType === QuestionGameplayType.RANKED_LIST &&
      snapshot.rankedList
        ? snapshot
        : await this.questions.findDocumentById(questionId);
    if (
      !question ||
      question.questionType !== QuestionGameplayType.RANKED_LIST ||
      !question.rankedList
    )
      throw new BadRequestException({
        code: 'RANKED_LIST_QUESTION_REQUIRED',
        message: 'The selected board question is not a ranked-list question.',
      });
    const now = new Date();
    const duration = TOP_10_TURN_SECONDS;
    const round: RankedListRoundState = {
      questionId: new Types.ObjectId(questionId),
      status: RankedListRoundStatus.ACTIVE,
      activeTeamIndex: game.currentTurnTeamIndex === 1 ? 1 : 0,
      turnStartedAt: now,
      turnExpiresAt: new Date(now.getTime() + duration * 1000),
      turnSequence: 1,
      turnDurationSeconds: duration,
      maxStrikesPerTeam: question.maxStrikesPerTeam ?? 3,
      teams: game.teams.map((_, teamIndex) => ({
        teamIndex,
        strikes: 0,
        temporaryScore: 0,
        eliminated: false,
      })),
      entries: question.rankedList.entries.map((entry) => ({
        id: entry.id,
        rank: entry.rank,
        answer: { ...entry.answer },
        aliases: [...entry.aliases],
        points: entry.points,
      })),
      revealedEntries: [],
    };
    game.rankedListRounds.push(round);
    await this.save(game);
    return this.action('started', game, round);
  }

  async getState(gameId: string, questionId: string, user: AuthenticatedUser) {
    const game = await this.requiredGame(gameId, user);
    return this.publicState(game, this.requiredRound(game, questionId));
  }

  async submit(
    gameId: string,
    questionId: string,
    dto: SubmitRankedListAnswerDto,
    user: AuthenticatedUser,
  ): Promise<RankedListActionResult> {
    const submitted = dto.answer.trim();
    if (!submitted)
      throw new BadRequestException({
        code: 'RANKED_LIST_EMPTY_ANSWER',
        message: 'Empty answers do not count as attempts.',
      });
    const game = await this.requiredGame(gameId, user);
    const round = this.requiredRound(game, questionId);
    if (round.status === RankedListRoundStatus.COMPLETED)
      return this.action('round_completed', game, round);
    if (dto.expectedTurnSequence !== round.turnSequence)
      return this.action('stale_turn', game, round);
    if (Date.now() >= new Date(round.turnExpiresAt).getTime())
      return this.applyMiss(game, round, 'timeout');

    const normalized = normalizeAnswer(submitted);
    const entry = round.entries.find((candidate) =>
      [candidate.answer.ar, candidate.answer.en, ...candidate.aliases]
        .filter((value): value is string => Boolean(value))
        .some((value) => normalizeAnswer(value) === normalized),
    );
    if (!entry) return this.applyMiss(game, round, 'incorrect');
    if (round.revealedEntries.some((revealed) => revealed.entryId === entry.id))
      return this.action('already_discovered', game, round, {
        strikeApplied: false,
        matchedEntry: this.matched(entry),
      });

    const active = round.teams[round.activeTeamIndex];
    active.temporaryScore += entry.points;
    round.revealedEntries.push({
      entryId: entry.id,
      rank: entry.rank,
      teamIndex: round.activeTeamIndex,
      points: entry.points,
      submittedAnswer: submitted.slice(0, 160),
      revealedAt: new Date(),
    });
    this.advanceTurn(round);
    const completed = this.shouldComplete(round);
    if (completed) this.finalizeState(game, round);
    await this.save(game);
    return this.action(completed ? 'round_completed' : 'correct', game, round, {
      strikeApplied: false,
      matchedEntry: this.matched(entry),
    });
  }

  async expire(
    gameId: string,
    questionId: string,
    dto: ExpireRankedListTurnDto,
    user: AuthenticatedUser,
  ): Promise<RankedListActionResult> {
    const game = await this.requiredGame(gameId, user);
    const round = this.requiredRound(game, questionId);
    if (round.status === RankedListRoundStatus.COMPLETED)
      return this.action('round_completed', game, round);
    if (dto.expectedTurnSequence !== round.turnSequence)
      return this.action('stale_turn', game, round);
    if (Date.now() < new Date(round.turnExpiresAt).getTime())
      throw new BadRequestException({
        code: 'RANKED_LIST_TURN_NOT_EXPIRED',
        message: 'The active turn has not expired.',
      });
    return this.applyMiss(game, round, 'timeout');
  }

  async finalize(
    gameId: string,
    questionId: string,
    user: AuthenticatedUser,
  ): Promise<RankedListActionResult> {
    const game = await this.requiredGame(gameId, user);
    const round = this.requiredRound(game, questionId);
    if (round.status === RankedListRoundStatus.COMPLETED)
      return this.action('round_completed', game, round);
    if (!this.shouldComplete(round))
      throw new BadRequestException({
        code: 'RANKED_LIST_ROUND_NOT_COMPLETE',
        message: 'The ranked-list round cannot be finalized yet.',
      });
    this.finalizeState(game, round);
    await this.save(game);
    return this.action('round_completed', game, round);
  }

  private async applyMiss(
    game: Game,
    round: RankedListRoundState,
    outcome: 'incorrect' | 'timeout',
  ): Promise<RankedListActionResult> {
    const active = round.teams[round.activeTeamIndex];
    active.strikes = Math.min(round.maxStrikesPerTeam, active.strikes + 1);
    active.eliminated = active.strikes >= round.maxStrikesPerTeam;
    this.advanceTurn(round);
    const completed = this.shouldComplete(round);
    if (completed) this.finalizeState(game, round);
    await this.save(game);
    return this.action(completed ? 'round_completed' : outcome, game, round, {
      strikeApplied: true,
    });
  }

  private advanceTurn(round: RankedListRoundState): void {
    const other = round.activeTeamIndex === 0 ? 1 : 0;
    if (!round.teams[other].eliminated) round.activeTeamIndex = other;
    else if (round.teams[round.activeTeamIndex].eliminated)
      round.activeTeamIndex = other;
    const now = new Date();
    round.turnStartedAt = now;
    round.turnExpiresAt = new Date(
      now.getTime() + round.turnDurationSeconds * 1000,
    );
    round.turnSequence += 1;
  }

  private shouldComplete(round: RankedListRoundState): boolean {
    return (
      round.revealedEntries.length === round.entries.length ||
      round.teams.every((team) => team.eliminated)
    );
  }

  private finalizeState(game: Game, round: RankedListRoundState): void {
    if (round.status === RankedListRoundStatus.COMPLETED) return;
    const [teamA, teamB] = round.teams;
    const tie = teamA.temporaryScore === teamB.temporaryScore;
    const winnerTeamIndex = tie
      ? undefined
      : teamA.temporaryScore > teamB.temporaryScore
        ? 0
        : 1;
    const awarded = [0, 0];
    if (winnerTeamIndex !== undefined) {
      const winnerCollectedScore = Math.min(
        TOP_10_MAX_POINTS,
        round.teams[winnerTeamIndex].temporaryScore,
      );
      awarded[winnerTeamIndex] = winnerCollectedScore;
      game.teams[winnerTeamIndex].score += awarded[winnerTeamIndex];
    }
    round.status = RankedListRoundStatus.COMPLETED;
    round.outcome = {
      type: tie ? RankedListOutcomeType.TIE : RankedListOutcomeType.WINNER,
      ...(winnerTeamIndex !== undefined ? { winnerTeamIndex } : {}),
      awardedPointsByTeam: awarded,
    };
    round.finalizedAt = new Date();
    game.currentTurnTeamIndex = round.activeTeamIndex;
    const boardQuestion = this.actions.findQuestion(game, round.questionId);
    boardQuestion.isAnswered = true;
    boardQuestion.isAnswerRevealed = true;
    boardQuestion.awardedPoints =
      winnerTeamIndex === undefined ? 0 : awarded[winnerTeamIndex];
    if (winnerTeamIndex !== undefined)
      boardQuestion.answeredByTeamIndex = winnerTeamIndex;
    if (this.lifecycle.isComplete(game)) {
      game.status = GameStatus.FINISHED;
      game.finishedAt = new Date();
    }
  }

  private action(
    outcome: RankedListActionOutcome,
    game: Game,
    round: RankedListRoundState,
    extra: Pick<RankedListActionResult, 'strikeApplied' | 'matchedEntry'> = {},
  ): RankedListActionResult {
    const state = this.publicState(game, round);
    return {
      outcome,
      ...extra,
      state,
      ...(state.outcome ? { result: state.outcome } : {}),
    };
  }

  publicState(game: Game, round: RankedListRoundState) {
    const teamId = (index: number) =>
      String(
        (game.teams[index] as unknown as { _id?: unknown })._id ??
          `team-${index}`,
      );
    const completed = round.status === RankedListRoundStatus.COMPLETED;
    return {
      questionId: String(round.questionId),
      status: round.status,
      activeTeamId: teamId(round.activeTeamIndex),
      activeTeamIndex: round.activeTeamIndex,
      turnStartedAt: new Date(round.turnStartedAt).toISOString(),
      turnExpiresAt: new Date(round.turnExpiresAt).toISOString(),
      turnSequence: round.turnSequence,
      turnDurationSeconds: round.turnDurationSeconds,
      maxStrikesPerTeam: round.maxStrikesPerTeam,
      collectedScore: Math.min(
        TOP_10_MAX_POINTS,
        round.revealedEntries.reduce(
          (total, revealed) => total + revealed.points,
          0,
        ),
      ),
      teams: round.teams.map((team) => ({
        teamId: teamId(team.teamIndex),
        teamIndex: team.teamIndex,
        name: game.teams[team.teamIndex].name,
        strikes: team.strikes,
        temporaryScore: team.temporaryScore,
        eliminated: team.eliminated,
      })),
      entries: round.entries
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map((entry) => {
          const revealed = round.revealedEntries.find(
            (item) => item.entryId === entry.id,
          );
          return {
            id: entry.id,
            rank: entry.rank,
            points: entry.points,
            // A completed Top 10 round reveals the full answer key. Entries
            // discovered during play still retain their claiming team below;
            // completion-only reveals intentionally have no claimant.
            revealed: Boolean(revealed) || completed,
            ...(revealed || completed
              ? {
                  answer: entry.answer.ar,
                  ...(entry.answer.en ? { answerEn: entry.answer.en } : {}),
                }
              : {}),
            ...(revealed
              ? {
                  claimedByTeamId: teamId(revealed.teamIndex),
                  submittedAnswer: revealed.submittedAnswer,
                  revealedAt: new Date(revealed.revealedAt).toISOString(),
                }
              : {}),
          };
        }),
      ...(round.outcome
        ? {
            outcome: {
              type: round.outcome.type,
              ...(round.outcome.winnerTeamIndex !== undefined
                ? {
                    winnerTeamId: teamId(round.outcome.winnerTeamIndex),
                  }
                : {}),
              awardedPointsByTeam: Object.fromEntries(
                round.outcome.awardedPointsByTeam.map((points, index) => [
                  teamId(index),
                  points,
                ]),
              ),
            },
          }
        : {}),
    };
  }

  private matched(entry: RankedListRoundState['entries'][number]) {
    return {
      id: entry.id,
      rank: entry.rank,
      answer: entry.answer.ar,
      points: entry.points,
    };
  }

  private async requiredGame(id: string, user: AuthenticatedUser) {
    const game = await this.games.findById(id);
    if (!game) throw new NotFoundException(`Game with ID "${id}" not found`);
    this.actions.assertCanAccess(game, user);
    return game;
  }

  private findRound(game: Game, questionId: string) {
    return game.rankedListRounds.find(
      (round) => String(round.questionId) === questionId,
    );
  }

  private requiredRound(game: Game, questionId: string) {
    const round = this.findRound(game, questionId);
    if (!round)
      throw new NotFoundException({
        code: 'RANKED_LIST_ROUND_NOT_FOUND',
        message: 'Ranked-list round has not been started.',
      });
    return round;
  }

  private async save(game: Game): Promise<void> {
    game.updatedAt = new Date();
    try {
      await game.save();
    } catch (error) {
      if (error instanceof Error && error.name === 'VersionError')
        throw new ConflictException({
          code: 'CONCURRENT_GAME_UPDATE',
          message: 'Game state changed. Reload and try again.',
        });
      throw error;
    }
  }
}
