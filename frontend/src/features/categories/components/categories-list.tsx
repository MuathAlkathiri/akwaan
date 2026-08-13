"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImageIcon, Pencil } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCategories, useDeleteCategory } from "../hooks/use-categories";
import { getEntityId } from "@/lib/utils";
import { getMediaUrl } from "@/lib/api/media-url";
import { DeleteDialog, EmptyState, LoadingState } from "@/components/shared";
import { BombCategoryReadiness } from "./bomb-category-readiness";
import { CategoryForm } from "./category-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Category } from "@/types";

export function CategoriesList() {
  const router = useRouter();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const { data, isLoading, error } = useCategories();
  const categories = data || [];
  const deleteCategory = useDeleteCategory();

  if (isLoading) return <LoadingState />;
  if (error)
    return <EmptyState title="تعذر تحميل الفئات" />;
  if (!categories.length)
    return <EmptyState title="لا توجد فئات" />;

  return (
    <>
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => {
        const categoryId = getEntityId(category);
        const bannerUrl = getMediaUrl(category.banner?.url);
        const catalogName = category.catalog
          ? category.catalog.name.ar
          : typeof category.catalogId === "object" && category.catalogId
            ? category.catalogId.name.ar
            : null;

        return (
          <Card
            key={categoryId}
            role="button"
            tabIndex={0}
            className="overflow-hidden cursor-pointer transition hover:border-primary/60 hover:bg-white/[0.04]"
            onClick={() => router.push(`/categories/${categoryId}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                router.push(`/categories/${categoryId}`);
              }
            }}
          >
            {bannerUrl ? (
              <div className="relative h-36 overflow-hidden border-b border-white/10">
                <Image
                  src={bannerUrl}
                  alt={category.name}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="grid h-36 place-items-center border-b border-dashed border-white/10 bg-white/[0.025] text-muted-foreground">
                <div className="text-center">
                  <ImageIcon className="mx-auto size-7" aria-hidden />
                  <p className="mt-2 text-xs">لا توجد صورة للفئة</p>
                </div>
              </div>
            )}
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl font-black">
                    {category.name}
                  </CardTitle>
                  <CardDescription>{category.description}</CardDescription>
                  <p className="text-xs text-muted-foreground mt-2">
                    {category.slug}
                  </p>
                  {catalogName && (
                    <Badge variant="outline" className="mt-3">
                      {catalogName}
                    </Badge>
                  )}
                  {category.gameplayMode === "BOMB" && (
                    <BombCategoryReadiness categoryId={categoryId} />
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant={category.isActive ? "default" : "secondary"}>
                    {category.isActive ? "نشطة" : "غير نشطة"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingCategory(category);
                    }}
                  >
                    <Pencil className="ml-1.5 size-3.5" aria-hidden />
                    {bannerUrl ? "تعديل" : "إضافة صورة"}
                  </Button>
                  <DeleteDialog
                    itemName={category.name}
                    disabled={deleteCategory.isPending}
                    onDelete={() => deleteCategory.mutate(categoryId)}
                    trigger={
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(event) => event.stopPropagation()}
                      >
                        حذف
                      </Button>
                    }
                  />
                </div>
              </div>
            </CardHeader>
          </Card>
        );
      })}
    </div>
      <Dialog
        open={Boolean(editingCategory)}
        onOpenChange={(open: boolean) => {
          if (!open) setEditingCategory(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-3rem)] overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              تعديل الفئة وإدارة الصورة
            </DialogTitle>
          </DialogHeader>
          {editingCategory && (
            <CategoryForm
              key={getEntityId(editingCategory)}
              category={editingCategory}
              onSuccess={() => setEditingCategory(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
