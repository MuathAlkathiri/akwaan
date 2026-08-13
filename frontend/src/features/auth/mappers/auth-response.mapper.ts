import type { AuthResponseDto } from "@/api/generated/models";
import type { AuthResponse } from "@/types";
import { toUser } from "@/features/users/mappers/user-response.mapper";

export const toAuthResponse = (response: AuthResponseDto): AuthResponse => ({
  accessToken: response.accessToken,
  user: toUser(response.user),
});
