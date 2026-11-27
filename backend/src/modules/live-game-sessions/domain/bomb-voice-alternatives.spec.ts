import {
  BOMB_GAMEPLAY_PLUGIN,
  BOMB_MAX_VOICE_ALTERNATIVES,
  bombTerminalSummary,
} from './bomb-gameplay.plugin';

/**
 * What القنبلة does with the speech engine's ranked guesses.
 *
 * The room is loud by design — that is the game — and browser recognition puts
 * the word the player said second about as often as first. Carrying the engine's
 * own alternatives is the difference between a correct answer that counts and
 * one the player has to shout twice at a 30-second clock.
 */
describe('Bomb accepts what the player was heard saying', () => {
  const items = [
    {
      prompt: 'من هو الأول؟',
      imageUrl: '/uploads/a.webp',
      altText: 'a',
      acceptedAnswers: ['ميسي'],
    },
  ];
  const runtimeState = {
    phase: 'ready',
    questionIndex: 0,
    questionsJson: JSON.stringify([
      { id: 'q1', prompt: items[0].prompt, items },
    ]),
  };
  const round = () => ({
    phase: 'presenting',
    questionId: 'q1',
    prompt: items[0].prompt,
    itemIndex: 0,
    itemCount: items.length,
    imageUrl: items[0].imageUrl,
    altText: 'a',
    answersJson: JSON.stringify(items[0].acceptedAnswers),
  });

  const submit = (payload: Record<string, unknown>) =>
    BOMB_GAMEPLAY_PLUGIN.handleCommand!(
      {} as never,
      {
        type: 'submit-answer',
        payload,
        runtimeState,
        roundState: round(),
      } as never,
    );

  const validate = (payload: Record<string, unknown>) =>
    BOMB_GAMEPLAY_PLUGIN.command!('submit-answer')!.validatePayload(
      payload as never,
    );

  it('counts an answer the engine ranked second', () => {
    const result = submit({
      answer: 'ميسو',
      alternativesJson: JSON.stringify(['ميسي']),
    });

    expect(
      bombTerminalSummary({ ...result.runtimeState, resultJson: '{}' }),
    ).toMatchObject([{ outcome: 'correct', submittedAnswer: 'ميسي' }]);
  });

  it('records the wording that matched, not the first guess', () => {
    // The result screen shows what the team said; showing the misheard first
    // guess next to «صح» reads like a bug.
    const result = submit({
      answer: 'ميسو',
      alternativesJson: JSON.stringify(['لا شيء', 'ميسي']),
    });

    expect(
      bombTerminalSummary({ ...result.runtimeState, resultJson: '{}' })[0],
    ).toMatchObject({ submittedAnswer: 'ميسي' });
  });

  it('leaves a wrong answer wrong, alternatives and all', () => {
    const result = submit({
      answer: 'رونالدو',
      alternativesJson: JSON.stringify(['نيمار', 'مبابي']),
    });

    expect(result.runtimeState).toEqual(runtimeState);
  });

  it('still takes a typed answer with no alternatives at all', () => {
    const result = submit({ answer: 'ميسي' });

    expect(
      bombTerminalSummary({ ...result.runtimeState, resultJson: '{}' }),
    ).toMatchObject([{ outcome: 'correct', submittedAnswer: 'ميسي' }]);
  });

  it('caps the list, so one tap stays one attempt', () => {
    const payload = validate({
      answer: 'ميسي',
      alternativesJson: JSON.stringify(['a', 'b', 'c', 'd']),
    });

    expect(
      JSON.parse(String(payload.alternativesJson)) as string[],
    ).toHaveLength(BOMB_MAX_VOICE_ALTERNATIVES);
  });

  it('refuses a malformed list rather than guessing at it', () => {
    expect(() =>
      validate({ answer: 'ميسي', alternativesJson: 'not json' }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_BOMB_ANSWER' }));
    expect(() =>
      validate({ answer: 'ميسي', alternativesJson: JSON.stringify([1, 2]) }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_BOMB_ANSWER' }));
    expect(() => validate({ answer: 'ميسي', nickname: 'x' })).toThrow(
      expect.objectContaining({ code: 'INVALID_BOMB_ANSWER' }),
    );
  });
});
