export type UserRole = "admin" | "user";
export type SubscriptionStatus = "none" | "active" | "expired";

export interface User {
  id: string;
  _id?: string;
  fullName: string;
  email: string;
  role: UserRole;
  freeGamesUsed: number;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface SubscriptionUpdatePayload {
  userId: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt?: string;
}
