import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from './schemas/category.schema';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { CategoryBannerStorageService } from './category-banner-storage.service';
import { LocalImageStorageService } from '../../common/uploads/local-image-storage.service';
import { CatalogsModule } from '../catalogs/catalogs.module';
import { CategoryRepository } from './persistence/category.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
    ]),
    CatalogsModule,
  ],
  providers: [
    CategoryRepository,
    CategoriesService,
    CategoryBannerStorageService,
    LocalImageStorageService,
  ],
  controllers: [CategoriesController],
  exports: [CategoriesService],
})
export class CategoriesModule {}
