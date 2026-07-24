import { Injectable } from '@nestjs/common';
import {
  MusicAssetPlan,
  MusicAssetProvider,
  MusicPreviewAsset,
  MusicSearchResult,
  musicSearchCandidates,
  normalizeMusicName,
} from '../../contracts/music-asset-provider.interface';

type ItunesResult = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackViewUrl?: string;
  trackTimeMillis?: number;
};
@Injectable()
export class AppleMusicPreviewProvider implements MusicAssetProvider {
  readonly name = 'apple-music-preview';
  async searchTrack(plan: MusicAssetPlan): Promise<MusicSearchResult[]> {
    const collected = new Map<string, MusicSearchResult>();
    for (const candidate of musicSearchCandidates(plan)) {
      const url = new URL('https://itunes.apple.com/search');
      url.searchParams.set('term', candidate);
      url.searchParams.set('entity', 'song');
      url.searchParams.set('limit', '10');
      url.searchParams.set('country', 'SA');
      url.searchParams.set('lang', 'ar_sa');
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'LammahQuiz/1.0 official-preview-search' },
      });
      if (!response.ok) continue;
      const results =
        ((await response.json()) as { results?: ItunesResult[] }).results ?? [];
      for (const result of results) {
        const titleExact =
          normalizeMusicName(result.trackName) ===
            normalizeMusicName(plan.title) ||
          (plan.localizedTitle
            ? normalizeMusicName(result.trackName) ===
              normalizeMusicName(plan.localizedTitle)
            : false);
        const artistExact =
          normalizeMusicName(result.artistName) ===
            normalizeMusicName(plan.artist) ||
          (plan.localizedArtist
            ? normalizeMusicName(result.artistName) ===
              normalizeMusicName(plan.localizedArtist)
            : false);
        collected.set(String(result.trackId), {
          providerTrackId: String(result.trackId),
          title: result.trackName,
          artist: result.artistName,
          album: result.collectionName,
          artworkUrl: result.artworkUrl100?.replace('100x100', '600x600'),
          previewUrl: result.previewUrl,
          sourceUrl: result.trackViewUrl,
          confidence:
            titleExact && artistExact
              ? 1
              : titleExact || artistExact
                ? 0.7
                : 0.3,
        });
      }
      if (
        [...collected.values()].some(
          (result) => result.confidence === 1 && result.previewUrl,
        )
      )
        break;
    }
    return [...collected.values()].sort(
      (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
    );
  }
  async resolvePreview(
    result: MusicSearchResult,
  ): Promise<MusicPreviewAsset | null> {
    if (!result.previewUrl) return null;
    return {
      type: 'audio',
      url: result.previewUrl,
      source: this.name,
      sourceUrl: result.sourceUrl,
      title: result.title,
      artist: result.artist,
      isrc: result.isrc,
      metadata: {
        providerTrackId: result.providerTrackId,
        album: result.album,
        artworkUrl: result.artworkUrl,
        confidence: result.confidence,
      },
    };
  }
}
