import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  Category,
  CategoryBanner,
  CategoryGameplayMode,
} from './schemas/category.schema';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/create-category.dto';
import { CategoryBannerStorageService } from './category-banner-storage.service';
import { CatalogRepository } from '../catalogs/persistence/catalog.repository';
import { CategoryRepository } from './persistence/category.repository';

interface UploadedBannerFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly catalogs: CatalogRepository,
    private readonly bannerStorage: CategoryBannerStorageService,
  ) {}

  async create(
    createCategoryDto: CreateCategoryDto,
    bannerFile?: UploadedBannerFile,
  ): Promise<Category> {
    // Check if slug already exists
    const existingCategory = await this.categories.findBySlugExcludingId(
      createCategoryDto.slug,
    );

    if (existingCategory) {
      throw new ConflictException('Category slug already exists');
    }

    const catalogId = await this.resolveCatalogId(
      createCategoryDto.catalogId,
      true,
    );
    const banner = bannerFile
      ? await this.bannerStorage.save(bannerFile)
      : undefined;

    try {
      const category = await this.categories.create({
        ...createCategoryDto,
        catalogId,
        ...(banner ? { banner } : {}),
      });
      return category.save();
    } catch (error) {
      await this.bannerStorage.delete(banner);
      this.throwMappedPersistenceError(error);
    }
  }

  async findAll(filters: { catalogId?: string } = {}): Promise<Category[]> {
    if (filters.catalogId) {
      if (!Types.ObjectId.isValid(filters.catalogId)) {
        throw new NotFoundException(
          `Catalog with ID "${filters.catalogId}" not found`,
        );
      }
    }
    return this.categories.findAll(filters.catalogId);
  }

  async findById(id: string): Promise<Category> {
    const category = await this.categories.findById(id);
    if (!category) {
      throw new NotFoundException(`Category with ID "${id}" not found`);
    }
    return category;
  }

  findByIdForGameSelection(id: string): Promise<Category> {
    return this.findById(id);
  }

  findByIdForQuestionAuthoring(id: string): Promise<Category> {
    return this.findById(id);
  }

  findByIdForGeneration(id: string): Promise<Category> {
    return this.findById(id);
  }

  findActiveMusicCategory(configuredSlug: string) {
    return this.categories.findActiveMusicCategory(configuredSlug);
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    bannerFile?: UploadedBannerFile,
  ): Promise<Category> {
    const existingCategory = await this.categories.findById(id, false);

    if (!existingCategory) {
      throw new NotFoundException(`Category with ID "${id}" not found`);
    }

    // If slug is being updated, check for uniqueness
    if (updateCategoryDto.slug) {
      const existingCategory = await this.categories.findBySlugExcludingId(
        updateCategoryDto.slug,
        id,
      );

      if (existingCategory) {
        throw new ConflictException('Category slug already exists');
      }
    }

    const catalogId =
      updateCategoryDto.catalogId !== undefined
        ? await this.resolveCatalogId(updateCategoryDto.catalogId)
        : undefined;
    const categoryPayload = { ...updateCategoryDto };
    delete categoryPayload.catalogId;
    delete categoryPayload.confirmGameplayModeChange;
    const previousMode =
      existingCategory.gameplayMode ?? CategoryGameplayMode.STANDARD;
    const nextMode = updateCategoryDto.gameplayMode;
    if (
      nextMode &&
      nextMode !== previousMode &&
      updateCategoryDto.confirmGameplayModeChange !== true
    ) {
      throw new BadRequestException({
        code: 'CATEGORY_GAMEPLAY_MODE_CHANGE_CONFIRMATION_REQUIRED',
        message:
          'Changing gameplay mode can make existing questions ineligible. Explicit confirmation is required.',
        categoryId: id,
        previousGameplayMode: previousMode,
        nextGameplayMode: nextMode,
      });
    }
    let nextBanner: CategoryBanner | undefined;

    if (bannerFile) {
      nextBanner = await this.bannerStorage.save(bannerFile);
    }

    try {
      const category = await this.categories.updateById(id, {
        ...categoryPayload,
        ...(catalogId !== undefined ? { catalogId } : {}),
        ...(nextBanner ? { banner: nextBanner } : {}),
        updatedAt: new Date(),
      });

      if (!category) {
        throw new NotFoundException(`Category with ID "${id}" not found`);
      }

      if (nextBanner) {
        await this.bannerStorage.delete(existingCategory.banner);
      }

      return category;
    } catch (error) {
      await this.bannerStorage.delete(nextBanner);
      this.throwMappedPersistenceError(error);
    }
  }

  async delete(id: string): Promise<void> {
    const result = await this.categories.deleteById(id);
    if (!result) {
      throw new NotFoundException(`Category with ID "${id}" not found`);
    }

    await this.bannerStorage.delete(result.banner);
  }

  private async resolveCatalogId(
    catalogId?: string | null,
    required = false,
  ): Promise<Types.ObjectId | null | undefined> {
    if (catalogId === undefined) {
      if (required) {
        throw new NotFoundException('Catalog ID is required');
      }
      return undefined;
    }

    if (catalogId === null || catalogId === '') {
      if (required) {
        throw new NotFoundException('Catalog ID is required');
      }
      return null;
    }

    if (!Types.ObjectId.isValid(catalogId)) {
      throw new NotFoundException(`Catalog with ID "${catalogId}" not found`);
    }

    const catalog = await this.catalogs.findReferenceById(catalogId);

    if (!catalog) {
      throw new NotFoundException(`Catalog with ID "${catalogId}" not found`);
    }

    return catalog._id as Types.ObjectId;
  }

  private throwMappedPersistenceError(error: unknown): never {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException({
        code: 'DUPLICATE_CATEGORY_SLUG',
        message: 'Category slug already exists',
      });
    }
    throw error;
  }
}
