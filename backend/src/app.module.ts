import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { MediaStorageModule } from './common/uploads/media-storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { OtpModule } from './modules/auth/otp/otp.module';
import { UsersModule } from './modules/users/users.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { ContentSignalModule } from './modules/content-signal/content-signal.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { LiveGameSessionsModule } from './modules/live-game-sessions/live-game-sessions.module';
import { HealthController } from './health.controller';
import { ProxyDiagnosticsController } from './proxy-diagnostics.controller';
import { WorldContentModule } from './modules/world-content/world-content.module';
import { MediaRightsModule } from './modules/media-rights/media-rights.module';
import { ContentEngineModule } from './modules/content-engine/content-engine.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { MatchModule } from './modules/match/match.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    MediaStorageModule,
    UsersModule,
    AuthModule,
    OtpModule,
    ScoringModule,
    WorldContentModule,
    MediaRightsModule,
    ContentEngineModule,
    SubscriptionsModule,
    ContentSignalModule,
    EntitlementsModule,
    PaymentsModule,
    LiveGameSessionsModule,
    MatchModule,
  ],
  controllers: [HealthController, ProxyDiagnosticsController],
})
export class AppModule {}
