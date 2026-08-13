export type QuestionAssetType =
  'text' | 'image' | 'audio' | 'video' | 'quote' | 'emoji' | 'timeline';

export type GameMode =
  | 'trivia'
  | 'identifyCharacter'
  | 'identifyVoice'
  | 'identifyImage'
  | 'completeQuote'
  | 'timeline'
  | 'emojiPuzzle'
  | 'identifySong'
  | 'identifySinger'
  | 'identifyMusicIntro';

export type AssetStatus = 'NOT_REQUIRED' | 'PENDING' | 'READY' | 'FAILED';
export type MediaIntent = 'music' | 'voice' | 'dialogue' | 'speech';
export type MediaSourceType =
  'song' | 'anime-voice' | 'movie-quote' | 'tv-dialogue' | 'speech';

export type AssetRequest = {
  type: QuestionAssetType;
  assetType?: QuestionAssetType;
  provider?: string;
  query?: string;
  entity?: string;
  canonicalEntity?: string;
  searchEntity?: string;
  searchContext?: string;
  coverTopic?: string;
  aliases?: string[];
  franchise?: string;
  language?: string;
  originalName?: string;
  localizedName?: string;
  englishTitle?: string;
  arabicTitle?: string;
  context?: string;
  entityType?:
    | 'character'
    | 'technique'
    | 'object'
    | 'creature'
    | 'organization'
    | 'clan'
    | 'ability'
    | 'weapon'
    | 'vehicle'
    | 'song'
    | 'artist'
    | 'actor'
    | 'historical-person'
    | 'football-player'
    | 'football-club'
    | 'country'
    | 'city'
    | 'landmark'
    | 'generic-topic'
    | 'unknown'
    | 'location'
    | 'person'
    | 'franchise'
    | 'logo'
    | 'event'
    | 'game'
    | string;
  visualHint?: string;
  categoryType?:
    'anime' | 'manga' | 'movie' | 'series' | 'history' | 'games' | string;
  purpose?: 'gameplay' | 'decorative';
  duration?: number;
  speaker?: string;
  gameMode?: GameMode;
  mediaIntent?: MediaIntent;
  sourceType?: MediaSourceType;
  title?: string;
  artist?: string;
  artistAliases?: string[];
  [key: string]: unknown;
};

export type AssetMetadata = {
  localPath: string;
  url: string;
  duration?: number;
  source: string;
  sourceUrl?: string;
  searchQuery?: string;
  provider: string;
  type: QuestionAssetType;
  metadata?: Record<string, unknown>;
};

export type AssetPipelineResult =
  | {
      assetStatus: 'READY';
      asset: AssetMetadata;
    }
  | {
      assetStatus: 'FAILED';
      assetFailureReason: string;
      assetFailureStep?: string;
      assetFailureDiagnostics?:
        Record<string, unknown> | Record<string, unknown>[];
    }
  | {
      assetStatus: 'NOT_REQUIRED';
    };

export interface AssetProvider {
  supports(assetRequest: AssetRequest): boolean;
  support?(assetRequest: AssetRequest): {
    supported: boolean;
    reason?: string;
  };
  process(assetRequest: AssetRequest): Promise<AssetMetadata>;
}
