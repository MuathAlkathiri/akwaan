import { batterySvg } from '../domain/composed-visuals';
import { inspectImageBytes } from '../../../infrastructure/media/image-bytes.inspector';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  COMPOSER_FONT_FILE,
  SvgRasterizationError,
  SvgRasterizer,
  findComposerFontDirectory,
  prepareComposerFonts,
} from './svg-rasterizer';

// The image library ships one native binary per platform. A machine without
// the one for its own platform cannot run this, and says so by skipping.
const nativeAvailable = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('sharp');
    return true;
  } catch {
    return false;
  }
})();

describe('the composer font', () => {
  it('ships beside the backend and is found from the source tree', () => {
    const directory = findComposerFontDirectory();
    expect(directory).not.toBeNull();
    expect(existsSync(join(directory!, COMPOSER_FONT_FILE))).toBe(true);
    // The licence travels with the font.
    expect(existsSync(join(directory!, 'OFL.txt'))).toBe(true);
  });

  it('is found from a build output directory too, and reported missing elsewhere', () => {
    const directory = findComposerFontDirectory()!;
    const backend = join(directory, '..', '..');
    expect(
      findComposerFontDirectory(
        join(backend, 'dist', 'modules', 'content-engine', 'infrastructure'),
      ),
    ).toBe(directory);
    expect(findComposerFontDirectory(tmpdir())).toBeNull();
  });

  it('points fontconfig at it without throwing', () => {
    expect(prepareComposerFonts()).toBe(true);
    expect(process.env.FONTCONFIG_FILE).toMatch(/akwaan-composer-fonts\.conf$/);
  });
});

describe('SvgRasterizer', () => {
  (nativeAvailable ? it : it.skip)(
    'turns a composed drawing into a PNG World Content accepts',
    async () => {
      const png = await new SvgRasterizer().toPng(batterySvg(27, 'horizontal'));
      const image = inspectImageBytes(png, { maxBytes: 5 * 1024 * 1024 });
      expect(image).toMatchObject({
        mimetype: 'image/png',
        width: 1200,
        height: 675,
      });
    },
  );

  (nativeAvailable ? it : it.skip)(
    'reports a drawing it cannot read instead of throwing something else',
    async () => {
      await expect(
        new SvgRasterizer().toPng('not an svg'),
      ).rejects.toBeInstanceOf(SvgRasterizationError);
    },
  );
});
