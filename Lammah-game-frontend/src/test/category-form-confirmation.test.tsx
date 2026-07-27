import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CategoryForm } from "@/features/categories/components/category-form";
import type { Category } from "@/types";

const updateCategory = vi.fn();

vi.mock("@/features/catalogs", () => ({
  useCatalogs: () => ({
    data: [{ id: "catalog-1", name: { ar: "عام", en: "General" } }],
    isLoading: false,
  }),
}));

vi.mock("@/features/categories/hooks/use-categories", () => ({
  useCreateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({
    mutateAsync: updateCategory,
    isPending: false,
  }),
}));

const category = {
  id: "category-1",
  _id: "category-1",
  name: "رياضة",
  slug: "sports",
  description: "",
  catalogId: "catalog-1",
  isActive: true,
  audioPolicy: "optional",
  gameplayMode: "STANDARD",
  sortOrder: 0,
} as Category;

describe("CategoryForm gameplay-mode confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCategory.mockResolvedValue(category);
  });

  it("requires explicit accessible confirmation before persisting a mode change", async () => {
    render(<CategoryForm category={category} />);

    fireEvent.click(screen.getByRole("combobox", { name: "نمط اللعب" }));
    fireEvent.click(screen.getByRole("option", { name: /Top 10/ }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ الفئة" }));

    expect(updateCategory).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("alertdialog", {
        name: "تأكيد تغيير نمط اللعب",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "متابعة التغيير" }),
    );

    await waitFor(() =>
      expect(updateCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          gameplayMode: "TOP_10",
          confirmGameplayModeChange: true,
        }),
      ),
    );
  });
});
