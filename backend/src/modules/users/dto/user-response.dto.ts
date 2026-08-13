import { SubscriptionStatus, UserRole } from '../schemas/user.schema';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty()
  id: string;
  @ApiPropertyOptional()
  _id?: string;
  @ApiProperty()
  fullName: string;
  @ApiProperty({ format: 'email' })
  email: string;
  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role: UserRole;
  @ApiProperty({ minimum: 0 })
  freeGamesUsed: number;
  @ApiProperty({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus' })
  subscriptionStatus: SubscriptionStatus;
  @ApiPropertyOptional({ format: 'date-time' })
  subscriptionExpiresAt?: Date;
  @ApiPropertyOptional({ format: 'date-time' })
  createdAt?: Date;
  @ApiPropertyOptional({ format: 'date-time' })
  updatedAt?: Date;
}
