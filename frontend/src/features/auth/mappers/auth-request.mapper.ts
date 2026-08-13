import type { LoginDto, RegisterDto } from "@/api/generated/models";
import type { LoginPayload, RegisterPayload } from "@/types";

export const toLoginRequest = (value: LoginPayload): LoginDto => ({
  email: value.email.trim().toLowerCase(),
  password: value.password,
});

export const toRegisterRequest = (value: RegisterPayload): RegisterDto => ({
  fullName: value.fullName.trim(),
  email: value.email.trim().toLowerCase(),
  password: value.password,
});
