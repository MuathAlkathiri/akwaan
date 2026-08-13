import type { UserResponseDto } from "@/api/generated/models";
import type { User } from "@/types";

export function toUser(dto: UserResponseDto): User {
  return {
    id: dto.id || dto._id || "",
    _id: dto._id,
    fullName: dto.fullName,
    email: dto.email,
    role: dto.role,
    freeGamesUsed: dto.freeGamesUsed,
    subscriptionStatus: dto.subscriptionStatus,
    subscriptionExpiresAt: dto.subscriptionExpiresAt,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export const toUsers = (users: UserResponseDto[]): User[] => users.map(toUser);
