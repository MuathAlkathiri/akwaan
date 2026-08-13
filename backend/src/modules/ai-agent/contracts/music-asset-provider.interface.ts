export type MusicAssetPlan = {
  assetType: 'musicPreview';
  title: string;
  localizedTitle?: string;
  artist: string;
  localizedArtist?: string;
  language?: string;
  region?: string;
  isrc?: string;
  searchCandidates?: string[];
  purpose: 'gameplay';
};
export type MusicSearchResult = {
  providerTrackId: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  previewUrl?: string;
  isrc?: string;
  confidence?: number;
  sourceUrl?: string;
};
export type MusicPreviewAsset = {
  type: 'audio';
  url: string;
  source: string;
  sourceUrl?: string;
  title: string;
  artist: string;
  duration?: number;
  isrc?: string;
  metadata?: Record<string, unknown>;
};
export interface MusicAssetProvider {
  readonly name: string;
  searchTrack(plan: MusicAssetPlan): Promise<MusicSearchResult[]>;
  resolvePreview(result: MusicSearchResult): Promise<MusicPreviewAsset | null>;
}

export function musicSearchCandidates(plan: MusicAssetPlan) {
  return [
    ...new Set(
      [
        plan.localizedTitle && plan.localizedArtist
          ? `${plan.localizedTitle} ${plan.localizedArtist}`
          : undefined,
        `${plan.title} ${plan.artist}`,
        `${plan.artist} ${plan.title}`,
        ...(plan.searchCandidates ?? []),
      ].filter((value): value is string => Boolean(value?.trim())),
    ),
  ];
}

export function normalizeMusicName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
