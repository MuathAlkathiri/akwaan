import { describe, expect, it } from "vitest";
import { toUser } from "@/features/users/mappers/user-response.mapper";
import type { UserResponseDto } from "@/api/generated/models";

const userDto = {
  _id: "user-1",
  fullName: "Test User",
  email: "test@example.invalid",
  role: "user",
  freeGamesUsed: 0,
  subscriptionStatus: "none",
} as UserResponseDto;

describe("core response mappers", () => {
  it("maps a safe user response without persistence fields", () => {
    expect(toUser(userDto)).not.toHaveProperty("password");
    expect(toUser(userDto)).toEqual(
      expect.objectContaining({ id: "user-1", email: userDto.email }),
    );
  });
});
