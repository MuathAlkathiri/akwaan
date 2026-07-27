"use client";

import type { UseFormSetValue } from "react-hook-form";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { QuestionFormData } from "@/features/questions/models/question-form-schema";

interface QuestionSettingsSectionProps {
  isTop10: boolean;
  values: QuestionFormData;
  setValue: UseFormSetValue<QuestionFormData>;
}

export function QuestionSettingsSection({
  isTop10,
  values,
  setValue,
}: QuestionSettingsSectionProps) {
  if (isTop10) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>حالة السؤال</CardTitle>
        </CardHeader>

        <CardContent className="max-w-sm">
          <QuestionStatusSelect
            value={values.status}
            setValue={setValue}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>الإعدادات</CardTitle>
      </CardHeader>

      <CardContent className="grid gap-4 md:grid-cols-3">
        <Select
          value={values.difficulty}
          onValueChange={(value: string) =>
            setValue(
              "difficulty",
              value as QuestionFormData["difficulty"],
              {
                shouldDirty: true,
              },
            )
          }
        >
          <SelectTrigger aria-label="الصعوبة">
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="easy">سهل</SelectItem>
            <SelectItem value="medium">متوسط</SelectItem>
            <SelectItem value="hard">صعب</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={values.points}
          onValueChange={(value: string) =>
            setValue(
              "points",
              value as QuestionFormData["points"],
              {
                shouldDirty: true,
              },
            )
          }
        >
          <SelectTrigger aria-label="النقاط">
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="200">200</SelectItem>
            <SelectItem value="400">400</SelectItem>
            <SelectItem value="600">600</SelectItem>
          </SelectContent>
        </Select>

        <QuestionStatusSelect
          value={values.status}
          setValue={setValue}
        />
      </CardContent>
    </Card>
  );
}

function QuestionStatusSelect({
  value,
  setValue,
}: {
  value: QuestionFormData["status"];
  setValue: UseFormSetValue<QuestionFormData>;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue: string) =>
        setValue(
          "status",
          nextValue as QuestionFormData["status"],
          {
            shouldDirty: true,
          },
        )
      }
    >
      <SelectTrigger aria-label="الحالة">
        <SelectValue />
      </SelectTrigger>

      <SelectContent>
        <SelectItem value="draft">مسودة</SelectItem>
        <SelectItem value="approved">معتمد</SelectItem>
        <SelectItem value="rejected">مرفوض</SelectItem>
      </SelectContent>
    </Select>
  );
}
