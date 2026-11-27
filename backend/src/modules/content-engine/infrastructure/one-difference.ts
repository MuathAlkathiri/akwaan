type Sharp = typeof import('sharp');
let loaded: Sharp | undefined;
/** Loaded on first use, as the rasteriser does: a host without it loses only this. */
async function lib(): Promise<Sharp> {
  if (!loaded) {
    const module = (await import('sharp')) as unknown as {
      default?: Sharp;
    } & Sharp;
    loaded = module.default ?? module;
  }
  return loaded;
}

/**
 * Keeps one difference between two pictures and no other.
 *
 * An image model asked to take one thing out of a picture redraws the whole
 * picture, and small things elsewhere drift: a curl of hair, a leaf. This
 * finds where the two pictures differ, keeps only the largest such region,
 * and pastes the edited picture into the original there alone. Everything
 * outside that region is the original, pixel for pixel.
 */
export const DIFFERENCE_SIDE = 768;
const CELL = 8;
/** A pixel has changed when a colour channel moved this much. */
const PIXEL_THRESHOLD = 45;
/** A cell has changed when this share of its pixels did. */
const CELL_SHARE = 0.25;

export interface DifferenceResult {
  original: Buffer;
  edited: Buffer;
  /** Share of the picture the kept difference covers, 0–1. */
  area: number;
  /** Share of the picture that changed elsewhere and was thrown away. */
  strayArea: number;
  box: { left: number; top: number; right: number; bottom: number };
}

async function rawSquare(bytes: Buffer): Promise<Buffer> {
  const sharp = await lib();
  return sharp(bytes)
    .resize(DIFFERENCE_SIDE, DIFFERENCE_SIDE, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer();
}

export async function keepOneDifference(
  originalBytes: Buffer,
  editedBytes: Buffer,
): Promise<DifferenceResult> {
  const sharp = await lib();
  const S = DIFFERENCE_SIDE;
  const a = await rawSquare(originalBytes);
  const b = await rawSquare(editedBytes);
  const g = S / CELL;
  const changed = new Uint8Array(g * g);
  for (let gy = 0; gy < g; gy += 1)
    for (let gx = 0; gx < g; gx += 1) {
      let count = 0;
      for (let y = 0; y < CELL; y += 1)
        for (let x = 0; x < CELL; x += 1) {
          const i = ((gy * CELL + y) * S + gx * CELL + x) * 3;
          if (
            Math.max(
              Math.abs(a[i] - b[i]),
              Math.abs(a[i + 1] - b[i + 1]),
              Math.abs(a[i + 2] - b[i + 2]),
            ) > PIXEL_THRESHOLD
          )
            count += 1;
        }
      changed[gy * g + gx] = count > CELL * CELL * CELL_SHARE ? 1 : 0;
    }

  // Regions, letting a two-cell gap join one thing's parts.
  const owner = new Int32Array(g * g).fill(-1);
  const regions: number[][] = [];
  for (let start = 0; start < g * g; start += 1) {
    if (!changed[start] || owner[start] >= 0) continue;
    const queue = [start];
    owner[start] = regions.length;
    const cells: number[] = [];
    while (queue.length) {
      const cell = queue.pop()!;
      cells.push(cell);
      const cx = cell % g;
      const cy = Math.floor(cell / g);
      for (let dy = -2; dy <= 2; dy += 1)
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= g || ny >= g) continue;
          const next = ny * g + nx;
          if (changed[next] && owner[next] < 0) {
            owner[next] = regions.length;
            queue.push(next);
          }
        }
    }
    regions.push(cells);
  }
  regions.sort((p, q) => q.length - p.length);
  const kept = regions[0] ?? [];
  const total = changed.reduce((sum, cell) => sum + cell, 0);

  const mask = new Uint8Array(g * g);
  let minX = g;
  let minY = g;
  let maxX = -1;
  let maxY = -1;
  for (const cell of kept) {
    const cx = cell % g;
    const cy = Math.floor(cell / g);
    minX = Math.min(minX, cx);
    maxX = Math.max(maxX, cx);
    minY = Math.min(minY, cy);
    maxY = Math.max(maxY, cy);
    for (let dy = -2; dy <= 2; dy += 1)
      for (let dx = -2; dx <= 2; dx += 1) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < g && ny < g) mask[ny * g + nx] = 255;
      }
  }
  const alpha = await sharp(Buffer.from(mask), {
    raw: { width: g, height: g, channels: 1 },
  })
    .resize(S, S, { kernel: 'linear' })
    .blur(4)
    .extractChannel(0)
    .raw()
    .toBuffer();
  const merged = Buffer.alloc(S * S * 3);
  for (let p = 0; p < S * S; p += 1) {
    const t = alpha[p] / 255;
    for (let k = 0; k < 3; k += 1)
      merged[p * 3 + k] = Math.round(a[p * 3 + k] * (1 - t) + b[p * 3 + k] * t);
  }
  const png = (raw: Buffer) =>
    sharp(raw, { raw: { width: S, height: S, channels: 3 } })
      .png()
      .toBuffer();
  return {
    original: await png(a),
    edited: await png(merged),
    area: kept.length / (g * g),
    strayArea: (total - kept.length) / (g * g),
    box:
      maxX < 0
        ? { left: 0, top: 0, right: 0, bottom: 0 }
        : {
            left: minX * CELL,
            top: minY * CELL,
            right: (maxX + 1) * CELL,
            bottom: (maxY + 1) * CELL,
          },
  };
}

/** The two pictures side by side, as القنبلة shows them: 1200 × 675. */
export async function sideBySide(
  first: Buffer,
  second: Buffer,
): Promise<Buffer> {
  const sharp = await lib();
  const side = 560;
  const top = Math.round((675 - side) / 2);
  const lefts = [26, 1200 - 26 - side];
  const rounded = (bytes: Buffer) =>
    sharp(bytes)
      .resize(side, side)
      .composite([
        {
          input: Buffer.from(
            `<svg width="${side}" height="${side}"><rect width="${side}" height="${side}" rx="24" fill="#fff"/></svg>`,
          ),
          blend: 'dest-in',
        },
      ])
      .png()
      .toBuffer();
  const border = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675">${lefts
      .map(
        (left) =>
          `<rect x="${left + 3}" y="${top + 3}" width="${side - 6}" height="${side - 6}" rx="22" fill="none" stroke="#1B1F3B" stroke-width="7"/>`,
      )
      .join('')}</svg>`,
  );
  return sharp({
    create: { width: 1200, height: 675, channels: 3, background: '#FFFFFF' },
  })
    .composite([
      { input: await rounded(first), left: lefts[0], top },
      { input: await rounded(second), left: lefts[1], top },
      { input: border, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}
