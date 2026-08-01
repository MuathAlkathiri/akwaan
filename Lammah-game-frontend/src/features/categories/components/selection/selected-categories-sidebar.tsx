import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Category } from "@/types";
import { SelectedCategorySlot } from "./selected-category-slot";

export function SelectedCategoriesSidebar({
  categories,
  limit,
  canContinue,
  onRemove,
  onContinue,
}: {
  categories: Category[];
  limit: number;
  canContinue: boolean;
  onRemove: (id: string) => void;
  onContinue: () => void;
}) {
  return (
    <aside className="group/sidebar max-h-[calc(100dvh-8rem)] w-16 overflow-x-hidden overflow-y-auto rounded-[1.35rem] border border-white/[0.08] bg-[#21173d]/95 p-2 shadow-[0_18px_48px_rgba(0,0,0,.32)] backdrop-blur-md transition-[width,padding] duration-300 ease-out hover:w-[200px] hover:p-3 focus-within:w-[200px] focus-within:p-3">
      <div className="hidden items-center justify-between gap-3 group-hover/sidebar:flex group-focus-within/sidebar:flex">
        <h2 className="text-sm font-black">الفئات المختارة</h2>
        <span
          dir="ltr"
          className="rounded-full bg-white/[0.06] px-2 py-1 text-xs font-black text-[#22C55E]"
        >
          {categories.length} / {limit}
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {Array.from({ length: limit }, (_, index) => {
          const category = categories[index];
          return (
            <div
              key={category?.id ?? `empty-${index}`}
              className={
                category
                  ? ""
                  : "hidden group-hover/sidebar:block group-focus-within/sidebar:block"
              }
            >
              <SelectedCategorySlot
                category={category}
                index={index}
                onRemove={() => category && onRemove(category.id)}
              />
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        disabled={!canContinue}
        onClick={onContinue}
        className="mt-4 hidden w-full rounded-xl bg-[#22C55E] text-[#111827] hover:bg-[#22C55E]/90 group-hover/sidebar:flex group-focus-within/sidebar:flex"
      >
        <CheckCircle2 className="ml-2 size-4" aria-hidden />
        متابعة
      </Button>
    </aside>
  );
}
