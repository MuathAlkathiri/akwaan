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
  isTop10: _isTop10,
  values,
  setValue,
}: QuestionSettingsSectionProps) {
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
