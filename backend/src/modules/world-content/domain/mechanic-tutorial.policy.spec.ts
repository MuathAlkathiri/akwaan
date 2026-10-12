import { RyoPayoffMatrixRule } from '../../scoring/application/ryo-payoff-matrix.rule';
import {
  deriveTutorialOutcome,
  findTutorialOverlap,
  TUTORIAL_CONTENT_ITEM_ID,
  TutorialScenarioInput,
  validateTutorialScenario,
} from './mechanic-tutorial.policy';

const scenario = (
  overrides: Partial<TutorialScenarioInput> = {},
): TutorialScenarioInput => ({
  prompt: 'كم لونًا في قوس قزح؟',
  options: [
    { id: 'a', label: 'سبعة' },
    { id: 'b', label: 'خمسة' },
    { id: 'c', label: 'ستة' },
    { id: 'd', label: 'ثمانية' },
  ],
  correctOptionId: 'a',
  answeringSelectionOptionId: 'a',
  opposingDecision: 'STEAL',
  ...overrides,
});

describe('tutorial scenario validation', () => {
  it('accepts a well-formed scenario', () => {
    expect(validateTutorialScenario(scenario())).toEqual([]);
  });

  it('requires a prompt', () => {
    const issues = validateTutorialScenario(scenario({ prompt: '   ' }));
    expect(issues.map((issue) => issue.code)).toContain(
      'TUTORIAL_PROMPT_REQUIRED',
    );
  });

  it('requires exactly four options', () => {
    const issues = validateTutorialScenario(
      scenario({ options: scenario().options.slice(0, 3) }),
    );
    expect(issues.map((issue) => issue.code)).toContain('TUTORIAL_OPTION_COUNT');
  });

  it('rejects duplicated option ids', () => {
    const options = scenario().options;
    options[1] = { id: 'a', label: 'خمسة' };
    expect(
      validateTutorialScenario(scenario({ options })).map((i) => i.code),
    ).toContain('TUTORIAL_OPTION_IDS_DUPLICATED');
  });

  it('rejects two options that read as the same answer', () => {
    // Same word, different diacritics and punctuation: a human reads one option
    // twice, so the demonstrated "read" would be nonsense.
    const options = scenario().options;
    options[1] = { id: 'b', label: 'سَبعة.' };
    expect(
      validateTutorialScenario(scenario({ options })).map((i) => i.code),
    ).toContain('TUTORIAL_OPTION_LABELS_DUPLICATED');
  });

  it('rejects a correct answer that is not one of the options', () => {
    expect(
      validateTutorialScenario(scenario({ correctOptionId: 'z' })).map(
        (i) => i.code,
      ),
    ).toContain('TUTORIAL_CORRECT_OPTION_UNKNOWN');
  });

  it('rejects a simulated selection that is not one of the options', () => {
    expect(
      validateTutorialScenario(
        scenario({ answeringSelectionOptionId: 'z' }),
      ).map((i) => i.code),
    ).toContain('TUTORIAL_SELECTION_UNKNOWN');
  });

  it('rejects an invalid opposing decision', () => {
    expect(
      validateTutorialScenario(
        scenario({ opposingDecision: 'MAYBE' as never }),
      ).map((i) => i.code),
    ).toContain('TUTORIAL_DECISION_INVALID');
  });

  it('reports every problem at once rather than the first', () => {
    const issues = validateTutorialScenario(
      scenario({ prompt: '', correctOptionId: 'z', options: [] }),
    );
    expect(issues.length).toBeGreaterThan(2);
  });
});

describe('tutorial outcome derivation', () => {
  const rule = new RyoPayoffMatrixRule();

  /** Every combination, scored by the real rule and by the tutorial path. */
  const cases = [
    { decision: 'TRUST' as const, correct: true },
    { decision: 'TRUST' as const, correct: false },
    { decision: 'STEAL' as const, correct: true },
    { decision: 'STEAL' as const, correct: false },
  ];

  it.each(cases)(
    'matches RyoPayoffMatrixRule for $decision / correct=$correct',
    ({ decision, correct }) => {
      const outcome = deriveTutorialOutcome({
        correctOptionId: 'a',
        answeringSelectionOptionId: correct ? 'a' : 'b',
        opposingDecision: decision,
      });

      const [expected] = rule.calculate({
        answeringTeamId: 'answering',
        opposingTeamId: 'opposing',
        contentItemId: TUTORIAL_CONTENT_ITEM_ID,
        itemIndex: 0,
        selectedAnswer: correct ? 'a' : 'b',
        correctAnswer: 'a',
        decision,
        correct,
      });

      expect(outcome.delta).toBe(expected.delta);
      expect(outcome.reason).toBe(expected.reason);
      expect(outcome.teamRole).toBe(
        expected.teamId === 'answering' ? 'answering' : 'opposing',
      );
      expect(outcome.correct).toBe(correct);
    },
  );

  it('loses a point only on a failed steal', () => {
    const failed = deriveTutorialOutcome({
      correctOptionId: 'a',
      answeringSelectionOptionId: 'b',
      opposingDecision: 'STEAL',
    });
    expect(failed).toMatchObject({ delta: -1, reason: 'ryo.steal.failed' });

    for (const other of [
      { answeringSelectionOptionId: 'a', opposingDecision: 'STEAL' as const },
      { answeringSelectionOptionId: 'a', opposingDecision: 'TRUST' as const },
      { answeringSelectionOptionId: 'b', opposingDecision: 'TRUST' as const },
    ]) {
      expect(
        deriveTutorialOutcome({ correctOptionId: 'a', ...other }).delta,
      ).toBe(1);
    }
  });

  it('never names a competitive ContentItem', () => {
    // The sentinel is what the rule is handed; nothing from the catalog is read
    // to produce a tutorial outcome.
    expect(TUTORIAL_CONTENT_ITEM_ID).toBe('tutorial');
  });
});

describe('tutorial / competitive overlap guard', () => {
  const competitive = [
    {
      contentItemId: '6a725e414c19c862fcb4c0a7',
      prompt: 'من توّج بلقب كأس العالم 2014 بعد فوزه على الأرجنتين في النهائي؟',
    },
    {
      contentItemId: 'anime-1',
      prompt: 'من هو الهوكاجي الرابع الملقب بالبرق الأصفر؟',
    },
  ];

  it('blocks the exact competitive question', () => {
    const matches = findTutorialOverlap(competitive[0].prompt, competitive);
    expect(matches[0]).toMatchObject({
      contentItemId: '6a725e414c19c862fcb4c0a7',
      similarity: 1,
    });
  });

  it('blocks a materially equivalent rewording', () => {
    // Same question, re-punctuated and with the alef/taa-marbuta variants a
    // different author would type.
    const matches = findTutorialOverlap(
      'من توج بلقب كاس العالم ٢٠١٤ بعد فوزه علي الارجنتين في النهائي',
      competitive,
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].similarity).toBeGreaterThanOrEqual(0.72);
  });

  it('clears a genuinely different question', () => {
    expect(findTutorialOverlap('كم لونًا في قوس قزح؟', competitive)).toEqual([]);
  });

  it('clears an empty prompt rather than matching everything', () => {
    expect(findTutorialOverlap('   ', competitive)).toEqual([]);
  });
});
