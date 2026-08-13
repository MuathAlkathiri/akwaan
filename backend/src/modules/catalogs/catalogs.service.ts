import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LocalImageStorageService,
  UploadedImageFile,
} from '../../common/uploads/local-image-storage.service';
import { Category } from '../categories/schemas/category.schema';
import { CreateCatalogDto, UpdateCatalogDto } from './dto/catalog.dto';
import { Catalog, CatalogBanner } from './schemas/catalog.schema';
import { CatalogRepository } from './persistence/catalog.repository';

@Injectable()
export class CatalogsService {
  constructor(
    private readonly catalogs: CatalogRepository,
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    private readonly localImageStorage: LocalImageStorageService,
  ) {}

  async create(
    createCatalogDto: CreateCatalogDto,
    bannerFile?: UploadedImageFile,
  ): Promise<Catalog> {
    const slug = this.normalizeSlug(
      createCatalogDto.slug || createCatalogDto.name.en,
    );
    await this.ensureSlugAvailable(slug);

    const banner = bannerFile ? await this.saveBanner(bannerFile) : undefined;

    try {
      return await this.catalogs.create({
        ...createCatalogDto,
        slug,
        ...(banner ? { banner } : {}),
      });
    } catch (error) {
      await this.localImageStorage.delete(banner);
      this.throwMappedPersistenceError(error);
    }
  }

  async findAll(): Promise<Catalog[]> {
    return this.catalogs.findAll();
  }

  async findById(id: string): Promise<Catalog> {
    const catalog = await this.catalogs.findById(id);

    if (!catalog) {
      throw new NotFoundException(`Catalog with ID "${id}" not found`);
    }

    return catalog;
  }

  async update(
    id: string,
    updateCatalogDto: UpdateCatalogDto,
    bannerFile?: UploadedImageFile,
  ): Promise<Catalog> {
    const existingCatalog = await this.catalogs.findById(id);

    if (!existingCatalog) {
      throw new NotFoundException(`Catalog with ID "${id}" not found`);
    }

    const updatePayload: UpdateCatalogDto & {
      slug?: string;
      banner?: CatalogBanner;
    } = {
      ...updateCatalogDto,
    };

    if (updateCatalogDto.slug) {
      updatePayload.slug = this.normalizeSlug(updateCatalogDto.slug);
      await this.ensureSlugAvailable(updatePayload.slug, id);
    } else if (updateCatalogDto.name?.en) {
      updatePayload.slug = this.normalizeSlug(updateCatalogDto.name.en);
      await this.ensureSlugAvailable(updatePayload.slug, id);
    }

    let nextBanner: CatalogBanner | undefined;

    if (bannerFile) {
      nextBanner = await this.saveBanner(bannerFile);
      updatePayload.banner = nextBanner;
    }

    try {
      const catalog = await this.catalogs.updateById(id, {
        ...updatePayload,
        updatedAt: new Date(),
      });

      if (!catalog) {
        throw new NotFoundException(`Catalog with ID "${id}" not found`);
      }

      if (nextBanner) {
        await this.localImageStorage.delete(existingCatalog.banner);
      }

      return catalog;
    } catch (error) {
      await this.localImageStorage.delete(nextBanner);
      this.throwMappedPersistenceError(error);
    }
  }

  async delete(id: string): Promise<void> {
    const catalog = await this.catalogs.findById(id);

    if (!catalog) {
      throw new NotFoundException(`Catalog with ID "${id}" not found`);
    }

    const linkedCategory = await this.categoryModel
      .exists({ catalogId: id })
      .exec();

    if (linkedCategory) {
      throw new ConflictException(
        'Cannot delete catalog because it has linked categories.',
      );
    }

    await this.catalogs.deleteById(id);
    await this.localImageStorage.delete(catalog.banner);
  }

  private async saveBanner(file: UploadedImageFile): Promise<CatalogBanner> {
    return this.localImageStorage.save(file, {
      directory: ['catalogs', 'banners'],
      filenamePrefix: 'catalog-banner',
    });
  }

  private normalizeSlug(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || `catalog-${Date.now()}`;
  }

  private async ensureSlugAvailable(
    slug: string,
    excludedId?: string,
  ): Promise<void> {
    const existingCatalog = await this.catalogs.findBySlugExcludingId(
      slug,
      excludedId,
    );

    if (existingCatalog) {
      throw new ConflictException('Catalog slug already exists');
    }
  }

  private throwMappedPersistenceError(error: unknown): never {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException({
        code: 'DUPLICATE_CATALOG_SLUG',
        message: 'Catalog slug already exists',
      });
    }
    throw error;
  }
}
