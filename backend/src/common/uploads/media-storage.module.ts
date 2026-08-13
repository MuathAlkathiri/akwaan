import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MEDIA_OBJECT_STORAGE,
  createMediaObjectStorage,
} from './media-object-storage';

/**
 * Global because the storage services live in several feature modules and the
 * mirror has no per-module state — one client, one bucket, one decision about
 * whether mirroring is on at all.
 */
@Global()
@Module({
  providers: [
    {
      provide: MEDIA_OBJECT_STORAGE,
      useFactory: (config: ConfigService) => createMediaObjectStorage(config),
      inject: [ConfigService],
    },
  ],
  exports: [MEDIA_OBJECT_STORAGE],
})
export class MediaStorageModule {}
