import { CategoryPayload } from "@/types";
import type { CategoryMultipartBodyDto } from "@/api/generated/models";

export function toCategoryRequest(
  data: CategoryPayload,
): CategoryMultipartBodyDto {
  const { bannerFile, ...category } = data;
  return {
    category: JSON.stringify(category),
    ...(bannerFile ? { banner: bannerFile } : {}),
  };
}
