"use client";
import { Input } from "@/components/ui/input";
import type { ChallengePresentation } from "../../types";

interface PresentationFieldsProps {
  value: ChallengePresentation;
  onChange: (value: ChallengePresentation) => void;
  /** Shown when these values are what differentiate two Worlds. */
  differentiationHint?: boolean;
  /** Mechanic these values were inherited from, when there is one. */
  inheritedFrom?: string;
  disabled?: boolean;
}

/**
 * The five properties the differentiation rule compares (roadmap 5.3). Colour
 * and icon are deliberately absent: they never count as differentiation.
 */
export function PresentationFields({
  value,
  onChange,
  differentiationHint = false,
  inheritedFrom,
  disabled = false,
}: PresentationFieldsProps) {
  const set = (patch: Partial<ChallengePresentation>) =>
    onChange({ ...value, ...patch });
  const identifier = (raw: string) =>
    raw.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div>
        <p className="text-sm font-semibold">
          {inheritedFrom ? "العرض والتقديم (موروث من المكانيكا)" : "العرض والتقديم"}
        </p>
        {inheritedFrom && (
          <p className="text-xs text-muted-foreground">
            هذه القيم جاءت من «{inheritedFrom}». عدّلها فقط لتمييز هذا العالم عن
            غيره.
          </p>
        )}
        {differentiationHint && (
          <p className="text-xs text-muted-foreground">
            يجب أن يختلف اسم التحدي بين كل عالمين، وأن يختلف عنصران على الأقل من
            هذه الخصائص. تغيير اللون أو الأيقونة وحده لا يكفي.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">نوع الإدخال</label>
          <Input
            value={value.inputType}
            disabled={disabled}
            placeholder="phone-multiple-choice"
            onChange={(event) => set({ inputType: identifier(event.target.value) })}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            المؤقت (ثانية)
          </label>
          <Input
            type="number"
            min={1}
            max={600}
            disabled={disabled}
            value={value.timerSeconds ?? ""}
            placeholder="بدون مؤقت"
            onChange={(event) =>
              set({
                timerSeconds: event.target.value
                  ? Number(event.target.value)
                  : null,
              })
            }
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">حزمة الصوت</label>
          <Input
            value={value.soundPack ?? ""}
            disabled={disabled}
            placeholder="stadium-crowd"
            onChange={(event) =>
              set({
                soundPack: event.target.value
                  ? identifier(event.target.value)
                  : null,
              })
            }
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium">
            أسلوب الكشف
          </label>
          <Input
            value={value.revealStyle ?? ""}
            disabled={disabled}
            placeholder="simultaneous-flip"
            onChange={(event) =>
              set({
                revealStyle: event.target.value
                  ? identifier(event.target.value)
                  : null,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
