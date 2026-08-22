"use client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PlayerInstructions } from "../../types";

/**
 * Authoring "شرح التحدي للاعبين" on the mechanic itself.
 *
 * These instructions are canonical to the ChallengeType and invariant across
 * every World — a World may rename or recolour a challenge, but never restate how
 * the mechanic is played. So this lives on the ChallengeType form and nowhere
 * else. It explains the *rule*; it never repeats a tunable number the runtime
 * owns (a timer, a stage count), because those are rendered live from config.
 *
 * The shape mirrors the backend exactly: a short summary, ordered steps, and
 * optional highlights. Empty fields are the author's business — the payload
 * builder drops anything blank, and readiness (not this form) flags a mechanic
 * whose instructions are still incomplete.
 */
export function PlayerInstructionsFields({
  value,
  onChange,
}: {
  value: PlayerInstructions;
  onChange: (value: PlayerInstructions) => void;
}) {
  const steps = value.steps ?? [];
  const highlights = value.highlights ?? [];

  const setSummary = (summary: string) => onChange({ ...value, summary });

  const setStep = (index: number, text: string) =>
    onChange({
      ...value,
      steps: steps.map((step, i) => (i === index ? text : step)),
    });
  const addStep = () => onChange({ ...value, steps: [...steps, ""] });
  const removeStep = (index: number) =>
    onChange({ ...value, steps: steps.filter((_, i) => i !== index) });
  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...value, steps: next });
  };

  const setHighlight = (index: number, text: string) =>
    onChange({
      ...value,
      highlights: highlights.map((h, i) => (i === index ? text : h)),
    });
  const addHighlight = () =>
    onChange({ ...value, highlights: [...highlights, ""] });
  const removeHighlight = (index: number) =>
    onChange({
      ...value,
      highlights: highlights.filter((_, i) => i !== index),
    });

  return (
    <div className="space-y-4 rounded-xl border p-3" data-testid="player-instructions-fields">
      <div>
        <p className="text-sm font-semibold">شرح التحدي للاعبين</p>
        <p className="text-xs text-muted-foreground">
          هذا الشرح يظهر للاعبين قبل بدء التحدي، وهو ثابت لكل العوالم. اشرح القاعدة،
          ولا تكتب الأرقام المتغيرة كالمؤقت — النظام يعرضها تلقائيًا.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">نبذة قصيرة</label>
        <Textarea
          value={value.summary ?? ""}
          maxLength={240}
          placeholder="جملة أو جملتان تشرح فكرة التحدي بسرعة."
          onChange={(event) => setSummary(event.target.value)}
          aria-label="نبذة قصيرة"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">كيف تلعبون؟</label>
        {steps.length === 0 && (
          <p className="text-xs text-muted-foreground">
            أضف الخطوات بالترتيب الذي يراه اللاعبون.
          </p>
        )}
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-2">
            <span className="mt-2 w-5 shrink-0 text-sm text-muted-foreground">
              {index + 1}.
            </span>
            <Input
              value={step}
              maxLength={200}
              placeholder="خطوة واضحة وقصيرة"
              onChange={(event) => setStep(index, event.target.value)}
              aria-label={`الخطوة ${index + 1}`}
            />
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`تحريك الخطوة ${index + 1} لأعلى`}
                disabled={index === 0}
                onClick={() => moveStep(index, -1)}
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`تحريك الخطوة ${index + 1} لأسفل`}
                disabled={index === steps.length - 1}
                onClick={() => moveStep(index, 1)}
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`حذف الخطوة ${index + 1}`}
                onClick={() => removeStep(index)}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addStep}
          disabled={steps.length >= 8}
        >
          <Plus className="me-1.5 size-4" />
          إضافة خطوة
        </Button>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          ملاحظات مهمة <span className="text-muted-foreground">(اختياري)</span>
        </label>
        {highlights.map((highlight, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={highlight}
              maxLength={200}
              placeholder="تنبيه أو نصيحة سريعة"
              onChange={(event) => setHighlight(index, event.target.value)}
              aria-label={`ملاحظة ${index + 1}`}
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`حذف الملاحظة ${index + 1}`}
              onClick={() => removeHighlight(index)}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addHighlight}
          disabled={highlights.length >= 5}
        >
          <Plus className="me-1.5 size-4" />
          إضافة ملاحظة
        </Button>
      </div>
    </div>
  );
}
