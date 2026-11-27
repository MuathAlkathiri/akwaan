import {
  DIFFERENCE_SIDE,
  keepOneDifference,
  sideBySide,
} from './one-difference';

// The image library ships one native binary per platform. A machine without
// the one for its own platform cannot run this, and says so by skipping.
const native = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    return require('sharp') as typeof import('sharp');
  } catch {
    return undefined;
  }
})();
const sharp = native!;
const describeNative = native ? describe : describe.skip;

const S = DIFFERENCE_SIDE;
const picture = (body: string) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="#BFE6FA"/>${body}</svg>`,
    ),
  )
    .png()
    .toBuffer();
const pixel = async (png: Buffer, x: number, y: number) => {
  const raw = await sharp(png).removeAlpha().raw().toBuffer();
  const i = (y * S + x) * 3;
  return [raw[i], raw[i + 1], raw[i + 2]];
};

describeNative('keepOneDifference', () => {
  it('keeps the one thing taken out and throws away drift elsewhere', async () => {
    const original = await picture(
      '<rect x="100" y="100" width="120" height="120" fill="#D8493F"/><rect x="500" y="500" width="60" height="60" fill="#1B1F3B"/>',
    );
    // The red square is gone; the model also nudged the dark square.
    const edited = await picture(
      '<rect x="520" y="520" width="60" height="60" fill="#1B1F3B"/>',
    );
    const kept = await keepOneDifference(original, edited);
    expect(kept.area).toBeGreaterThan(0.02);
    expect(kept.strayArea).toBeGreaterThan(0);
    expect(kept.box.left).toBeLessThanOrEqual(100);
    expect(kept.box.right).toBeGreaterThanOrEqual(220);
    // Where the red square was: the edit (sky).
    const [r, , b] = await pixel(kept.edited, 160, 160);
    expect(b).toBeGreaterThan(r);
    // Where the drift was: the original, untouched.
    expect(await pixel(kept.edited, 505, 505)).toEqual(
      await pixel(kept.original, 505, 505),
    );
    expect(await pixel(kept.edited, 575, 575)).toEqual(
      await pixel(kept.original, 575, 575),
    );
  });

  it('finds nothing when nothing changed', async () => {
    const same = await picture(
      '<circle cx="300" cy="300" r="80" fill="#E8B33A"/>',
    );
    const kept = await keepOneDifference(same, same);
    expect(kept.area).toBe(0);
    expect(kept.strayArea).toBe(0);
  });

  it('lays the two pictures side by side at 1200 × 675', async () => {
    const one = await picture('');
    const meta = await sharp(await sideBySide(one, one)).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 675]);
  });
});
