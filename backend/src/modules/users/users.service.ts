import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { mapUserResponse } from './mappers/user-response.mapper';
import { UserRepository } from './persistence/user.repository';
import { SubscriptionStatus, User, UserRole } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(private readonly users: UserRepository) {}

  async create(data: {
    fullName: string;
    email: string;
    password: string;
    role?: UserRole;
  }): Promise<User> {
    const email = this.normalizeEmail(data.email);
    if (await this.users.findByEmailWithPassword(email)) {
      throw new ConflictException('Email is already registered');
    }
    try {
      return await this.users.create({
        ...data,
        email,
        role: data.role ?? UserRole.USER,
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  findByEmailForAuthentication(email: string) {
    return this.users.findByEmailWithPassword(this.normalizeEmail(email));
  }

  async findById(id: string | Types.ObjectId): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException(`User with ID "${id}" not found`);
    return user;
  }

  findByIdWithPassword(id: string | Types.ObjectId) {
    return this.users.findByIdWithPassword(id);
  }

  async findAll() {
    return (await this.users.findAll()).map(mapUserResponse);
  }

  async incrementFreeGamesUsed(id: string | Types.ObjectId): Promise<void> {
    await this.users.updateById(id, {
      $inc: { freeGamesUsed: 1 },
      updatedAt: new Date(),
    });
  }

  async updateSubscription(
    id: string,
    subscriptionStatus: SubscriptionStatus,
    subscriptionExpiresAt?: Date,
  ) {
    const user = await this.users.updateById(id, {
      subscriptionStatus,
      subscriptionExpiresAt,
      updatedAt: new Date(),
    });
    if (!user) throw new NotFoundException(`User with ID "${id}" not found`);
    return mapUserResponse(user);
  }

  private normalizeEmail(email: string) {
    return email.toLowerCase().trim();
  }
}

function isDuplicateKey(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}
