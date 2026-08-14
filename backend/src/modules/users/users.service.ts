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
    /** Absent for passwordless accounts. */
    password?: string;
    phone?: string;
    emailVerifiedAt?: Date;
    phoneVerifiedAt?: Date;
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

  findByEmail(email: string) {
    return this.users.findByEmail(this.normalizeEmail(email));
  }

  /** `phone` must already be canonical E.164; normalization happens at the edge. */
  findByPhone(phone: string) {
    return this.users.findByPhone(phone);
  }

  /**
   * Register from a verified identifier alone — no password exists to set.
   *
   * A phone-first account still needs the `email` the schema requires and the
   * JWT payload carries, so it gets a reserved placeholder derived from the
   * canonical number. It is unique, obviously not a real inbox, and replaced
   * the moment the user verifies a real address.
   */
  async createPasswordless(identifier: {
    type: 'email' | 'phone';
    value: string;
  }): Promise<User> {
    const now = new Date();
    const isEmail = identifier.type === 'email';
    const email = isEmail
      ? this.normalizeEmail(identifier.value)
      : `${identifier.value.replace(/\D/g, '')}@phone.akwaan.local`;

    try {
      return await this.users.create({
        fullName: DEFAULT_DISPLAY_NAME,
        email,
        role: UserRole.USER,
        ...(isEmail
          ? { emailVerifiedAt: now }
          : { phone: identifier.value, phoneVerifiedAt: now }),
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      // Two verifications of the same brand-new identifier can race. The
      // loser reads the winner's account rather than failing the login.
      const existing = isEmail
        ? await this.users.findByEmail(email)
        : await this.users.findByPhone(identifier.value);
      if (existing) return existing;
      throw new ConflictException('Identifier is already registered');
    }
  }

  /** Records that an OTP for this identifier was just verified. */
  async markIdentifierVerified(
    id: string,
    type: 'email' | 'phone',
  ): Promise<User | null> {
    return this.users.updateById(id, {
      [type === 'email' ? 'emailVerifiedAt' : 'phoneVerifiedAt']: new Date(),
      updatedAt: new Date(),
    });
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

/** Shown until the user sets their own name; the schema requires a value. */
const DEFAULT_DISPLAY_NAME = 'لاعب أكوان';

function isDuplicateKey(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}
