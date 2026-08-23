import {
  BOMB_MAX_ITEMS,
  BOMB_MIN_ITEMS,
  buildBombRuntimeItems,
  type BombAuthoredItem,
} from './bomb-content.policy';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  ContentMediaType,
} from './world-content.constants';

const item = (
  index: number,
  overrides: Partial<BombAuthoredItem> = {},
): BombAuthoredItem => ({
  id: `item-${index}`,
  status: ContentItemStatus.READY,
  prompt: { ar: `سؤال ${index}` },
  media: {
    type: ContentMediaType.IMAGE,
    assets: [{ url: `/uploads/bomb/${index}.webp`, altText: `صورة ${index}` }],
  },
  answerPayload: {
    mode: ChallengeAnswerMode.MATCH,
    acceptedAnswers: [`جواب ${index}`],
  },
  ...overrides,
});

const list = (count: number) =>
  Array.from({ length: count }, (_, index) => item(index + 1));

describe('Bomb authored content', () => {
  describe('cardinality', () => {
    it('rejects nine items', () => {
      expect(() => buildBombRuntimeItems(list(9))).toThrow(
        /10–15 ordered items/,
      );
    });

    it('accepts ten', () => {
      expect(buildBombRuntimeItems(list(BOMB_MIN_ITEMS))).toHaveLength(10);
    });

    it('accepts fifteen', () => {
      expect(buildBombRuntimeItems(list(BOMB_MAX_ITEMS))).toHaveLength(15);
    });

    it('rejects sixteen', () => {
      expect(() => buildBombRuntimeItems(list(16))).toThrow(
        /10–15 ordered items/,
      );
    });

    it('rejects the same item played twice', () => {
      const repeated = [...list(9), item(1)];
      expect(() => buildBombRuntimeItems(repeated)).toThrow(/same item twice/);
    });
  });

  describe('per-item prompt', () => {
    it('keeps each item paired with its own question', () => {
      const built = buildBombRuntimeItems(list(10));

      expect(built.map((entry) => entry.prompt)).toEqual(
        Array.from({ length: 10 }, (_, i) => `سؤال ${i + 1}`),
      );
    });

    it('rejects an item with no Arabic prompt', () => {
      const items = list(10);
      items[2] = item(3, { prompt: { en: 'only english' } });
      expect(() => buildBombRuntimeItems(items)).toThrow(
        /Item 3 needs an Arabic prompt/,
      );
    });
  });

  describe('ordering', () => {
    it('preserves the authored order as gameplay order', () => {
      const built = buildBombRuntimeItems(list(10));

      expect(built.map((entry) => entry.imageUrl)).toEqual(
        Array.from({ length: 10 }, (_, i) => `/uploads/bomb/${i + 1}.webp`),
      );
    });
  });

  describe('media', () => {
    it('accepts an item with no media at all (text-only)', () => {
      const items = list(10);
      items[3] = item(4, { media: undefined });
      const built = buildBombRuntimeItems(items);
      expect(built[3].media).toEqual({ type: 'none' });
      expect(built[3].imageUrl).toBe('');
    });

    it('accepts an item with explicit type none', () => {
      const items = list(10);
      items[2] = item(3, { media: { type: ContentMediaType.NONE, assets: [] } });
      const built = buildBombRuntimeItems(items);
      expect(built[2].media).toEqual({ type: 'none' });
      expect(built[2].imageUrl).toBe('');
    });

    it('accepts an audio medium with valid asset URL', () => {
      const items = list(10);
      items[0] = item(1, {
        media: {
          type: ContentMediaType.AUDIO,
          assets: [{ url: '/audio/track.mp3', altText: 'مقطع صوتي' }],
        },
      });
      const built = buildBombRuntimeItems(items);
      expect(built[0].media).toEqual({
        type: 'audio',
        url: '/audio/track.mp3',
        altText: 'مقطع صوتي',
      });
      expect(built[0].imageUrl).toBe('');
    });

    it('accepts an image medium with valid asset URL', () => {
      const items = list(10);
      const built = buildBombRuntimeItems(items);
      expect(built[0].media).toEqual({
        type: 'image',
        url: '/uploads/bomb/1.webp',
        altText: 'صورة 1',
      });
      expect(built[0].imageUrl).toBe('/uploads/bomb/1.webp');
    });

    it('rejects an image asset with a blank url', () => {
      const items = list(10);
      items[0] = item(1, {
        media: { type: ContentMediaType.IMAGE, assets: [{ url: '  ' }] },
      });
      expect(() => buildBombRuntimeItems(items)).toThrow(
        /missing a valid image URL/,
      );
    });

    it('rejects an audio asset with a blank url', () => {
      const items = list(10);
      items[0] = item(1, {
        media: { type: ContentMediaType.AUDIO, assets: [{ url: '  ' }] },
      });
      expect(() => buildBombRuntimeItems(items)).toThrow(
        /missing a valid audio URL/,
      );
    });

    it('rejects an unsupported media type', () => {
      const items = list(10);
      items[0] = item(1, {
        media: {
          type: ContentMediaType.VIDEO,
          assets: [{ url: '/video/intro.mp4' }],
        },
      });
      expect(() => buildBombRuntimeItems(items)).toThrow(
        /not supported in Bomb/,
      );
    });
  });

  describe('answers', () => {
    it('rejects an item with no accepted answers', () => {
      const items = list(10);
      items[2] = item(3, {
        answerPayload: { mode: ChallengeAnswerMode.MATCH, acceptedAnswers: [] },
      });
      expect(() => buildBombRuntimeItems(items)).toThrow(/Item 3 needs 1–10/);
    });

    it('rejects an answer mode Bomb cannot grade', () => {
      const items = list(10);
      items[0] = item(1, {
        answerPayload: {
          mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
          acceptedAnswers: ['x'],
        },
      });
      expect(() => buildBombRuntimeItems(items)).toThrow(/match answer/);
    });

    it('rejects two answers that normalize to the same string', () => {
      const items = list(10);
      items[0] = item(1, {
        answerPayload: {
          mode: ChallengeAnswerMode.MATCH,
          acceptedAnswers: ['ميسي', ' ميسي '],
        },
      });
      expect(() => buildBombRuntimeItems(items)).toThrow(/repeats the same/);
    });

    it('keeps several genuinely different answers', () => {
      const items = list(10);
      items[0] = item(1, {
        answerPayload: {
          mode: ChallengeAnswerMode.MATCH,
          acceptedAnswers: ['ميسي', 'ليونيل ميسي'],
        },
      });
      expect(buildBombRuntimeItems(items)[0].acceptedAnswers).toEqual([
        'ميسي',
        'ليونيل ميسي',
      ]);
    });
  });

  describe('lifecycle', () => {
    it('refuses to play a draft item', () => {
      const items = list(10);
      items[5] = item(6, { status: ContentItemStatus.DRAFT });
      expect(() => buildBombRuntimeItems(items)).toThrow(/Item 6 is not ready/);
    });

    it('accepts a fully ready selection', () => {
      expect(() => buildBombRuntimeItems(list(12))).not.toThrow();
    });
  });

  describe('runtime shape', () => {
    it('reduces to exactly what the Bomb plugin expects', () => {
      const [first] = buildBombRuntimeItems(list(10));

      expect(Object.keys(first).sort()).toEqual([
        'acceptedAnswers',
        'altText',
        'imageUrl',
        'media',
        'prompt',
      ]);
    });
  });
});
