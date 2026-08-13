import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { SubscriptionsService } from './subscriptions.service';
import {
  UpdateUserSubscriptionDto,
  UpdateUserSubscriptionResponseDto,
} from './dto/update-user-subscription.dto';
import { ids, userExample } from '../../common/swagger/examples';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Patch('users/:userId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    operationId: 'usersUpdateSubscription',
    summary: 'Manually update a user subscription',
  })
  @ApiParam({
    name: 'userId',
    example: ids.user,
    description: 'User MongoDB ObjectId',
  })
  @ApiBody({
    type: UpdateUserSubscriptionDto,
    examples: {
      activate: {
        summary: 'Activate subscription',
        value: {
          subscriptionStatus: 'active',
          subscriptionExpiresAt: '2026-12-31T00:00:00.000Z',
        },
      },
      expire: {
        summary: 'Expire subscription',
        value: {
          subscriptionStatus: 'expired',
          subscriptionExpiresAt: '2026-06-20T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription updated successfully',
    type: UpdateUserSubscriptionResponseDto,
    schema: {
      example: {
        statusCode: 200,
        message: 'Subscription updated successfully',
        data: {
          ...userExample,
          subscriptionStatus: 'active',
          subscriptionExpiresAt: '2026-12-31T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Admin role required',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden resource',
        error: 'Forbidden',
      },
    },
  })
  async updateUserSubscription(
    @Param('userId') userId: string,
    @Body() updateUserSubscriptionDto: UpdateUserSubscriptionDto,
  ) {
    const user = await this.subscriptionsService.updateUserSubscription(
      userId,
      updateUserSubscriptionDto,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Subscription updated successfully',
      data: user,
    };
  }
}
