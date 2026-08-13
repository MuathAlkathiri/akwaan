import {
  musicSearchCandidates,
  normalizeMusicName,
} from '../contracts/music-asset-provider.interface';

describe('music asset planning utilities', () => {
  const plan = {
    assetType: 'musicPreview' as const,
    title: 'El Bakht',
    localizedTitle: 'البخت',
    artist: 'Wegz',
    localizedArtist: 'ويجز',
    purpose: 'gameplay' as const,
  };
  it('generates localized and Latin title/artist candidates', () => {
    expect(musicSearchCandidates(plan)).toEqual([
      'البخت ويجز',
      'El Bakht Wegz',
      'Wegz El Bakht',
    ]);
  });
  it('normalizes exact title and artist comparisons', () => {
    expect(normalizeMusicName('  El-Bakht! ')).toBe('el bakht');
    expect(normalizeMusicName('البخت')).toBe('البخت');
  });
});
