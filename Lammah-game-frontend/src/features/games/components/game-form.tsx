"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import * as z from "zod";
import { Pencil } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCategories } from "@/features/categories";
import { useCreateGame } from "../hooks/use-games";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMediaUrl } from "@/lib/api/media-url";
import { getEntityId } from "@/lib/utils";
import { Category } from "@/types";
import { gameValidationMessageAr } from "../game-validation-errors";

const gameSchema = z.object({
  name: z.string().min(1, "اسم اللعبة مطلوب"),
  teamAName: z.string().min(1, "اسم الفريق أ مطلوب"),
  teamBName: z.string().min(1, "اسم الفريق ب مطلوب"),
  categoryIds: z.array(z.string()).length(6, "يجب اختيار 6 تصنيفات بالضبط"),
});

type GameFormData = z.infer<typeof gameSchema>;

export function GameForm() {
  const searchParams = useSearchParams();
  const initialCategoryIds = (searchParams.get("categories") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<GameFormData>({
    resolver: zodResolver(gameSchema),
    defaultValues: {
      categoryIds: initialCategoryIds,
    },
  });

  const router = useRouter();
  const { data: categoriesData } = useCategories();
  const createGame = useCreateGame();
  const selectedCategories = watch("categoryIds") || [];
  const categories = categoriesData || [];
  const selectedCategoryDetails = selectedCategories
    .map((categoryId) =>
      categories.find((category) => getEntityId(category) === categoryId),
    )
    .filter((category): category is Category => Boolean(category));
  const [submitError, setSubmitError] = useState("");

  const onSubmit = async (data: GameFormData) => {
    setSubmitError("");
    try {
      const gameData = {
        name: data.name,
        teams: [
          {
            name: data.teamAName,
            members: [],
          },
          {
            name: data.teamBName,
            members: [],
          },
        ],
        categoryIds: data.categoryIds,
      };

      const game = await createGame.mutateAsync(gameData);
      router.push(`/games/${getEntityId(game)}`);
    } catch (error) {
      const backendMessage = axios.isAxiosError(error)
        ? error.response?.data?.message || error.response?.data?.error
        : null;
      const backendCode = axios.isAxiosError(error)
        ? error.response?.data?.code
        : undefined;
      setSubmitError(
        gameValidationMessageAr(backendCode) ||
          backendMessage ||
          "تعذر إنشاء اللعبة. إذا كنت استخدمت لعبتك المجانية، تحتاج اشتراك عشان تنشئ لعبة جديدة.",
      );
      console.error("Failed to create game:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">اسم اللعبة</label>
        <Input placeholder="أدخل اسم اللعبة" {...register("name")} />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium mb-2">اسم الفريق أ</label>
          <Input placeholder="مثال: الفريق الأحمر" {...register("teamAName")} />
          {errors.teamAName && (
            <p className="text-sm text-destructive">
              {errors.teamAName.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">اسم الفريق ب</label>
          <Input placeholder="مثال: الفريق الأزرق" {...register("teamBName")} />
          {errors.teamBName && (
            <p className="text-sm text-destructive">
              {errors.teamBName.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <label className="block text-sm font-medium">الفئات المختارة</label>
            <p className="mt-1 text-sm text-muted-foreground">
              اخترت {selectedCategories.length} من 6 فئات
            </p>
          </div>
          <Button asChild type="button" variant="outline" size="sm">
            <Link href="/#categories">
              <Pencil className="ml-2 h-4 w-4" aria-hidden="true" />
              تعديل
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {selectedCategoryDetails.map((category) => {
            const bannerUrl = getMediaUrl(category?.banner?.url);

            return (
              <div
                key={getEntityId(category)}
                className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]"
              >
                {bannerUrl ? (
                  <>
                    <Image
                      src={bannerUrl}
                      alt={category?.name || "فئة"}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
                  </>
                ) : (
                  <span className="absolute inset-0 bg-gradient-to-br from-white/[0.08] to-primary/[0.06]" />
                )}
                <span className="absolute inset-x-0 bottom-0 p-3 text-sm font-black text-white drop-shadow">
                  {category?.name}
                </span>
              </div>
            );
          })}
        </div>
        {errors.categoryIds && (
          <p className="text-sm text-destructive">
            {errors.categoryIds.message}
          </p>
        )}
        {selectedCategories.length !== 6 && (
          <p className="mt-3 text-sm text-destructive">
            ارجع واختر 6 فئات قبل إنشاء اللعبة.
          </p>
        )}
      </div>

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <Button
        type="submit"
        disabled={createGame.isPending || selectedCategories.length !== 6}
      >
        {createGame.isPending ? "جاري الإنشاء..." : "ابدأ اللعبة"}
      </Button>
    </form>
  );
}
