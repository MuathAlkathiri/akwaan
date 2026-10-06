import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaRightsService } from './application/media-rights.service';
import { MediaRightsRepository } from './persistence/media-rights.repository';
import { AdminMediaRightsController } from './presentation/media-rights.controller';
import {
  MediaRightsDocument,
  MediaRightsSchema,
} from './schemas/media-rights.schema';

/**
 * The media-rights registry.
 *
 * Standalone on purpose. It is keyed only by `assetUrl` and knows nothing about
 * Worlds, Scopes or mechanics, so it imports no content module — which also
 * keeps it off the import allowlist `world-content.architecture.spec.ts` pins.
 *
 * It is generic: any managed asset may carry a rights record. Nothing enforces
 * those records — a 2026-10-04 Product decision removed rights clearance as a
 * readiness gate, so the registry documents what is known and decides nothing.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MediaRightsDocument.name, schema: MediaRightsSchema },
    ]),
  ],
  controllers: [AdminMediaRightsController],
  providers: [MediaRightsRepository, MediaRightsService],
  exports: [MediaRightsService],
})
export class MediaRightsModule {}
