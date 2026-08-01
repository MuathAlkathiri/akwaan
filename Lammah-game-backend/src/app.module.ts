import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';
import { GamesModule } from './modules/games/games.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { LiveGameSessionsModule } from './modules/live-game-sessions/live-game-sessions.module';
import { QuestionHistoryModule } from './modules/question-history/question-history.module';
import { MusicModule } from './modules/music/music.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    CatalogsModule,
    CategoriesModule,
    QuestionsModule,
    QuestionHistoryModule,
    AiAgentModule,
    MusicModule,
    GamesModule,
    SubscriptionsModule,
    LiveGameSessionsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
