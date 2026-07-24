import { Types } from 'mongoose';
import { CatalogRepository } from '../catalogs/persistence/catalog.repository';
import { CategoryBannerStorageService } from './category-banner-storage.service';
import { CategoriesService } from './categories.service';
import { CategoryRepository } from './persistence/category.repository';
import { CategoryGameplayMode } from './schemas/category.schema';

describe('CategoriesService', () => {
  const catalogId = new Types.ObjectId();
  const categories = {
    findBySlugExcludingId: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
    updateById: jest.fn(),
    create: jest.fn(),
  } as unknown as CategoryRepository;
  const catalogs = {
    findReferenceById: jest.fn().mockResolvedValue({ _id: catalogId }),
  } as unknown as CatalogRepository;
  const banners = {
    save: jest.fn(),
    delete: jest.fn(),
  } as unknown as CategoryBannerStorageService;
  const service = new CategoriesService(categories, catalogs, banners);

  beforeEach(() => jest.clearAllMocks());

  it('validates the catalog relationship and preserves gameplay configuration', async () => {
    const created = { _id: new Types.ObjectId(), save: jest.fn() };
    created.save.mockResolvedValue(created);
    (categories.create as jest.Mock).mockResolvedValue(created);
    await service.create({
      name: 'World Cup',
      slug: 'world-cup',
      catalogId: catalogId.toString(),
      gameplayConfig: { maxAudioDuration: 6 },
    });
    expect(catalogs.findReferenceById).toHaveBeenCalledWith(
      catalogId.toString(),
    );
    expect(categories.create).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogId,
        gameplayConfig: { maxAudioDuration: 6 },
      }),
    );
  });

  it('maps duplicate-key races to a stable category error', async () => {
    (categories.create as jest.Mock).mockRejectedValue({ code: 11000 });
    await expect(
      service.create({
        name: 'World Cup',
        slug: 'world-cup',
        catalogId: catalogId.toString(),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DUPLICATE_CATEGORY_SLUG' }),
    });
  });

  it('requires explicit confirmation before changing gameplay mode', async () => {
    (categories.findById as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId(),
      gameplayMode: CategoryGameplayMode.STANDARD,
    });
    await expect(
      service.update('category-id', {
        gameplayMode: CategoryGameplayMode.TOP_10,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CATEGORY_GAMEPLAY_MODE_CHANGE_CONFIRMATION_REQUIRED',
      }),
    });
    expect(categories.updateById).not.toHaveBeenCalled();
  });

  it('persists a confirmed gameplay mode change without persisting the confirmation flag', async () => {
    const updated = {
      _id: new Types.ObjectId(),
      gameplayMode: CategoryGameplayMode.TOP_10,
    };
    (categories.findById as jest.Mock).mockResolvedValue({
      _id: updated._id,
      gameplayMode: CategoryGameplayMode.STANDARD,
    });
    (categories.updateById as jest.Mock).mockResolvedValue(updated);
    await service.update('category-id', {
      gameplayMode: CategoryGameplayMode.TOP_10,
      confirmGameplayModeChange: true,
    });
    expect(categories.updateById).toHaveBeenCalledWith(
      'category-id',
      expect.not.objectContaining({
        confirmGameplayModeChange: expect.anything(),
      }),
    );
  });
});
