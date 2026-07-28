"use client";

import type { FieldErrors, UseFormSetValue } from "react-hook-form";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getEntityId } from "@/lib/utils";
import type { Category } from "@/types";

import type { QuestionFormData } from "../models/question-form-schema";
interface QuestionClassificationSectionProps {
  categories: Category[];
  values: QuestionFormData;
  errors: FieldErrors<QuestionFormData>;
  setValue: UseFormSetValue<QuestionFormData>;
}

export function QuestionClassificationSection({
  categories,
  values,
  errors,
  setValue,
}: QuestionClassificationSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>نوع السؤال والتصنيف</CardTitle>
      </CardHeader>

      <CardContent className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium">
            نوع التأليف
          </label>

          <Select
            value={values.authoringType}
            onValueChange={(value: string) =>
              setValue(
                "authoringType",
                value as QuestionFormData["authoringType"],
                {
                  shouldDirty: true,
                  shouldValidate: true,
                },
              )
            }
          >
            <SelectTrigger aria-label="نوع التأليف">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="text">نص</SelectItem>
              <SelectItem value="image">صورة</SelectItem>
              <SelectItem value="audio">صوت</SelectItem>
              <SelectItem value="video">فيديو</SelectItem>
              <SelectItem value="top10">Top 10</SelectItem>
              <SelectItem value="bomb">Bomb sequence</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">الفئة</label>

          <Select
            value={values.categoryId}
            onValueChange={(value: string) =>
              setValue("categoryId", value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="اختر فئة" />
            </SelectTrigger>

            <SelectContent>
              {categories.map((category) => (
                <SelectItem
                  key={getEntityId(category)}
                  value={getEntityId(category)}
                >
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {errors.categoryId && (
            <p className="mt-1 text-sm text-destructive">
              {errors.categoryId.message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
