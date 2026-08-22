import { BOMB_GAMEPLAY_PLUGIN, BOMB_MODE_KEY } from './bomb-gameplay.plugin';

/**
 * Bomb's rules, pinned exactly as the legacy implementation defined them, plus
 * the one thing Option A changed: a spent clock now ends the *challenge*, not
 * the live session.
 *
 * These exist because "adapt the lifecycle without redesigning the rules" is
 * only meaningful if the rules are asserted somewhere.
 */
describe('Bomb gameplay rules', () => {
  const items = [
    {
      prompt: 'من هو الأول؟',
      imageUrl: '/uploads/a.webp',
      altText: 'a',
      acceptedAnswers: ['ميسي'],
    },
    {
      prompt: 'من هو الثاني؟',
      imageUrl: '/uploads/b.webp',
      altText: 'b',
      acceptedAnswers: ['رونالدو'],
    },
  ];
  const runtimeState = {
    phase: 'ready',
    questionIndex: 0,
    questionsJson: JSON.stringify([
      { id: 'q1', prompt: items[0].prompt, items },
    ]),
  };

  const round = (overrides: Record<string, unknown> = {}) => ({
    phase: 'presenting',
    questionId: 'q1',
    prompt: items[0].prompt,
    itemIndex: 0,
    itemCount: items.length,
    imageUrl: items[0].imageUrl,
    altText: 'a',
    answersJson: JSON.stringify(items[0].acceptedAnswers),
    ...overrides,
  });

  const run = (
    type: string,
    payload: Record<string, unknown> = {},
    over = {},
  ) =>
    BOMB_GAMEPLAY_PLUGIN.handleCommand!(
      {} as never,
      {
        type,
        payload,
        runtimeState,
        roundState: round(over),
      } as never,
    );

  it('keeps the stable runtime key', () => {
    expect(BOMB_MODE_KEY).toBe('bomb');
    expect(BOMB_GAMEPLAY_PLUGIN.key).toBe('bomb');
  });

  describe('answering', () => {
    it("carries the next item's own prompt when advancing", () => {
      // Each ContentItem asks its own question, so advancing changes the
      // prompt as well as the picture.
      const result = run('submit-answer', { answer: 'ميسي' });

      expect(result.roundState.prompt).toBe('من هو الثاني؟');
    });

    it('advances and switches team on a correct answer', () => {
      const result = run('submit-answer', { answer: 'ميسي' });

      expect(result.eventType).toBe('bomb-answer-correct');
      expect(result.roundState.itemIndex).toBe(1);
      expect(result.effects).toContainEqual(
        expect.objectContaining({ type: 'switch-active-team' }),
      );
    });

    it('changes nothing at all on a wrong answer', () => {
      const before = round();
      const result = run('submit-answer', { answer: 'خطأ' });

      expect(result.eventType).toBe('bomb-answer-incorrect');
      expect(result.roundState).toEqual(before);
      // No penalty and no switch: a wrong guess costs only the clock already
      // running, which is the established rule.
      expect(result.effects).not.toContainEqual(
        expect.objectContaining({ type: 'adjust-active-team-time' }),
      );
      expect(result.effects).not.toContainEqual(
        expect.objectContaining({ type: 'switch-active-team' }),
      );
    });

    it('matches accepted answers after normalization', () => {
      expect(run('submit-answer', { answer: '  ميسي  ' }).eventType).toBe(
        'bomb-answer-correct',
      );
    });
  });

  describe('skipping', () => {
    it('advances and takes five seconds off the active clock', () => {
      const result = run('skip');

      expect(result.eventType).toBe('bomb-item-skipped');
      expect(result.roundState.itemIndex).toBe(1);
      expect(result.roundState.imageUrl).toBe(items[1].imageUrl);
      expect(result.roundState.prompt).toBe(items[1].prompt);
      expect(result.runtimeState).toEqual(runtimeState);
      expect(result.effects).toContainEqual({
        type: 'adjust-active-team-time',
        deltaMs: -5_000,
      });
    });

    it('does not switch team', () => {
      expect(run('skip').effects).not.toContainEqual(
        expect.objectContaining({ type: 'switch-active-team' }),
      );
    });
  });

  describe('finishing', () => {
    it('completes the round once the last item is played', () => {
      const result = run(
        'submit-answer',
        { answer: 'رونالدو' },
        {
          itemIndex: 1,
          imageUrl: items[1].imageUrl,
          answersJson: JSON.stringify(items[1].acceptedAnswers),
        },
      );

      expect(result.roundState.phase).toBe('completed');
      expect(result.roundState.itemIndex).toBe(items.length);
    });

    /** The Option A change, and the only rule-adjacent behaviour that moved. */
    it('ends the challenge — not the live session — when the clock expires', () => {
      const result = run('expire-team');

      expect(result.eventType).toBe('bomb-clock-expired');
      expect(result.roundState.phase).toBe('completed');
      expect(result.roundState.endedBy).toBe('clock-expired');
      // The session must survive so the Match can score and reopen the board.
      expect(result.effects).not.toContainEqual(
        expect.objectContaining({ type: 'finish-live-session' }),
      );
    });

    it('refuses commands once the round is complete', () => {
      expect(() => run('skip', {}, { phase: 'completed' })).toThrow(
        expect.objectContaining({ code: 'BOMB_ROUND_COMPLETE' }),
      );
    });
  });

  describe('projections', () => {
    it('never exposes accepted answers to a player', () => {
      const projected = BOMB_GAMEPLAY_PLUGIN.projectRoundState!(round());

      expect(projected).not.toHaveProperty('answersJson');
      expect(JSON.stringify(projected)).not.toContain('ميسي');
    });

    it('exposes the current item and progress', () => {
      const projected = BOMB_GAMEPLAY_PLUGIN.projectRoundState!(round());

      expect(projected).toMatchObject({
        itemIndex: 0,
        itemCount: 2,
        imageUrl: items[0].imageUrl,
      });
    });

    it('never exposes the authored question bank in runtime state', () => {
      const projected = BOMB_GAMEPLAY_PLUGIN.projectRuntimeState!(runtimeState);

      expect(projected).not.toHaveProperty('questionsJson');
      expect(JSON.stringify(projected)).not.toContain('رونالدو');
    });
  });

  describe('authority', () => {
    it('lets the active participant answer and skip without a host', () => {
      expect(BOMB_GAMEPLAY_PLUGIN.command!('submit-answer')).toMatchObject({
        authorization: 'active-participant',
      });
      expect(BOMB_GAMEPLAY_PLUGIN.command!('skip')).toMatchObject({
        authorization: 'active-participant',
      });
    });

    it('exposes no host adjudication command', () => {
      expect(BOMB_GAMEPLAY_PLUGIN.command!('adjudicate')).toBeUndefined();
      expect(BOMB_GAMEPLAY_PLUGIN.command!('mark-correct')).toBeUndefined();
    });
  });
});
