import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriesModule } from '../categories/categories.module';
import { QuestionsModule } from '../questions/questions.module';
import { MediaInfrastructureModule } from '../../infrastructure/media/media-infrastructure.module';
import { LocalAudioStorageService } from '../../common/uploads/local-audio-storage.service';
import {
  AdminMusicTracksController,
  MusicQuestionsController,
} from './music.controller';
import { MusicMetadataAgentService } from './music-metadata-agent.service';
import { MusicService } from './music.service';
import { MusicTrack, MusicTrackSchema } from './schemas/music-track.schema';
import { MusicTrackRepository } from './persistence/music-track.repository';
import { MusicTrackPolicy } from './policies/music-track.policy';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MusicTrack.name, schema: MusicTrackSchema },
    ]),
    CategoriesModule,
    QuestionsModule,
    MediaInfrastructureModule,
  ],
  controllers: [AdminMusicTracksController, MusicQuestionsController],
  providers: [
    MusicService,
    MusicMetadataAgentService,
    MusicTrackRepository,
    MusicTrackPolicy,
    LocalAudioStorageService,
  ],
  exports: [MusicService, MusicMetadataAgentService],
})
export class MusicModule {}
