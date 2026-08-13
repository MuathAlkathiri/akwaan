import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '../../users/schemas/user.schema';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class UpdateUserSubscriptionDto {
  @ApiProperty({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus' })
  @IsEnum(SubscriptionStatus)
  subscriptionStatus: SubscriptionStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  subscriptionExpiresAt?: string | null;
}

export class UpdateUserSubscriptionResponseDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty() message!: string;
  @ApiProperty({ type: UserResponseDto }) data!: UserResponseDto;
}
