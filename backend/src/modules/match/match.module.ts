import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { LiveGameSessionsModule } from '../live-game-sessions/live-game-sessions.module';
import { ScoringModule } from '../scoring/scoring.module';
import { WorldContentModule } from '../world-content/world-content.module';
import { ChallengeLauncherRegistry } from './application/challenge-launcher.registry';
import { MATCH_CLOCK, SystemMatchClock } from './application/match-clock';
import { MatchReconciliationService } from './application/match-reconciliation.service';
import { MatchConvergenceSweeper } from './application/match-convergence.sweeper';
import { MatchChallengeReadinessService } from './application/match-challenge-readiness.service';
import { MatchContentPool } from './application/match-content-pool.service';
import { MatchContentSelector } from './application/match-content-selection.service';
import { MatchSnapshotComposer } from './application/match-snapshot.composer';
import { MatchTransitionNotifier } from './application/match-transition.notifier';
import { MatchWorldCatalog } from './application/match-world.catalog';
import { MatchUseCases } from './application/match.use-cases';
import { RakkibhaChallengeLauncher } from './application/rakkibha-challenge.launcher';
import { RyoChallengeLauncher } from './application/ryo-challenge.launcher';
import { RuntimeScoreEventCollector } from './application/runtime-score-event.collector';
import { Top5ChallengeLauncher } from './application/top5-challenge.launcher';
import { UnifiedMatchSetupValidator } from './application/unified-match-setup.validator';
import { BombChallengeLauncher } from './application/bomb-challenge.launcher';
import { ClosestChallengeLauncher } from './application/closest-challenge.launcher';
import { MarhalaChallengeLauncher } from './application/marhala-challenge.launcher';
import { MarhalaQuestionSourceProvider } from './application/marhala-question-source';
import { ComboChallengeLauncher } from './application/combo-challenge.launcher';
import {
  UnifiedMatchBoardPolicy,
  unifiedMatchBoardPolicy,
} from './domain/unified-match-board.policy';
import {
  UnifiedMatchSetupPolicy,
  unifiedMatchSetupPolicy,
} from './domain/unified-match-setup.policy';
import { MATCH_REPOSITORY } from './persistence/match.repository';
import {
  ContentExposureDocument,
  ContentExposureSchema,
} from './persistence/content-exposure.schema';
import { ContentExposureRepository } from './persistence/content-exposure.repository';
import { ContentExposureService } from './application/content-exposure.service';
import { MatchDocument, MatchSchema } from './persistence/match.schema';
import { MongooseMatchRepository } from './persistence/mongoose-match.repository';
import { MatchController } from './presentation/match.controller';
import { UnifiedMatchController } from './presentation/unified-match.controller';
import { MatchParticipantController } from './presentation/match-participant.controller';
import { OneClueChallengeLauncher } from './application/one-clue-challenge.launcher';
import { ChallengeTypeMatchUsageGuard } from './application/challenge-type-match-usage.guard';
import { ListMyMatches } from './application/list-my-matches.use-case';
import { MyMatchesController } from './presentation/my-matches.controller';
import { OddPieceChallengeLauncher } from './application/odd-piece-challenge.launcher';
import { LaqathaChallengeLauncher } from './application/laqatha-challenge.launcher';

/**
 * Match orchestration.
 *
 * This module sits *above* live-game-sessions and depends on it one way only: it
 * launches challenges through the mechanics' own use cases, learns that they
 * finished through the gameplay observer registry, and adds one projection to the
 * snapshot those sessions already publish. It introduces no gateway of its own,
 * no second runtime, and no scoring rules.
 */
@Module({
  imports: [
    AuthModule,
    ScoringModule,
    WorldContentModule,
    LiveGameSessionsModule,
    MongooseModule.forFeature([
      { name: MatchDocument.name, schema: MatchSchema },
      {
        name: ContentExposureDocument.name,
        schema: ContentExposureSchema,
      },
    ]),
  ],
  controllers: [
    MatchController,
    UnifiedMatchController,
    MatchParticipantController,
    MyMatchesController,
  ],
  providers: [
    SystemMatchClock,
    { provide: MATCH_CLOCK, useExisting: SystemMatchClock },
    MongooseMatchRepository,
    { provide: MATCH_REPOSITORY, useExisting: MongooseMatchRepository },
    ChallengeLauncherRegistry,
    ContentExposureRepository,
    ContentExposureService,
    RuntimeScoreEventCollector,
    MatchTransitionNotifier,
    MatchContentPool,
    MatchContentSelector,
    MatchChallengeReadinessService,
    MatchWorldCatalog,
    // The aggregate is not a provider, so it holds these same instances directly:
    // binding them by value keeps one policy rather than two that could drift.
    { provide: UnifiedMatchSetupPolicy, useValue: unifiedMatchSetupPolicy },
    { provide: UnifiedMatchBoardPolicy, useValue: unifiedMatchBoardPolicy },
    UnifiedMatchSetupValidator,
    MatchUseCases,
    RyoChallengeLauncher,
    Top5ChallengeLauncher,
    RakkibhaChallengeLauncher,
    BombChallengeLauncher,
    ClosestChallengeLauncher,
    ComboChallengeLauncher,
    MarhalaChallengeLauncher,
    MarhalaQuestionSourceProvider,
    OneClueChallengeLauncher,
    OddPieceChallengeLauncher,
    LaqathaChallengeLauncher,
    MatchReconciliationService,
    MatchConvergenceSweeper,
    MatchSnapshotComposer,
    ChallengeTypeMatchUsageGuard,
    ListMyMatches,
  ],
  exports: [MatchUseCases, ChallengeLauncherRegistry],
})
export class MatchModule {}
