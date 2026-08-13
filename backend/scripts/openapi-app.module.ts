import { InjectionToken, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminAiGeneratorController } from '../src/modules/ai-agent/admin-ai-generator.controller';
import { AiAgentController } from '../src/modules/ai-agent/ai-agent.controller';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { CatalogsController } from '../src/modules/catalogs/catalogs.controller';
import { CatalogsService } from '../src/modules/catalogs/catalogs.service';
import { CategoriesController } from '../src/modules/categories/categories.controller';
import { CategoriesService } from '../src/modules/categories/categories.service';
import { GamesController } from '../src/modules/games/games.controller';
import { CreateGameService } from '../src/modules/games/application/create-game.service';
import { GameProgressService } from '../src/modules/games/application/game-progress.service';
import { GameScoringService } from '../src/modules/games/application/game-scoring.service';
import { QueryGameService } from '../src/modules/games/application/query-game.service';
import {
  AdminMusicTracksController,
  MusicQuestionsController,
} from '../src/modules/music/music.controller';
import { MusicService } from '../src/modules/music/music.service';
import {
  AdminQuestionsController,
  QuestionsController,
} from '../src/modules/questions/questions.controller';
import { MutateQuestionService } from '../src/modules/questions/application/mutate-question.service';
import { QueryQuestionsService } from '../src/modules/questions/application/query-questions.service';
import { QuestionAssetRetryService } from '../src/modules/questions/application/question-asset-retry.service';
import { ReviewQuestionService } from '../src/modules/questions/application/review-question.service';
import { SubscriptionsController } from '../src/modules/subscriptions/subscriptions.controller';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';
import { WigoloClient } from '../src/modules/ai-agent/infrastructure/wigolo/wigolo-client';
import { QuestionDuplicateDetectionService } from '../src/modules/questions/application/question-duplicate-detection.service';
import { QuestionAudioReviewService } from '../src/modules/questions/application/question-audio-review.service';
import { RankedListRoundService } from '../src/modules/games/application/ranked-list-round.service';
import { AcceptedAnswerExpansionService } from '../src/modules/questions/application/accepted-answer-expansion.service';
import { GameQuestionFlowService } from '../src/modules/games/application/game-question-flow.service';
import { AiAgentService } from '../src/modules/ai-agent/ai-agent.service';

const documentationOnlyProvider = (provide: InjectionToken) => ({
  provide,
  useValue: Object.freeze({}),
});

/**
 * Controller-only application graph used exclusively for Swagger reflection.
 * It deliberately contains no database, storage, media, seed, or provider
 * modules, while retaining the exact runtime controllers and DTO metadata.
 */
@Module({
  controllers: [
    UsersController,
    AuthController,
    CatalogsController,
    CategoriesController,
    QuestionsController,
    AdminQuestionsController,
    AiAgentController,
    AdminAiGeneratorController,
    AdminMusicTracksController,
    MusicQuestionsController,
    GamesController,
    SubscriptionsController,
  ],
  providers: [
    AuthService,
    UsersService,
    CatalogsService,
    CategoriesService,
    QueryQuestionsService,
    MutateQuestionService,
    ReviewQuestionService,
    QuestionAssetRetryService,
    CreateGameService,
    QueryGameService,
    GameProgressService,
    GameScoringService,
    RankedListRoundService,
    GameQuestionFlowService,
    AcceptedAnswerExpansionService,
    MusicService,
    WigoloClient,
    ConfigService,
    QuestionDuplicateDetectionService,
    QuestionAudioReviewService,
    AiAgentService,
    SubscriptionsService,
  ].map(documentationOnlyProvider),
})
export class OpenApiAppModule {}
