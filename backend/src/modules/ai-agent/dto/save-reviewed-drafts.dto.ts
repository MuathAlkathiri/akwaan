import { IsArray, IsMongoId, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveReviewedDraftsDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  @IsArray()
  @IsObject({ each: true })
  drafts: Record<string, unknown>[];

  @ApiProperty()
  @IsMongoId()
  categoryId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  catalogId?: string;
}
