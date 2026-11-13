import {
  inspectImageBytes,
  ImageInspectionError,
} from './image-bytes.inspector';
import {
  GIF_3X2,
  JPEG_BASELINE_3X2,
  JPEG_PROGRESSIVE_3X2,
  PNG_3X2,
  WEBP_ALPHA_3X2,
  WEBP_LOSSLESS_3X2,
  WEBP_LOSSY_3X2,
} from './testing/image-fixtures';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return (error as ImageInspectionError).code;
  }
  return undefined;
};

describe('inspectImageBytes', () => {
  it.each([
    ['PNG', PNG_3X2, 'png', 'image/png', '.png'],
    ['baseline JPEG', JPEG_BASELINE_3X2, 'jpeg', 'image/jpeg', '.jpg'],
    ['progressive JPEG', JPEG_PROGRESSIVE_3X2, 'jpeg', 'image/jpeg', '.jpg'],
    ['lossy WebP', WEBP_LOSSY_3X2, 'webp', 'image/webp', '.webp'],
    ['lossless WebP', WEBP_LOSSLESS_3X2, 'webp', 'image/webp', '.webp'],
    ['extended WebP', WEBP_ALPHA_3X2, 'webp', 'image/webp', '.webp'],
  ])('reads a real %s', (_label, bytes, format, mimetype, extension) => {
    expect(inspectImageBytes(bytes)).toEqual({
      format,
      mimetype,
      extension,
      width: 3,
      height: 2,
      byteLength: bytes.length,
    });
  });

  it.each([
    ['GIF', GIF_3X2],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['an HTML error page', Buffer.from('<!doctype html><title>404</title>')],
    ['random bytes', Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])],
  ])('refuses %s', (_label, bytes) => {
    expect(codeOf(() => inspectImageBytes(bytes))).toBe(
      'IMAGE_FORMAT_UNSUPPORTED',
    );
  });

  it('refuses empty input', () => {
    expect(codeOf(() => inspectImageBytes(Buffer.alloc(0)))).toBe(
      'IMAGE_EMPTY',
    );
  });

  it('enforces the byte limit', () => {
    expect(
      codeOf(() =>
        inspectImageBytes(PNG_3X2, { maxBytes: PNG_3X2.length - 1 }),
      ),
    ).toBe('IMAGE_TOO_LARGE');
  });

  it.each([
    ['PNG', PNG_3X2],
    ['baseline JPEG', JPEG_BASELINE_3X2],
    ['progressive JPEG', JPEG_PROGRESSIVE_3X2],
    ['lossy WebP', WEBP_LOSSY_3X2],
    ['lossless WebP', WEBP_LOSSLESS_3X2],
    ['extended WebP', WEBP_ALPHA_3X2],
  ])('refuses every truncation of a %s', (_label, bytes) => {
    for (let length = 1; length < bytes.length; length += 1) {
      const code = codeOf(() => inspectImageBytes(bytes.subarray(0, length)));
      expect([
        'IMAGE_TRUNCATED',
        'IMAGE_MALFORMED',
        'IMAGE_FORMAT_UNSUPPORTED',
      ]).toContain(code);
    }
  });

  it('refuses a decompression-bomb canvas declared by a tiny PNG', () => {
    const bomb = Buffer.from(PNG_3X2);
    bomb.writeUInt32BE(100_000, 16);
    bomb.writeUInt32BE(100_000, 20);
    expect(codeOf(() => inspectImageBytes(bomb))).toBe(
      'IMAGE_DIMENSIONS_INVALID',
    );
  });

  it('refuses a zero-sized PNG', () => {
    const empty = Buffer.from(PNG_3X2);
    empty.writeUInt32BE(0, 16);
    expect(codeOf(() => inspectImageBytes(empty))).toBe(
      'IMAGE_DIMENSIONS_INVALID',
    );
  });

  it('applies caller dimension bounds', () => {
    expect(
      codeOf(() => inspectImageBytes(JPEG_BASELINE_3X2, { minSide: 64 })),
    ).toBe('IMAGE_DIMENSIONS_INVALID');
  });

  it('accepts trailing bytes after a JPEG end-of-image marker', () => {
    const padded = Buffer.concat([JPEG_BASELINE_3X2, Buffer.from([0, 0, 0])]);
    expect(inspectImageBytes(padded).width).toBe(3);
  });
});
