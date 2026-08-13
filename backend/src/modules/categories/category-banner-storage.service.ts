import { Injectable } from '@nestjs/common';
import {
  LocalImageStorageService,
  UploadedImageFile,
} from '../../common/uploads/local-image-storage.service';
import { CategoryBanner } from './schemas/category.schema';

@Injectable()
export class CategoryBannerStorageService {
  constructor(private readonly localImageStorage: LocalImageStorageService) {}

  async save(file: UploadedImageFile): Promise<CategoryBanner> {
    return this.localImageStorage.save(file, {
      directory: ['categories', 'banners'],
      filenamePrefix: 'category-banner',
    });
  }

  async delete(banner?: Pick<CategoryBanner, 'path'>): Promise<void> {
    await this.localImageStorage.delete(banner);
  }
}
