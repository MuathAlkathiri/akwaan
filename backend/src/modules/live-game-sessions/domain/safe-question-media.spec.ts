import { toSafeQuestionMedia } from './safe-question-media';
import { ContentMediaType } from '../../world-content/domain/world-content.constants';

describe('toSafeQuestionMedia', () => {
  it('narrows image media to type, url, and altText only', () => {
    expect(
      toSafeQuestionMedia({
        type: ContentMediaType.IMAGE,
        assets: [
          {
            url: 'https://cdn/a.webp',
            altText: 'caption',
            path: 'p',
            filename: 'f',
            mimetype: 'image/webp',
            size: 10,
          },
        ],
      }),
    ).toEqual({ type: 'image', url: 'https://cdn/a.webp', altText: 'caption' });
  });

  it('narrows audio media the same way', () => {
    expect(
      toSafeQuestionMedia({
        type: ContentMediaType.AUDIO,
        assets: [{ url: 'https://cdn/a.mp3', path: 'p' }],
      }),
    ).toEqual({ type: 'audio', url: 'https://cdn/a.mp3' });
  });

  it('omits altText entirely when none was authored', () => {
    expect(
      toSafeQuestionMedia({
        type: ContentMediaType.IMAGE,
        assets: [{ url: 'https://cdn/a.webp' }],
      }),
    ).toEqual({ type: 'image', url: 'https://cdn/a.webp' });
  });

  it('returns null for absent media', () => {
    expect(toSafeQuestionMedia(null)).toBeNull();
    expect(toSafeQuestionMedia(undefined)).toBeNull();
  });

  it('returns null for none/video types', () => {
    expect(
      toSafeQuestionMedia({ type: ContentMediaType.NONE, assets: [] }),
    ).toBeNull();
    expect(
      toSafeQuestionMedia({
        type: ContentMediaType.VIDEO,
        assets: [{ url: 'https://cdn/a.mp4' }],
      }),
    ).toBeNull();
  });

  it('returns null rather than throwing for an empty or blank-url asset list', () => {
    expect(
      toSafeQuestionMedia({ type: ContentMediaType.IMAGE, assets: [] }),
    ).toBeNull();
    expect(
      toSafeQuestionMedia({
        type: ContentMediaType.IMAGE,
        assets: [{ url: '   ' }],
      }),
    ).toBeNull();
  });

  it('takes only the first asset when several are present', () => {
    expect(
      toSafeQuestionMedia({
        type: ContentMediaType.IMAGE,
        assets: [
          { url: 'https://cdn/first.webp' },
          { url: 'https://cdn/second.webp' },
        ],
      }),
    ).toEqual({ type: 'image', url: 'https://cdn/first.webp' });
  });
});
