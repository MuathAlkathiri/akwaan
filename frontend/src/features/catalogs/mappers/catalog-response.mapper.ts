import type { CatalogResponseDto } from "@/api/generated/models";
import type { Catalog } from "@/types";

export function toCatalogModel(dto: CatalogResponseDto): Catalog {
  return {
    id: dto._id,
    _id: dto._id,
    name: dto.name,
    description: dto.description,
    slug: dto.slug,
    banner: dto.banner,
    icon: dto.icon,
    isActive: dto.isActive,
    sortOrder: dto.sortOrder,
    createdAt: dto.createdAt ?? "",
    updatedAt: dto.updatedAt ?? "",
  };
}

export const toCatalogModels = (catalogs: CatalogResponseDto[]): Catalog[] =>
  catalogs.map(toCatalogModel);
