import { CatalogPayload } from "@/types";
import type { CatalogMultipartBodyDto } from "@/api/generated/models";

export function toCatalogRequest(
  data: CatalogPayload,
): CatalogMultipartBodyDto {
  const { bannerFile, ...catalog } = data;
  return {
    catalog: JSON.stringify(catalog),
    ...(bannerFile ? { banner: bannerFile } : {}),
  };
}
