import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

export class GrantTokensDto {
  @ApiProperty({
    description: 'How many tokens to add. Whole Matches, never a fraction.',
    example: 3,
    minimum: 1,
    maximum: 500,
  })
  @IsInt()
  @Min(1)
  // An upper bound so a slipped keystroke is a rejected request rather than a
  // thousand free Matches nobody can take back without editing the ledger.
  @Max(500)
  amount!: number;

  @ApiProperty({
    description:
      'Why this was given, in an operator’s own words. It is read back in the ledger, so write what the next person needs to understand it.',
    example: 'عوّضناه عن ماتش انقطع فيه الإنترنت',
  })
  @IsString()
  @MaxLength(280)
  note!: string;

  @ApiProperty({
    description:
      'Makes the grant happen once. Send the same key when retrying a request that may already have landed.',
    example: 'support-ticket-4417',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}

export class TokenMovementDto {
  @ApiProperty({ example: -1 }) delta!: number;
  @ApiProperty({ example: 'match.start' }) reason!: string;
  @ApiProperty({ example: '6730a1f2c9e4b81d3a5f2e10', required: false })
  reference?: string;
  @ApiProperty({ example: 4 }) balanceAfter!: number;
}

export class TokenBalanceDto {
  @ApiProperty({ example: 4 }) balance!: number;
}
