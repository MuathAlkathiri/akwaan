"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  useCreateScope,
  useUpdateScope,
  useWorldBoard,
  useWorldContentMetadata,
} from "../../hooks/use-world-content";
import { useAutoSlug } from "../../hooks/use-auto-slug";
import { useEntityFormSubmit } from "../../hooks/use-entity-form-submit";
import { buildScopePayload } from "../../services/world-content-forms";
import {
  AdvancedSlugField,
  FormIssueList,
  StatusSelect,
  UploadField,
} from "../shared";
import { FAMILY_LABEL } from "../../utils/world-content.labels";
import type { Scope, WorldContentStatus } from "../../types";

interface ScopeFormProps {
  worldId: string;
  scope?: Scope;
  onSuccess: () => void;
}

export function ScopeForm({ worldId, scope, onSuccess }: ScopeFormProps) {
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [name, setName] = useState(scope?.name ?? "");
  const [description, setDescription] = useState(scope?.description ?? "");
  const [status, setStatus] = useState<WorldContentStatus>(
    scope?.status ?? "draft",
  );
  const [excluded, setExcluded] = useState<string[]>(
    scope?.excludedChallengeTypeIds ?? [],
  );
  const slugField = useAutoSlug(scope?.slug, "scope");
  const board = useWorldBoard(worldId);
  const { data: metadata } = useWorldContentMetadata();
  const requiredUsableChallenges = metadata?.boardSlotCount ?? 0;

  const configurations = board.data?.configurations ?? [];
  const enabled = configurations.filter(
    (configuration) => configuration.isEnabled,
  );
  const usableCount = enabled.filter(
    (configuration) => !excluded.includes(configuration.challengeTypeId),
  ).length;
  const belowMinimum = usableCount < requiredUsableChallenges;

  const formSubmit = useEntityFormSubmit<Scope>({
    entityId: scope?.id,
    createMutation: useCreateScope(worldId),
    updateMutation: useUpdateScope(),
    successMessage: "تم حفظ النطاق.",
    errorMessage: "تعذر حفظ النطاق.",
  });

  const toggle = (challengeTypeId: string) =>
    setExcluded((current) =>
      current.includes(challengeTypeId)
        ? current.filter((value) => value !== challengeTypeId)
        : [...current, challengeTypeId],
    );

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = buildScopePayload({
      name,
      slug: slugField.slug,
      description,
      status,
      excludedChallengeTypeIds: excluded,
    });
    const ok = await formSubmit.submit(payload, assetFile ?? undefined);
    if (ok) onSuccess();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium">اسم النطاق</label>
        <Input
          value={name}
          placeholder="مثال: كأس العالم"
          onChange={(event) => {
            setName(event.target.value);
            slugField.onNameChange(event.target.value);
          }}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">الوصف</label>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <UploadField
        label="صورة النطاق"
        existingUrl={scope?.image?.url}
        value={assetFile}
        onChange={setAssetFile}
        disabled={formSubmit.isPending}
      />

      <div className="space-y-2 rounded-xl border p-3">
        <div>
          <p className="text-sm font-semibold">المكانيكا المستثناة</p>
          <p className="text-xs text-muted-foreground">
            النطاق لا يغيّر قواعد اللعب، لكنه يمنع تشغيل محتواه عبر مكانيكا غير
            مناسبة.
          </p>
        </div>

        {!configurations.length && (
          <p className="text-sm text-muted-foreground">
            لا توجد تحديات مهيأة في هذا العالم بعد.
          </p>
        )}

        {configurations.map((configuration) => (
          <label
            key={configuration.id}
            className="flex items-center gap-2 text-sm"
          >
            <Checkbox
              checked={excluded.includes(configuration.challengeTypeId)}
              onCheckedChange={() => toggle(configuration.challengeTypeId)}
            />
            <span>{configuration.displayName}</span>
            <span className="text-xs text-muted-foreground">
              {FAMILY_LABEL[configuration.challengeType.family]}
              {configuration.isEnabled ? "" : " · غير مفعّل"}
            </span>
          </label>
        ))}

        <p
          className={
            belowMinimum
              ? "text-sm font-medium text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {usableCount} تحدٍ متاح من {requiredUsableChallenges}
          {belowMinimum
            ? " — الاستثناءات تُسقط النطاق تحت الحد الأدنى للوحة."
            : ""}
        </p>
      </div>

      <StatusSelect value={status} onChange={setStatus} />

      <AdvancedSlugField slugField={slugField} />

      <FormIssueList error={formSubmit.error} issues={formSubmit.issues} />

      <Button type="submit" disabled={formSubmit.isPending} className="w-full">
        {formSubmit.isPending ? "جاري الحفظ..." : scope ? "حفظ النطاق" : "إضافة نطاق"}
      </Button>
    </form>
  );
}
