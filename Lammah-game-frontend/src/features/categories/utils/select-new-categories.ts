import type { Category } from "@/types";

export const NEW_CATEGORIES_LIMIT = 5;

const createdTime = (category: Category) => {
  const timestamp = Date.parse(category.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export function selectNewCategories(
  categories: Category[],
  limit = NEW_CATEGORIES_LIMIT,
): Category[] {
  return categories
    .filter((category) => category.isActive)
    .map((category, index) => ({ category, index }))
    .sort(
      (left, right) =>
        createdTime(right.category) - createdTime(left.category) ||
        right.index - left.index,
    )
    .slice(0, limit)
    .map(({ category }) => category);
}
