import { ScoreEventDraft } from './score-event';

/**
 * A scoring rule is declared (configuration, available now) separately from its
 * calculator (mechanic behaviour, bound as each mechanic ships). Challenge Types
 * reference a declaration id, so content and board configuration can be
 * validated in full before any gameplay code exists.
 */

export const SCORING_RULE_IDS = {
  /** Roadmap 6.1 payoff matrix. Opts out of the perfect-clear bonus. */
  RYO_PAYOFF_MATRIX: 'ryo.payoff-matrix',
  /** +1 per cleared Co-op item. */
  COOP_ITEM_SUCCESS: 'coop.item-success',
  /** +1 per matched/consensus Relational item. */
  RELATIONAL_ITEM_SUCCESS: 'relational.item-success',
  /**
   * Placeholder declaration for Signature mechanics. Roadmap 4.1 requires each
   * Signature mechanic to declare its own scoring, and no mechanic is assigned
   * yet (roadmap 4), so a Signature challenge references this until its own rule
   * is registered.
   */
  SIGNATURE_DECLARED_BY_MECHANIC: 'signature.declared-by-mechanic',
  /** Cross-family +1 for clearing every item of a challenge (roadmap 8). */
  CHALLENGE_PERFECT_CLEAR_BONUS: 'challenge.perfect-clear-bonus',
  TOP10_POISON_DECK_RESULT: 'top10.poison-deck.result',
  /** +1 to the team that finishes the three-segment race first. */
  DISTRIBUTED_INFORMATION_RACE_RESULT: 'distributed-information.race-result',
} as const;

export type ScoringRuleId =
  (typeof SCORING_RULE_IDS)[keyof typeof SCORING_RULE_IDS];

export interface ScoringRuleDeclaration {
  readonly id: ScoringRuleId;
  readonly description: string;
  /** True when a challenge scored by this rule also earns the perfect clear. */
  readonly perfectClearBonusEligible: boolean;
  /** True when the rule can legitimately emit a negative delta. */
  readonly allowsNegativeDelta: boolean;
  /**
   * True when the rule cannot be calculated until a concrete mechanic binds its
   * behaviour. Such rules are valid references but are not yet playable.
   */
  readonly requiresMechanicBinding: boolean;
}

export interface ScoringContext {
  matchId: string;
  challengeSessionId: string;
  occurredAt: Date;
}

/**
 * The behaviour half of a rule. Implemented per mechanic as mechanics ship; the
 * engine refuses to score a declaration with no bound calculator.
 */
export interface ScoringRuleCalculator<TInput = unknown> {
  readonly ruleId: ScoringRuleId;
  calculate(input: TInput, context: ScoringContext): ScoreEventDraft[];
}

/**
 * Registered declarations. This list is configuration transcribed from the
 * roadmap's scoring table, not gameplay behaviour.
 */
export const SCORING_RULE_DECLARATIONS: readonly ScoringRuleDeclaration[] = [
  {
    id: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
    description:
      'Read Your Opponent payoff matrix: trust/steal resolution, including the -1 on a failed steal.',
    perfectClearBonusEligible: false,
    allowsNegativeDelta: true,
    requiresMechanicBinding: true,
  },
  {
    id: SCORING_RULE_IDS.COOP_ITEM_SUCCESS,
    description: 'One point per successfully cleared Co-op item.',
    perfectClearBonusEligible: true,
    allowsNegativeDelta: false,
    requiresMechanicBinding: true,
  },
  {
    id: SCORING_RULE_IDS.RELATIONAL_ITEM_SUCCESS,
    description:
      'One point per Relational item that reaches a match or team consensus.',
    perfectClearBonusEligible: true,
    allowsNegativeDelta: false,
    requiresMechanicBinding: true,
  },
  {
    id: SCORING_RULE_IDS.SIGNATURE_DECLARED_BY_MECHANIC,
    description:
      'Signature mechanic scoring, declared by the mechanic once one is assigned to the World.',
    perfectClearBonusEligible: true,
    allowsNegativeDelta: true,
    requiresMechanicBinding: true,
  },
  {
    id: SCORING_RULE_IDS.CHALLENGE_PERFECT_CLEAR_BONUS,
    description:
      'One bonus point for clearing every item of a challenge, except for RYO challenges.',
    perfectClearBonusEligible: false,
    allowsNegativeDelta: false,
    requiresMechanicBinding: false,
  },
  {
    id: SCORING_RULE_IDS.TOP10_POISON_DECK_RESULT,
    description:
      'Awards one Match point to the poison-deck winner; ties award none.',
    perfectClearBonusEligible: false,
    allowsNegativeDelta: false,
    requiresMechanicBinding: false,
  },
  {
    id: SCORING_RULE_IDS.DISTRIBUTED_INFORMATION_RACE_RESULT,
    description:
      'Awards one Match point to the team that solves all three distributed-information puzzles first; a true tie awards none. Wrong answers cost only the five-second lock.',
    perfectClearBonusEligible: false,
    allowsNegativeDelta: false,
    requiresMechanicBinding: false,
  },
];
