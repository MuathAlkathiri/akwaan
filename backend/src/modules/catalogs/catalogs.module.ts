import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocalImageStorageService } from '../../common/uploads/local-image-storage.service';
import {
  Category,
  CategorySchema,
} from '../categories/schemas/category.schema';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { Catalog, CatalogSchema } from './schemas/catalog.schema';
import { CatalogRepository } from './persistence/catalog.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Catalog.name, schema: CatalogSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
  ],
  providers: [CatalogRepository, CatalogsService, LocalImageStorageService],
  controllers: [CatalogsController],
  exports: [CatalogsService, CatalogRepository],
})
export class CatalogsModule {}
