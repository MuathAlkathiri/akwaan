import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  DISTRIBUTED_INFORMATION_SLUG,
  ONE_CLUE_SLUG,
  TOP5_SLUG,
  COMBO_SLUG,
  BOMB_SLUG,
  MARHALA_SLUG,
} from './world-content.constants';

/**
 * Runtime-owned ChallengeType identity. Display copy, artwork, activation and
 * World assignment remain admin-owned; these fields must match executable code.
 */
export interface ProductionMechanicDefinition {
  slug: string;
  runtimeKey: string;
  family: ChallengeFamily;
  itemStructure: ChallengeItemStructure;
  answerMode: ChallengeAnswerMode;
  matchScoringRuleId: typeof SCORING_RULE_IDS.CHALLENGE_WIN;
  seed: {
    name: string;
    description: string;
    defaultPresentation: {
      inputType: string;
      timerSeconds: number | null;
      soundPack: null;
      revealStyle: null;
    };
  };
}

const definition = (
  value: Omit<
    ProductionMechanicDefinition,
    'runtimeKey' | 'matchScoringRuleId'
  >,
): ProductionMechanicDefinition => ({
  ...value,
  runtimeKey: value.slug,
  matchScoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
});

export const PRODUCTION_MECHANICS: readonly ProductionMechanicDefinition[] = [
  definition({
    slug: 'read-your-opponent',
    family: ChallengeFamily.RYO,
    itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
    answerMode: ChallengeAnswerMode.RYO,
    seed: {
      name: 'اقرأ خصمك',
      description: 'إجابة عمياء مع قرار ثقة أو سرقة من الفريق المنافس.',
      defaultPresentation: {
        inputType: 'phone-choice',
        timerSeconds: 25,
        soundPack: null,
        revealStyle: null,
      },
    },
  }),
  definition({
    // "القنبلة" — a timed run of 10–15 pictures shared by both teams. One
    // continuous unit occupying a single board slot, like Top 5, rather than a
    // discrete triple: its internal item count is the mechanic's business.
    slug: BOMB_SLUG,
    // Shared Core, not a Signature (§16.1). The family axis is the *answer
    // system*, not shared-vs-exclusive: COOP is the family of automatically
    // resolved team mechanics, which is exactly what "مين اقرب" already is and
    // what Bomb is. Signature would claim an exclusivity Bomb must not have.
    family: ChallengeFamily.COOP,
    itemStructure: ChallengeItemStructure.CONTINUOUS,
    answerMode: ChallengeAnswerMode.MATCH,
    seed: {
      name: 'القنبلة',
      description:
        'سباق على الوقت: كل إجابة صحيحة تنقل القنبلة إلى الفريق الآخر.',
      defaultPresentation: {
        // Null, not zero: Bomb has no per-item timer at all — the clock it
        // runs on is the team clock the live session already owns.
        inputType: 'phone-text',
        timerSeconds: null,
        soundPack: null,
        revealStyle: null,
      },
    },
  }),
  definition({
    slug: 'closest',
    family: ChallengeFamily.COOP,
    itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
    answerMode: ChallengeAnswerMode.CLOSEST,
    seed: {
      name: 'مين أقرب',
      description: 'يفوز الفريق صاحب التقدير الأقرب للإجابة الصحيحة.',
      defaultPresentation: {
        inputType: 'phone-number',
        timerSeconds: 45,
        soundPack: null,
        revealStyle: null,
      },
    },
  }),
  definition({
    slug: TOP5_SLUG,
    family: ChallengeFamily.SIGNATURE,
    itemStructure: ChallengeItemStructure.CONTINUOUS,
    answerMode: ChallengeAnswerMode.TOP_5,
    seed: {
      name: 'أفضل 5',
      description: 'اختيار وامتلاك عناصر القائمة الحقيقية من بين الفخاخ.',
      defaultPresentation: {
        inputType: 'shared-choice',
        timerSeconds: 15,
        soundPack: null,
        revealStyle: null,
      },
    },
  }),
  definition({
    slug: DISTRIBUTED_INFORMATION_SLUG,
    family: ChallengeFamily.COOP,
    itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
    answerMode: ChallengeAnswerMode.DISTRIBUTED,
    seed: {
      name: 'ركّبها',
      description: 'معلومات موزعة بين أعضاء الفريق في سباق لحل ثلاثة ألغاز.',
      defaultPresentation: {
        inputType: 'phone-text',
        timerSeconds: 45,
        soundPack: null,
        revealStyle: null,
      },
    },
  }),
  definition({
    // "الكومبو" — the Anime Signature. Two Runs of four questions of rising
    // stage, one Run per team. One continuous unit occupying a single board
    // slot, like Bomb and Top 5: its internal question count is the mechanic's
    // business, and its stage progression lives on each item's
    // `mechanicPayload.comboStage`.
    slug: COMBO_SLUG,
    family: ChallengeFamily.SIGNATURE,
    itemStructure: ChallengeItemStructure.CONTINUOUS,
    answerMode: ChallengeAnswerMode.MATCH,
    seed: {
      name: 'الكومبو',
      description:
        'ثبت النقاط أو كمل الكومبو وخاطر بكل الرصيد، وخصمك يقدر يكسره عليك.',
      defaultPresentation: {
        inputType: 'phone-text',
        // Every question, every stage. The clock is not the difficulty lever.
        timerSeconds: 30,
        soundPack: null,
        revealStyle: null,
      },
    },
  }),
  definition({
    slug: ONE_CLUE_SLUG,
    family: ChallengeFamily.COOP,
    itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
    answerMode: ChallengeAnswerMode.ONE_CLUE,
    seed: {
      name: 'بدليل واحد',
      description: 'خمسة أدلة متدرجة، وإجابة واحدة مقفلة لكل فريق.',
      defaultPresentation: {
        inputType: 'phone-text',
        timerSeconds: 7,
        soundPack: null,
        revealStyle: null,
      },
    },
  }),
  definition({
    // "المرحلة" — the Video Games Signature (§17). Continuous because a race runs
    // for however many questions it takes: its length is the mechanic's business,
    // not a board item budget, and it draws every one of them on demand.
    slug: MARHALA_SLUG,
    family: ChallengeFamily.SIGNATURE,
    itemStructure: ChallengeItemStructure.CONTINUOUS,
    answerMode: ChallengeAnswerMode.MATCH,
    seed: {
      name: 'المرحلة',
      description:
        'سباق على لوحة المرحلة: اختر مستوى الخطر، وأجب، وتحرّك — والقفزات والفخاخ تقرر الباقي.',
      defaultPresentation: {
        inputType: 'phone-text',
        // One clock for every difficulty. The risk a team elects is the movement
        // range, never the time, so the timer must not become a second lever.
        timerSeconds: 30,
        soundPack: null,
        revealStyle: null,
      },
    },
  }),
];

export function productionMechanicDefinition(
  slug: string,
): ProductionMechanicDefinition | undefined {
  return PRODUCTION_MECHANICS.find((entry) => entry.slug === slug);
}

export function productionMechanicSystemFields(
  entry: ProductionMechanicDefinition,
): Record<string, string> {
  return {
    slug: entry.slug,
    family: entry.family,
    itemStructure: entry.itemStructure,
    answerMode: entry.answerMode,
    scoringRuleId: entry.matchScoringRuleId,
  };
}
