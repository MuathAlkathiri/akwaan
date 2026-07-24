import { GameResponseMapper } from './game-response.mapper';

describe('GameResponseMapper', () => {
  it('normalizes defaults and removes mongoose version metadata', () => {
    expect(
      GameResponseMapper.toResponse({
        _id: 'game-id',
        name: 'Game',
        status: 'active',
        __v: 2,
      }),
    ).toEqual({
      _id: 'game-id',
      name: 'Game',
      status: 'active',
      teams: [],
      selectedCategories: [],
      board: [],
      currentTurnTeamIndex: 0,
    });
  });

  it('derives a text fallback for an old game without a presentation snapshot', () => {
    const response = GameResponseMapper.toResponse({
      _id: 'game-id',
      name: 'Game',
      status: 'active',
      board: [
        {
          category: 'category-id',
          questions: [
            {
              question: {
                _id: 'question-id',
                type: 'image',
                assetStatus: 'PENDING',
              },
              points: 200,
              isAnswered: false,
              isAnswerRevealed: false,
            },
          ],
        },
      ],
    });
    expect(response.board[0].questions[0].presentation).toMatchObject({
      preferredType: 'image',
      type: 'text',
      mediaAvailable: false,
      fallbackReason: 'MISSING_ASSET',
    });
  });

  it('does not trust a legacy mediaUrl synthesized as a ready image asset', () => {
    const response = GameResponseMapper.toResponse({
      _id: 'game-id',
      name: 'Game',
      status: 'active',
      board: [
        {
          category: 'category-id',
          questions: [
            {
              question: {
                _id: 'question-id',
                type: 'image',
                source: 'manual',
                mediaUrl: '/uploads/legacy.jpg',
                assetStatus: 'READY',
                primaryAsset: {
                  type: 'IMAGE',
                  source: 'manual',
                  url: '/uploads/legacy.jpg',
                },
              },
              points: 200,
              isAnswered: false,
              isAnswerRevealed: false,
            },
          ],
        },
      ],
    });

    expect(response.board[0].questions[0].presentation).toMatchObject({
      preferredType: 'image',
      type: 'text',
      mediaAvailable: false,
      fallbackReason: 'MISSING_ASSET',
    });
    expect(response.board[0].questions[0].question).not.toHaveProperty(
      'mediaUrl',
    );
    expect(response.board[0].questions[0].question).not.toHaveProperty(
      'primaryAsset',
    );
  });

  it('does not expose answers for unrevealed board questions', () => {
    const response = GameResponseMapper.toResponse({
      _id: 'game-id',
      name: 'Game',
      status: 'active',
      board: [
        {
          category: 'category-id',
          questions: [
            {
              isAnswerRevealed: false,
              question: {
                _id: 'question-id',
                question: 'Visible question',
                answer: 'Hidden answer',
                acceptedAnswers: ['Hidden alias'],
                explanation: 'Hidden explanation',
              },
            },
          ],
        },
      ],
    });
    const question = response.board[0].questions[0].question;
    expect(question).toHaveProperty('question', 'Visible question');
    expect(question).not.toHaveProperty('answer');
    expect(question).not.toHaveProperty('acceptedAnswers');
    expect(question).not.toHaveProperty('explanation');
  });
});
