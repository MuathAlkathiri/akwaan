"use client";

import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";

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
  useChallengeTypes,
  useCreateWorldChallengeConfiguration,
  useUpdateWorldChallengeConfiguration,
  useWorldBoard,
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
  /** Pre-selects the position when assigning into a specific empty slot. */
  defaultSlotKey?: WorldChallengeSlotKey;
  onSuccess: () => void;
}

/**
 * Puts a global mechanic into one board position.
 *
 * The position is generic. Runtime fields stay on the global mechanic, while
 * the World may override only its player-facing copy.
 */
export function ConfigurationForm({
  worldId,
  configuration,
  defaultSlotKey,
  onSuccess,
}: ConfigurationFormProps) {
  const { data: challengeTypes = [], isLoading: loadingChallengeTypes } =
    useChallengeTypes();
  const { data: metadata } = useWorldContentMetadata();
  const { data: board } = useWorldBoard(worldId);

  const [challengeTypeId, setChallengeTypeId] = useState(
    configuration?.challengeTypeId ?? "",
  );
  const [slotKey, setSlotKey] = useState<WorldChallengeSlotKey>(
    configuration?.slotKey ?? defaultSlotKey ?? "slot_1",
  );
  const [displayName, setDisplayName] = useState(
    configuration?.displayName ?? "",
  );
  const [description, setDescription] = useState(
    configuration?.description ?? "",
  );
  const [instructions, setInstructions] = useState(
    configuration?.instructions ?? "",
  );
  const [sortOrder, setSortOrder] = useState(configuration?.sortOrder ?? 0);
  const [isEnabled, setIsEnabled] = useState(configuration?.isEnabled ?? true);
  const [localProblems, setLocalProblems] = useState<string[]>([]);

  const slots = metadata?.slots ?? [];
  const otherConfigurations = useMemo(
    () =>
      (board?.configurations ?? []).filter(
        (entry) => entry.id !== configuration?.id,
      ),
    [board?.configurations, configuration?.id],
  );
  const assignedChallengeTypeIds = new Set(
    otherConfigurations.map((entry) => entry.challengeTypeId),
  );
  const selectable = challengeTypes.filter(
    (challengeType) =>
      challengeType.status === "active" &&
      !assignedChallengeTypeIds.has(challengeType.id),
  );
  const occupiedSlots = useMemo(
    () => new Set(otherConfigurations.map((entry) => entry.slotKey)),
    [otherConfigurations],
  );
  const selectableSlots = slots.filter((slot) => !occupiedSlots.has(slot.key));
  useEffect(() => {
    if (!configuration && occupiedSlots.has(slotKey) && selectableSlots[0]) {
      setSlotKey(selectableSlots[0].key);
    }
  }, [configuration, occupiedSlots, selectableSlots, slotKey]);
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

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problems = challengeTypeId ? [] : ["اختر المكانيكا أولاً."];
    setLocalProblems(problems);
    if (problems.length) return;

    const ok = await formSubmit.submit(
      buildConfigurationPayload(
        {
          challengeTypeId,
          slotKey,
          displayName,
          description,
          instructions,
          sortOrder,
          isEnabled,
        },
        Boolean(configuration),
      ),
    );
    if (ok) onSuccess();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium">
          <span className="akwaan-numeral">1</span>. الموضع
        </label>
        <Select
          value={slotKey}
          onValueChange={(value: string) =>
            setSlotKey(value as WorldChallengeSlotKey)
          }
        >
          <SelectTrigger aria-label="الموضع في اللوحة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectableSlots.map((slot) => (
              <SelectItem key={slot.key} value={slot.key}>
                {SLOT_KEY_LABEL[slot.key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">
          كل عالم يملك أربع خانات متساوية. نوع التحدي الذي تختاره هو ما يحدد
          طريقة اللعب.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          <span className="akwaan-numeral">2</span>. المكانيكا
        </label>
        <Select
          value={challengeTypeId}
          onValueChange={setChallengeTypeId}
          disabled={!selectable.length}
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
            لا توجد مكانيكا نشطة أخرى متاحة. فعّل مكانيكا عامة أو استبدل أحد
            تحديات اللوحة.
          </p>
        )}
      </div>

      {selected && <SelectedMechanicSummary challengeType={selected} />}

      <div className="space-y-3 rounded-xl border p-3">
        <p className="text-sm font-semibold">النص الظاهر في هذا العالم</p>
        <div>
          <label className="mb-1.5 block text-sm font-medium">اسم التحدي</label>
          <Input
            value={displayName}
            placeholder={selected?.name ?? "اتركه فارغاً لاستخدام الاسم العام"}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">الوصف</label>
          <Textarea
            value={description}
            placeholder="وصف مختصر مناسب لهذا العالم (اختياري)"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">التعليمات</label>
          <Textarea
            value={instructions}
            placeholder="تعليمات اللاعب في هذا العالم (اختياري)"
            onChange={(event) => setInstructions(event.target.value)}
          />
        </div>
      </div>

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

/** Global runtime facts, shown read-only. */
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
          <span className="text-muted-foreground">الاسم العام: </span>
          {challengeType.name}
        </p>
        <p className="text-muted-foreground">
          {FAMILY_LABEL[challengeType.family]} ·{" "}
          {ANSWER_MODE_LABEL[challengeType.answerMode]} ·{" "}
          {timer ? `${timer} ثانية لكل فقرة` : "إيقاع تحدده المكانيكا"}
        </p>
        <p className="text-muted-foreground">
          طريقة اللعب والتوقيت والنقاط ثابتة في كل العوالم. يمكنك تخصيص الاسم
          والوصف والتعليمات فقط.
        </p>
      </div>
    </div>
  );
}
