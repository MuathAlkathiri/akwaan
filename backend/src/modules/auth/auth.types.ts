import { UserRole, SubscriptionStatus } from '../users/schemas/user.schema';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthUserResponse {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  freeGamesUsed: number;
  subscriptionExpiresAt?: Date;
}

export type AuthenticatedUser = AuthUserResponse;
