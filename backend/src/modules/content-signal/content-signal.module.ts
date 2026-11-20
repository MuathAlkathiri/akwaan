import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ContentSignalDocument,
  ContentSignalSchema,
} from './persistence/content-signal.schema';
import { ContentSignalRepository } from './persistence/content-signal.repository';
import { ContentSignalService } from './application/content-signal.service';
import { ContentSignalController } from './presentation/content-signal.controller';
import { MatchModule } from '../match/match.module';
import { LiveGameSessionsModule } from '../live-game-sessions/live-game-sessions.module';

/**
 * What players thought of the questions they were shown.
 *
 * Depends on Match to know what is on screen and on live sessions to know
 * whose phone is asking; nothing depends on it. Capture is deliberately
 * separable from reporting — a signal missed on launch day is gone, while a
 * chart can be built from it in December.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContentSignalDocument.name, schema: ContentSignalSchema },
    ]),
    MatchModule,
    LiveGameSessionsModule,
  ],
  controllers: [ContentSignalController],
  providers: [ContentSignalRepository, ContentSignalService],
})
export class ContentSignalModule {}
