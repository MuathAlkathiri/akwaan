import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CatalogLocalizedTextResponseDto {
  @ApiProperty() ar!: string;
  @ApiProperty() en!: string;
}

export class CatalogBannerResponseDto {
  @ApiProperty() filename!: string;
  @ApiProperty() url!: string;
  @ApiProperty() mimetype!: string;
  @ApiProperty() size!: number;
}

export class CatalogResponseDto {
  @ApiProperty() _id!: string;
  @ApiProperty({ type: CatalogLocalizedTextResponseDto })
  name!: CatalogLocalizedTextResponseDto;
  @ApiPropertyOptional({ type: CatalogLocalizedTextResponseDto })
  description?: CatalogLocalizedTextResponseDto;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ type: CatalogBannerResponseDto })
  banner?: CatalogBannerResponseDto;
  @ApiPropertyOptional() icon?: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiPropertyOptional() createdAt?: string;
  @ApiPropertyOptional() updatedAt?: string;
}

export class CatalogListResponseDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: [CatalogResponseDto] }) data!: CatalogResponseDto[];
}

export class CatalogDetailResponseDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: CatalogResponseDto }) data!: CatalogResponseDto;
}

export class CatalogMutationResponseDto extends CatalogDetailResponseDto {
  @ApiProperty() message!: string;
}
