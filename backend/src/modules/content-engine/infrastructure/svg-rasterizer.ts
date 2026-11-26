import { Injectable } from '@nestjs/common';
import { existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

export class SvgRasterizationError extends Error {
  readonly code = 'COMPOSED_VISUAL_RASTERIZATION_FAILED';
}

export const COMPOSER_FONT_FILE = 'NotoKufiArabic-Variable.ttf';

/** `assets/fonts` beside the backend, found from wherever this file runs. */
export function findComposerFontDirectory(start = __dirname): string | null {
  let directory = start;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(directory, 'assets', 'fonts');
    if (existsSync(join(candidate, COMPOSER_FONT_FILE))) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

let fontsPrepared = false;

/**
 * Point fontconfig at the bundled font, keeping the system's own fonts.
 *
 * A host has no Arabic font to rely on, and a missing one fails silently —
 * the words are drawn as empty boxes. Returns false when the font could not
 * be set up, so the caller can tell; it never throws.
 */
export function prepareComposerFonts(): boolean {
  if (fontsPrepared) return true;
  try {
    const directory = findComposerFontDirectory();
    if (!directory) return false;
    const configFile = join(tmpdir(), 'akwaan-composer-fonts.conf');
    writeFileSync(
      configFile,
      [
        '<?xml version="1.0"?>',
        '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
        '<fontconfig>',
        '  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>',
        `  <dir>${directory}</dir>`,
        `  <cachedir>${join(tmpdir(), 'akwaan-composer-font-cache')}</cachedir>`,
        '</fontconfig>',
      ].join('\n'),
      'utf8',
    );
    process.env.FONTCONFIG_FILE = configFile;
    fontsPrepared = true;
    return true;
  } catch {
    return false;
  }
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
        // Before the library first loads: it reads its font configuration
        // once, and a drawing with Arabic words needs the project's font.
        prepareComposerFonts();
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
