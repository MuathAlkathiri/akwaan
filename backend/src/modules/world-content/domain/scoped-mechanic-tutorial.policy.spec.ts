import {
  SCOPED_TUTORIAL_FIELD_CLASSIFICATION,
  SCOPED_TUTORIAL_MECHANIC_KEYS,
  validateScopedTutorialFlow,
} from './scoped-mechanic-tutorial.policy';

describe('scoped mechanic tutorial flow contract', () => {
  it('declares an example-only field contract for every supported mechanic', () => {
    expect(Object.keys(SCOPED_TUTORIAL_FIELD_CLASSIFICATION).sort()).toEqual(
      [...SCOPED_TUTORIAL_MECHANIC_KEYS].sort(),
    );
    for (const mechanicKey of SCOPED_TUTORIAL_MECHANIC_KEYS) {
      const classification = SCOPED_TUTORIAL_FIELD_CLASSIFICATION[mechanicKey];
      expect(classification.exampleEditable.length).toBeGreaterThan(0);
      expect(classification.derivedOrValidated).toContain('outcome');
    }
  });

  it('locks Bomb timing and handoff values', () => {
    const issues = validateScopedTutorialFlow('bomb', {
      kind: 'bomb',
      version: 1,
      prompt: 'سؤال',
      acceptedAnswer: 'أ',
      nextPrompt: 'التالي',
      startingTeam: 'team-b',
      correctAtSecondsRemaining: 12,
      opponentExpiresAtSecondsRemaining: 1 as 0,
    });

    expect(issues.map((item) => item.code)).toEqual([
      'SCOPED_TUTORIAL_FLOW_LOCKED',
      'SCOPED_TUTORIAL_FLOW_LOCKED',
      'SCOPED_TUTORIAL_FLOW_LOCKED',
    ]);
  });

  it('locks RYO ownership decision and Top 5 keep/give flow', () => {
    const ryo = {
      kind: 'ryo' as const,
      version: 1 as const,
      prompt: 'سؤال',
      options: [
        { id: 'a', label: 'أ' },
        { id: 'b', label: 'ب' },
        { id: 'c', label: 'ج' },
        { id: 'd', label: 'د' },
      ],
      correctOptionId: 'a',
      answeringSelectionOptionId: 'a',
      opposingDecision: 'STEAL' as const,
    };
    expect(
      validateScopedTutorialFlow(
        'read-your-opponent',
        { ...ryo, opposingDecision: 'TRUST' as const },
        ryo,
      ).map((item) => item.details?.field),
    ).toEqual(['opposingDecision']);

    const top5 = {
      kind: 'top-5' as const,
      version: 1 as const,
      prompt: 'أفضل خمسة',
      title: 'أفضل خمسة',
      rankingBasis: 'ترتيب',
      sourceLabel: 'مصدر',
      startingTeam: 'team-a' as const,
      entries: Array.from({ length: 10 }, (_, index) => ({
        id: String(index),
        label: String(index),
        rank: index < 5 ? ((index + 1) as 1 | 2 | 3 | 4 | 5) : null,
      })),
      decisions: [
        { action: 'keep' as const },
        { action: 'give' as const },
        { action: 'keep' as const },
        { action: 'give' as const },
        { action: 'give' as const },
        { action: 'keep' as const },
        { action: 'give' as const },
        { action: 'give' as const },
        { action: 'keep' as const },
        { action: 'keep' as const },
      ],
    };
    expect(
      validateScopedTutorialFlow(
        'top-5',
        { ...top5, decisions: top5.decisions.slice().reverse() },
        top5,
      ).map((item) => item.details?.field),
    ).toEqual(['decisions']);
  });

  it('locks First Note auction and allows example answer text', () => {
    const issues = validateScopedTutorialFlow('first-note', {
      kind: 'first-note',
      version: 1,
      prompt: 'مثال مختلف',
      title: 'أغنية',
      contextualClue: 'دليل',
      bids: [
        { team: 'team-a', seconds: 8 },
        { team: 'team-b', seconds: 5 },
        { team: 'team-a', seconds: 3 },
      ],
      acceptedAnswers: ['أغنية'],
      firstSubmittedAnswer: 'خطأ',
      stealSubmittedAnswer: 'أغنية',
    });

    expect(issues).toEqual([]);
  });

  it('rejects One Clue from scoped publication', () => {
    const issues = validateScopedTutorialFlow('one-clue', {
      kind: 'one-clue',
      version: 1,
      prompt: 'قديم',
      clues: [
        { order: 1, value: 5, text: 'أ' },
        { order: 2, value: 4, text: 'ب' },
        { order: 3, value: 3, text: 'ج' },
        { order: 4, value: 2, text: 'د' },
        { order: 5, value: 1, text: 'هـ' },
      ],
      acceptedAnswer: 'صحيح',
      firstSubmittedAnswer: 'خطأ',
      secondSubmittedAnswer: 'صحيح',
    });

    expect(issues[0]?.code).toBe('SCOPED_TUTORIAL_MECHANIC_UNSUPPORTED');
  });

  it('keeps Odd Piece on the approved single-image version', () => {
    const issues = validateScopedTutorialFlow('odd-piece', {
      kind: 'odd-piece',
      version: 1,
      prompt: 'قطعة',
      targetVehicleIdentity: 'target',
      targetVehicleLabel: 'الهدف',
      intruderVehicleIdentity: 'intruder',
      intruderVehicleLabel: 'الدخيل',
      pieces: [],
      wrongSelectionPieceId: 'wrong',
      correctSelectionPieceId: 'correct',
      targetReveal: { imageUrl: '/reveal.jpg', altText: 'كشف' },
    });
    expect(issues.map((item) => item.code)).toContain(
      'SCOPED_TUTORIAL_VERSION_LOCKED',
    );
  });

  it('locks the Laqatha clue ladder while allowing clue text to vary', () => {
    const baseline = {
      kind: 'laqatha' as const,
      version: 1 as const,
      prompt: 'فيلم',
      title: 'العنوان',
      clues: [1, 2, 3, 4, 5].map((order) => ({
        order: order as 1 | 2 | 3 | 4 | 5,
        value: (6 - order) as 5 | 4 | 3 | 2 | 1,
        text: `دليل ${order}`,
      })),
      acceptedAnswers: ['العنوان'],
      firstSubmittedAnswer: 'خطأ',
      secondSubmittedAnswer: 'العنوان',
    };
    const changed = {
      ...baseline,
      clues: baseline.clues.map((clue, index) =>
        index === 0
          ? { ...clue, order: 2 as 1 | 2 | 3 | 4 | 5, text: 'مثال آخر' }
          : clue,
      ),
    };

    const issues = validateScopedTutorialFlow('laqatha', changed, baseline);
    expect(issues.map((item) => item.code)).toEqual([
      'SCOPED_TUTORIAL_FLOW_LOCKED',
    ]);
    expect(issues[0]?.details).toMatchObject({ field: 'clues[].order' });
  });

  it('locks Ekshifni version and reveal-region order', () => {
    const baseline = {
      kind: 'ekshifni' as const,
      version: 1 as const,
      prompt: 'من هذه الشخصية؟',
      celebrityIdentity: 'شخصية',
      image: {
        url: '/image.jpg',
        altText: 'صورة',
        sha256: 'a'.repeat(64),
        provenanceNote: 'محلي',
      },
      regions: [1, 2, 3, 4, 5, 6].map((number) => ({
        id: `r${number}`,
        number: number as 1 | 2 | 3 | 4 | 5 | 6,
        shape: { x: 0.05, y: 0.05, width: 0.1, height: 0.1 },
      })),
      wrongSubmittedAnswer: 'خطأ',
      correctSubmittedAnswer: 'شخصية',
    };
    const changed = {
      ...baseline,
      version: 2 as 1,
      regions: baseline.regions.map((region, index) =>
        index === 0
          ? { ...region, number: 2 as 1 | 2 | 3 | 4 | 5 | 6 }
          : region,
      ),
    };

    const issues = validateScopedTutorialFlow('ekshifni', changed, baseline);
    expect(issues.map((item) => item.code)).toEqual([
      'SCOPED_TUTORIAL_FLOW_LOCKED',
      'SCOPED_TUTORIAL_FLOW_LOCKED',
    ]);
    expect(issues.map((item) => item.details?.field)).toEqual([
      'version',
      'regions[].number',
    ]);
  });

  it('locks Combo stage order, Marhala movement roles, and La Tahriqha structure', () => {
    const combo = {
      kind: 'combo' as const,
      version: 1 as const,
      stages: [1, 2, 3].map((stage) => ({
        stage: stage as 1 | 2 | 3,
        prompt: `سؤال ${stage}`,
        correctAnswer: 'صح',
        submittedAnswer: 'صح',
      })),
    };
    const comboChanged = {
      ...combo,
      stages: combo.stages.map((item, index) =>
        index === 0 ? { ...item, stage: 2 as 1 | 2 | 3 } : item,
      ),
    };
    expect(
      validateScopedTutorialFlow('combo', comboChanged, combo).map(
        (item) => item.details?.field,
      ),
    ).toEqual(['stages.stage']);

    const marhala = {
      kind: 'marhala' as const,
      version: 1 as const,
      prompt: 'سؤال',
      correctAnswer: 'صح',
      submittedAnswer: 'صح',
      teamAPosition: 4,
      teamBPosition: 8,
      activeTeam: 'team-a' as const,
      difficulty: 'hard' as const,
      movement: 4,
      baseLanding: 8,
      tile: 'boost' as const,
      finalLanding: 13,
    };
    expect(
      validateScopedTutorialFlow(
        'marhala',
        { ...marhala, movement: 5 },
        marhala,
      ).map((item) => item.details?.field),
    ).toEqual(['movement']);

    const laTahriqha = {
      kind: 'la-tahriqha' as const,
      version: 1 as const,
      prompt: 'طبق',
      dishWindowSeconds: 30,
      dishes: [1, 2, 3].map((dish) => ({
        id: `d${dish}`,
        name: `طبق ${dish}`,
        ingredients: Array.from({ length: 8 }, (_, index) => ({
          id: `d${dish}i${index}`,
          label: `مكوّن ${index}`,
          correct: index < 4,
        })),
        teamASelection: [],
        teamBSelection: [],
      })),
      captainRotation: {
        teamA: ['a1', 'a2', 'a3'],
        teamB: ['b1', 'b2', 'b3'],
      },
    };
    const changedDish = {
      ...laTahriqha,
      dishes: laTahriqha.dishes.slice(0, 2),
    };
    expect(
      validateScopedTutorialFlow('la-tahriqha', changedDish, laTahriqha).map(
        (item) => item.details?.field,
      ),
    ).toContain('dishCount');
  });
});
