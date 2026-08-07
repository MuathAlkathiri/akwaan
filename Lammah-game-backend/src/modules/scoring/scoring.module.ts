import { Module, OnModuleInit } from '@nestjs/common';
import { ScoringRuleRegistry } from './application/scoring-rule.registry';
import { ScoringService } from './application/scoring.service';
import { PerfectClearBonusRule } from './application/perfect-clear-bonus.rule';
import { RyoPayoffMatrixRule } from './application/ryo-payoff-matrix.rule';
import { Top5ResultRule } from './application/top5-result.rule';
import { DistributedInformationRaceRule } from './application/distributed-information-race.rule';

/**
 * The single scoring module for the new system (roadmap 0.3). The legacy
 * `games` ScoringPolicy stays behind the legacy boundary and is not reachable
 * from here.
 */
@Module({
  providers: [
    ScoringRuleRegistry,
    ScoringService,
    PerfectClearBonusRule,
    RyoPayoffMatrixRule,
    Top5ResultRule,
    DistributedInformationRaceRule,
  ],
  exports: [ScoringRuleRegistry, ScoringService],
})
export class ScoringModule implements OnModuleInit {
  constructor(
    private readonly registry: ScoringRuleRegistry,
    private readonly perfectClearBonus: PerfectClearBonusRule,
    private readonly ryoPayoffMatrix: RyoPayoffMatrixRule,
    private readonly top5Result: Top5ResultRule,
    private readonly distributedRace: DistributedInformationRaceRule,
  ) {}

  onModuleInit(): void {
    this.registry.bind(this.perfectClearBonus);
    this.registry.bind(this.ryoPayoffMatrix);
    this.registry.bind(this.top5Result);
    this.registry.bind(this.distributedRace);
  }
}
