/**
 * What an image *is*, read from its bytes rather than from a header or a file
 * name. Pure and synchronous: no decoder, no native dependency.
 *
 * It establishes three things, each fail-closed:
 *
 * - **format** — JPEG, PNG or WebP by signature; anything else (GIF, SVG,
 *   HTML error pages served as `image/jpeg`) is refused;
 * - **dimensions** — from the format's own header, bounded so a tiny file
 *   cannot declare a decompression-bomb canvas;
 * - **completeness** — the container's structure must reach its end marker
 *   (PNG `IEND`, JPEG `EOI`, the WebP RIFF length), so a download cut short
 *   is refused instead of being stored as a half-rendered image.
 *
 * It does not decode pixels or verify checksums. A structurally complete file
 * with corrupt compressed data can still pass; that is a renderability concern
 * left to human media review.
 */

export type InspectedImageFormat = 'jpeg' | 'png' | 'webp';

export interface InspectedImage {
  format: InspectedImageFormat;
  mimetype: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: '.jpg' | '.png' | '.webp';
  width: number;
  height: number;
  byteLength: number;
}

export interface ImageInspectionLimits {
  maxBytes?: number;
  minSide?: number;
  maxSide?: number;
  maxPixels?: number;
}

export const DEFAULT_IMAGE_INSPECTION_LIMITS: Required<ImageInspectionLimits> =
  {
    maxBytes: Number.MAX_SAFE_INTEGER,
    minSide: 1,
    maxSide: 16_384,
    maxPixels: 50_000_000,
  };

export type ImageInspectionCode =
  | 'IMAGE_EMPTY'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_FORMAT_UNSUPPORTED'
  | 'IMAGE_TRUNCATED'
  | 'IMAGE_MALFORMED'
  | 'IMAGE_DIMENSIONS_INVALID';

export class ImageInspectionError extends Error {
  constructor(
    readonly code: ImageInspectionCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'ImageInspectionError';
  }
}

const fail = (code: ImageInspectionCode, message: string): never => {
  throw new ImageInspectionError(code, message);
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const FORMATS = {
  jpeg: { mimetype: 'image/jpeg', extension: '.jpg' },
  png: { mimetype: 'image/png', extension: '.png' },
  webp: { mimetype: 'image/webp', extension: '.webp' },
} as const;

export function inspectImageBytes(
  bytes: Buffer,
  limits: ImageInspectionLimits = {},
): InspectedImage {
  const bounds = { ...DEFAULT_IMAGE_INSPECTION_LIMITS, ...limits };
  if (!bytes?.length) fail('IMAGE_EMPTY', 'image has no bytes');
  if (bytes.length > bounds.maxBytes) {
    fail(
      'IMAGE_TOO_LARGE',
      `image is ${bytes.length} bytes; the limit is ${bounds.maxBytes}`,
    );
  }

  let format: InspectedImageFormat;
  let size: { width: number; height: number };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    format = 'png';
    size = inspectPng(bytes);
  } else if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    format = 'jpeg';
    size = inspectJpeg(bytes);
  } else if (
    bytes.length >= 12 &&
    bytes.toString('latin1', 0, 4) === 'RIFF' &&
    bytes.toString('latin1', 8, 12) === 'WEBP'
  ) {
    format = 'webp';
    size = inspectWebp(bytes);
  } else {
    return fail(
      'IMAGE_FORMAT_UNSUPPORTED',
      'bytes are not a JPEG, PNG or WebP image',
    );
  }

  const { width, height } = size;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < bounds.minSide ||
    height < bounds.minSide ||
    width > bounds.maxSide ||
    height > bounds.maxSide ||
    width * height > bounds.maxPixels
  ) {
    fail(
      'IMAGE_DIMENSIONS_INVALID',
      `${width}x${height} is outside the allowed bounds`,
    );
  }
  return {
    format,
    ...FORMATS[format],
    width,
    height,
    byteLength: bytes.length,
  };
}

function inspectPng(bytes: Buffer): { width: number; height: number } {
  // The first chunk must be a 13-byte IHDR.
  if (bytes.length < 33) fail('IMAGE_TRUNCATED', 'PNG header is incomplete');
  if (
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('latin1', 12, 16) !== 'IHDR'
  ) {
    fail('IMAGE_MALFORMED', 'PNG does not start with IHDR');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);

  // Walk every chunk to IEND; a chunk that runs past the buffer is a cut-off
  // download, and so is a stream that never reaches IEND.
  let offset = 8;
  let sawImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const next = offset + 12 + length;
    if (next > bytes.length) {
      fail(
        'IMAGE_TRUNCATED',
        `PNG chunk ${type} runs past the end of the file`,
      );
    }
    if (type === 'IDAT') sawImageData = true;
    if (type === 'IEND') {
      if (!sawImageData) fail('IMAGE_MALFORMED', 'PNG has no image data');
      return { width, height };
    }
    offset = next;
  }
  return fail('IMAGE_TRUNCATED', 'PNG ends before IEND');
}

const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 &&
  marker <= 0xcf &&
  marker !== 0xc4 &&
  marker !== 0xc8 &&
  marker !== 0xcc;

function inspectJpeg(bytes: Buffer): { width: number; height: number } {
  let offset = 2;
  let size: { width: number; height: number } | null = null;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      fail('IMAGE_MALFORMED', `JPEG expected a marker at byte ${offset}`);
    }
    // Fill bytes: any number of 0xFF may precede a marker.
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9) {
      if (!size) fail('IMAGE_MALFORMED', 'JPEG has no frame header');
      return size!;
    }
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    if (offset + 2 > bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2)
      fail('IMAGE_MALFORMED', 'JPEG segment length is invalid');
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > bytes.length) break;

    if (isStartOfFrame(marker)) {
      if (segmentLength < 7)
        fail('IMAGE_MALFORMED', 'JPEG frame header is too short');
      size = {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset = segmentEnd;

    if (marker === 0xda) {
      if (!size) fail('IMAGE_MALFORMED', 'JPEG scan precedes its frame header');
      // Entropy-coded data runs until a marker that is neither a stuffed zero
      // nor a restart marker.
      while (offset + 1 < bytes.length) {
        if (bytes[offset] === 0xff) {
          const following = bytes[offset + 1];
          if (
            following !== 0x00 &&
            following !== 0xff &&
            !(following >= 0xd0 && following <= 0xd7)
          ) {
            break;
          }
        }
        offset += 1;
      }
      if (offset + 1 >= bytes.length) break;
    }
  }
  return fail('IMAGE_TRUNCATED', 'JPEG ends before its end-of-image marker');
}

function inspectWebp(bytes: Buffer): { width: number; height: number } {
  const riffSize = bytes.readUInt32LE(4);
  const declaredEnd = 8 + riffSize;
  if (declaredEnd > bytes.length) {
    fail('IMAGE_TRUNCATED', 'WebP is shorter than its RIFF header declares');
  }
  if (bytes.length < 20) fail('IMAGE_TRUNCATED', 'WebP has no image chunk');
  const chunk = bytes.toString('latin1', 12, 16);
  const chunkSize = bytes.readUInt32LE(16);
  const chunkEnd = 20 + chunkSize;
  if (chunkEnd > declaredEnd) {
    fail(
      'IMAGE_TRUNCATED',
      `WebP ${chunk.trim()} chunk runs past the RIFF end`,
    );
  }

  if (chunk === 'VP8 ') {
    if (chunkSize < 10)
      fail('IMAGE_MALFORMED', 'VP8 frame header is too short');
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      fail('IMAGE_MALFORMED', 'VP8 start code is missing');
    }
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    if (chunkSize < 5 || bytes[20] !== 0x2f) {
      fail('IMAGE_MALFORMED', 'VP8L signature is missing');
    }
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === 'VP8X') {
    if (chunkSize < 10) fail('IMAGE_MALFORMED', 'VP8X header is too short');
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1,
    };
  }
  return fail(
    'IMAGE_FORMAT_UNSUPPORTED',
    `WebP chunk ${chunk} is not supported`,
  );
}
