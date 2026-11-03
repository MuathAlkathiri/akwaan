import { ContentMediaType } from './world-content.constants';
import { RyoPayoffMatrixRule } from '../../scoring/application/ryo-payoff-matrix.rule';
import {
  deriveTutorialOutcome,
  deriveClosestTutorialOutcome,
  deriveBombTutorialOutcome,
  findTutorialOverlap,
  TUTORIAL_CONTENT_ITEM_ID,
  RyoTutorialScenarioInput,
  validateTutorialScenario,
  validateMechanicTutorialScenario,
  validateTop5TutorialScenario,
  deriveTop5TutorialOutcome,
  Top5TutorialScenarioInput,
  deriveComboTutorialOutcome,
  validateComboTutorialScenario,
  ComboTutorialScenarioInput,
  deriveMarhalaTutorialOutcome,
  validateMarhalaTutorialScenario,
  MarhalaTutorialScenarioInput,
  LaqathaTutorialScenarioInput,
  deriveLaqathaTutorialOutcome,
  validateLaqathaTutorialScenario,
  FirstNoteTutorialScenarioInput,
  deriveFirstNoteTutorialOutcome,
  validateFirstNoteTutorialScenario,
  OddPieceV1TutorialScenarioInput,
  OddPieceV2TutorialScenarioInput,
  deriveOddPieceTutorialOutcome,
  validateOddPieceTutorialScenario,
  deriveOneClueTutorialOutcome,
  validateOneClueTutorialScenario,
  OneClueTutorialScenarioInput,
  EkshifniTutorialScenarioInput,
  deriveEkshifniTutorialOutcome,
  validateEkshifniTutorialScenario,
} from './mechanic-tutorial.policy';

const ekshifniScenario = (): EkshifniTutorialScenarioInput => ({
  kind: 'ekshifni',
  version: 1,
  prompt: 'مين هذي؟',
  celebrityIdentity: 'رضوى الشربيني',
  image: {
    url: '/tutorial-media/ekshifni-v1/radwa-el-sherbiny.jpg',
    altText: 'صورة الكشف النهائي',
    sha256: '2c6c2e377eb19fcbc580569acb9059a011c52adea82132c76c5e54f98464b695',
    provenanceNote: 'أصل محلي مؤرشف؛ الحقوق الخارجية غير مثبتة.',
  },
  regions: [1, 2, 3, 4, 5, 6].map((number) => ({
    id: `r${number}`,
    number: number as 1 | 2 | 3 | 4 | 5 | 6,
    shape: { x: 0.05 * number, y: 0.05, width: 0.1, height: 0.1 },
  })),
  wrongSubmittedAnswer: 'لجين عمران',
  correctSubmittedAnswer: 'رضوى الشربيني',
});

describe('ekshifni tutorial contract', () => {
  it('validates six windows and derives the three-image open-race result', () => {
    expect(validateEkshifniTutorialScenario(ekshifniScenario())).toEqual([]);
    expect(deriveEkshifniTutorialOutcome(ekshifniScenario())).toMatchObject({
      resolvedValue: 2,
      initiativeAfterWrong: 'team-b',
      eligibilityRestoredBy: 'opponent-reveal',
      finalTotals: { 'team-a': 6, 'team-b': 8 },
      winnerTeam: 'team-b',
      matchPointDelta: 1,
    });
    expect(
      validateMechanicTutorialScenario('ekshifni', ekshifniScenario()),
    ).toEqual([]);
  });

  it('rejects image leakage contract errors and malformed windows', () => {
    const input = ekshifniScenario();
    input.image.sha256 = 'bad';
    input.regions.pop();
    input.wrongSubmittedAnswer = input.celebrityIdentity;
    const codes = validateEkshifniTutorialScenario(input).map(
      (issue) => issue.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        'TUTORIAL_EKSHIFNI_HASH_INVALID',
        'TUTORIAL_EKSHIFNI_REGION_COUNT',
        'TUTORIAL_EKSHIFNI_WRONG_ANSWER_INVALID',
      ]),
    );
  });
});

const oneClueScenario = (): OneClueTutorialScenarioInput => ({
  kind: 'one-clue',
  version: 1,
  prompt: 'ما المدينة المقصودة؟',
  clues: [
    { order: 1, value: 5, text: 'مدينة عربية ساحلية' },
    { order: 2, value: 4, text: 'واجهة بحرية طويلة' },
    { order: 3, value: 3, text: 'فيها نافورة الملك فهد' },
    { order: 4, value: 2, text: 'عروس البحر الأحمر' },
    { order: 5, value: 1, text: 'تبدأ بحرف الجيم' },
  ],
  acceptedAnswer: 'جدة',
  firstSubmittedAnswer: 'الدمام',
  secondSubmittedAnswer: 'جدة',
});

describe('one-clue tutorial contract', () => {
  it('validates five ordered clues and derives the canonical walkthrough', () => {
    expect(validateOneClueTutorialScenario(oneClueScenario())).toEqual([]);
    expect(deriveOneClueTutorialOutcome(oneClueScenario())).toMatchObject({
      itemCount: 3,
      firstLockedValue: 4,
      eliminatedTeam: 'team-a',
      correctTeam: 'team-b',
      correctValue: 3,
      finalTotals: { 'team-a': 5, 'team-b': 7 },
      winnerTeam: 'team-b',
      matchPointDelta: 1,
    });
  });

  it('rejects malformed clue progression and a first answer that is correct', () => {
    const input = oneClueScenario();
    input.clues[2].value = 4;
    input.firstSubmittedAnswer = 'جدة';
    const codes = validateOneClueTutorialScenario(input).map(
      (issue) => issue.code,
    );
    expect(codes).toContain('TUTORIAL_ONE_CLUE_CLUES_INVALID');
    expect(codes).toContain('TUTORIAL_ONE_CLUE_FIRST_ANSWER_MUST_BE_WRONG');
  });
});

const scenario = (
  overrides: Partial<RyoTutorialScenarioInput> = {},
): RyoTutorialScenarioInput => ({
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
    expect(issues.map((issue) => issue.code)).toContain(
      'TUTORIAL_OPTION_COUNT',
    );
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
    expect(findTutorialOverlap('كم لونًا في قوس قزح؟', competitive)).toEqual(
      [],
    );
  });

  it('clears an empty prompt rather than matching everything', () => {
    expect(findTutorialOverlap('   ', competitive)).toEqual([]);
  });
});

describe('generalized mechanic tutorial policy', () => {
  const closest = {
    kind: 'closest' as const,
    version: 1 as const,
    prompt: 'كم يبلغ ارتفاع هذا المبنى التقريبي؟',
    teamAEstimate: 110,
    teamBEstimate: 145,
    correctValue: 120,
    unit: 'متر',
  };

  it('accepts legacy RYO without a discriminator', () => {
    expect(
      validateMechanicTutorialScenario('read-your-opponent', scenario()),
    ).toEqual([]);
  });

  it('rejects a scenario kind owned by another mechanic', () => {
    expect(
      validateMechanicTutorialScenario('read-your-opponent', closest).map(
        (issue) => issue.code,
      ),
    ).toContain('TUTORIAL_MECHANIC_KIND_MISMATCH');
  });

  it('derives the Closest winner and distances with the live grader', () => {
    expect(deriveClosestTutorialOutcome(closest)).toEqual({
      teamADistance: 10,
      teamBDistance: 25,
      winnerTeam: 'team-a',
      tie: false,
      mechanicTallyDelta: 1,
      matchPointDelta: 0,
      reason: 'closest.absolute-distance',
    });
  });

  it('preserves the canonical equal-distance tie', () => {
    expect(
      deriveClosestTutorialOutcome({
        teamAEstimate: 110,
        teamBEstimate: 130,
        correctValue: 120,
      }),
    ).toMatchObject({ winnerTeam: null, tie: true, mechanicTallyDelta: 0 });
  });

  it('rejects non-finite Closest values', () => {
    expect(
      validateMechanicTutorialScenario('closest', {
        ...closest,
        teamBEstimate: Number.NaN,
      }).map((issue) => issue.code),
    ).toContain('TUTORIAL_CLOSEST_VALUE_INVALID');
  });

  const top5 = (): Top5TutorialScenarioInput => ({
    kind: 'top-5',
    version: 1,
    prompt: 'من أكثر خمسة هدافين؟',
    title: 'أفضل 5 هدافين',
    rankingBasis: 'أهداف الدوري',
    sourceLabel: 'مصدر تجريبي',
    startingTeam: 'team-a',
    entries: [
      { id: 'a', label: 'أ', rank: 1 },
      { id: 'b', label: 'ب', rank: 2 },
      { id: 'c', label: 'ج', rank: 3 },
      { id: 'd', label: 'د', rank: 4 },
      { id: 'e', label: 'هـ', rank: 5 },
      { id: 'f', label: 'و', rank: null },
      { id: 'g', label: 'ز', rank: null },
      { id: 'h', label: 'ح', rank: null },
      { id: 'i', label: 'ط', rank: null },
      { id: 'j', label: 'ي', rank: null },
    ],
    decisions: Array.from({ length: 10 }, (_, index) => ({
      action: index % 2 === 0 ? 'keep' : 'give',
    })),
  });

  it('validates a complete Top 5 tutorial contract', () => {
    expect(validateTop5TutorialScenario(top5())).toEqual([]);
  });

  it('derives ownership and the single Match point from keep-or-give decisions', () => {
    const outcome = deriveTop5TutorialOutcome(top5());
    expect(outcome.ownership).toHaveLength(10);
    expect(outcome.top5Counts['team-a'] + outcome.top5Counts['team-b']).toBe(5);
    expect(outcome.matchPointDelta).toBe(1);
    expect(outcome.reason).toBe('top-5.win');
  });

  it('rejects malformed Top 5 card and decision contracts', () => {
    const input = top5();
    input.entries = input.entries.slice(0, 9);
    input.decisions = [{ action: 'keep' }];
    expect(
      validateTop5TutorialScenario(input).map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        'TUTORIAL_TOP5_ENTRY_COUNT',
        'TUTORIAL_TOP5_DECISION_COUNT',
      ]),
    );
  });

  const combo = (): ComboTutorialScenarioInput => ({
    kind: 'combo',
    version: 1,
    stages: [
      {
        stage: 1,
        prompt: 'ما اسم القرية التي ينتمي إليها ناروتو؟',
        correctAnswer: 'كونوها',
        submittedAnswer: 'كونوها',
      },
      {
        stage: 2,
        prompt: 'ما اسم أخ نيزوكو الأكبر؟',
        correctAnswer: 'تانجيرو كامادو',
        submittedAnswer: 'تانجيرو كامادو',
      },
      {
        stage: 3,
        prompt: 'ما اسم الشخصية الرئيسية في ون بيس؟',
        correctAnswer: 'مونكي دي لوفي',
        submittedAnswer: 'ناروتو',
      },
    ],
  });

  const marhala = (): MarhalaTutorialScenarioInput => ({
    kind: 'marhala',
    version: 1,
    prompt: 'أي لعبة ترتبط بشخصية كريتوس؟',
    correctAnswer: 'غود أوف وور',
    submittedAnswer: 'غود أوف وور',
    teamAPosition: 4,
    teamBPosition: 11,
    activeTeam: 'team-a',
    difficulty: 'hard',
    movement: 4,
    baseLanding: 8,
    tile: 'boost',
    finalLanding: 13,
  });

  it('accepts and derives the canonical Marhala movement and boost path', () => {
    expect(validateMarhalaTutorialScenario(marhala())).toEqual([]);
    expect(deriveMarhalaTutorialOutcome(marhala())).toMatchObject({
      teamAPosition: 13,
      teamBPosition: 11,
      baseLanding: 8,
      tile: 'boost',
      finalLanding: 13,
      matchPointDelta: 0,
      reason: 'marhala.tutorial-turn',
    });
  });

  it('rejects a Marhala movement outside the selected difficulty band', () => {
    const input = marhala();
    input.movement = 2;
    expect(
      validateMarhalaTutorialScenario(input).map((issue) => issue.code),
    ).toContain('TUTORIAL_MARHALA_MOVEMENT_INVALID');
  });

  it('keeps Marhala scenarios on the Marhala mechanic only', () => {
    expect(
      validateMechanicTutorialScenario('combo', marhala()).map(
        (issue) => issue.code,
      ),
    ).toContain('TUTORIAL_MECHANIC_KIND_MISMATCH');
    expect(validateMechanicTutorialScenario('marhala', marhala())).toEqual([]);
  });

  it('accepts and derives the canonical Combo break path', () => {
    expect(validateComboTutorialScenario(combo())).toEqual([]);
    expect(deriveComboTutorialOutcome(combo())).toEqual({
      decision: 'continue-combo',
      breakArmedAtStage: 2,
      forcedQuestionStage: 3,
      correctStagesBeforeBreak: 2,
      unbankedPointsBeforeForcedQuestion: 2,
      forcedQuestionEarned: 0,
      bankedPoints: 0,
      endedBy: 'combo-break',
      reason: 'combo.push-your-luck',
    });
  });

  it('rejects a Combo path that contradicts the forced-question consequence', () => {
    const input = combo();
    input.stages[1].submittedAnswer = 'خطأ';
    input.stages[2].submittedAnswer = input.stages[2].correctAnswer;
    expect(
      validateComboTutorialScenario(input).map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        'TUTORIAL_COMBO_DECISION_PATH_INVALID',
        'TUTORIAL_COMBO_FORCED_OUTCOME_INVALID',
      ]),
    );
    expect(() => deriveComboTutorialOutcome(input)).toThrow(
      'Combo tutorial path does not match the approved sequence',
    );
  });

  const laqatha = (): LaqathaTutorialScenarioInput => ({
    kind: 'laqatha',
    version: 1,
    prompt: 'تعرّفوا على الفيلم من أدلة متدرجة.',
    title: 'حديقة الديناصورات',
    clues: [
      { order: 1, value: 5, text: 'زيارة جزيرة نائية تسبق افتتاح متنزه جديد.' },
      {
        order: 2,
        value: 4,
        text: 'عالِم حفريات يقود مشروعًا يعتمد على الحمض النووي القديم.',
      },
      { order: 3, value: 3, text: 'تعود حيوانات منقرضة إلى الحياة.' },
      { order: 4, value: 2, text: 'طفلان يختبئان قرب سياج كهربائي.' },
      { order: 5, value: 1, text: 'تي-ريكس يطارد الناجين.' },
    ],
    acceptedAnswers: ['حديقة الديناصورات', 'Jurassic Park'],
    firstSubmittedAnswer: 'حديقة الوحوش',
    secondSubmittedAnswer: 'حديقة الديناصورات',
  });

  it('accepts and derives the canonical القطها claim race', () => {
    expect(validateLaqathaTutorialScenario(laqatha())).toEqual([]);
    expect(deriveLaqathaTutorialOutcome(laqatha())).toEqual({
      questionCount: 3,
      firstClaimTeam: 'team-a',
      firstClaimAtClue: 2,
      firstClaimReward: 4,
      firstClaimFailed: true,
      secondClaimTeam: 'team-b',
      secondClaimAtClue: 3,
      secondClaimReward: 3,
      winnerTeam: 'team-b',
      points: { 'team-a': 0, 'team-b': 3 },
      reason: 'laqatha.claim-race',
    });
  });

  it('rejects malformed clue order and an incorrect opponent answer', () => {
    const input = laqatha();
    input.clues[1].value = 5;
    input.secondSubmittedAnswer = 'فيلم آخر';
    expect(
      validateLaqathaTutorialScenario(input).map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        'TUTORIAL_LAQATHA_CLUE_ORDER',
        'TUTORIAL_LAQATHA_SECOND_CLAIM_CORRECT',
      ]),
    );
  });

  it('keeps القطها scenarios on the القطها mechanic only', () => {
    expect(
      validateMechanicTutorialScenario('marhala', laqatha()).map(
        (issue) => issue.code,
      ),
    ).toContain('TUTORIAL_MECHANIC_KIND_MISMATCH');
    expect(validateMechanicTutorialScenario('laqatha', laqatha())).toEqual([]);
  });

  it('keeps Combo scenarios on the Combo mechanic only', () => {
    expect(
      validateMechanicTutorialScenario('closest', combo()).map(
        (issue) => issue.code,
      ),
    ).toContain('TUTORIAL_MECHANIC_KIND_MISMATCH');
    expect(validateMechanicTutorialScenario('combo', combo())).toEqual([]);
  });

  const firstNote = (): FirstNoteTutorialScenarioInput => ({
    kind: 'first-note',
    version: 1,
    prompt: 'تعرّفوا على الأغنية من مزاد ثوانٍ قصير.',
    title: 'على بالي',
    clueLabel: 'السياق',
    contextualClue: 'أغنية عربية معاصرة بصوت نسائي من ألبوم واسع الانتشار.',
    bids: [
      { team: 'team-a', seconds: 8 },
      { team: 'team-b', seconds: 5 },
      { team: 'team-a', seconds: 3 },
    ],
    acceptedAnswers: ['على بالي'],
    firstSubmittedAnswer: 'ليلة صيف',
    stealSubmittedAnswer: 'على بالي',
  });

  it('accepts and derives the canonical First Note auction and steal', () => {
    expect(validateFirstNoteTutorialScenario(firstNote())).toEqual([]);
    expect(deriveFirstNoteTutorialOutcome(firstNote())).toMatchObject({
      songCount: 3,
      finalBidSeconds: 3,
      auctionWinner: 'team-a',
      stolen: true,
      points: { 'team-a': 0, 'team-b': 1 },
    });
    expect(validateMechanicTutorialScenario('first-note', firstNote())).toEqual(
      [],
    );
  });

  it('rejects non-descending, leaking, or incorrectly answered First Note paths', () => {
    const input = firstNote();
    input.contextualClue = 'أغنية على بالي من ألبوم شهير.';
    input.bids[1].seconds = 9;
    input.firstSubmittedAnswer = 'على بالي';
    expect(
      validateFirstNoteTutorialScenario(input).map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        'TUTORIAL_FIRST_NOTE_CLUE_LEAKS_TITLE',
        'TUTORIAL_FIRST_NOTE_BID_DESCENDING',
        'TUTORIAL_FIRST_NOTE_FIRST_ANSWER_WRONG',
      ]),
    );
  });

  const oddPiece = (): OddPieceV1TutorialScenarioInput => ({
    kind: 'odd-piece',
    version: 1,
    prompt: 'أي قطعة لا تنتمي لنفس السيارة؟',
    targetVehicleIdentity: 'BMW M4 G82',
    targetVehicleLabel: 'BMW M4 Competition Coupe (G82)',
    intruderVehicleIdentity: 'Mercedes-AMG C63 W206',
    intruderVehicleLabel: 'Mercedes-AMG C63 (W206)',
    pieces: [
      {
        id: 'a',
        imageUrl: '/a.jpg',
        altText: 'قطعة أ',
        vehicleIdentity: 'BMW M4 G82',
        vehicleLabel: 'BMW M4 G82',
      },
      {
        id: 'b',
        imageUrl: '/b.jpg',
        altText: 'قطعة ب',
        vehicleIdentity: 'BMW M4 G82',
        vehicleLabel: 'BMW M4 G82',
      },
      {
        id: 'c',
        imageUrl: '/c.jpg',
        altText: 'قطعة ج',
        vehicleIdentity: 'BMW M4 G82',
        vehicleLabel: 'BMW M4 G82',
      },
      {
        id: 'd',
        imageUrl: '/d.jpg',
        altText: 'قطعة د',
        vehicleIdentity: 'Mercedes-AMG C63 W206',
        vehicleLabel: 'Mercedes-AMG C63 W206',
      },
    ],
    wrongSelectionPieceId: 'b',
    correctSelectionPieceId: 'd',
    targetReveal: {
      imageUrl: '/reveal.jpg',
      altText: 'السيارة الهدف بعد الكشف',
    },
  });

  const oddPieceV2 = (): OddPieceV2TutorialScenarioInput => ({
    kind: 'odd-piece',
    version: 2,
    prompt: 'أين القطعة الدخيلة؟',
    targetVehicleIdentity: 'BMW M4 G82',
    targetVehicleLabel: 'BMW M4 Competition Coupe (G82)',
    intruderVehicleIdentity: 'Mercedes-AMG C63 W206',
    intruderVehicleLabel: 'Mercedes-AMG C63 (W206)',
    intruderPartIdentity: 'mirror-right',
    intruderPartLabel: 'مرآة جانبية',
    modifiedImage: {
      width: 1200,
      height: 800,
      orientation: 'landscape',
      media: {
        type: ContentMediaType.IMAGE,
        assets: [{ url: '/modified.jpg' }],
      },
      provenance: {
        assetOrigin: 'ai-edited',
        sourceUrl: 'https://akwaan.test/car-modified.jpg',
      },
    },
    originalImage: {
      width: 1200,
      height: 800,
      orientation: 'landscape',
      media: {
        type: ContentMediaType.IMAGE,
        assets: [{ url: '/original.jpg' }],
      },
      provenance: {
        assetOrigin: 'authentic',
        sourceUrl: 'https://akwaan.test/car-original.jpg',
      },
    },
    hotspot: {
      polygon: [
        { x: 0.5, y: 0.3 },
        { x: 0.6, y: 0.3 },
        { x: 0.6, y: 0.4 },
        { x: 0.5, y: 0.4 },
      ],
      tolerance: 0.02,
    },
    wrongPoint: { x: 0.2, y: 0.6 },
    correctPoint: { x: 0.55, y: 0.35 },
  });

  it('accepts and derives the canonical Odd Piece handoff', () => {
    expect(validateOddPieceTutorialScenario(oddPiece())).toEqual([]);
    expect(deriveOddPieceTutorialOutcome(oddPiece())).toMatchObject({
      firstClaimTeam: 'team-a',
      firstClaimCorrect: false,
      handoffTeam: 'team-b',
      secondClaimPieceId: 'd',
      winnerTeam: 'team-b',
      points: { 'team-a': 0, 'team-b': 1 },
      matchPointDelta: 1,
      puzzleCount: 3,
    });
    expect(validateMechanicTutorialScenario('odd-piece', oddPiece())).toEqual(
      [],
    );
  });

  it('accepts and derives the Odd Piece V2 single-image hotspot tutorial', () => {
    expect(validateOddPieceTutorialScenario(oddPieceV2())).toEqual([]);
    expect(deriveOddPieceTutorialOutcome(oddPieceV2())).toMatchObject({
      firstClaimTeam: 'team-a',
      firstClaimCorrect: false,
      handoffTeam: 'team-b',
      winnerTeam: 'team-b',
      points: { 'team-a': 0, 'team-b': 1 },
      matchPointDelta: 1,
      puzzleCount: 3,
      reason: 'odd-piece.claim-handoff',
    });
    expect(validateMechanicTutorialScenario('odd-piece', oddPieceV2())).toEqual(
      [],
    );
  });

  it('rejects an ambiguous piece count or a pre-reveal identity leak in V1', () => {
    const input = oddPiece();
    input.pieces[0].altText = 'BMW M4 G82 headlight';
    input.pieces = input.pieces.slice(0, 3);
    expect(
      validateOddPieceTutorialScenario(input).map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        'TUTORIAL_ODD_PIECE_COUNT',
        'TUTORIAL_ODD_PIECE_ALT_LEAKS_IDENTITY',
      ]),
    );
  });

  it('rejects an invalid hotspot or inverted taps in V2', () => {
    const input = oddPieceV2();
    input.wrongPoint = { x: 0.55, y: 0.35 }; // inside hotspot!
    input.correctPoint = { x: 0.1, y: 0.1 }; // outside hotspot!
    expect(
      validateOddPieceTutorialScenario(input).map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        'TUTORIAL_ODD_PIECE_WRONG_SELECTION_INVALID',
        'TUTORIAL_ODD_PIECE_CORRECT_SELECTION_INVALID',
      ]),
    );
  });

  it('derives the approved multi-pass Bomb outcome without resetting time', () => {
    expect(deriveBombTutorialOutcome({ startingTeam: 'team-a' })).toEqual({
      passedToTeam: 'team-a',
      expiredTeam: 'team-a',
      winnerTeam: 'team-b',
      correctAnswerPassesTurn: true,
      timerResetsOnPass: false,
      matchPointDelta: 1,
      reason: 'bomb.clock-expired',
    });
  });

  it('validates a mechanic-native Bomb scenario', () => {
    expect(
      validateMechanicTutorialScenario('bomb', {
        kind: 'bomb',
        version: 1,
        prompt: 'وش هذا؟',
        acceptedAnswer: 'المريخ',
        nextPrompt: 'وش التالي؟',
        startingTeam: 'team-a',
        correctAtSecondsRemaining: 18,
        opponentExpiresAtSecondsRemaining: 0,
      }),
    ).toEqual([]);
  });
});
