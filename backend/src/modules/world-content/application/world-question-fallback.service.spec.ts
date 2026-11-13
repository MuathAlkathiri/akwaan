import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { UploadedImageFile } from '../../../common/uploads/local-image-storage.service';
import type { ContentAssetRef } from '../domain/world-content.types';
import { WorldContentAssetMutator } from './world-content-asset.mutator';
import { WorldService } from './world.service';

/**
 * The World question fallback artwork (roadmap §30.22 Track A).
 *
 * Two things are under test: the asset lifecycle — a replaced or removed file is
 * discarded, and a failed write leaves nothing behind — and the boundary, that
 * setting the artwork writes this field and nothing else about the World.
 *
 * The real `WorldContentAssetMutator` runs against a fake storage, so the
 * ordering it owns is proven here rather than mocked away.
 */
describe('WorldService question fallback', () => {
  const WORLD = new Types.ObjectId().toHexString();

  const upload = (name = 'fallback.jpg'): UploadedImageFile =>
    ({
      originalname: name,
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('bytes'),
    }) as UploadedImageFile;

  const build = (
    options: {
      existing?: Partial<{
        questionFallback: ContentAssetRef | null;
        banner: ContentAssetRef;
      }>;
      updateFails?: boolean;
      updateMissing?: boolean;
    } = {},
  ) => {
    const world = {
      _id: WORLD,
      name: 'عالم المشاهير',
      slug: 'celebrities',
      status: 'active',
      sortOrder: 0,
      ...options.existing,
    };
    const saved: ContentAssetRef = {
      url: '/world-content/worlds/world-new.jpg',
      path: 'world-content/worlds/world-new.jpg',
    };
    const storage = {
      save: jest.fn().mockResolvedValue(saved),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const updateById = jest.fn(
      async (_id: string, patch: Record<string, unknown>) => {
        if (options.updateFails) throw new Error('WRITE_FAILED');
        if (options.updateMissing) return null;
        return { ...world, ...patch };
      },
    );
    const worlds = {
      findById: jest.fn().mockResolvedValue(world),
      updateById,
    };
    const service = new WorldService(
      worlds as never,
      { countByWorld: jest.fn().mockResolvedValue(0) } as never,
      { countByWorld: jest.fn().mockResolvedValue(0) } as never,
      { countByWorld: jest.fn().mockResolvedValue(0) } as never,
      { evaluateWorld: jest.fn().mockResolvedValue({ ready: true }) } as never,
      {} as never,
      new WorldContentAssetMutator(storage as never),
      { assertUnreferenced: jest.fn() } as never,
    );
    return { service, worlds, storage, updateById, saved };
  };

  it('stores the uploaded artwork and reports it on the World', async () => {
    const { service, storage, updateById, saved } = build();

    const summary = await service.setQuestionFallback(WORLD, upload());

    expect(storage.save).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'fallback.jpg' }),
      { directory: ['world-content', 'worlds'], filenamePrefix: 'world' },
    );
    // Only this field is written: the banner, status and board are untouched.
    expect(updateById).toHaveBeenCalledWith(WORLD, {
      questionFallback: saved,
    });
    expect(summary.questionFallback).toEqual(saved);
  });

  it('discards the artwork it replaced, and only after the write succeeded', async () => {
    const previous: ContentAssetRef = {
      url: '/world-content/worlds/world-old.jpg',
      path: 'world-content/worlds/world-old.jpg',
    };
    const { service, storage } = build({
      existing: { questionFallback: previous },
    });

    await service.setQuestionFallback(WORLD, upload());

    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: previous.path }),
    );
  });

  it('keeps the old artwork and deletes the new file when the write fails', async () => {
    const previous: ContentAssetRef = {
      url: '/world-content/worlds/world-old.jpg',
      path: 'world-content/worlds/world-old.jpg',
    };
    const { service, storage, saved } = build({
      existing: { questionFallback: previous },
      updateFails: true,
    });

    await expect(service.setQuestionFallback(WORLD, upload())).rejects.toThrow(
      'WRITE_FAILED',
    );

    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: saved.path }),
    );
  });

  it('refuses a World that does not exist', async () => {
    const { service, worlds } = build();
    worlds.findById.mockResolvedValue(null);

    await expect(service.setQuestionFallback(WORLD, upload())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('clears the artwork and discards its file', async () => {
    const previous: ContentAssetRef = {
      url: '/world-content/worlds/world-old.jpg',
      path: 'world-content/worlds/world-old.jpg',
    };
    const { service, storage, updateById } = build({
      existing: { questionFallback: previous },
    });

    const summary = await service.clearQuestionFallback(WORLD);

    expect(updateById).toHaveBeenCalledWith(WORLD, { questionFallback: null });
    expect(storage.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: previous.path }),
    );
    expect(summary.questionFallback).toBeNull();
  });

  it('clears a World that never had artwork without touching storage', async () => {
    const { service, storage } = build();

    await service.clearQuestionFallback(WORLD);

    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('discards the artwork when the World itself is deleted', async () => {
    const banner: ContentAssetRef = {
      url: '/world-content/worlds/banner.jpg',
      path: 'world-content/worlds/banner.jpg',
    };
    const fallback: ContentAssetRef = {
      url: '/world-content/worlds/fallback.jpg',
      path: 'world-content/worlds/fallback.jpg',
    };
    const { service, storage, worlds } = build({
      existing: { banner, questionFallback: fallback },
    });
    (worlds as unknown as { deleteById: jest.Mock }).deleteById = jest
      .fn()
      .mockResolvedValue({});

    await service.remove(WORLD);

    expect(storage.delete.mock.calls.map(([asset]) => asset.path)).toEqual([
      banner.path,
      fallback.path,
    ]);
  });
});
