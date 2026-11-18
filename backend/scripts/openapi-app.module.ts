import { InjectionToken, Module } from '@nestjs/common';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { SubscriptionsController } from '../src/modules/subscriptions/subscriptions.controller';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';

const documentationOnlyProvider = (provide: InjectionToken) => ({
  provide,
  useValue: Object.freeze({}),
});

/**
 * Controller-only application graph used exclusively for Swagger reflection.
 * It deliberately contains no database, storage, media, seed, or provider
 * modules, while retaining the exact runtime controllers and DTO metadata.
 */
@Module({
  controllers: [UsersController, AuthController, SubscriptionsController],
  providers: [AuthService, UsersService, SubscriptionsService].map(
    documentationOnlyProvider,
  ),
})
export class OpenApiAppModule {}
