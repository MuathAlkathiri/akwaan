import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';
import { UserRepository } from './persistence/user.repository';
import { SubscriptionAccessPolicy } from './policies/subscription-access.policy';
import { UsersController } from './users.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UsersController],
  providers: [UsersService, UserRepository, SubscriptionAccessPolicy],
  exports: [UsersService, UserRepository, SubscriptionAccessPolicy],
})
export class UsersModule {}
