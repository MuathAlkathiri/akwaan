import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocalImageStorageService } from '../../common/uploads/local-image-storage.service';
import { ScoringModule } from '../scoring/scoring.module';
import { ChallengeTypeService } from './application/challenge-type.service';
import { ContentItemService } from './application/content-item.service';
import { ScopeService } from './application/scope.service';
import { WorldChallengeConfigurationService } from './application/world-challenge-configuration.service';
import { WorldContentAssetMutator } from './application/world-content-asset.mutator';
import { WorldContentClassificationService } from './application/world-content-classification.service';
import { WorldContentReferenceRegistry } from './application/world-content-reference.registry';
import { WorldReadinessService } from './application/world-readiness.service';
import { WorldService } from './application/world.service';
import { BoardDefinitionPolicy } from './domain/board-definition.policy';
import { ChallengePresentationPolicy } from './domain/challenge-presentation.policy';
import { ChallengeTypePolicy } from './domain/challenge-type.policy';
import { ContentItemCompatibilityPolicy } from './domain/content-item-compatibility.policy';
import { MatchWorldSelectionPolicy } from './domain/match-world-selection.policy';
import { ScopeCompatibilityPolicy } from './domain/scope-compatibility.policy';
import { WorldReadinessPolicy } from './domain/world-readiness.policy';
import { ChallengeTypeRepository } from './persistence/challenge-type.repository';
import { ContentItemRepository } from './persistence/content-item.repository';
import { ScopeRepository } from './persistence/scope.repository';
import { WorldChallengeConfigurationRepository } from './persistence/world-challenge-configuration.repository';
import { WorldRepository } from './persistence/world.repository';
import { ChallengeTypesController } from './presentation/challenge-types.controller';
import { ContentItemsController } from './presentation/content-items.controller';
import { ScopesController } from './presentation/scopes.controller';
import { WorldChallengeConfigurationsController } from './presentation/world-challenge-configurations.controller';
import { WorldsController } from './presentation/worlds.controller';
import {
  ChallengeType,
  ChallengeTypeSchema,
} from './schemas/challenge-type.schema';
import { ContentItem, ContentItemSchema } from './schemas/content-item.schema';
import { Scope, ScopeSchema } from './schemas/scope.schema';
import {
  WorldChallengeConfiguration,
  WorldChallengeConfigurationSchema,
} from './schemas/world-challenge-configuration.schema';
import { World, WorldSchema } from './schemas/world.schema';

/**
 * World -> Scope -> ChallengeType -> ContentItem.
 *
 * The new-system content domain. It depends on the central scoring module and on
 * nothing from the legacy `games`/`questions`/`categories` modules (roadmap 17).
 */
@Module({
  imports: [
    ScoringModule,
    MongooseModule.forFeature([
      { name: World.name, schema: WorldSchema },
      { name: Scope.name, schema: ScopeSchema },
      { name: ChallengeType.name, schema: ChallengeTypeSchema },
      {
        name: WorldChallengeConfiguration.name,
        schema: WorldChallengeConfigurationSchema,
      },
      { name: ContentItem.name, schema: ContentItemSchema },
    ]),
  ],
  controllers: [
    WorldsController,
    ScopesController,
    WorldChallengeConfigurationsController,
    ChallengeTypesController,
    ContentItemsController,
  ],
  providers: [
    // domain policies
    ChallengePresentationPolicy,
    ChallengeTypePolicy,
    BoardDefinitionPolicy,
    ScopeCompatibilityPolicy,
    ContentItemCompatibilityPolicy,
    WorldReadinessPolicy,
    MatchWorldSelectionPolicy,
    // persistence
    WorldRepository,
    ScopeRepository,
    ChallengeTypeRepository,
    WorldChallengeConfigurationRepository,
    ContentItemRepository,
    // application
    WorldService,
    ScopeService,
    ChallengeTypeService,
    WorldChallengeConfigurationService,
    ContentItemService,
    WorldReadinessService,
    WorldContentClassificationService,
    WorldContentReferenceRegistry,
    WorldContentAssetMutator,
    LocalImageStorageService,
  ],
  exports: [
    // The only surfaces other modules may consume.
    WorldContentClassificationService,
    WorldContentReferenceRegistry,
    MatchWorldSelectionPolicy,
    ContentItemCompatibilityPolicy,
    ContentItemRepository,
    ChallengeTypeRepository,
    WorldChallengeConfigurationRepository,
  ],
})
export class WorldContentModule {}
