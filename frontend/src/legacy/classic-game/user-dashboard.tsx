"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { useCatalogs } from "@/features/catalogs";
import { useCategories } from "@/features/categories";
import { NewCategoriesCarousel } from "@/features/categories/components/new-categories/new-categories-carousel";
import { SelectedCategoriesSidebar } from "@/features/categories/components/selection/selected-categories-sidebar";
import { selectNewCategories } from "@/features/categories/utils/select-new-categories";
import { getMediaUrl } from "@/lib/api/media-url";
import { getEntityId } from "@/lib/utils";
import {
  groupCategoriesByCatalog,
  CatalogCategoryGroup,
} from "@/lib/categories/catalog-groups";
import { Category } from "@/types";

function WatermelonOutline({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute opacity-[0.055] ${className}`}
      aria-hidden="true"
    >
      <div className="h-28 w-40 rounded-b-full border border-white/70 border-t-0" />
      <div className="absolute left-7 top-7 h-1.5 w-1.5 rounded-full bg-white/70" />
      <div className="absolute left-16 top-12 h-1.5 w-1.5 rounded-full bg-white/70" />
      <div className="absolute left-28 top-8 h-1.5 w-1.5 rounded-full bg-white/70" />
    </div>
  );
}

function CategoryTile({
  category,
  selected,
  disabled,
  onToggle,
}: {
  category: Category;
  selected: boolean;
  disabled: boolean;
  onToggle: (categoryId: string) => void;
}) {
  const bannerUrl = getMediaUrl(category.banner?.url);
  const categoryId = getEntityId(category);

  return (
    <button
      type="button"
      disabled={disabled && !selected}
      onClick={() => onToggle(categoryId)}
      className={`group relative aspect-square min-w-36 overflow-hidden rounded-[1.35rem] border bg-[#22173f]/80 text-right shadow-[0_12px_32px_rgba(0,0,0,0.16)] transition duration-300 hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-55 ${
        selected
          ? "border-amber-300/70 ring-2 ring-amber-300/25 shadow-[0_0_28px_rgba(245,158,11,.16)]"
          : "border-white/[0.09] hover:border-violet-300/50"
      }`}
    >
      {bannerUrl ? (
        <>
          <Image
            src={bannerUrl}
            alt={category.name}
            fill
            unoptimized
            className="object-cover transition duration-500 group-hover:scale-105"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/5" />
        </>
      ) : (
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(34,197,94,0.14),transparent_9rem),linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]" />
      )}
      {selected && (
        <span className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full border border-amber-100/60 bg-gradient-to-br from-amber-300 to-amber-500 text-[#2a174b] shadow-[0_6px_18px_rgba(245,158,11,.3)]">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 z-10 p-4">
        <span className="block text-base font-black leading-tight text-white drop-shadow">
          {category.name}
        </span>
        {category.description && (
          <span className="mt-1 line-clamp-2 hidden text-xs leading-5 text-zinc-300 sm:block">
            {category.description}
          </span>
        )}
      </span>
    </button>
  );
}

function CategoryGroupSection({
  group,
  selectedCategoryIds,
  onToggleCategory,
}: {
  group: CatalogCategoryGroup;
  selectedCategoryIds: string[];
  onToggleCategory: (categoryId: string) => void;
}) {
  const selectionFull = selectedCategoryIds.length >= 6;

  return (
    <div className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-4 backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#22C55E]/20 bg-[#22C55E]/10 px-4 py-1.5 text-sm font-black text-[#22C55E]">
            {group.title}
          </span>
          <span className="text-xs font-bold text-zinc-500">
            {group.categories.length} فئة
          </span>
        </div>
      </div>
      {group.description && (
        <p className="mb-4 max-w-2xl text-sm leading-6 text-zinc-400">
          {group.description}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {group.categories.map((category) => (
          <CategoryTile
            key={getEntityId(category)}
            category={category}
            selected={selectedCategoryIds.includes(getEntityId(category))}
            disabled={selectionFull}
            onToggle={onToggleCategory}
          />
        ))}
      </div>
    </div>
  );
}

export function UserDashboard() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { data: categories } = useCategories();
  const { data: catalogs } = useCatalogs();
  const newCategories = selectNewCategories(categories || []);
  const categoryGroups = groupCategoriesByCatalog(
    categories || [],
    catalogs || [],
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const selectedCategories = useMemo(
    () =>
      selectedCategoryIds
        .map((categoryId) =>
          (categories || []).find(
            (category) => getEntityId(category) === categoryId,
          ),
        )
        .filter((category): category is Category => Boolean(category)),
    [categories, selectedCategoryIds],
  );
  const canStartGame = selectedCategoryIds.length === 6;

  const handleToggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((currentIds) => {
      if (currentIds.includes(categoryId)) {
        return currentIds.filter((id) => id !== categoryId);
      }

      if (currentIds.length >= 6) {
        return currentIds;
      }

      return [...currentIds, categoryId];
    });
  };

  const handleStartGame = () => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    if (!canStartGame) return;

    router.push(`/games/new?categories=${selectedCategoryIds.join(",")}`);
  };

  return (
    <div className="relative min-w-0 overflow-x-clip bg-[#1a1333] px-4 pb-36 pt-2 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(36,20,71,0.88)_0%,rgba(26,19,51,0.98)_52%,#17112d_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,197,94,0.055),transparent_34rem)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.28)_1px,transparent_0)] [background-size:28px_28px]" />
      <WatermelonOutline className="-right-10 top-20 rotate-[-24deg]" />
      <WatermelonOutline className="left-2 top-56 rotate-[26deg]" />
      <WatermelonOutline className="left-12 top-[32rem] hidden rotate-[-8deg] lg:block" />
      <WatermelonOutline className="right-12 top-[37rem] hidden rotate-[15deg] lg:block" />

      <div className="relative mx-auto max-w-7xl min-w-0">
        <div className="min-w-0 space-y-7">
          {!!newCategories.length && (
            <NewCategoriesCarousel
              categories={newCategories}
              selectedIds={selectedCategoryIds}
              onToggle={handleToggleCategory}
            />
          )}

          {!!categoryGroups.length && (
            <section id="categories" className="min-w-0 scroll-mt-28">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black text-[#22C55E]">
                    تصفح حسب الكتالوج
                  </p>
                  <h2 className="mt-1 text-3xl font-black">كل الفئات</h2>
                </div>
                <p className="max-w-md text-sm leading-6 text-zinc-400">
                  اختر من الفئات المتاحة، مرتبة تحت كتالوجات تساعدك تلقى نوع
                  التحدي المناسب.
                </p>
              </div>
              <div className="space-y-5">
                {categoryGroups.map((group) => (
                  <CategoryGroupSection
                    key={group.id}
                    group={group}
                    selectedCategoryIds={selectedCategoryIds}
                    onToggleCategory={handleToggleCategory}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
        <div id="account" className="sr-only" aria-label="حسابي" />
      </div>

      {selectedCategories.length > 0 && (
        <div className="fixed left-4 top-28 z-40 hidden lg:block">
          <SelectedCategoriesSidebar
            categories={selectedCategories}
            limit={6}
            canContinue={canStartGame}
            onRemove={handleToggleCategory}
            onContinue={handleStartGame}
          />
        </div>
      )}

      {!!categoryGroups.length && selectedCategories.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#17112d]/92 px-4 py-3 shadow-[0_-20px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-6 lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-white">
                اخترت {selectedCategoryIds.length} من 6 فئات
              </p>
              <div className="mt-2 flex max-w-3xl flex-wrap gap-2">
                {selectedCategories.length ? (
                  selectedCategories.map((category) => (
                    <span
                      key={getEntityId(category)}
                      className="rounded-full border border-[#22C55E]/20 bg-[#22C55E]/10 px-3 py-1 text-xs font-bold text-[#22C55E]"
                    >
                      {category.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-zinc-400">
                    اختر الفئات من الكتالوجات بالأعلى.
                  </span>
                )}
              </div>
            </div>
            <Button
              type="button"
              size="lg"
              disabled={!canStartGame}
              onClick={handleStartGame}
              className="min-w-48 rounded-2xl bg-[#22C55E] text-[#111827] hover:bg-[#22C55E]/90"
            >
              ابدأ اللعبة
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
