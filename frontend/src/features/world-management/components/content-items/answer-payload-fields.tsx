"use client";

import { useState } from "react";
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
  ANSWER_MODE_LABEL,
  VOTE_CONSENSUS_LABEL,
} from "../../utils/world-content.labels";
import {
  CLOSEST_COLOUR_BOUNDS,
  CLOSEST_COLOUR_REVEAL_MAX_SECONDS,
  hasClosestSliderMode,
  hexToHue,
  hueToHex,
  type AnswerFormState,
} from "../../services/content-item-form.service";
import type { ChallengeAnswerMode, VoteConsensusRule } from "../../types";

interface AnswerPayloadFieldsProps {
  value: AnswerFormState;
  onChange: (value: AnswerFormState) => void;
  /** Modes the selected challenge types can actually consume. */
  availableModes: ChallengeAnswerMode[];
  /**
   * Whether this form is creating rather than editing. Only مين أقرب reads it,
   * and only to decide whether the legacy number input is still on offer.
   */
  isNewItem?: boolean;
}

const CONSENSUS_RULES: VoteConsensusRule[] = [
  "exact",
  "majority",
  "team_match",
];

/**
 * One editor for all six answer modes, driven by the payload discriminator.
 * No mechanic gets its own page: each mode only reveals the fields it needs.
 */
export function AnswerPayloadFields({
  value,
  onChange,
  availableModes,
  isNewItem = false,
}: AnswerPayloadFieldsProps) {
  const set = (patch: Partial<AnswerFormState>) =>
    onChange({ ...value, ...patch });
  const modes = availableModes.length ? availableModes : [value.mode];
  /** «تذكّر اللون»: the answer is picked as a colour, not typed as a number. */
  const colourQuestion =
    value.mode === "closest" && value.closestInteraction === "colour-hue";
  const colourHue =
    colourQuestion &&
    value.correctValue.trim() !== "" &&
    Number.isFinite(Number(value.correctValue))
      ? Number(value.correctValue)
      : undefined;
  // The picker can hand back a grey, which has no place on the wheel.
  const [colourUnusable, setColourUnusable] = useState(false);
  const usesOptions =
    value.mode === "multiple_choice" ||
    value.mode === "vote" ||
    value.mode === "ryo";
  const usesNumeric =
    value.mode === "closest" ||
    (value.mode === "ryo" &&
      !value.options.some((option) => option.label.trim()));
  const usesAcceptedAnswers = value.mode === "match" || value.mode === "split";

  const setOption = (index: number, label: string) =>
    set({
      options: value.options.map((option, current) =>
        current === index ? { ...option, label } : option,
      ),
    });

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div>
        <label className="mb-1.5 block text-sm font-medium">نمط الإجابة</label>
        <Select
          value={value.mode}
          onValueChange={(next: string) =>
            set({ mode: next as ChallengeAnswerMode })
          }
        >
          <SelectTrigger aria-label="نمط الإجابة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modes.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {ANSWER_MODE_LABEL[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">
          لا توجد إجابات نصية مفتوحة يحكمها مقدّم — كل الأنماط تُحسم آلياً.
        </p>
      </div>

      {usesOptions && (
        <div className="space-y-2">
          <p className="text-sm font-medium">الخيارات</p>
          {value.options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2">
              <Input
                value={option.label}
                placeholder={`الخيار ${index + 1}`}
                onChange={(event) => setOption(index, event.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant={
                  value.correctOptionId === option.id ? "default" : "outline"
                }
                onClick={() => set({ correctOptionId: option.id })}
                disabled={value.mode === "vote"}
              >
                {value.correctOptionId === option.id ? "الصحيح" : "تحديد"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  set({
                    options: value.options.filter(
                      (_current, position) => position !== index,
                    ),
                  })
                }
              >
                حذف
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              set({
                options: [
                  ...value.options,
                  { id: `option-${value.options.length + 1}`, label: "" },
                ],
              })
            }
          >
            إضافة خيار
          </Button>
        </div>
      )}

      {usesNumeric && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              className="mb-1.5 block text-sm font-medium"
              htmlFor="closest-correct-value"
            >
              {colourQuestion ? "اللون الصحيح" : "القيمة الصحيحة"}
            </label>
            {colourQuestion ? (
              <div className="space-y-1.5" data-testid="closest-colour-fields">
                <div className="flex items-center gap-3">
                  <input
                    id="closest-correct-value"
                    type="color"
                    aria-label="اللون الصحيح"
                    data-testid="closest-colour-picker"
                    className="h-10 w-16 cursor-pointer rounded border bg-transparent p-1"
                    value={
                      colourHue === undefined ? "#888888" : hueToHex(colourHue)
                    }
                    onChange={(event) => {
                      const hue = hexToHue(event.target.value);
                      setColourUnusable(hue === undefined);
                      if (hue !== undefined)
                        set({ correctValue: String(hue) });
                    }}
                  />
                  <span className="text-xs font-medium text-muted-foreground">
                    {colourHue === undefined
                      ? "اختر لون القطعة المطلوبة من الصورة"
                      : `درجة اللون ${colourHue} من 360 — هذا اللون اللي بيشوفه اللاعبون`}
                  </span>
                </div>
                {colourUnusable && (
                  <p
                    className="text-xs font-medium text-foreground"
                    data-testid="closest-colour-unusable"
                  >
                    الأبيض والأسود والرمادي ما لهم مكان على دائرة الألوان.
                    اختر لونًا واضحًا.
                  </p>
                )}
              </div>
            ) : (
              <Input
                id="closest-correct-value"
                type="number"
                value={value.correctValue}
                onChange={(event) => set({ correctValue: event.target.value })}
              />
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              هامش القبول
            </label>
            <Input
              type="number"
              min={0}
              value={value.acceptedTolerance}
              onChange={(event) =>
                set({ acceptedTolerance: event.target.value })
              }
            />
          </div>
        </div>
      )}

      {value.mode === "closest" && (
        <div
          className="space-y-3 rounded-lg border bg-muted/30 p-3"
          data-testid="closest-slider-fields"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              طريقة التفاعل
            </label>
            <Select
              value={value.closestInteraction}
              onValueChange={(next: string) => {
                const leavingColour =
                  value.closestInteraction === "colour-hue" &&
                  next !== "colour-hue";
                set({
                  closestInteraction:
                    next as AnswerFormState["closestInteraction"],
                  // The wheel is the range, so it is set for the author — and
                  // taken back when they leave, or a number question would
                  // inherit 0→360 and a hue as its answer.
                  ...(next === "colour-hue"
                    ? {
                        closestMin: CLOSEST_COLOUR_BOUNDS.min,
                        closestMax: CLOSEST_COLOUR_BOUNDS.max,
                        closestStep: CLOSEST_COLOUR_BOUNDS.step,
                        correctValue: "",
                      }
                    : leavingColour
                      ? {
                          closestMin: "",
                          closestMax: "",
                          closestStep: "",
                          correctValue: "",
                          closestRevealSeconds: "",
                        }
                      : {}),
                });
                setColourUnusable(false);
              }}
            >
              <SelectTrigger aria-label="طريقة تفاعل مين أقرب">
                {/* An unselected mode has to read as a question, not as a
                    silently-chosen default. */}
                <SelectValue placeholder="اختر طريقة التفاعل" />
              </SelectTrigger>
              <SelectContent>
                {/* Offered only where it already is the truth. A new item
                    cannot choose the legacy number input, because the runtime
                    falls back to it whenever no continuum is authored and a
                    catalog that keeps choosing it never reaches the slider. */}
                {!isNewItem && (
                  <SelectItem value="legacy">
                    إدخال رقمي قديم — محتوى قديم
                  </SelectItem>
                )}
                <SelectItem value="numeric-range">نطاق رقمي</SelectItem>
                <SelectItem value="between-anchors">
                  بين نقطتي ارتكاز
                </SelectItem>
                <SelectItem value="colour-hue">تذكّر اللون</SelectItem>
              </SelectContent>
            </Select>
            {isNewItem && !hasClosestSliderMode(value.closestInteraction) && (
              <p
                className="mt-1.5 text-xs font-medium text-muted-foreground"
                data-testid="closest-mode-required-hint"
              >
                المحتوى الجديد يختار مداه بنفسه — لا يوجد نطاق افتراضي.
              </p>
            )}
            {!isNewItem && value.closestInteraction === "legacy" && (
              <p
                className="mt-1.5 text-xs font-medium text-muted-foreground"
                data-testid="closest-legacy-badge"
              >
                محتوى قديم (Legacy) — يظل قابلًا للعب والتحرير. اختر مدى فقط إذا
                قررت ترقيته.
              </p>
            )}
          </div>
          {colourQuestion && (
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium"
                htmlFor="closest-reveal-seconds"
              >
                كم ثانية تظهر الصورة ملوّنة؟
              </label>
              <Input
                id="closest-reveal-seconds"
                type="number"
                min={1}
                max={CLOSEST_COLOUR_REVEAL_MAX_SECONDS}
                step={1}
                placeholder="4"
                value={value.closestRevealSeconds}
                onChange={(e) => set({ closestRevealSeconds: e.target.value })}
              />
              <p className="text-xs font-medium text-muted-foreground">
                بعدها تصير رمادي واللاعبون يختارون اللون من الذاكرة. ارفع
                الصورة الملوّنة في خانة الصورة، واكتب في السؤال أي قطعة
                تقصد («وش لون القميص؟»).
              </p>
            </div>
          )}
          {hasClosestSliderMode(value.closestInteraction) && !colourQuestion && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  type="number"
                  aria-label="الحد الأدنى"
                  placeholder="الحد الأدنى"
                  value={value.closestMin}
                  onChange={(e) => set({ closestMin: e.target.value })}
                />
                <Input
                  type="number"
                  aria-label="الحد الأعلى"
                  placeholder="الحد الأعلى"
                  value={value.closestMax}
                  onChange={(e) => set({ closestMax: e.target.value })}
                />
                <Input
                  type="number"
                  min={0}
                  aria-label="الخطوة"
                  placeholder="الخطوة (اختياري)"
                  value={value.closestStep}
                  onChange={(e) => set({ closestStep: e.target.value })}
                />
              </div>
              {value.closestInteraction === "numeric-range" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    value={value.closestDisplayFormat}
                    onValueChange={(next: string) =>
                      set({
                        closestDisplayFormat:
                          next as AnswerFormState["closestDisplayFormat"],
                        // A year takes no unit, so choosing it clears one the
                        // author may already have typed.
                        ...(next === "calendar-year" ? { closestUnit: "" } : {}),
                      })
                    }
                  >
                    <SelectTrigger aria-label="طريقة عرض الرقم">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="number">رقم عادي</SelectItem>
                      <SelectItem value="calendar-year">سنة ميلادية</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* A calendar year is a value, not an amount of anything. */}
                  {value.closestDisplayFormat === "number" && (
                    <Input
                      aria-label="الوحدة"
                      maxLength={40}
                      placeholder="الوحدة (اختياري)"
                      value={value.closestUnit}
                      onChange={(e) => set({ closestUnit: e.target.value })}
                    />
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    aria-label="نقطة الارتكاز اليسرى"
                    maxLength={80}
                    placeholder="نقطة الارتكاز اليسرى"
                    value={value.closestLeftAnchor}
                    onChange={(e) => set({ closestLeftAnchor: e.target.value })}
                  />
                  <Input
                    aria-label="نقطة الارتكاز اليمنى"
                    maxLength={80}
                    placeholder="نقطة الارتكاز اليمنى"
                    value={value.closestRightAnchor}
                    onChange={(e) =>
                      set({ closestRightAnchor: e.target.value })
                    }
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {usesAcceptedAnswers && (
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            الإجابات المقبولة (سطر لكل إجابة)
          </label>
          <Textarea
            value={value.acceptedAnswers}
            rows={4}
            onChange={(event) => set({ acceptedAnswers: event.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            تُقارن آلياً بعد تطبيع النص العربي، فلا حاجة لتكرار صيغ الألف
            والهمزة.
          </p>
        </div>
      )}

      {value.mode === "vote" && (
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            قاعدة التوافق
          </label>
          <Select
            value={value.consensusRule}
            onValueChange={(next: string) =>
              set({ consensusRule: next as VoteConsensusRule })
            }
          >
            <SelectTrigger aria-label="قاعدة التوافق">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONSENSUS_RULES.map((rule) => (
                <SelectItem key={rule} value={rule}>
                  {VOTE_CONSENSUS_LABEL[rule]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {value.mode === "split" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">أجزاء المعلومة</p>
          {value.fragments.map((fragment, index) => (
            <div key={fragment.seat} className="flex items-center gap-2">
              <span className="w-16 text-xs text-muted-foreground">
                مقعد {fragment.seat}
              </span>
              <Input
                value={fragment.clue}
                placeholder="الجزء الذي يراه هذا اللاعب فقط"
                onChange={(event) =>
                  set({
                    fragments: value.fragments.map((current, position) =>
                      position === index
                        ? { ...current, clue: event.target.value }
                        : current,
                    ),
                  })
                }
              />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              set({
                fragments: [
                  ...value.fragments,
                  { seat: value.fragments.length + 1, clue: "" },
                ],
              })
            }
          >
            إضافة جزء
          </Button>
        </div>
      )}
    </div>
  );
}
