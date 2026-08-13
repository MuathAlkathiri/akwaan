"use client";

import { useState } from "react";
import Image from "next/image";
import axios from "axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CatalogForm } from "./catalog-form";
import { useCatalogs, useDeleteCatalog } from "../hooks/use-catalogs";
import { useCategories } from "@/features/categories";
import { getMediaUrl } from "@/lib/api/media-url";
import { getEntityId } from "@/lib/utils";
import { Catalog } from "@/types";
import { DeleteDialog, EmptyState, LoadingState } from "@/components/shared";

export function CatalogsList() {
  const [editingCatalog, setEditingCatalog] = useState<Catalog | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const { data: catalogs, isLoading, error } = useCatalogs();
  const { data: categories } = useCategories();
  const deleteCatalog = useDeleteCatalog();

  if (isLoading) return <LoadingState />;
  if (error)
    return <EmptyState title="تعذر تحميل الكتالوجات" />;
  if (!catalogs?.length)
    return <EmptyState title="لا توجد كتالوجات" />;

  const getLinkedCategoryCount = (catalogId: string) =>
    (categories || []).filter((category) => {
      if (!category.catalogId) return false;
      return typeof category.catalogId === "object"
        ? getEntityId(category.catalogId) === catalogId
        : category.catalogId === catalogId;
    }).length;

  const handleDelete = async (catalogId: string) => {
    setDeleteError("");
    try {
      await deleteCatalog.mutateAsync(catalogId);
    } catch (deleteCatalogError) {
      const message = axios.isAxiosError(deleteCatalogError)
        ? deleteCatalogError.response?.data?.message
        : null;
      setDeleteError(message || "تعذر حذف الكتالوج");
    }
  };

  return (
    <>
      {deleteError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {deleteError}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {catalogs.map((catalog) => {
          const catalogId = getEntityId(catalog);
          const bannerUrl = getMediaUrl(catalog.banner?.url);
          const linkedCategoryCount = getLinkedCategoryCount(catalogId);

          return (
            <Card
              key={catalogId}
              data-testid="catalog-card"
              className="overflow-hidden"
            >
              {bannerUrl && (
                <div className="relative h-36 overflow-hidden border-b border-white/10">
                  <Image
                    src={bannerUrl}
                    alt={catalog.name.ar}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
              )}
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-2xl font-black">
                      {catalog.name.ar}
                    </CardTitle>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge
                        variant={catalog.isActive ? "default" : "secondary"}
                      >
                        {catalog.isActive ? "نشط" : "غير نشط"}
                      </Badge>
                      <Badge variant="secondary">
                        {linkedCategoryCount} فئة
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingCatalog(catalog)}
                    >
                      تعديل
                    </Button>
                    <DeleteDialog
                      itemName={catalog.name.ar}
                      disabled={deleteCatalog.isPending}
                      onDelete={() => void handleDelete(catalogId)}
                      trigger={<Button size="sm" variant="destructive">حذف</Button>}
                    />
                  </div>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <Dialog
        open={!!editingCatalog}
        onOpenChange={(open: boolean) => !open && setEditingCatalog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل الكتالوج</DialogTitle>
          </DialogHeader>
          {editingCatalog && (
            <CatalogForm
              catalog={editingCatalog}
              onSuccess={() => setEditingCatalog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
