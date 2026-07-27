"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCatalogs } from "@/features/catalogs";
import { useCreateCategory, useUpdateCategory } from "../hooks/use-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Category } from "@/types";
import { getMediaUrl } from "@/lib/api/media-url";
import { getEntityId } from "@/lib/utils";
import axios from "axios";
import { ConfirmationDialog } from "@/components/shared";

const categorySchema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  description: z.string().optional(),
  catalogId: z.string().min(1, "الكتالوج مطلوب"),
  isActive: z.boolean(),
  audioPolicy: z.enum(["disabled", "optional", "required"]),
  gameplayMode: z.enum(["STANDARD", "TOP_10"]),
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface CategoryFormProps {
  category?: Category;
  onSuccess?: () => void;
}

function createCategorySlug(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `category-${Date.now()}`;
}

export function CategoryForm({ category, onSuccess }: CategoryFormProps) {
  const [bannerFile, setBannerFile] = useState<File | undefined>();
  const [submitError, setSubmitError] = useState("");
  const [pendingGameplayModeChange, setPendingGameplayModeChange] =
    useState<CategoryFormData | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | undefined>(
    category?.banner?.url ? getMediaUrl(category.banner.url) : undefined,
  );
  const categoryId = category ? getEntityId(category) : "";
  const selectedCatalogId =
    typeof category?.catalogId === "object" && category.catalogId
      ? getEntityId(category.catalogId)
      : typeof category?.catalogId === "string"
        ? category.catalogId
        : "";
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
      catalogId: selectedCatalogId,
      isActive: category?.isActive ?? true,
      audioPolicy: category?.audioPolicy ?? "optional",
      gameplayMode: category?.gameplayMode ?? "STANDARD",
    },
  });

  const { data: catalogs, isLoading: catalogsLoading } = useCatalogs();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory(categoryId);
  const isPending = createCategory.isPending || updateCategory.isPending;

  useEffect(() => {
    if (!bannerFile) {
      setBannerPreview(
        category?.banner?.url ? getMediaUrl(category.banner.url) : undefined,
      );
      return;
    }

    const previewUrl = URL.createObjectURL(bannerFile);
    setBannerPreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [bannerFile, category?.banner?.url]);

  const saveCategory = async (
    data: CategoryFormData,
    gameplayModeChanged: boolean,
  ) => {
    setSubmitError("");
    try {
      const payload = {
        ...data,
        slug: createCategorySlug(data.name),
        sortOrder: category?.sortOrder ?? 0,
        bannerFile,
        ...(gameplayModeChanged ? { confirmGameplayModeChange: true } : {}),
      };

      if (categoryId) {
        await updateCategory.mutateAsync(payload);
      } else {
        await createCategory.mutateAsync(payload);
      }

      onSuccess?.();
    } catch (error) {
      const response = axios.isAxiosError(error) ? error.response?.data : null;
      const code =
        response && typeof response === "object" && "code" in response
          ? response.code
          : undefined;
      setSubmitError(
        code === "CATEGORY_GAMEPLAY_MODE_CHANGE_CONFIRMATION_REQUIRED"
          ? "يجب تأكيد تغيير نمط اللعب لأن الأسئلة الحالية قد لا تكون صالحة للنمط الجديد."
          : "تعذر حفظ الفئة. تحقق من البيانات وحاول مرة أخرى.",
      );
      console.error("Failed to save category:", error);
    }
  };

  const onSubmit = async (data: CategoryFormData) => {
    const gameplayModeChanged =
      Boolean(categoryId) &&
      data.gameplayMode !== (category?.gameplayMode ?? "STANDARD");

    if (gameplayModeChanged) {
      setPendingGameplayModeChange(data);
      return;
    }

    await saveCategory(data, false);
  };

  return (
    <>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex max-h-[calc(100dvh-9rem)] min-h-0 flex-col"
      >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-1 pb-4">
        <div>
          <label className="block text-sm font-medium mb-2">الكتالوج</label>
          <Select
            defaultValue={selectedCatalogId}
            onValueChange={(value: string) => {
              setValue("catalogId", value, { shouldValidate: true });
            }}
          >
            <SelectTrigger aria-label="الكتالوج">
              <SelectValue
                placeholder={
                  catalogsLoading ? "جاري تحميل الكتالوجات..." : "اختر الكتالوج"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(catalogs || []).map((item) => (
                <SelectItem key={getEntityId(item)} value={getEntityId(item)}>
                  {item.name.ar}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.catalogId && (
            <p className="text-sm text-destructive">
              {errors.catalogId.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">اسم الفئة</label>
          <Input placeholder="أدخل اسم الفئة" {...register("name")} />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">الوصف</label>
          <Textarea
            placeholder="أدخل وصف الفئة (اختياري)"
            {...register("description")}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">صورة الفئة</label>
          {bannerPreview && (
            <div className="relative mb-3 h-28 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] sm:h-32">
              <Image
                src={bannerPreview}
                alt="معاينة صورة الفئة"
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          )}
          <Input
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="overflow-hidden text-ellipsis whitespace-nowrap"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setBannerFile(file);
            }}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            الصيغ المدعومة: JPG، PNG، WEBP. الحد الأقصى 5MB.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="rounded"
            {...register("isActive")}
          />
          نشطة
        </label>

        <div>
          <label className="mb-2 block text-sm font-medium">نمط اللعب</label>
          <Select
            defaultValue={category?.gameplayMode ?? "STANDARD"}
            onValueChange={(value: string) =>
              setValue(
                "gameplayMode",
                value as CategoryFormData["gameplayMode"],
                { shouldValidate: true },
              )
            }
          >
            <SelectTrigger aria-label="نمط اللعب">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="STANDARD">
                Standard trivia — أسئلة قياسية
              </SelectItem>
              <SelectItem value="TOP_10">Top 10 — أفضل عشرة</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            نمط اللعب يحدد قواعد اللعبة والتحقق. نوع السؤال يحدد طريقة العرض
            فقط، مثل النص أو الصورة أو الصوت أو الفيديو.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">سياسة الصوت</label>
          <Select
            defaultValue={category?.audioPolicy ?? "optional"}
            onValueChange={(value: string) =>
              setValue(
                "audioPolicy",
                value as CategoryFormData["audioPolicy"],
                { shouldValidate: true },
              )
            }
          >
            <SelectTrigger aria-label="سياسة الصوت">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disabled">الصوت معطّل</SelectItem>
              <SelectItem value="optional">الصوت اختياري</SelectItem>
              <SelectItem value="required">الصوت مطلوب</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-1 border-t border-white/10 bg-card/95 px-1 pt-4 backdrop-blur">
        {submitError && (
          <p className="mb-3 text-sm text-destructive">{submitError}</p>
        )}
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending
            ? categoryId
              ? "جاري الحفظ..."
              : "جاري الإنشاء..."
            : categoryId
              ? "حفظ الفئة"
              : "إنشاء فئة"}
        </Button>
      </div>
      </form>

      <ConfirmationDialog
        open={Boolean(pendingGameplayModeChange)}
        onOpenChange={(open) => {
          if (!open) setPendingGameplayModeChange(null);
        }}
        title="تأكيد تغيير نمط اللعب"
        description="تغيير نمط اللعب قد يجعل بعض الأسئلة الحالية غير صالحة لهذا النمط. هل تريد المتابعة دون تعديل الأسئلة؟"
        confirmLabel="متابعة التغيير"
        disabled={isPending}
        onConfirm={() => {
          if (!pendingGameplayModeChange) return;
          const pendingData = pendingGameplayModeChange;
          setPendingGameplayModeChange(null);
          void saveCategory(pendingData, true);
        }}
      />
    </>
  );
}
