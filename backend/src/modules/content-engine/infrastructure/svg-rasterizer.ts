import { Injectable } from '@nestjs/common';

export class SvgRasterizationError extends Error {
  readonly code = 'COMPOSED_VISUAL_RASTERIZATION_FAILED';
}

type SharpFactory = (input: Buffer) => {
  png: (options?: { compressionLevel?: number }) => {
    toBuffer: () => Promise<Buffer>;
  };
};

/**
 * Turns an SVG the engine drew into the PNG a ContentItem can hold.
 *
 * World Content accepts JPEG, PNG and WebP only — an SVG is a document that
 * can carry script, so it is never stored or served as one. The library is
 * loaded on first use: a host without its native binary loses composed
 * pictures, and nothing else.
 */
@Injectable()
export class SvgRasterizer {
  private sharp?: SharpFactory;

  async toPng(svg: string): Promise<Buffer> {
    try {
      if (!this.sharp) {
        const loaded = (await import('sharp')) as unknown as {
          default?: SharpFactory;
        } & SharpFactory;
        this.sharp = loaded.default ?? loaded;
      }
      return await this.sharp(Buffer.from(svg, 'utf8'))
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch (error) {
      throw new SvgRasterizationError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
