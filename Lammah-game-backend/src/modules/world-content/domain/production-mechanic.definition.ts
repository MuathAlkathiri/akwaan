import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  DISTRIBUTED_INFORMATION_SLUG,
  ONE_CLUE_SLUG,
  TOP5_SLUG,
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
      timerSeconds: number;
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
