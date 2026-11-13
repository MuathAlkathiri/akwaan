import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  JPEG_BASELINE_3X2,
  PNG_3X2,
} from '../../infrastructure/media/testing/image-fixtures';
import {
  isContentAddressedImagePath,
  LocalImageStorageService,
  SaveContentAddressedImageOptions,
} from './local-image-storage.service';
import { MediaObjectStorage } from './media-object-storage';

const options: SaveContentAddressedImageOptions = {
  directory: ['test-media', 'items'],
  filenamePrefix: 'engine',
  extension: '.png',
  mimetype: 'image/png',
  requireObjectStorage: true,
};

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('LocalImageStorageService.saveContentAddressed', () => {
  let root: string;
  let mirror: jest.Mocked<MediaObjectStorage> & { enabled: boolean };
  let storage: LocalImageStorageService;

  const directory = () => join(root, 'test-media', 'items');

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'akwaan-ca-'));
    mirror = {
      enabled: true,
      put: jest.fn<Promise<void>, [string, Buffer, string?]>(
        async () => undefined,
      ),
      remove: jest.fn<Promise<void>, [string]>(async () => undefined),
      publicUrl: jest.fn<string | undefined, [string]>(() => undefined),
    };
    storage = new LocalImageStorageService(
      new ConfigService({ UPLOADS_DIR: root }),
      mirror,
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('names the file by its SHA-256 and mirrors it under the same key', async () => {
    const stored = await storage.saveContentAddressed(PNG_3X2, options);
    const hash = sha(PNG_3X2);
    expect(stored).toMatchObject({
      sha256: hash,
      filename: `engine-${hash}.png`,
      objectKey: `test-media/items/engine-${hash}.png`,
      url: `/uploads/test-media/items/engine-${hash}.png`,
      mimetype: 'image/png',
      size: PNG_3X2.length,
      reusedLocalFile: false,
      mirrored: true,
    });
    expect(mirror.put).toHaveBeenCalledWith(
      stored.objectKey,
      PNG_3X2,
      'image/png',
    );
    expect(
      (await readFile(join(directory(), stored.filename))).equals(PNG_3X2),
    ).toBe(true);
  });

  it('deduplicates identical bytes and re-puts idempotently', async () => {
    const first = await storage.saveContentAddressed(PNG_3X2, options);
    const second = await storage.saveContentAddressed(
      Buffer.from(PNG_3X2),
      options,
    );
    expect(second.url).toBe(first.url);
    expect(second.reusedLocalFile).toBe(true);
    expect(mirror.put).toHaveBeenCalledTimes(2);
    expect(await readdir(directory())).toEqual([first.filename]);
  });

  it('gives different bytes different identities', async () => {
    const png = await storage.saveContentAddressed(PNG_3X2, options);
    const jpeg = await storage.saveContentAddressed(JPEG_BASELINE_3X2, {
      ...options,
      extension: '.jpg',
      mimetype: 'image/jpeg',
    });
    expect(jpeg.url).not.toBe(png.url);
  });

  it('never reports success when the R2 mirror write fails, and a retry recovers', async () => {
    mirror.put.mockRejectedValueOnce(new Error('R2 503'));
    await expect(
      storage.saveContentAddressed(PNG_3X2, options),
    ).rejects.toMatchObject({ code: 'STORAGE_MIRROR_WRITE_FAILED' });

    const retried = await storage.saveContentAddressed(PNG_3X2, options);
    expect(retried.reusedLocalFile).toBe(true);
    expect(retried.mirrored).toBe(true);
    expect(mirror.put).toHaveBeenCalledTimes(2);
  });

  it('refuses a non-durable store when object storage is required but off', async () => {
    mirror.enabled = false;
    await expect(
      storage.saveContentAddressed(PNG_3X2, options),
    ).rejects.toMatchObject({ code: 'STORAGE_NOT_DURABLE' });
    await expect(readdir(directory())).rejects.toThrow();
    expect(mirror.put).not.toHaveBeenCalled();
  });

  it('stores locally only when the caller explicitly allows it', async () => {
    mirror.enabled = false;
    const stored = await storage.saveContentAddressed(PNG_3X2, {
      ...options,
      requireObjectStorage: false,
    });
    expect(stored.mirrored).toBe(false);
    expect(mirror.put).not.toHaveBeenCalled();
  });

  it('replaces a corrupt leftover under the final name and leaves no temp files', async () => {
    const hash = sha(PNG_3X2);
    await mkdir(directory(), { recursive: true });
    await writeFile(
      join(directory(), `engine-${hash}.png`),
      Buffer.from('partial'),
    );
    const stored = await storage.saveContentAddressed(PNG_3X2, options);
    expect(stored.reusedLocalFile).toBe(false);
    expect(
      (await readFile(join(directory(), stored.filename))).equals(PNG_3X2),
    ).toBe(true);
    expect(
      (await readdir(directory())).filter((name) => name.endsWith('.tmp')),
    ).toEqual([]);
  });

  it.each([
    [{ filenamePrefix: '../escape' }],
    [{ filenamePrefix: 'Engine' }],
    // A well-formed slug outside the registered prefixes would create a shared
    // file the delete guard does not protect, so it is refused too.
    [{ filenamePrefix: 'photo' }],
    [{ directory: ['..', 'etc'] }],
    [{ directory: [] }],
  ])('refuses unsafe naming %#', async (override) => {
    await expect(
      storage.saveContentAddressed(PNG_3X2, {
        ...options,
        ...override,
      } as SaveContentAddressedImageOptions),
    ).rejects.toMatchObject({ code: 'STORAGE_INVALID_REQUEST' });
  });

  it('refuses empty bytes', async () => {
    await expect(
      storage.saveContentAddressed(Buffer.alloc(0), options),
    ).rejects.toMatchObject({ code: 'STORAGE_INVALID_REQUEST' });
  });

  describe('shared-file protection', () => {
    it('never deletes a content-addressed file, locally or in R2', async () => {
      const stored = await storage.saveContentAddressed(PNG_3X2, options);
      await storage.delete({ path: stored.path });
      expect(await readdir(directory())).toEqual([stored.filename]);
      expect(mirror.remove).not.toHaveBeenCalled();
    });

    it('still deletes legacy timestamped uploads', async () => {
      const legacy = await storage.save(
        {
          originalname: 'photo.png',
          mimetype: 'image/png',
          size: PNG_3X2.length,
          buffer: PNG_3X2,
        },
        { directory: ['test-media', 'items'], filenamePrefix: 'content-item' },
      );
      expect(legacy.filename).toMatch(/^content-item-\d+-[0-9a-f]{12}\.png$/);
      expect(isContentAddressedImagePath(legacy.path)).toBe(false);
      await storage.delete({ path: legacy.path });
      expect(await readdir(directory())).toEqual([]);
      expect(mirror.remove).toHaveBeenCalledWith(
        `test-media/items/${legacy.filename}`,
      );
    });

    it.each([
      ['uploads/test-media/items/engine-' + 'a'.repeat(64) + '.webp', true],
      ['/uploads/x/engine-' + 'a'.repeat(64) + '.jpg', true],
      [
        'uploads/questions/images/question-1731300000000-abcdef012345.png',
        false,
      ],
      [
        'question-assets/images/Pikachu-1b4e28ba-2fa1-11d2-883f-0016d3cca427.jpg',
        false,
      ],
      ['uploads/x/engine-' + 'a'.repeat(63) + '.jpg', false],
      // Shapes present in local uploads today (8 and 12 hex suffixes).
      ['uploads/question-assets/images/goku-super-saiyan-0a1b2c3d.webp', false],
      ['uploads/question-assets/images/vegeta-0a1b2c3d4e5f.webp', false],
      // A sha-named file from anything other than content-addressed storage.
      ['uploads/x/photo-' + 'a'.repeat(64) + '.png', false],
      ['uploads/x/myengine-' + 'a'.repeat(64) + '.png', false],
      ['uploads/x/engine-' + 'A'.repeat(64) + '.png', false],
      ['uploads/x/engine-' + 'a'.repeat(64) + '.png.bak', false],
      ['uploads/x/engine-' + 'a'.repeat(64) + '.gif', false],
      ['uploads/x/engine-' + 'a'.repeat(65) + '.png', false],
    ])('classifies %s', (path, expected) => {
      expect(isContentAddressedImagePath(path)).toBe(expected);
    });

    it('still deletes a sha-named file that content-addressed storage did not issue', async () => {
      const name = `photo-${'b'.repeat(64)}.png`;
      await mkdir(directory(), { recursive: true });
      await writeFile(join(directory(), name), PNG_3X2);
      await storage.delete({ path: `uploads/test-media/items/${name}` });
      expect(await readdir(directory())).toEqual([]);
      expect(mirror.remove).toHaveBeenCalledWith(`test-media/items/${name}`);
    });
  });
});
