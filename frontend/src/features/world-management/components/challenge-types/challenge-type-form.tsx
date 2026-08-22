"use client";

import { useEffect, useState } from "react";

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

import {
  useWorldContentMetadata,
  useCreateChallengeType,
  useUpdateChallengeType,
} from "../../hooks/use-world-content";
import { useAutoSlug } from "../../hooks/use-auto-slug";
import { useEntityFormSubmit } from "../../hooks/use-entity-form-submit";
import {
  buildChallengeTypePayload,
  EMPTY_PRESENTATION,
  normalizePlayerInstructions,
} from "../../services/world-content-forms";
import {
  AdvancedSlugField,
  FormIssueList,
  PlayerInstructionsFields,
  PresentationFields,
  StatusSelect,
  UploadField,
} from "../shared";
import {
  ANSWER_MODE_LABEL,
  FAMILY_LABEL,
  ITEM_STRUCTURE_LABEL,
  SCORING_RULE_PRESENTATION,
  scoringRuleDescription,
  scoringRuleLabel,
} from "../../utils/world-content.labels";
import type {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  ChallengePresentation,
  ChallengeType,
  WorldContentStatus,
} from "../../types";

interface ChallengeTypeFormProps {
  challengeType?: ChallengeType;
  onSuccess: () => void;
}

/**
 * Defines a mechanic once, globally. Families, answer modes, item structures, and
 * scoring rules all come from the server metadata endpoint, so this form can
 * never offer a combination the backend would reject as unknown.
 */
export function ChallengeTypeForm({
  challengeType,
  onSuccess,
}: ChallengeTypeFormProps) {
  const metadata = useWorldContentMetadata();
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [name, setName] = useState(challengeType?.name ?? "");
  const [description, setDescription] = useState(
    challengeType?.description ?? "",
  );
  const [family, setFamily] = useState<ChallengeFamily>(
    challengeType?.family ?? "ryo",
  );
  const [answerMode, setAnswerMode] = useState<ChallengeAnswerMode>(
    challengeType?.answerMode ?? "ryo",
  );
  const [itemStructure, setItemStructure] = useState<ChallengeItemStructure>(
    challengeType?.itemStructure ?? "discrete_triple",
  );
  const [scoringRuleId, setScoringRuleId] = useState(
    challengeType?.scoringRuleId ?? "",
  );
  const [status, setStatus] = useState<WorldContentStatus>(
    challengeType?.status ?? "draft",
  );
  const [presentation, setPresentation] = useState<ChallengePresentation>(
    challengeType?.defaultPresentation ?? EMPTY_PRESENTATION,
  );
  const slugField = useAutoSlug(challengeType?.slug, "mechanic");

  const familyMeta = metadata.data?.families.find(
    (entry) => entry.value === family,
  );
  const productionDefinition = metadata.data?.productionMechanics.find(
    (entry) => entry.slug === challengeType?.slug,
  );
  const runtimeOwned = Boolean(productionDefinition);
  const allowedAnswerModes = familyMeta?.allowedAnswerModes ?? [];
  const scoringRules = (metadata.data?.scoringRules ?? []).filter((rule) =>
    productionDefinition
      ? rule.id === productionDefinition.matchScoringRuleId
      : SCORING_RULE_PRESENTATION[rule.id]?.family === family,
  );

  useEffect(() => {
    if (!scoringRules.length) return;
    if (!scoringRules.some((rule) => rule.id === scoringRuleId)) {
      setScoringRuleId(scoringRules[0].id);
    }
  }, [scoringRuleId, scoringRules]);

  // A new mechanic starts on its family's pacing budget as soon as the served
  // rules arrive, so the timer is never an empty box the author has to guess at.
  useEffect(() => {
    if (challengeType || !familyMeta) return;
    setPresentation((current) =>
      current.timerSeconds === null
        ? { ...current, timerSeconds: familyMeta.defaultTimerSeconds }
        : current,
    );
  }, [challengeType, familyMeta]);

  const formSubmit = useEntityFormSubmit<ChallengeType>({
    entityId: challengeType?.id,
    createMutation: useCreateChallengeType(),
    updateMutation: useUpdateChallengeType(),
    successMessage: "تم حفظ المكانيكا.",
    errorMessage: "تعذر حفظ المكانيكا.",
  });

  const onFamilyChange = (next: string) => {
    const nextFamily = next as ChallengeFamily;
    setFamily(nextFamily);
    const entry = metadata.data?.families.find(
      (candidate) => candidate.value === nextFamily,
    );
    const allowed = entry?.allowedAnswerModes ?? [];
    if (allowed.length && !allowed.includes(answerMode)) {
      setAnswerMode(allowed[0]);
    }
    // Roadmap 3.4 gives each family its pacing budget, so the timer is declared
    // by the system rather than invented per mechanic.
    if (entry) {
      setPresentation((current) => ({
        ...current,
        timerSeconds: entry.defaultTimerSeconds,
      }));
    }
  };

  const onAnswerModeChange = (next: string) => {
    const nextMode = next as ChallengeAnswerMode;
    setAnswerMode(nextMode);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = buildChallengeTypePayload({
      name,
      slug: slugField.slug,
      description,
      family,
      itemStructure,
      answerMode,
      scoringRuleId,
      status,
      defaultPresentation: presentation,
    });
    const ok = await formSubmit.submit(payload, assetFile ?? undefined);
    if (ok) onSuccess();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium">اسم المكانيكا</label>
        <Input
          value={name}
          placeholder="مثال: اقرأ خصمك"
          onChange={(event) => {
            setName(event.target.value);
            slugField.onNameChange(event.target.value);
          }}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          هذا اسم داخلي. الاسم الذي يراه اللاعب يُحدد لكل عالم على حدة.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">الوصف</label>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">العائلة</label>
          <Select value={family} onValueChange={onFamilyChange} disabled={runtimeOwned}>
            <SelectTrigger aria-label="العائلة">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(metadata.data?.families ?? []).map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {FAMILY_LABEL[entry.value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            {familyMeta?.mustBeExclusive
              ? "مكانيكا التوقيع حصرية لعالم واحد فقط، وتحدد إيقاعها بنفسها."
              : `ميزانية الإيقاع لهذه العائلة: ${familyMeta?.defaultTimerSeconds ?? "—"} ثانية لكل فقرة.`}
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            نمط الإجابة
          </label>
          <Select value={answerMode} onValueChange={onAnswerModeChange} disabled={runtimeOwned}>
            <SelectTrigger aria-label="نمط الإجابة">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedAnswerModes.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {ANSWER_MODE_LABEL[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            بنية الفقرات
          </label>
          <Select
            value={itemStructure}
            disabled={runtimeOwned}
            onValueChange={(next: string) =>
              setItemStructure(next as ChallengeItemStructure)
            }
          >
            <SelectTrigger aria-label="بنية الفقرات">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(metadata.data?.itemStructures ?? []).map((structure) => (
                <SelectItem key={structure} value={structure}>
                  {ITEM_STRUCTURE_LABEL[structure]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            طريقة احتساب النقاط
          </label>
          {scoringRules.length > 1 ? (
            <Select value={scoringRuleId} onValueChange={setScoringRuleId}>
              <SelectTrigger aria-label="طريقة احتساب النقاط">
                <SelectValue placeholder="اختر طريقة الاحتساب" />
              </SelectTrigger>
              <SelectContent>
                {scoringRules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {scoringRuleLabel(rule.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm font-medium">
              {scoringRuleId
                ? scoringRuleLabel(scoringRuleId)
                : "يتم اختيار طريقة الاحتساب تلقائيًا حسب العائلة"}
            </div>
          )}
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {scoringRuleId
              ? scoringRuleDescription(scoringRuleId)
              : "اختر عائلة التحدي وسيحدد النظام طريقة احتساب النقاط المناسبة."}
          </p>
        </div>
      </div>

      <PresentationFields value={presentation} onChange={setPresentation} />

      <PlayerInstructionsFields
        value={
          presentation.playerInstructions ?? { summary: "", steps: [] }
        }
        onChange={(playerInstructions) =>
          setPresentation((current) => ({ ...current, playerInstructions }))
        }
      />

      <PlayerInstructionsPreview value={presentation.playerInstructions} />

      <UploadField
        label="أيقونة المكانيكا"
        existingUrl={challengeType?.icon?.url}
        value={assetFile}
        onChange={setAssetFile}
        disabled={formSubmit.isPending}
      />

      <StatusSelect
        value={status}
        onChange={setStatus}
        statuses={["draft", "active"]}
        hint="المكانيكا يجب أن تكون نشطة لتُستخدم في لوحة أي عالم."
      />

      {runtimeOwned && (
        <p className="text-xs text-muted-foreground">
          العائلة ونمط الإجابة والبنية وقاعدة نقاط المباراة والمعرّف مرتبطة بتنفيذ التشغيل ولا يمكن تعديلها يدويًا.
        </p>
      )}
      <AdvancedSlugField slugField={slugField} disabled={runtimeOwned} />

      <FormIssueList error={formSubmit.error} issues={formSubmit.issues} />

      <Button type="submit" disabled={formSubmit.isPending} className="w-full">
        {formSubmit.isPending
          ? "جاري الحفظ..."
          : challengeType
            ? "حفظ المكانيكا"
            : "إضافة مكانيكا"}
      </Button>
    </form>
  );
}

/**
 * "معاينة شرح اللاعبين" — the authored instructions as a player would meet them,
 * so an author sees the shape they are writing without leaving the form. It reads
 * from the same normalizer the payload uses, so a field that would be dropped on
 * save is dropped here too.
 */
function PlayerInstructionsPreview({
  value,
}: {
  value: ChallengePresentation["playerInstructions"];
}) {
  const normalized = normalizePlayerInstructions(value);
  if (!normalized) return null;
  return (
    <div
      className="space-y-3 rounded-xl border bg-muted/30 p-3"
      data-testid="player-instructions-preview"
    >
      <p className="text-xs font-semibold text-muted-foreground">
        معاينة شرح اللاعبين
      </p>
      {normalized.summary && <p className="text-sm">{normalized.summary}</p>}
      {normalized.steps.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium">كيف تلعبون؟</p>
          <ol className="list-inside list-decimal space-y-1 text-sm">
            {normalized.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {normalized.highlights && normalized.highlights.length > 0 && (
        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          {normalized.highlights.map((highlight, index) => (
            <li key={index}>{highlight}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
