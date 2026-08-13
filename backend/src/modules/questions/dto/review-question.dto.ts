import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsMongoId } from 'class-validator';

export class BulkQuestionActionDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  ids!: string[];

  @ApiProperty({ enum: ['approve', 'reject', 'delete'] })
  @IsIn(['approve', 'reject', 'delete'])
  action!: 'approve' | 'reject' | 'delete';
}
