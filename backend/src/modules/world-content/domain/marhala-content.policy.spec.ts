import {
  isMarhalaDifficulty,
  marhalaDifficultyOf,
  normalizeMarhalaMedia,
} from './marhala-content.policy';
import { ContentMediaType } from './world-content.constants';

describe('marhala-content.policy', () => {
  describe('isMarhalaDifficulty', () => {
    it('accepts valid difficulties', () => {
      expect(isMarhalaDifficulty('easy')).toBe(true);
      expect(isMarhalaDifficulty('medium')).toBe(true);
      expect(isMarhalaDifficulty('hard')).toBe(true);
    });

    it('rejects invalid or unknown difficulties', () => {
      expect(isMarhalaDifficulty('stage_1')).toBe(false);
      expect(isMarhalaDifficulty('extreme')).toBe(false);
      expect(isMarhalaDifficulty('')).toBe(false);
      expect(isMarhalaDifficulty(null)).toBe(false);
      expect(isMarhalaDifficulty(undefined)).toBe(false);
      expect(isMarhalaDifficulty(123)).toBe(false);
    });
  });

  describe('marhalaDifficultyOf', () => {
    it('extracts valid difficulty from mechanicPayload', () => {
      expect(marhalaDifficultyOf({ marhalaDifficulty: 'medium' })).toBe(
        'medium',
      );
      expect(marhalaDifficultyOf({ marhalaDifficulty: 'hard' })).toBe('hard');
      expect(marhalaDifficultyOf({ marhalaDifficulty: 'easy' })).toBe('easy');
    });

    it('returns undefined for invalid or missing difficulty', () => {
      expect(marhalaDifficultyOf({})).toBeUndefined();
      expect(marhalaDifficultyOf(null)).toBeUndefined();
      expect(
        marhalaDifficultyOf({ marhalaDifficulty: 'invalid' }),
      ).toBeUndefined();
    });
  });

  describe('normalizeMarhalaMedia', () => {
    it('normalizes missing or null media to type none', () => {
      expect(normalizeMarhalaMedia(null)).toEqual({ type: 'none' });
      expect(normalizeMarhalaMedia(undefined)).toEqual({ type: 'none' });
      expect(normalizeMarhalaMedia({})).toEqual({ type: 'none' });
      expect(normalizeMarhalaMedia({ type: ContentMediaType.NONE })).toEqual({
        type: 'none',
      });
      expect(normalizeMarhalaMedia({ type: 'none' })).toEqual({
        type: 'none',
      });
    });

    it('normalizes canonical ContentItem image with assets array', () => {
      const result = normalizeMarhalaMedia({
        type: ContentMediaType.IMAGE,
        assets: [
          {
            url: 'https://media.akwaan.com/images/overwatch-tracer.webp',
            altText: 'Tracer portrait',
          },
        ],
      });
      expect(result).toEqual({
        type: 'image',
        url: 'https://media.akwaan.com/images/overwatch-tracer.webp',
        altText: 'Tracer portrait',
      });
    });

    it('normalizes flat image media with imageUrl / url', () => {
      const result = normalizeMarhalaMedia({
        type: 'image',
        url: 'https://media.akwaan.com/images/del-perro.webp',
        altText: 'Del Perro Pier',
      });
      expect(result).toEqual({
        type: 'image',
        url: 'https://media.akwaan.com/images/del-perro.webp',
        altText: 'Del Perro Pier',
      });
    });

    it('normalizes canonical audio media with assets array', () => {
      const result = normalizeMarhalaMedia({
        type: ContentMediaType.AUDIO,
        assets: [
          {
            url: 'https://media.akwaan.com/audio/high-noon.mp3',
          },
        ],
      });
      expect(result).toEqual({
        type: 'audio',
        url: 'https://media.akwaan.com/audio/high-noon.mp3',
      });
    });

    it('falls back to none when image or audio media is missing a valid URL', () => {
      expect(
        normalizeMarhalaMedia({
          type: 'image',
          assets: [{ url: '' }],
        }),
      ).toEqual({ type: 'none' });

      expect(
        normalizeMarhalaMedia({
          type: 'audio',
          assets: [],
        }),
      ).toEqual({ type: 'none' });

      expect(
        normalizeMarhalaMedia({
          type: 'image',
          url: '   ',
        }),
      ).toEqual({ type: 'none' });
    });

    it('safely handles unknown or unsupported media types', () => {
      expect(
        normalizeMarhalaMedia({
          type: 'video',
          assets: [{ url: 'https://example.com/video.mp4' }],
        }),
      ).toEqual({ type: 'none' });
    });
  });
});
