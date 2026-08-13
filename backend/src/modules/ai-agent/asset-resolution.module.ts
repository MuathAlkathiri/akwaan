import { Module } from '@nestjs/common';
import { AssetService } from './application/asset.service';
import { ImageDownloadService } from './infrastructure/assets/image-download.service';
import { WikimediaImageProvider } from './infrastructure/assets/wikimedia-image.provider';
import { YouTubeAssetProvider } from './infrastructure/assets/youtube-asset.provider';
import { JikanAnimeImageProvider } from './infrastructure/assets/jikan-anime-image.provider';

@Module({
  providers: [
    AssetService,
    YouTubeAssetProvider,
    JikanAnimeImageProvider,
    WikimediaImageProvider,
    ImageDownloadService,
  ],
  exports: [AssetService],
})
export class AssetResolutionModule {}
