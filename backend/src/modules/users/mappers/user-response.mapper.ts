import { UserResponseDto } from '../dto/user-response.dto';
import { User } from '../schemas/user.schema';

export function mapUserResponse(user: User): UserResponseDto {
  const raw = typeof user.toObject === 'function' ? user.toObject() : user;
  const id = raw._id.toString();
  return {
    id,
    _id: id,
    fullName: raw.fullName,
    email: raw.email,
    role: raw.role,
    freeGamesUsed: raw.freeGamesUsed ?? 0,
    subscriptionStatus: raw.subscriptionStatus,
    subscriptionExpiresAt: raw.subscriptionExpiresAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
