import { batterySvg } from '../domain/composed-visuals';
import { inspectImageBytes } from '../../../infrastructure/media/image-bytes.inspector';
import { SvgRasterizationError, SvgRasterizer } from './svg-rasterizer';

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
