import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CategoryAiConfigDto,
  CategoryGameplayConfigDto,
} from './create-category.dto';
import { CatalogLocalizedTextResponseDto } from '../../catalogs/dto/catalog-response.dto';
import {
  CategoryAudioPolicy,
  CategoryGameplayMode,
} from '../schemas/category.schema';

export class CategoryCatalogResponseDto {
  @ApiProperty() _id!: string;
  @ApiProperty({ type: CatalogLocalizedTextResponseDto })
  name!: CatalogLocalizedTextResponseDto;
  @ApiProperty() slug!: string;
}

export class CategoryBannerResponseDto {
  @ApiProperty() filename!: string;
  @ApiProperty() url!: string;
  @ApiProperty() mimetype!: string;
  @ApiProperty() size!: number;
}

export class CategoryResponseDto {
  @ApiProperty() _id!: string;
  @ApiPropertyOptional() id?: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  catalogId?: string | null;
  @ApiPropertyOptional({ type: CategoryCatalogResponseDto, nullable: true })
  catalog?: CategoryCatalogResponseDto | null;
  @ApiPropertyOptional({ type: CategoryBannerResponseDto })
  banner?: CategoryBannerResponseDto;
  @ApiPropertyOptional({ type: CategoryAiConfigDto })
  aiConfig?: CategoryAiConfigDto;
  @ApiPropertyOptional({ type: CategoryGameplayConfigDto })
  gameplayConfig?: CategoryGameplayConfigDto;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({
    enum: CategoryAudioPolicy,
    enumName: 'CategoryAudioPolicy',
    default: CategoryAudioPolicy.OPTIONAL,
  })
  audioPolicy!: CategoryAudioPolicy;
  @ApiProperty({
    enum: CategoryGameplayMode,
    enumName: 'CategoryGameplayMode',
    default: CategoryGameplayMode.STANDARD,
  })
  gameplayMode!: CategoryGameplayMode;
  @ApiProperty() sortOrder!: number;
  @ApiPropertyOptional() createdAt?: string;
  @ApiPropertyOptional() updatedAt?: string;
}

export class CategoryListResponseDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: [CategoryResponseDto] }) data!: CategoryResponseDto[];
}

export class CategoryDetailResponseDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: CategoryResponseDto }) data!: CategoryResponseDto;
}

export class CategoryMutationResponseDto extends CategoryDetailResponseDto {
  @ApiProperty() message!: string;
}
