import { Injectable } from '@nestjs/common';
import {
  SCORING_RULE_DECLARATIONS,
  ScoringRuleCalculator,
  ScoringRuleDeclaration,
} from '../domain/scoring-rule';
import {
  ScoringRuleNotImplementedError,
  ScoringRuleNotRegisteredError,
} from '../domain/scoring.errors';

/**
 * The one registry every Challenge Type resolves its `scoringRuleId` against
 * (roadmap 0.3). Declarations are fixed configuration; calculators are bound by
 * the scoring module as mechanics ship.
 */
@Injectable()
export class ScoringRuleRegistry {
  private readonly declarations = new Map<string, ScoringRuleDeclaration>(
    SCORING_RULE_DECLARATIONS.map((rule) => [rule.id, rule]),
  );
  private readonly calculators = new Map<string, ScoringRuleCalculator>();

  isRegistered(ruleId: string): boolean {
    return this.declarations.has(ruleId);
  }

  /**
   * Whether a calculator is actually bound for this rule in the runtime.
   *
   * The authoritative "is this mechanic's scoring shipped" signal: a declaration
   * with `requiresMechanicBinding` is only truly awaiting a mechanic while no
   * calculator has been bound. Readers derive from this rather than the static
   * declaration flag so Admin never diverges from real runtime capability.
   */
  hasCalculator(ruleId: string): boolean {
    return this.calculators.has(ruleId);
  }

  declaration(ruleId: string): ScoringRuleDeclaration {
    const declaration = this.declarations.get(ruleId);
    if (!declaration) throw new ScoringRuleNotRegisteredError(ruleId);
    return declaration;
  }

  list(): ScoringRuleDeclaration[] {
    return [...this.declarations.values()];
  }

  bind(calculator: ScoringRuleCalculator): void {
    this.declaration(calculator.ruleId);
    this.calculators.set(calculator.ruleId, calculator);
  }

  calculator<TInput>(ruleId: string): ScoringRuleCalculator<TInput> {
    this.declaration(ruleId);
    const calculator = this.calculators.get(ruleId);
    if (!calculator) throw new ScoringRuleNotImplementedError(ruleId);
    return calculator as ScoringRuleCalculator<TInput>;
  }
}
