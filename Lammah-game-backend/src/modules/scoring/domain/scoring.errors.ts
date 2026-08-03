import { BadRequestException } from '@nestjs/common';

export class ScoringRuleNotRegisteredError extends BadRequestException {
  constructor(ruleId: string) {
    super({
      code: 'SCORING_RULE_NOT_REGISTERED',
      message: `Scoring rule "${ruleId}" is not registered`,
    });
  }
}

export class ScoringRuleNotImplementedError extends BadRequestException {
  constructor(ruleId: string) {
    super({
      code: 'SCORING_RULE_NOT_IMPLEMENTED',
      message: `Scoring rule "${ruleId}" has no bound calculator yet`,
    });
  }
}

export class ScoringRuleContractError extends BadRequestException {
  constructor(ruleId: string, detail: string) {
    super({
      code: 'SCORING_RULE_CONTRACT_VIOLATION',
      message: `Scoring rule "${ruleId}" produced an invalid result: ${detail}`,
    });
  }
}

export class ForeignScoreEventError extends BadRequestException {
  constructor() {
    super({
      code: 'FOREIGN_SCORE_EVENT',
      message:
        'Score events must be produced by the central scoring module; a mechanic cannot mutate scores directly',
    });
  }
}
