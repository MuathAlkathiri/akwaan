import { MatchDeletionParticipant } from './application/match-deletion.participant';
import { MatchCreationFence } from './application/match-creation.fence';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { LiveGameSessionsModule } from '../live-game-sessions/live-game-sessions.module';
import { ScoringModule } from '../scoring/scoring.module';
import { WorldContentModule } from '../world-content/world-content.module';
import { ChallengeLauncherRegistry } from './application/challenge-launcher.registry';
import { ChallengeLaunchabilityPublisher } from './application/challenge-launchability.publisher';
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
import { AnswerGuardCatalogReader } from './persistence/answer-guard-catalog.reader';
import {
  ContentItem,
  ContentItemSchema,
} from '../world-content/schemas/content-item.schema';
import { MovingXoChallengeLauncher } from './application/moving-xo-challenge.launcher';
import { MovingXoQuestionSourceProvider } from './application/moving-xo-question-source';
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
import { MatchPresentedContentLookup } from './application/match-presented-content.lookup';
import {
  ContentExposureDocument,
  ContentExposureSchema,
} from './persistence/content-exposure.schema';
import { ContentExposureRepository } from './persistence/content-exposure.repository';
import {
  WorldRemainingDocument,
  WorldRemainingSchema,
} from './persistence/world-remaining.schema';
import { WorldRemainingRepository } from './persistence/world-remaining.repository';
import { WorldRemainingService } from './application/world-remaining.service';
import { WorldRemainingController } from './presentation/world-remaining.controller';
import {
  ChallengeType,
  ChallengeTypeSchema,
} from '../world-content/schemas/challenge-type.schema';
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
import { EkshifniChallengeLauncher } from './application/ekshifni-challenge.launcher';
import { LaTahriqhaChallengeLauncher } from './application/la-tahriqha-challenge.launcher';
import { FirstNoteChallengeLauncher } from './application/first-note-challenge.launcher';
import { EntitlementsModule } from '../entitlements/entitlements.module';

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
    EntitlementsModule,
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
      // Read-only: the answer-guard catalog reader projects a World's READY
      // match answers. Writes stay with world-content's own repository.
      { name: ContentItem.name, schema: ContentItemSchema },
      // Read-only: the remaining-questions summary needs a challenge's slug to
      // decide whether an item has been seen in every challenge it can appear
      // in. Writes stay with world-content.
      { name: ChallengeType.name, schema: ChallengeTypeSchema },
      {
        name: WorldRemainingDocument.name,
        schema: WorldRemainingSchema,
      },
    ]),
  ],
  controllers: [
    WorldRemainingController,
    MatchController,
    UnifiedMatchController,
    MatchParticipantController,
    MyMatchesController,
  ],
  providers: [
    MatchDeletionParticipant,
    MatchCreationFence,
    FirstNoteChallengeLauncher,
    SystemMatchClock,
    { provide: MATCH_CLOCK, useExisting: SystemMatchClock },
    MongooseMatchRepository,
    { provide: MATCH_REPOSITORY, useExisting: MongooseMatchRepository },
    ChallengeLauncherRegistry,
    ChallengeLaunchabilityPublisher,
    ContentExposureRepository,
    ContentExposureService,
    WorldRemainingRepository,
    WorldRemainingService,
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
    MatchPresentedContentLookup,
    RyoChallengeLauncher,
    Top5ChallengeLauncher,
    RakkibhaChallengeLauncher,
    BombChallengeLauncher,
    ClosestChallengeLauncher,
    ComboChallengeLauncher,
    MarhalaChallengeLauncher,
    MarhalaQuestionSourceProvider,
    AnswerGuardCatalogReader,
    MovingXoChallengeLauncher,
    MovingXoQuestionSourceProvider,
    OneClueChallengeLauncher,
    OddPieceChallengeLauncher,
    LaqathaChallengeLauncher,
    EkshifniChallengeLauncher,
    LaTahriqhaChallengeLauncher,
    MatchReconciliationService,
    MatchConvergenceSweeper,
    MatchSnapshotComposer,
    ChallengeTypeMatchUsageGuard,
    ListMyMatches,
  ],
  exports: [
    MatchUseCases,
    ChallengeLauncherRegistry,
    MatchPresentedContentLookup,
  ],
})
export class MatchModule {}
