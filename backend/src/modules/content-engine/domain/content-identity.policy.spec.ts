import { ChallengeAnswerMode } from '../../world-content/domain/world-content.constants';
import {
  compareContentIdentities,
  extractContentIdentity,
} from './content-identity.policy';
import { RawContentItemInput } from './content-identity.types';

describe('ContentIdentityPolicy (Slice 2B Hardening)', () => {
  // 1. Identical fact, identical answer, different distractors → DUPLICATE
  it('1. classifies identical fact and answer with differing distractors as DUPLICATE', () => {
    // Section 3: "Changing distractors does not create a new core gameplay task."
    const itemA: RawContentItemInput = {
      prompt: 'ما هي عاصمة اليابان؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'طوكيو' },
          { id: '2', label: 'أوساكا' },
          { id: '3', label: 'كيوتو' },
          { id: '4', label: 'ناغويا' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'world-capitals',
    };

    const itemB: RawContentItemInput = {
      prompt: 'ما هي عاصمة اليابان؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: 'طوكيو' },
          { id: 'b', label: 'بكين' },
          { id: 'c', label: 'سول' },
          { id: 'd', label: 'بانكوك' },
        ],
        correctOptionId: 'a',
      },
      scopeKey: 'world-capitals',
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);
    const comparison = compareContentIdentities(idA, idB);

    expect(comparison.result).toBe('DUPLICATE');
    expect(comparison.reasonCode).toBe('SAME_FACT_DIFFERENT_DISTRACTORS');
    expect(comparison.dimensions.semanticTarget).toBe('MATCH');
    expect(comparison.dimensions.cognitiveTask).toBe('MATCH');
    expect(comparison.dimensions.mechanicPayload).toBe('OVERLAP');
  });

  // 2. Identical fact, reordered options → DUPLICATE
  it('2. classifies identical fact with reordered options as DUPLICATE', () => {
    const itemA: RawContentItemInput = {
      prompt: 'ما هي عاصمة فرنسا؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'opt1', label: 'باريس' },
          { id: 'opt2', label: 'لندن' },
          { id: 'opt3', label: 'روما' },
        ],
        correctOptionId: 'opt1',
      },
      scopeKey: 'world-capitals',
    };

    const itemB: RawContentItemInput = {
      prompt: 'ما هي عاصمة فرنسا؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'x', label: 'روما' },
          { id: 'y', label: 'باريس' },
          { id: 'z', label: 'لندن' },
        ],
        correctOptionId: 'y',
      },
      scopeKey: 'world-capitals',
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);
    const comparison = compareContentIdentities(idA, idB);

    expect(comparison.result).toBe('DUPLICATE');
    expect(comparison.reasonCode).toBe('SAME_PUZZLE_REORDERED_OPTIONS');
    expect(comparison.dimensions.semanticTarget).toBe('MATCH');
    expect(comparison.dimensions.mechanicPayload).toBe('MATCH');
  });

  // 3. Same answer, different factual relationship → DISTINCT when proven
  it('3. classifies same answer with proven different factual relationships as DISTINCT', () => {
    // Both answers are "باريس", but one asks for location of Eiffel Tower and the other asks for Louvre Museum
    const itemA: RawContentItemInput = {
      prompt: 'في أي مدينة يقع برج إيفل؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'باريس' },
          { id: '2', label: 'ليون' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'geography-landmarks',
    };

    const itemB: RawContentItemInput = {
      prompt: 'في أي مدينة يقع متحف اللوفر؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: 'باريس' },
          { id: 'b', label: 'مارسيليا' },
        ],
        correctOptionId: 'a',
      },
      scopeKey: 'geography-landmarks',
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);
    const comparison = compareContentIdentities(idA, idB);

    expect(comparison.result).toBe('DISTINCT');
    expect(comparison.reasonCode).toBe('DISTINCT_FACTUAL_RELATIONSHIP');
    expect(comparison.dimensions.cognitiveTask).toBe('MISMATCH');
    expect(comparison.dimensions.semanticTarget).toBe('MATCH');
  });

  // 4. Same answer, uncertain relationship → POTENTIAL_OVERLAP
  it('4. classifies same answer with uncertain factual relationship as POTENTIAL_OVERLAP', () => {
    // Both answers are "باريس", but prompts use unverified literary/descriptive cues
    const itemA: RawContentItemInput = {
      prompt: 'مدينة تشتهر ببرجها الحديدي الشهير',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'باريس' },
          { id: '2', label: 'روما' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'trivia',
    };

    const itemB: RawContentItemInput = {
      prompt: 'عاصمة الموضة والأناقة العالمية',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: 'باريس' },
          { id: 'b', label: 'ميلانو' },
        ],
        correctOptionId: 'a',
      },
      scopeKey: 'trivia',
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);
    const comparison = compareContentIdentities(idA, idB);

    expect(comparison.result).toBe('POTENTIAL_OVERLAP');
    expect(comparison.reasonCode).toBe('UNCERTAIN_FACTUAL_RELATIONSHIP');
    expect(comparison.dimensions.cognitiveTask).toBe('OVERLAP');
  });

  // 5. Semantically equivalent question paraphrases → DUPLICATE when proven
  it('5. classifies proven semantically equivalent question paraphrases as DUPLICATE', () => {
    const itemA: RawContentItemInput = {
      prompt: 'ما هي عاصمة اليابان؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'طوكيو' },
          { id: '2', label: 'كيوتو' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'world-capitals',
    };

    const itemB: RawContentItemInput = {
      prompt: 'عاصمة دولة اليابان هي:',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: 'طوكيو' },
          { id: 'b', label: 'كيوتو' },
        ],
        correctOptionId: 'a',
      },
      scopeKey: 'world-capitals',
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);
    const comparison = compareContentIdentities(idA, idB);

    expect(comparison.result).toBe('DUPLICATE');
    expect(comparison.reasonCode).toBe('SAME_TASK_REWORDED_PROMPT');
    expect(comparison.dimensions.semanticTarget).toBe('MATCH');
    expect(comparison.dimensions.cognitiveTask).toBe('MATCH');
  });

  // 6. Same clues, reordered progression → DUPLICATE
  it('6. classifies same clues with reordered progression as DUPLICATE difficulty variation', () => {
    // Section 4: "Same target, same clues, different order: normally DUPLICATE when the same underlying gameplay task is established."
    const itemA: RawContentItemInput = {
      prompt: 'من هي الشخصية؟',
      answerPayload: {
        mode: ChallengeAnswerMode.ONE_CLUE,
        acceptedAnswers: ['أحمد زويل'],
      },
      mechanicPayload: {
        clues: [
          { order: 1, value: 5, text: { ar: 'وُلد في دمنهور عام 1946' } },
          {
            order: 2,
            value: 1,
            text: { ar: 'حصل على جائزة نوبل في الكيمياء عن الفيمتو ثانية' },
          },
        ],
      },
      scopeKey: 'personalities',
    };

    const itemB: RawContentItemInput = {
      prompt: 'من هي الشخصية؟',
      answerPayload: {
        mode: ChallengeAnswerMode.ONE_CLUE,
        acceptedAnswers: ['أحمد زويل'],
      },
      mechanicPayload: {
        clues: [
          {
            order: 1,
            value: 5,
            text: { ar: 'حصل على جائزة نوبل في الكيمياء عن الفيمتو ثانية' },
          },
          { order: 2, value: 1, text: { ar: 'وُلد في دمنهور عام 1946' } },
        ],
      },
      scopeKey: 'personalities',
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);
    const comparison = compareContentIdentities(idA, idB);

    expect(comparison.result).toBe('DUPLICATE');
    expect(comparison.reasonCode).toBe('SAME_CLUES_REORDERED_PROGRESSION');
    expect(comparison.dimensions.semanticTarget).toBe('MATCH');
    expect(comparison.dimensions.mechanicPayload).toBe('MATCH');
  });

  // 7. Same target, partially overlapping clues → POTENTIAL_OVERLAP
  it('7. classifies same target with partially overlapping clues as POTENTIAL_OVERLAP', () => {
    // Section 4: "Same target, partially overlapping clues: POTENTIAL_OVERLAP unless stronger evidence supports another outcome."
    const itemA: RawContentItemInput = {
      prompt: 'من هو الكاتب؟',
      answerPayload: {
        mode: ChallengeAnswerMode.ONE_CLUE,
        acceptedAnswers: ['نجيب محفوظ'],
      },
      mechanicPayload: {
        clues: [
          { order: 1, text: { ar: 'وُلد في الجمالية بالقاهرة' } },
          { order: 2, text: { ar: 'صاحب الثلاثية الشهيرة' } },
        ],
      },
      scopeKey: 'literature',
    };

    const itemB: RawContentItemInput = {
      prompt: 'من هو الكاتب؟',
      answerPayload: {
        mode: ChallengeAnswerMode.ONE_CLUE,
        acceptedAnswers: ['نجيب محفوظ'],
      },
      mechanicPayload: {
        clues: [
          { order: 1, text: { ar: 'صاحب الثلاثية الشهيرة' } },
          { order: 2, text: { ar: 'نال جائزة نوبل في الأدب عام 1988' } },
        ],
      },
      scopeKey: 'literature',
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);
    const comparison = compareContentIdentities(idA, idB);

    expect(comparison.result).toBe('POTENTIAL_OVERLAP');
    expect(comparison.reasonCode).toBe('PARTIAL_CLUE_OVERLAP');
    expect(comparison.dimensions.semanticTarget).toBe('MATCH');
    expect(comparison.dimensions.mechanicPayload).toBe('OVERLAP');
  });

  // 8. Same target, different clues without sufficient identity evidence → POTENTIAL_OVERLAP
  it('8. classifies same target with genuinely different clues as POTENTIAL_OVERLAP', () => {
    // Section 4: "Same target, genuinely different clue sets: evaluate the underlying task and mechanic semantics; do not assume either DUPLICATE or DISTINCT from clue differences alone."
    const itemA: RawContentItemInput = {
      prompt: 'من هو الكاتب؟',
      answerPayload: {
        mode: ChallengeAnswerMode.ONE_CLUE,
        acceptedAnswers: ['نجيب محفوظ'],
      },
      mechanicPayload: {
        clues: [
          { order: 1, text: { ar: 'درس الفلسفة في جامعة القاهرة' } },
          { order: 2, text: { ar: 'عمل موظفا في وزارة الأوقاف' } },
        ],
      },
      scopeKey: 'literature',
    };

    const itemB: RawContentItemInput = {
      prompt: 'من هو الكاتب؟',
      answerPayload: {
        mode: ChallengeAnswerMode.ONE_CLUE,
        acceptedAnswers: ['نجيب محفوظ'],
      },
      mechanicPayload: {
        clues: [
          { order: 1, text: { ar: 'ألف رواية خان الخليلي' } },
          { order: 2, text: { ar: 'توفي عام 2006' } },
        ],
      },
      scopeKey: 'literature',
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);
    const comparison = compareContentIdentities(idA, idB);

    expect(comparison.result).toBe('POTENTIAL_OVERLAP');
    expect(comparison.reasonCode).toBe('SAME_TARGET_DIFFERENT_CLUES');
    expect(comparison.dimensions.semanticTarget).toBe('MATCH');
    expect(comparison.dimensions.mechanicPayload).toBe('MISMATCH');
  });

  // 9. Different established semantic targets → DISTINCT
  it('9. classifies different established semantic targets as DISTINCT', () => {
    const itemA: RawContentItemInput = {
      prompt: 'ما هي عاصمة فرنسا؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'باريس' },
          { id: '2', label: 'ليون' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'world-capitals',
    };

    const itemB: RawContentItemInput = {
      prompt: 'ما هي عاصمة إنجلترا؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'لندن' },
          { id: '2', label: 'مانشستر' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'world-capitals',
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);
    const comparison = compareContentIdentities(idA, idB);

    expect(comparison.result).toBe('DISTINCT');
    expect(comparison.reasonCode).toBe('DISTINCT_SEMANTIC_TARGET');
  });

  // 10. Generic prompt stems with different puzzle payloads must not falsely collide
  it('10. treats identical generic prompt stems with different option sets as DISTINCT', () => {
    const itemA: RawContentItemInput = {
      prompt: 'ما العنصر الدخيل؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'تفاح' },
          { id: '2', label: 'برتقال' },
          { id: '3', label: 'موز' },
          { id: '4', label: 'سيارة' },
        ],
        correctOptionId: '4',
      },
      scopeKey: 'wordplay-letters',
    };

    const itemB: RawContentItemInput = {
      prompt: 'ما العنصر الدخيل؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'الرياض' },
          { id: '2', label: 'القاهرة' },
          { id: '3', label: 'لندن' },
          { id: '4', label: 'شجرة' },
        ],
        correctOptionId: '4',
      },
      scopeKey: 'wordplay-letters',
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);
    const comparison = compareContentIdentities(idA, idB);

    expect(comparison.result).toBe('DISTINCT');
    expect(comparison.reasonCode).toBe('DISTINCT_PUZZLE_PAYLOAD');
  });

  // 11. Conflicting answer keys for the same puzzle must not silently pass as DISTINCT
  it('11. detects conflicting answer keys on identical options as DUPLICATE with contradiction warning', () => {
    const itemA: RawContentItemInput = {
      prompt: 'ما العنصر الدخيل؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'حديد' },
          { id: '2', label: 'نحاس' },
          { id: '3', label: 'ألمنيوم' },
          { id: '4', label: 'خشب' },
        ],
        correctOptionId: '4', // خشب
      },
      scopeKey: 'wordplay-letters',
    };

    const itemB: RawContentItemInput = {
      prompt: 'اختر الكلمة الشاذة:',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: 'حديد' },
          { id: 'b', label: 'نحاس' },
          { id: 'c', label: 'ألمنيوم' },
          { id: 'd', label: 'خشب' },
        ],
        correctOptionId: 'a', // حديد (contradiction!)
      },
      scopeKey: 'wordplay-letters',
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);
    const comparison = compareContentIdentities(idA, idB);

    expect(comparison.result).toBe('DUPLICATE');
    expect(comparison.reasonCode).toBe('SAME_PUZZLE_CONFLICTING_ANSWER');
    expect(comparison.dimensions.mechanicPayload).toBe('MATCH');
    expect(comparison.dimensions.semanticTarget).toBe('MISMATCH');
  });

  // 12. Cross-Scope equivalent content remains advisory
  it('12. flags identical content across different Scopes as POTENTIAL_OVERLAP with CROSS_SCOPE_ADVISORY', () => {
    const itemA: RawContentItemInput = {
      prompt: 'ما هي عاصمة إيطاليا؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'روما' },
          { id: '2', label: 'ميلانو' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'geography-europe',
    };

    const itemB: RawContentItemInput = {
      prompt: 'ما هي عاصمة إيطاليا؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'روما' },
          { id: '2', label: 'ميلانو' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'world-capitals', // Different Scope!
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);
    const comparison = compareContentIdentities(idA, idB);

    expect(comparison.result).toBe('POTENTIAL_OVERLAP');
    expect(comparison.reasonCode).toBe('CROSS_SCOPE_ADVISORY');
    expect(comparison.isCrossScope).toBe(true);
  });

  // 13. Existing mechanic-specific identity behavior remains intact
  it('13. preserves mechanic-specific identity for Closest, Odd Piece, La Tahriqha, and Media', () => {
    // 13a. Closest numeric estimate with same number but different task -> DISTINCT
    const numContinents: RawContentItemInput = {
      prompt: 'كم عدد قارات العالم المعترف بها؟',
      answerPayload: { mode: ChallengeAnswerMode.CLOSEST, correctValue: 7 },
      scopeKey: 'geography',
    };
    const numDays: RawContentItemInput = {
      prompt: 'كم عدد أيام الأسبوع؟',
      answerPayload: { mode: ChallengeAnswerMode.CLOSEST, correctValue: 7 },
      scopeKey: 'general-knowledge',
    };
    const compNum = compareContentIdentities(
      extractContentIdentity(numContinents),
      extractContentIdentity(numDays),
    );
    expect(compNum.result).toBe('DISTINCT');
    expect(compNum.reasonCode).toBe('DISTINCT_COGNITIVE_TASK');

    // 13b. La Tahriqha identical ingredients -> DUPLICATE
    const dishA: RawContentItemInput = {
      prompt: 'كبسة دجاج',
      answerPayload: { mode: ChallengeAnswerMode.LA_TAHRIQHA },
      mechanicPayload: {
        ingredients: [
          { label: 'أرز', correct: true },
          { label: 'دجاج', correct: true },
          { label: 'بصل', correct: true },
          { label: 'فانيليا', correct: false },
        ],
      },
      scopeKey: 'food',
    };
    const dishB: RawContentItemInput = {
      prompt: 'كبسة دجاج سعودية',
      answerPayload: { mode: ChallengeAnswerMode.LA_TAHRIQHA },
      mechanicPayload: {
        ingredients: [
          { label: 'دجاج', correct: true },
          { label: 'أرز', correct: true },
          { label: 'بصل', correct: true },
          { label: 'فانيليا', correct: false },
        ],
      },
      scopeKey: 'food',
    };
    const compDish = compareContentIdentities(
      extractContentIdentity(dishA),
      extractContentIdentity(dishB),
    );
    expect(compDish.result).toBe('DUPLICATE');

    // 13c. Odd piece different vehicle -> DISTINCT
    const oddA: RawContentItemInput = {
      prompt: 'القطعة الدخيلة',
      answerPayload: { mode: ChallengeAnswerMode.ODD_PIECE },
      mechanicPayload: { targetVehicleIdentity: 'camry' },
      scopeKey: 'cars',
    };
    const oddB: RawContentItemInput = {
      prompt: 'القطعة الدخيلة',
      answerPayload: { mode: ChallengeAnswerMode.ODD_PIECE },
      mechanicPayload: { targetVehicleIdentity: 'accord' },
      scopeKey: 'cars',
    };
    const compOdd = compareContentIdentities(
      extractContentIdentity(oddA),
      extractContentIdentity(oddB),
    );
    expect(compOdd.result).toBe('DISTINCT');
    expect(compOdd.reasonCode).toBe('DISTINCT_SEMANTIC_TARGET');
  });

  // 14. Missing identity evidence never defaults to DISTINCT
  it('14. never defaults missing evidence or unsupported mechanics to DISTINCT', () => {
    // Missing semantic target -> POTENTIAL_OVERLAP
    const missingTarget: RawContentItemInput = {
      prompt: 'سؤال بدون إجابة',
      answerPayload: { mode: ChallengeAnswerMode.MULTIPLE_CHOICE, options: [] },
      scopeKey: 'test',
    };
    const validTarget: RawContentItemInput = {
      prompt: 'سؤال عادي',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [{ id: '1', label: 'نعم' }],
        correctOptionId: '1',
      },
      scopeKey: 'test',
    };
    const compMissing = compareContentIdentities(
      extractContentIdentity(missingTarget),
      extractContentIdentity(validTarget),
    );
    expect(compMissing.result).toBe('POTENTIAL_OVERLAP');
    expect(compMissing.reasonCode).toBe('MISSING_SEMANTIC_TARGET');

    // Unsupported subjective consensus (VOTE) -> POTENTIAL_OVERLAP
    const voteItem: RawContentItemInput = {
      prompt: 'ما رأيك؟',
      answerPayload: {
        mode: ChallengeAnswerMode.VOTE,
        consensusRule: 'MAJORITY',
      },
      scopeKey: 'survey',
    };
    const compVote = compareContentIdentities(
      extractContentIdentity(voteItem),
      extractContentIdentity(voteItem),
    );
    expect(compVote.result).toBe('POTENTIAL_OVERLAP');
    expect(compVote.reasonCode).toBe('UNSUPPORTED_MECHANIC_COMPARISON');
  });

  // 15. Symmetrical stability
  it('15. maintains symmetrical stability regardless of argument order', () => {
    const itemA: RawContentItemInput = {
      prompt: 'ما هي عاصمة إيطاليا؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'روما' },
          { id: '2', label: 'ميلانو' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'europe',
    };

    const itemB: RawContentItemInput = {
      prompt: 'عاصمة دولة إيطاليا هي:',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'x', label: 'روما' },
          { id: 'y', label: 'تورينو' },
        ],
        correctOptionId: 'x',
      },
      scopeKey: 'europe',
    };

    const idA = extractContentIdentity(itemA);
    const idB = extractContentIdentity(itemB);

    const resAB = compareContentIdentities(idA, idB);
    const resBA = compareContentIdentities(idB, idA);

    expect(resAB.result).toBe(resBA.result);
    expect(resAB.reasonCode).toBe(resBA.reasonCode);
    expect(resAB.dimensions).toEqual(resBA.dimensions);
  });

  // 16. America vs United States (same capital) → POTENTIAL_OVERLAP
  it('16. treats America vs United States with same capital as POTENTIAL_OVERLAP', () => {
    const itemA: RawContentItemInput = {
      prompt: 'ما هي عاصمة أمريكا؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'واشنطن' },
          { id: '2', label: 'نيويورك' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'world-capitals',
    };

    const itemB: RawContentItemInput = {
      prompt: 'ما هي عاصمة الولايات المتحدة؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: 'واشنطن' },
          { id: 'b', label: 'شيكاغو' },
        ],
        correctOptionId: 'a',
      },
      scopeKey: 'world-capitals',
    };

    const comp = compareContentIdentities(
      extractContentIdentity(itemA),
      extractContentIdentity(itemB),
    );

    expect(comp.result).toBe('POTENTIAL_OVERLAP');
    expect(comp.reasonCode).toBe('UNCERTAIN_FACTUAL_RELATIONSHIP');
    expect(comp.dimensions.semanticTarget).toBe('MATCH');
    expect(comp.dimensions.cognitiveTask).toBe('MISMATCH');
  });

  // 17. Telephone vs phone (same inventor) → POTENTIAL_OVERLAP
  it('17. treats telephone vs phone with same inventor as POTENTIAL_OVERLAP', () => {
    const itemA: RawContentItemInput = {
      prompt: 'من هو مخترع الهاتف؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'جراهام بيل' },
          { id: '2', label: 'إديسون' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'inventions',
    };

    const itemB: RawContentItemInput = {
      prompt: 'من هو مخترع التليفون؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: 'جراهام بيل' },
          { id: 'b', label: 'تيسلا' },
        ],
        correctOptionId: 'a',
      },
      scopeKey: 'inventions',
    };

    const comp = compareContentIdentities(
      extractContentIdentity(itemA),
      extractContentIdentity(itemB),
    );

    expect(comp.result).toBe('POTENTIAL_OVERLAP');
    expect(comp.reasonCode).toBe('UNCERTAIN_FACTUAL_RELATIONSHIP');
    expect(comp.dimensions.semanticTarget).toBe('MATCH');
  });

  // 18. Harry Potter vs Harry Potter novel
  it('18. handles Harry Potter book/novel variants safely without false distinct', () => {
    // 18a. Strippable prefix (رواية هاري بوتر vs هاري بوتر) -> DUPLICATE
    const itemA: RawContentItemInput = {
      prompt: 'من مؤلف هاري بوتر؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'رولينج' },
          { id: '2', label: 'تولكين' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'literature',
    };

    const itemB: RawContentItemInput = {
      prompt: 'من كاتب رواية هاري بوتر؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: 'رولينج' },
          { id: 'b', label: 'مارتن' },
        ],
        correctOptionId: 'a',
      },
      scopeKey: 'literature',
    };

    const compEquiv = compareContentIdentities(
      extractContentIdentity(itemA),
      extractContentIdentity(itemB),
    );
    expect(compEquiv.result).toBe('DUPLICATE');
    expect(compEquiv.reasonCode).toBe('SAME_FACT_DIFFERENT_DISTRACTORS');

    // 18b. Unstrippable variation (مغامرات هاري بوتر vs هاري بوتر) -> POTENTIAL_OVERLAP
    const itemC: RawContentItemInput = {
      prompt: 'من كاتب مغامرات هاري بوتر؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'x', label: 'رولينج' },
          { id: 'y', label: 'شكسبير' },
        ],
        correctOptionId: 'x',
      },
      scopeKey: 'literature',
    };

    const compUncertain = compareContentIdentities(
      extractContentIdentity(itemA),
      extractContentIdentity(itemC),
    );
    expect(compUncertain.result).toBe('POTENTIAL_OVERLAP');
    expect(compUncertain.reasonCode).toBe('UNCERTAIN_FACTUAL_RELATIONSHIP');
  });

  // 19. Same answer with differing property labels without proven task difference
  it('19. treats differing property labels without proven task difference as POTENTIAL_OVERLAP', () => {
    const itemA: RawContentItemInput = {
      prompt: 'فرنسا',
      metadata: { subject: 'فرنسا' },
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'باريس' },
          { id: '2', label: 'ليون' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'geo',
    };

    const itemB: RawContentItemInput = {
      prompt: 'ما هي عاصمة فرنسا؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: 'باريس' },
          { id: 'b', label: 'مارسيليا' },
        ],
        correctOptionId: 'a',
      },
      scopeKey: 'geo',
    };

    const comp = compareContentIdentities(
      extractContentIdentity(itemA),
      extractContentIdentity(itemB),
    );

    expect(comp.result).toBe('POTENTIAL_OVERLAP');
    expect(comp.reasonCode).toBe('UNCERTAIN_FACTUAL_RELATIONSHIP');
  });

  // 20. Feminine location verbs (تقع / توجد)
  it('20. correctly extracts feminine location verbs and identifies duplicates', () => {
    const itemA: RawContentItemInput = {
      prompt: 'أين تقع الكعبة المشرفة؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'مكة المكرمة' },
          { id: '2', label: 'المدينة المنورة' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'islamic-landmarks',
    };

    const itemB: RawContentItemInput = {
      prompt: 'في أي مدينة توجد الكعبة المشرفة؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: 'مكة المكرمة' },
          { id: 'b', label: 'جدة' },
        ],
        correctOptionId: 'a',
      },
      scopeKey: 'islamic-landmarks',
    };

    const comp = compareContentIdentities(
      extractContentIdentity(itemA),
      extractContentIdentity(itemB),
    );

    expect(comp.result).toBe('DUPLICATE');
    expect(comp.reasonCode).toBe('SAME_FACT_DIFFERENT_DISTRACTORS');
  });

  // 21. Fronted constructions and unsupported colloquial phrasing
  it('21. supports fronted location structures and keeps colloquial slang uncertain', () => {
    // 21a. Fronted pattern: "برج إيفل أين يقع؟" -> extracts location & subject
    const itemFronted: RawContentItemInput = {
      prompt: 'برج إيفل أين يقع؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'باريس' },
          { id: '2', label: 'روما' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'landmarks',
    };

    const itemStandard: RawContentItemInput = {
      prompt: 'أين يقع برج إيفل؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: 'باريس' },
          { id: 'b', label: 'لندن' },
        ],
        correctOptionId: 'a',
      },
      scopeKey: 'landmarks',
    };

    const compFronted = compareContentIdentities(
      extractContentIdentity(itemFronted),
      extractContentIdentity(itemStandard),
    );
    expect(compFronted.result).toBe('DUPLICATE');
    expect(compFronted.reasonCode).toBe('SAME_FACT_DIFFERENT_DISTRACTORS');

    // 21b. Unsupported colloquial phrasing -> POTENTIAL_OVERLAP
    const itemColloquial: RawContentItemInput = {
      prompt: 'برج إيفل ده مكانه فين بالظبط يا شباب؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'باريس' },
          { id: '2', label: 'برلين' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'landmarks',
    };

    const compColloquial = compareContentIdentities(
      extractContentIdentity(itemColloquial),
      extractContentIdentity(itemStandard),
    );
    expect(compColloquial.result).toBe('POTENTIAL_OVERLAP');
    expect(compColloquial.reasonCode).toBe('UNCERTAIN_FACTUAL_RELATIONSHIP');
  });

  // 22. Cross-Scope conflicting answer keys must be POTENTIAL_OVERLAP with advisory
  it('22. flags cross-Scope conflicting answer keys as POTENTIAL_OVERLAP with advisory', () => {
    const itemA: RawContentItemInput = {
      prompt: 'ما هي عاصمة فرنسا؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'باريس' },
          { id: '2', label: 'ليون' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'scope-a',
    };

    const itemB: RawContentItemInput = {
      prompt: 'ما هي عاصمة فرنسا؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'باريس' },
          { id: '2', label: 'ليون' },
        ],
        correctOptionId: '2',
      },
      scopeKey: 'scope-b', // Different Scope!
    };

    const comp = compareContentIdentities(
      extractContentIdentity(itemA),
      extractContentIdentity(itemB),
    );

    expect(comp.result).toBe('POTENTIAL_OVERLAP');
    expect(comp.reasonCode).toBe('CROSS_SCOPE_ADVISORY');
    expect(comp.explanation).toContain('conflicting answer key');
    expect(comp.isCrossScope).toBe(true);
  });

  // 23. Same answer with different cognitive tasks and accurate independent dimensions
  it('23. preserves accurate independent dimensions when same answer has distinct cognitive tasks', () => {
    const itemLocation: RawContentItemInput = {
      prompt: 'في أي مدينة يقع متحف اللوفر؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: '1', label: 'باريس' },
          { id: '2', label: 'مارسيليا' },
        ],
        correctOptionId: '1',
      },
      scopeKey: 'general-knowledge',
    };

    const itemCapital: RawContentItemInput = {
      prompt: 'ما هي عاصمة فرنسا؟',
      answerPayload: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: 'باريس' },
          { id: 'b', label: 'ليون' },
        ],
        correctOptionId: 'a',
      },
      scopeKey: 'general-knowledge',
    };

    const comp = compareContentIdentities(
      extractContentIdentity(itemLocation),
      extractContentIdentity(itemCapital),
    );

    expect(comp.result).toBe('DISTINCT');
    expect(comp.reasonCode).toBe('DISTINCT_FACTUAL_RELATIONSHIP');
    expect(comp.dimensions.semanticTarget).toBe('MATCH');
    expect(comp.dimensions.cognitiveTask).toBe('MISMATCH');
  });
});
