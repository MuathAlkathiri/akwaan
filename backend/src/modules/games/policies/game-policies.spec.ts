import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { GameActionPolicy } from './game-action.policy';
import { GameLifecyclePolicy } from './game-lifecycle.policy';
import { ScoringPolicy } from './scoring.policy';
import { Game } from '../schemas/game.schema';

const makeGame = () =>
  ({
    teams: [
      { name: 'A', members: [], score: 0 },
      { name: 'B', members: [], score: 0 },
    ],
    currentTurnTeamIndex: 0,
    board: [
      {
        category: new Types.ObjectId(),
        questions: [
          {
            question: new Types.ObjectId(),
            points: 200,
            isAnswered: false,
            isAnswerRevealed: false,
          },
        ],
      },
    ],
  }) as unknown as Game;

describe('game policies', () => {
  const actions = new GameActionPolicy();
  const lifecycle = new GameLifecyclePolicy();
  const scoring = new ScoringPolicy();

  it('awards the board value and advances the turn', () => {
    const game = makeGame();
    const question = game.board[0].questions[0];
    scoring.award(game, question, 0);
    lifecycle.advanceTurn(game);
    expect(game.teams[0].score).toBe(200);
    expect(question.isAnswered).toBe(true);
    expect(game.currentTurnTeamIndex).toBe(1);
    expect(lifecycle.isComplete(game)).toBe(true);
  });

  it('prevents duplicate scoring through the unanswered guard', () => {
    const game = makeGame();
    const question = game.board[0].questions[0];
    question.isAnswered = true;
    expect(() => actions.assertUnanswered(question)).toThrow(
      BadRequestException,
    );
  });
});
