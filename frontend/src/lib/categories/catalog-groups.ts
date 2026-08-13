import { Catalog, Category } from "@/types";
import { getEntityId } from "@/lib/utils";

export type CatalogCategoryGroup = {
  id: string;
  title: string;
  description?: string;
  catalog?: Catalog;
  categories: Category[];
};

function getCatalogFromCategory(
  category: Category,
  catalogsById: Map<string, Catalog>,
) {
  if (category.catalog) {
    return category.catalog;
  }

  if (!category.catalogId) return undefined;

  if (typeof category.catalogId === "object") {
    return category.catalogId;
  }

  return catalogsById.get(category.catalogId);
}

function getCatalogId(category: Category) {
  if (!category.catalogId) return "";

  if (typeof category.catalogId === "object") {
    return getEntityId(category.catalogId);
  }

  return category.catalogId;
}

function getSortValue(value?: number) {
  return typeof value === "number" ? value : 0;
}

function sortByOrderAndDate<
  T extends { sortOrder?: number; createdAt?: string },
>(first: T, second: T) {
  const orderDifference =
    getSortValue(first.sortOrder) - getSortValue(second.sortOrder);

  if (orderDifference !== 0) return orderDifference;

  return (
    new Date(first.createdAt || 0).getTime() -
    new Date(second.createdAt || 0).getTime()
  );
}

export function groupCategoriesByCatalog(
  categories: Category[],
  catalogs: Catalog[] = [],
): CatalogCategoryGroup[] {
  const catalogsById = new Map(
    catalogs.map((catalog) => [getEntityId(catalog), catalog]),
  );
  const grouped = new Map<string, CatalogCategoryGroup>();

  categories
    .filter((category) => category.isActive !== false)
    .sort(sortByOrderAndDate)
    .forEach((category) => {
      const catalog = getCatalogFromCategory(category, catalogsById);
      const catalogId = catalog ? getEntityId(catalog) : getCatalogId(category);
      const groupId = catalogId || "general";

      if (!grouped.has(groupId)) {
        grouped.set(groupId, {
          id: groupId,
          title: catalog?.name?.ar || "عام",
          description: catalog?.description?.ar,
          catalog,
          categories: [],
        });
      }

      grouped.get(groupId)?.categories.push(category);
    });

  return Array.from(grouped.values()).sort((first, second) => {
    if (first.catalog && second.catalog) {
      return sortByOrderAndDate(first.catalog, second.catalog);
    }

    if (first.catalog) return -1;
    if (second.catalog) return 1;
    return first.title.localeCompare(second.title, "ar");
  });
}
