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

  it('withholds altText from AUDIO — nothing renders it, and it names the song', () => {
    // Every `altText` consumer in the app is an `<img alt=…>`; every audio
    // component takes a URL and nothing else. On an audio question the caption
    // is therefore pure leak surface, reaching devices that will never display
    // it in a round whose whole question is the name of the song.
    const projected = toSafeQuestionMedia({
      type: ContentMediaType.AUDIO,
      assets: [{ url: 'https://cdn/a.mp3', altText: 'أم كلثوم — أنت عمري' }],
    } as never);
    expect(projected).toEqual({ type: 'audio', url: 'https://cdn/a.mp3' });
    expect(JSON.stringify(projected)).not.toContain('كلثوم');
  });

  it('keeps altText on IMAGE — there it is the accessible name', () => {
    expect(
      toSafeQuestionMedia({
        type: ContentMediaType.IMAGE,
        assets: [{ url: 'https://cdn/a.webp', altText: 'صورة السؤال' }],
      } as never),
    ).toMatchObject({ altText: 'صورة السؤال' });
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
