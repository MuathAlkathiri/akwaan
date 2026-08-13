import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidationErrorDetailDto {
  @ApiProperty({ description: 'Field or validation constraint identifier' })
  field!: string;

  @ApiProperty({ description: 'Human-readable validation failure' })
  message!: string;
}

export class ErrorResponseDto {
  @ApiPropertyOptional({ example: 'CONCURRENT_GAME_UPDATE' })
  code?: string;
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Validation failed',
  })
  message!: string | string[];

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ example: '/questions' })
  path!: string;

  @ApiPropertyOptional({ type: [ValidationErrorDetailDto] })
  errors?: ValidationErrorDetailDto[];
}
