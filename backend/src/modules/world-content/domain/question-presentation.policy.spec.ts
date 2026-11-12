import { ContentMediaType } from './world-content.constants';
import {
  QuestionPresentationInput,
  resolveQuestionPresentation,
} from './question-presentation.policy';
import type { ContentAssetRef } from './world-content.types';

const asset = (url: string): ContentAssetRef => ({ url });

const FALLBACK = asset('/world-content/worlds/celebrities-fallback-16x9.jpg');
const PHOTO = asset('/world-content/content-items/engine-abc.jpg');
const SONG = asset('/world-content/content-items/first-note-1.mp3');

const resolve = (input: QuestionPresentationInput) =>
  resolveQuestionPresentation(input);

const codes = (input: QuestionPresentationInput) =>
  resolve(input).defects.map((defect) => defect.code);

describe('question presentation precedence (§30.22 Track A)', () => {
  describe('required gameplay media comes first and is never cropped', () => {
    it('shows a gameplay image whole, at its own ratio, with no artwork behind it', () => {
      const result = resolve({
        itemMedia: { type: ContentMediaType.IMAGE, assets: [PHOTO] },
        gameplayMediaRequired: true,
        worldQuestionFallback: FALLBACK,
      });

      expect(result.stage).toEqual({
        source: 'gameplay-media',
        asset: PHOTO,
        fit: 'native',
        mediaType: ContentMediaType.IMAGE,
      });
      // A celebrity photograph a team is reading gets the screen to itself.
      expect(result.backdrop.source).toBe('none');
      expect(result.defects).toEqual([]);
    });

    it('treats video the same way', () => {
      const result = resolve({
        itemMedia: {
          type: ContentMediaType.VIDEO,
          assets: [asset('/clip.mp4')],
        },
        worldQuestionFallback: FALLBACK,
      });

      expect(result.stage.source).toBe('gameplay-media');
      expect(result.stage.fit).toBe('native');
      expect(result.backdrop.source).toBe('none');
    });

    it('takes the first asset carrying a usable url', () => {
      const result = resolve({
        itemMedia: {
          type: ContentMediaType.IMAGE,
          assets: [asset('   '), PHOTO],
        },
      });

      expect(result.stage.asset).toBe(PHOTO);
    });
  });

  describe('audio-visual coexistence', () => {
    it('lets the World artwork sit behind an audio question', () => {
      const result = resolve({
        itemMedia: { type: ContentMediaType.AUDIO, assets: [SONG] },
        gameplayMediaRequired: true,
        worldQuestionFallback: FALLBACK,
      });

      // The audio is still the gameplay media; the artwork is only a backdrop,
      // so it cannot touch playback or readiness.
      expect(result.stage).toEqual({
        source: 'gameplay-media',
        asset: SONG,
        fit: 'native',
        mediaType: ContentMediaType.AUDIO,
      });
      expect(result.backdrop).toEqual({
        source: 'world-fallback',
        asset: FALLBACK,
        fit: 'cover-16x9',
      });
      expect(result.defects).toEqual([]);
    });

    it('plays the audio question without a backdrop when the World has no artwork', () => {
      const result = resolve({
        itemMedia: { type: ContentMediaType.AUDIO, assets: [SONG] },
        gameplayMediaRequired: true,
      });

      expect(result.stage.source).toBe('gameplay-media');
      expect(result.backdrop.source).toBe('none');
      expect(result.defects).toEqual([
        {
          code: 'WORLD_FALLBACK_MISSING',
          severity: 'advisory',
          message: expect.any(String),
        },
      ]);
    });
  });

  describe('non-substitution invariant', () => {
    it('paints nothing and blocks when required gameplay media is unresolved, even with artwork available', () => {
      const result = resolve({
        itemMedia: { type: ContentMediaType.IMAGE, assets: [] },
        gameplayMediaRequired: true,
        worldQuestionFallback: FALLBACK,
      });

      expect(result.stage.source).toBe('none');
      expect(result.stage.asset).toBeNull();
      // The whole point: the World artwork must not make a broken question look
      // finished, so it is withheld here although one exists.
      expect(result.backdrop.source).toBe('none');
      expect(result.defects).toEqual([
        {
          code: 'GAMEPLAY_MEDIA_MISSING',
          severity: 'blocking',
          message: expect.any(String),
        },
      ]);
    });

    it('blocks a required slot whose only asset has a blank url', () => {
      expect(
        codes({
          itemMedia: { type: ContentMediaType.IMAGE, assets: [asset('  ')] },
          gameplayMediaRequired: true,
          worldQuestionFallback: FALLBACK,
        }),
      ).toEqual(['GAMEPLAY_MEDIA_MISSING']);
    });

    it('blocks when the item declares no media at all but the mechanic needs it', () => {
      expect(
        codes({
          itemMedia: { type: ContentMediaType.NONE, assets: [] },
          gameplayMediaRequired: true,
          worldQuestionFallback: FALLBACK,
        }),
      ).toEqual(['GAMEPLAY_MEDIA_MISSING']);
      expect(
        codes({ gameplayMediaRequired: true, worldQuestionFallback: FALLBACK }),
      ).toEqual(['GAMEPLAY_MEDIA_MISSING']);
    });

    it('ignores assets on media explicitly declared none', () => {
      // A declared `none` is an authoring statement, not an oversight: whatever
      // is left in the array is not this question's media.
      const result = resolve({
        itemMedia: { type: ContentMediaType.NONE, assets: [PHOTO] },
        worldQuestionFallback: FALLBACK,
      });

      expect(result.stage.source).toBe('none');
      expect(result.backdrop.source).toBe('world-fallback');
    });
  });

  describe('approved decorative media, then the World fallback', () => {
    it('prefers the item’s own artwork over the World’s, at native ratio', () => {
      const decorative = asset('/world-content/content-items/topic.jpg');
      const result = resolve({
        decorativeAsset: decorative,
        worldQuestionFallback: FALLBACK,
      });

      expect(result.stage).toEqual({
        source: 'decorative-media',
        asset: decorative,
        fit: 'native',
        mediaType: ContentMediaType.IMAGE,
      });
      expect(result.backdrop.source).toBe('none');
      expect(result.defects).toEqual([]);
    });

    it('falls back to the World artwork for a text question', () => {
      const result = resolve({
        itemMedia: { type: ContentMediaType.NONE, assets: [] },
        worldQuestionFallback: FALLBACK,
      });

      expect(result.stage.source).toBe('none');
      expect(result.backdrop).toEqual({
        source: 'world-fallback',
        asset: FALLBACK,
        fit: 'cover-16x9',
      });
    });

    it('downgrades gracefully, never fatally, when nothing is available', () => {
      const result = resolve({});

      expect(result.stage.source).toBe('none');
      expect(result.backdrop.source).toBe('none');
      expect(result.defects).toEqual([
        {
          code: 'WORLD_FALLBACK_MISSING',
          severity: 'advisory',
          message: expect.any(String),
        },
      ]);
      expect(
        result.defects.every((defect) => defect.severity === 'advisory'),
      ).toBe(true);
    });

    it('does not take a decorative asset with a blank url', () => {
      const result = resolve({
        decorativeAsset: asset('   '),
        worldQuestionFallback: FALLBACK,
      });

      expect(result.stage.source).toBe('none');
      expect(result.backdrop.source).toBe('world-fallback');
    });
  });

  describe('16:9 belongs to the World artwork alone', () => {
    const everyBranch: QuestionPresentationInput[] = [
      {
        itemMedia: { type: ContentMediaType.IMAGE, assets: [PHOTO] },
        worldQuestionFallback: FALLBACK,
      },
      {
        itemMedia: { type: ContentMediaType.AUDIO, assets: [SONG] },
        worldQuestionFallback: FALLBACK,
      },
      { gameplayMediaRequired: true, worldQuestionFallback: FALLBACK },
      { decorativeAsset: PHOTO, worldQuestionFallback: FALLBACK },
      { worldQuestionFallback: FALLBACK },
      {},
    ];

    it('never fits anything the question owns to 16:9', () => {
      for (const input of everyBranch) {
        const result = resolve(input);
        expect(result.stage.fit).toBe('native');
        if (result.backdrop.source === 'world-fallback') {
          expect(result.backdrop.fit).toBe('cover-16x9');
        } else {
          expect(result.backdrop.asset).toBeNull();
        }
      }
    });
  });
});
