"use client";

import { useMemo } from "react";
import type { FieldErrors, UseFormSetValue } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/types";
import {
  useScopes,
  useWorldBoard,
  useWorlds,
} from "@/features/world-management/hooks/use-world-content";
import type { QuestionFormData } from "../models/question-form-schema";

interface Props {
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
}: Props) {
  const isLegacyQuestion = Boolean(values.categoryId && !values.worldId);
  const { data: allWorlds = [] } = useWorlds();
  const { data: worldScopes = [] } = useScopes(values.worldId);
  const { data: board } = useWorldBoard(values.worldId);

  const worlds = useMemo(
    () => allWorlds.filter((world) => world.status === "active"),
    [allWorlds],
  );
  const scopesForWorld = useMemo(
    () =>
      worldScopes
        .filter((scope) => scope.status === "active")
        .map((scope) => ({ id: scope.id, name: scope.name })),
    [worldScopes],
  );
  // Challenge types are global now, so a World's options are its enabled board
  // configurations, shown under the name players see in that World.
  const challengesForWorld = useMemo(
    () =>
      (board?.configurations ?? [])
        .filter((configuration) => configuration.isEnabled)
        .filter(
          (configuration) =>
            !worldScopes
              .find((scope) => scope.id === values.contentCategoryId)
              ?.excludedChallengeTypeIds.includes(configuration.challengeTypeId),
        )
        .map((configuration) => ({
          id: configuration.challengeTypeId,
          name: configuration.effectiveName,
        })),
    [board, worldScopes, values.contentCategoryId],
  );
  const legacyCategory = categories.find(
    (item) => (item._id ?? item.id) === values.categoryId,
  );
  const pathComplete = Boolean(
    isLegacyQuestion ||
    (values.worldId && values.contentCategoryId && values.challengeTypeId),
  );
  const set = (
    field: "worldId" | "contentCategoryId" | "challengeTypeId",
    value: string,
  ) => setValue(field, value, { shouldDirty: true, shouldValidate: true });

  return (
    <Card>
      <CardHeader>
        <CardTitle>مسار المحتوى</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {values.categoryId && !values.worldId ? (
          <div className="rounded-xl border border-amber-300/25 bg-amber-500/10 p-4">
            <strong>سؤال قديم قابل للقراءة</strong>
            <p className="text-sm text-muted-foreground">
              التصنيف القديم: {legacyCategory?.name ?? values.categoryId}. يمكن
              إبقاؤه كما هو أثناء فترة الانتقال.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <TaxonomySelect
              label="1. العالم"
              value={values.worldId}
              placeholder="اختر العالم"
              items={worlds.map((world) => ({
                id: world.id,
                name: world.name,
              }))}
              onChange={(worldId) => {
                setValue("categoryId", "");
                set("worldId", worldId);
                set("contentCategoryId", "");
                set("challengeTypeId", "");
              }}
            />
            <TaxonomySelect
              label="2. النطاق"
              value={values.contentCategoryId}
              placeholder="اختر نطاقاً"
              items={scopesForWorld}
              disabled={!values.worldId}
              onChange={(value) => set("contentCategoryId", value)}
            />
            <TaxonomySelect
              label="3. نوع التحدي"
              value={values.challengeTypeId}
              placeholder="اختر تحدياً"
              items={challengesForWorld}
              disabled={!values.worldId}
              onChange={(value) => set("challengeTypeId", value)}
            />
          </div>
        )}
        {pathComplete && (
          <div>
            <label className="mb-2 block text-sm font-medium">
              4. نوع السؤال
            </label>
            <Select
              value={values.authoringType}
              onValueChange={(value: string) =>
                setValue(
                  "authoringType",
                  value as QuestionFormData["authoringType"],
                  { shouldDirty: true, shouldValidate: true },
                )
              }
            >
              <SelectTrigger className="max-w-sm" aria-label="نوع السؤال">
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
        )}
        {(errors.worldId ||
          errors.contentCategoryId ||
          errors.challengeTypeId) && (
          <p className="text-sm text-destructive">
            أكمل العالم والنطاق ونوع التحدي.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TaxonomySelect({
  label,
  value,
  placeholder,
  items,
  disabled,
  onChange,
}: {
  label: string;
  value?: string;
  placeholder: string;
  items: Array<{ id: string; name: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium">{label}</label>
      <Select
        value={value || undefined}
        disabled={disabled}
        onValueChange={onChange}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
