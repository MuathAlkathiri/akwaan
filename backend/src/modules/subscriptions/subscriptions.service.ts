import { Injectable } from '@nestjs/common';
import { UpdateUserSubscriptionDto } from './dto/update-user-subscription.dto';
import { UsersService } from '../users/users.service';
import { UserResponseDto } from '../users/dto/user-response.dto';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly usersService: UsersService) {}

  async updateUserSubscription(
    userId: string,
    dto: UpdateUserSubscriptionDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateSubscription(
      userId,
      dto.subscriptionStatus,
      dto.subscriptionExpiresAt
        ? new Date(dto.subscriptionExpiresAt)
        : undefined,
    );
  }
}
