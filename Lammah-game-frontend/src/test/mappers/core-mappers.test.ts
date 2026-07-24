import { describe, expect, it } from "vitest";
import { toCatalogModel } from "@/features/catalogs/mappers/catalog-response.mapper";
import { toCategoryModel } from "@/features/categories/mappers/category-response.mapper";
import { toMusicTrack } from "@/features/music/mappers/music-response.mapper";
import { toAuthResponse } from "@/features/auth/mappers/auth-response.mapper";
import { toUser } from "@/features/users/mappers/user-response.mapper";
import type {
  AuthResponseDto,
  CatalogResponseDto,
  CategoryResponseDto,
  MusicTrackResponseDto,
  UserResponseDto,
} from "@/api/generated/models";

const userDto = {
  _id: "user-1",
  fullName: "Test User",
  email: "test@example.invalid",
  role: "user",
  freeGamesUsed: 0,
  subscriptionStatus: "none",
} as UserResponseDto;

describe("core response mappers", () => {
  it("normalizes catalog IDs and nullable optional values", () => {
    const dto: CatalogResponseDto = {
      _id: "catalog-1",
      name: { ar: "رياضة", en: "Sports" },
      slug: "sports",
      isActive: true,
      sortOrder: 0,
    };
    expect(toCatalogModel(dto)).toMatchObject({
      id: "catalog-1",
      _id: "catalog-1",
      description: undefined,
      createdAt: "",
    });
  });

  it("maps nested category catalog and gameplay metadata", () => {
    const dto: CategoryResponseDto = {
      _id: "category-1",
      name: "كرة القدم",
      slug: "football",
      catalog: {
        _id: "catalog-1",
        name: { ar: "رياضة", en: "Sports" },
        slug: "sports",
      },
      gameplayConfig: {
        gameModes: { trivia: 1 },
        supportedAssetTypes: ["text", "image"],
      },
      isActive: true,
      audioPolicy: "optional",
      gameplayMode: "TOP_10",
      sortOrder: 2,
    };
    expect(toCategoryModel(dto)).toMatchObject({
      id: "category-1",
      gameplayMode: "TOP_10",
      catalog: { id: "catalog-1" },
      gameplayConfig: {
        gameModes: { trivia: 1 },
        supportedAssetTypes: ["text", "image"],
      },
    });
  });

  it("normalizes music media URLs and keeps metadata", () => {
    const dto = {
      _id: "track-1",
      title: "Synthetic tone",
      artist: "Test fixture",
      language: "ar",
      difficulty: "easy",
      source: "admin-upload",
      snippetAudioUrl: "/uploads/tone.wav",
      durationSeconds: 10,
      snippetStartSecond: 1,
      snippetDurationSeconds: 5,
      isActive: true,
    } as MusicTrackResponseDto;
    expect(toMusicTrack(dto)).toMatchObject({
      id: "track-1",
      title: "Synthetic tone",
      snippetAudioUrl: expect.stringContaining("/uploads/tone.wav"),
    });
  });

  it("maps safe user and auth responses without persistence fields", () => {
    const auth: AuthResponseDto = { accessToken: "test-token", user: userDto };
    expect(toUser(userDto)).not.toHaveProperty("password");
    expect(toAuthResponse(auth)).toEqual({
      accessToken: "test-token",
      user: expect.objectContaining({ id: "user-1", email: userDto.email }),
    });
  });
});
