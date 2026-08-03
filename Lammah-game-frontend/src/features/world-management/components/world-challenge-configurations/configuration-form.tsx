"use client";

import { useState } from "react";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  useChallengeTypes,
  useCreateWorldChallengeConfiguration,
  useUpdateWorldChallengeConfiguration,
  useWorldContentMetadata,
} from "../../hooks/use-world-content";
import { useEntityFormSubmit } from "../../hooks/use-entity-form-submit";
import { buildConfigurationPayload } from "../../services/world-content-forms";
import { FormIssueList } from "../shared";
import {
  ANSWER_MODE_LABEL,
  FAMILY_LABEL,
  SLOT_KEY_LABEL,
} from "../../utils/world-content.labels";
import type {
  ChallengeType,
  WorldChallengeConfiguration,
  WorldChallengeSlotKey,
} from "../../types";

interface ConfigurationFormProps {
  worldId: string;
  configuration?: WorldChallengeConfiguration;
  onSuccess: () => void;
}

/**
 * Puts a global mechanic into one board position.
 *
 * There are only two decisions: which position, and which mechanic. Timing,
 * input, reveal behaviour, name, and scoring belong to the mechanic; media
 * belongs to the ContentItem. Nothing here is configured per World.
 */
export function ConfigurationForm({
  worldId,
  configuration,
  onSuccess,
}: ConfigurationFormProps) {
  const { data: challengeTypes = [], isLoading: loadingChallengeTypes } =
    useChallengeTypes();
  const { data: metadata } = useWorldContentMetadata();

  const [challengeTypeId, setChallengeTypeId] = useState(
    configuration?.challengeTypeId ?? "",
  );
  const [slotKey, setSlotKey] = useState<WorldChallengeSlotKey>(
    configuration?.slotKey ?? "ryo_1",
  );
  const [sortOrder, setSortOrder] = useState(configuration?.sortOrder ?? 0);
  const [isEnabled, setIsEnabled] = useState(configuration?.isEnabled ?? true);
  const [localProblems, setLocalProblems] = useState<string[]>([]);

  const slots = metadata?.slots ?? [];
  const allowedFamilies =
    slots.find((slot) => slot.key === slotKey)?.allowedFamilies ?? [];
  const selectable = challengeTypes.filter(
    (challengeType) =>
      allowedFamilies.includes(challengeType.family) &&
      challengeType.status === "active",
  );
  const selected = challengeTypes.find(
    (challengeType) => challengeType.id === challengeTypeId,
  );

  const formSubmit = useEntityFormSubmit<WorldChallengeConfiguration>({
    entityId: configuration?.id,
    createMutation: useCreateWorldChallengeConfiguration(worldId),
    updateMutation: useUpdateWorldChallengeConfiguration(),
    successMessage: "تم حفظ التحدي في اللوحة.",
    errorMessage: "تعذر حفظ التحدي.",
  });

  const onSlotChange = (next: string) => {
    const nextSlot = next as WorldChallengeSlotKey;
    setSlotKey(nextSlot);
    const nextAllowed =
      slots.find((slot) => slot.key === nextSlot)?.allowedFamilies ?? [];
    if (selected && !nextAllowed.includes(selected.family)) {
      setChallengeTypeId("");
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problems = challengeTypeId ? [] : ["اختر المكانيكا أولاً."];
    setLocalProblems(problems);
    if (problems.length) return;

    const ok = await formSubmit.submit(
      buildConfigurationPayload(
        { challengeTypeId, slotKey, sortOrder, isEnabled },
        Boolean(configuration),
      ),
    );
    if (ok) onSuccess();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium">
          ١. الخانة في اللوحة
        </label>
        <Select value={slotKey} onValueChange={onSlotChange}>
          <SelectTrigger aria-label="الخانة في اللوحة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {slots.map((slot) => (
              <SelectItem key={slot.key} value={slot.key}>
                {SLOT_KEY_LABEL[slot.key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">
          لوحة كل عالم: خانة توقيع، خانتا «اقرأ خصمك»، وخانة مرنة. المكانيكا
          نفسها تملأ الخانتين.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">٢. المكانيكا</label>
        <Select
          value={challengeTypeId}
          onValueChange={setChallengeTypeId}
          disabled={Boolean(configuration) || !selectable.length}
        >
          <SelectTrigger aria-label="المكانيكا">
            <SelectValue placeholder="اختر المكانيكا" />
          </SelectTrigger>
          <SelectContent>
            {selectable.map((challengeType) => (
              <SelectItem key={challengeType.id} value={challengeType.id}>
                {challengeType.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!loadingChallengeTypes && !selectable.length && !configuration && (
          <p className="mt-1 text-xs text-destructive">
            لا توجد مكانيكا نشطة من نوع{" "}
            {allowedFamilies.map((family) => FAMILY_LABEL[family]).join(" أو ")}.
            أضفها من تبويب «المكانيكا العامة» واجعل حالتها نشطة.
          </p>
        )}
        {configuration && (
          <p className="mt-1 text-xs text-muted-foreground">
            لتغيير المكانيكا، احذف هذا الإعداد وأضف واحداً جديداً.
          </p>
        )}
      </div>

      {selected && <SelectedMechanicSummary challengeType={selected} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            ترتيب العرض
          </label>
          <input
            type="number"
            min={0}
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value) || 0)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <Checkbox
            checked={isEnabled}
            onCheckedChange={(checked: boolean | "indeterminate") =>
              setIsEnabled(checked === true)
            }
          />
          <span>مفعّل في اللوحة</span>
        </label>
      </div>

      <FormIssueList
        error={formSubmit.error}
        issues={[...localProblems, ...formSubmit.issues]}
      />

      <Button type="submit" disabled={formSubmit.isPending} className="w-full">
        {formSubmit.isPending
          ? "جاري الحفظ..."
          : configuration
            ? "حفظ"
            : "إضافة إلى اللوحة"}
      </Button>
    </form>
  );
}

/** Everything the mechanic already decides, shown read-only. */
function SelectedMechanicSummary({
  challengeType,
}: {
  challengeType: ChallengeType;
}) {
  const timer = challengeType.defaultPresentation.timerSeconds;
  return (
    <div className="flex gap-2 rounded-xl border bg-muted/40 p-3 text-xs">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="space-y-0.5">
        <p>
          <span className="text-muted-foreground">الاسم عند اللاعب: </span>
          {challengeType.name}
        </p>
        <p className="text-muted-foreground">
          {FAMILY_LABEL[challengeType.family]} ·{" "}
          {ANSWER_MODE_LABEL[challengeType.answerMode]} ·{" "}
          {timer ? `${timer} ثانية لكل فقرة` : "إيقاع تحدده المكانيكا"}
        </p>
        <p className="text-muted-foreground">
          الاسم والتوقيت وطريقة العرض ثابتة في كل العوالم. الوسائط تُحدد داخل
          عنصر المحتوى.
        </p>
      </div>
    </div>
  );
}
