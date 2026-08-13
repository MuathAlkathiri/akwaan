import {
  AssetRequest,
  GameMode,
  MediaIntent,
  MediaSourceType,
} from '../contracts/asset-provider.interface';

const MUSIC_MODES = new Set<GameMode>([
  'identifySong',
  'identifySinger',
  'identifyMusicIntro',
]);

export function normalizeAssetRequestIntent(
  request: AssetRequest,
  gameMode: GameMode,
): AssetRequest {
  if (request.type !== 'audio') return request;
  const mediaIntent: MediaIntent =
    request.mediaIntent ??
    (MUSIC_MODES.has(gameMode)
      ? 'music'
      : gameMode === 'identifyVoice'
        ? 'voice'
        : 'speech');
  const sourceType: MediaSourceType =
    request.sourceType ??
    (mediaIntent === 'music'
      ? 'song'
      : mediaIntent === 'voice'
        ? inferVoiceSource(request.categoryType)
        : 'speech');
  return { ...request, gameMode, mediaIntent, sourceType };
}

function inferVoiceSource(categoryType?: string): MediaSourceType {
  switch (categoryType?.trim().toLowerCase()) {
    case 'anime':
    case 'manga':
      return 'anime-voice';
    case 'movie':
      return 'movie-quote';
    case 'series':
      return 'tv-dialogue';
    default:
      return 'speech';
  }
}
