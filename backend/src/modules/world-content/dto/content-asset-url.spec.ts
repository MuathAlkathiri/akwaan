import { ValidationPipe, ArgumentMetadata } from '@nestjs/common';
import { ContentAssetDto } from './world-content-shared.dto';

/**
 * What Akwaan will accept as a media address.
 *
 * `url` was `@IsString()` and nothing else: any value at all, of any length,
 * in any scheme. These assert the two shapes that are real — a first-party
 * `/uploads` path and an absolute `http(s)` URL — and that the schemes a media
 * address is never written in are refused.
 *
 * The host is deliberately **not** restricted. An audio-only first-party rule
 * is the right end state, but existing authored content and several mechanics'
 * fixtures use absolute URLs, so enforcing it now would reject legitimate
 * authoring. That restriction is documented as deferred, not quietly applied.
 */
describe('ContentAssetDto.url', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta: ArgumentMetadata = {
    type: 'body',
    metatype: ContentAssetDto as never,
  };

  const accepts = (url: string) => pipe.transform({ url }, meta);
  const refusalFor = async (url: string) => {
    try {
      await pipe.transform({ url }, meta);
    } catch (error) {
      const response = (
        error as { getResponse?: () => unknown }
      ).getResponse?.() as { message?: string[] } | undefined;
      return (response?.message ?? []).join(' ');
    }
    return undefined;
  };

  describe('accepts what authoring really produces', () => {
    it('accepts the first-party upload path every upload produces', async () => {
      await expect(
        accepts('/uploads/question-assets/audio/0f3a-4c0e-9a2b-clip.mp3'),
      ).resolves.toMatchObject({ url: expect.stringContaining('/uploads/') });
    });

    it('accepts an absolute https URL', async () => {
      // First Note and Moving XO authoring both rely on this today.
      await expect(
        accepts('https://cdn.akwaan.test/puzzles/fixture.png'),
      ).resolves.toBeDefined();
    });

    it('accepts an absolute http URL', async () => {
      await expect(
        accepts('http://localhost:3000/uploads/a.mp3'),
      ).resolves.toBeDefined();
    });

    it('accepts a path carrying a query string', async () => {
      // A signed URL will look like this in Phase B; refusing it now would
      // design the next phase out of the validator.
      await expect(
        accepts('/uploads/music/snippets/abc-snippet.mp3?v=2'),
      ).resolves.toBeDefined();
    });
  });

  describe('refuses what is not a media address', () => {
    for (const [label, url] of [
      ['a javascript: scheme', 'javascript:alert(1)'],
      ['a data: URI', 'data:audio/mpeg;base64,SUQzBAAAA'],
      ['a file: path', 'file:///etc/passwd'],
      ['a protocol-relative URL', '//evil.example/clip.mp3'],
      ['a bare word', 'clip.mp3'],
      ['an empty string', ''],
      ['a value with whitespace', '/uploads/a b.mp3'],
    ] as const) {
      it(`refuses ${label}`, async () => {
        await expect(refusalFor(url)).resolves.toMatch(/url/);
      });
    }

    it('refuses an absurdly long value', async () => {
      await expect(
        refusalFor(`https://cdn.test/${'a'.repeat(2100)}.mp3`),
      ).resolves.toMatch(/url/);
    });
  });
});
