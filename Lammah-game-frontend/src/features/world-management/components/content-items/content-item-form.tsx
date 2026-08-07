"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  useCreateContentItem,
  useScopes,
  useUpdateContentItem,
  useWorldBoard,
  useWorldContentMetadata,
} from "../../hooks/use-world-content";
import { useEntityFormSubmit } from "../../hooks/use-entity-form-submit";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  findLocalFormProblems,
  toContentItemForm,
  type ContentItemFormValues,
} from "../../services/content-item-form.service";
import { FormIssueList } from "../shared";
import { AnswerPayloadFields } from "./answer-payload-fields";
import { Top5Fields } from "./top5-fields";
import { DistributedInformationFields } from "./distributed-information-fields";
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABEL,
  MEDIA_TYPES,
  MEDIA_TYPE_LABEL,
  worldChallengeConfigurationName,
} from "../../utils/world-content.labels";
import type {
  ContentItem,
  ContentItemStatus,
  ContentMediaType,
} from "../../types";

interface ContentItemFormProps {
  worldId: string;
  contentItem?: ContentItem;
  defaultScopeId?: string;
  onSuccess: () => void;
}

export function ContentItemForm({
  worldId,
  contentItem,
  defaultScopeId,
  onSuccess,
}: ContentItemFormProps) {
  const { data: scopes = [] } = useScopes(worldId);
  const { data: board } = useWorldBoard(worldId);
  const { data: metadata } = useWorldContentMetadata();
  const [values, setValues] = useState<ContentItemFormValues>(
    contentItem
      ? toContentItemForm(contentItem)
      : emptyContentItemForm(defaultScopeId ?? ""),
  );
  const [localProblems, setLocalProblems] = useState<string[]>([]);

  const set = (patch: Partial<ContentItemFormValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  const selectedScope = scopes.find((scope) => scope.id === values.scopeId);
  // Mechanics the Scope excludes are not offered at all (roadmap 5.2).
  const availableChallengeTypes = (board?.configurations ?? []).filter(
    (configuration) =>
      !selectedScope?.excludedChallengeTypeIds.includes(
        configuration.challengeTypeId,
      ),
  );
  const selectedChallengeTypes = availableChallengeTypes.filter(
    (configuration) =>
      values.compatibleChallengeTypeIds.includes(configuration.challengeTypeId),
  );
  // Only the payload modes every selected mechanic can consume, using the
  // compatibility table the backend enforces.
  const availableModes = selectedChallengeTypes.length
    ? selectedChallengeTypes
        .map(
          (configuration) =>
            metadata?.answerModeCompatibility.find(
              (entry) =>
                entry.challengeAnswerMode ===
                configuration.challengeType.answerMode,
            )?.itemAnswerModes ?? [],
        )
        .reduce((shared, modes) =>
          shared.filter((mode) => modes.includes(mode)),
        )
    : [];

  const distributedSelected = selectedChallengeTypes.some(
    (configuration) => configuration.challengeType.answerMode === "distributed",
  );
  // Keep the payload flag in step with the selection, so deselecting the
  // mechanic stops emitting its payload.
  useEffect(() => {
    setValues((current) =>
      current.distributed.enabled === distributedSelected
        ? current
        : {
            ...current,
            distributed: { ...current.distributed, enabled: distributedSelected },
          },
    );
  }, [distributedSelected]);

  const formSubmit = useEntityFormSubmit<ContentItem>({
    entityId: contentItem?.id,
    createMutation: useCreateContentItem(),
    updateMutation: useUpdateContentItem(),
    successMessage: "تم حفظ عنصر المحتوى.",
    errorMessage: "تعذر حفظ عنصر المحتوى.",
  });

  const toggleChallengeType = (challengeTypeId: string) =>
    set({
      compatibleChallengeTypeIds: values.compatibleChallengeTypeIds.includes(
        challengeTypeId,
      )
        ? values.compatibleChallengeTypeIds.filter(
            (value) => value !== challengeTypeId,
          )
        : [...values.compatibleChallengeTypeIds, challengeTypeId],
    });

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problems = findLocalFormProblems(values);
    setLocalProblems(problems);
    if (problems.length) return;
    const ok = await formSubmit.submit(buildContentItemPayload(values));
    if (ok) onSuccess();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium">النطاق</label>
        <Select
          value={values.scopeId}
          onValueChange={(next: string) =>
            set({ scopeId: next, compatibleChallengeTypeIds: [] })
          }
        >
          <SelectTrigger aria-label="النطاق">
            <SelectValue placeholder="اختر نطاقاً" />
          </SelectTrigger>
          <SelectContent>
            {scopes.map((scope) => (
              <SelectItem key={scope.id} value={scope.id}>
                {scope.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">
          العالم مشتق من النطاق تلقائياً.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">نص السؤال</label>
        <Textarea
          value={values.promptAr}
          rows={3}
          onChange={(event) => set({ promptAr: event.target.value })}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          النص بالإنجليزية (اختياري)
        </label>
        <Input
          value={values.promptEn}
          onChange={(event) => set({ promptEn: event.target.value })}
        />
      </div>

      <div className="space-y-2 rounded-xl border p-3">
        <p className="text-sm font-semibold">التحديات المتوافقة</p>
        {!availableChallengeTypes.length && (
          <p className="text-sm text-muted-foreground">
            لا توجد تحديات متاحة لهذا النطاق.
          </p>
        )}
        {availableChallengeTypes.map((configuration) => {
          const challengeName = worldChallengeConfigurationName(configuration);
          const hasWorldName =
            challengeName !== configuration.challengeType.name;

          return (
            <label
              key={configuration.id}
              className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60"
            >
              <Checkbox
                className="mt-0.5"
                checked={values.compatibleChallengeTypeIds.includes(
                  configuration.challengeTypeId,
                )}
                onCheckedChange={() =>
                  toggleChallengeType(configuration.challengeTypeId)
                }
              />
              <span className="min-w-0">
                <span className="block font-medium">{challengeName}</span>
                {hasWorldName && (
                  <span className="block text-xs text-muted-foreground">
                    نوع التحدي: {configuration.challengeType.name}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <AnswerPayloadFields
        value={values.answer}
        onChange={(answer) => set({ answer })}
        availableModes={availableModes}
      />

      {values.answer.mode === "top_5" && (
        <Top5Fields
          value={values.top5}
          onChange={(top5) => set({ top5 })}
        />
      )}

      {values.distributed.enabled && (
        <DistributedInformationFields
          value={values.distributed}
          onChange={(distributed) => set({ distributed })}
          answerMode={values.answer.mode}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">الوسائط</label>
          <Select
            value={values.mediaType}
            onValueChange={(next: string) =>
              set({ mediaType: next as ContentMediaType })
            }
          >
            <SelectTrigger aria-label="الوسائط">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEDIA_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {MEDIA_TYPE_LABEL[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">الحالة</label>
          <Select
            value={values.status}
            onValueChange={(next: string) =>
              set({ status: next as ContentItemStatus })
            }
          >
            <SelectTrigger aria-label="الحالة">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {CONTENT_STATUS_LABEL[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {values.mediaType !== "none" && (
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            روابط الوسائط (سطر لكل رابط)
          </label>
          <Textarea
            rows={2}
            value={values.mediaUrls.join("\n")}
            onChange={(event) =>
              set({ mediaUrls: event.target.value.split("\n") })
            }
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={values.isReusableAcrossSessions}
          onCheckedChange={(checked: boolean | "indeterminate") =>
            set({ isReusableAcrossSessions: checked === true })
          }
        />
        <span>قابل للتكرار بين الجلسات</span>
      </label>
      <p className="-mt-2 text-xs text-muted-foreground">
        المحتوى العلائقي فقط يُعاد استخدامه عادة، لأن الإجابة تتغير مع المجموعة.
      </p>

      <div>
        <label className="mb-1.5 block text-sm font-medium">ملاحظات</label>
        <Textarea
          rows={2}
          value={values.notes}
          onChange={(event) => set({ notes: event.target.value })}
        />
      </div>

      <FormIssueList
        error={formSubmit.error}
        issues={[...localProblems, ...formSubmit.issues]}
      />

      <Button type="submit" disabled={formSubmit.isPending} className="w-full">
        {formSubmit.isPending
          ? "جاري الحفظ..."
          : contentItem
            ? "حفظ العنصر"
            : "إضافة عنصر"}
      </Button>
    </form>
  );
}
