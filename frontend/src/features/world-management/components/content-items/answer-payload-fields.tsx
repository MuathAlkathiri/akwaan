"use client";

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
import type { AnswerFormState } from "../../services/content-item-form.service";
import type { ChallengeAnswerMode, VoteConsensusRule } from "../../types";

interface AnswerPayloadFieldsProps {
  value: AnswerFormState;
  onChange: (value: AnswerFormState) => void;
  /** Modes the selected challenge types can actually consume. */
  availableModes: ChallengeAnswerMode[];
}

const CONSENSUS_RULES: VoteConsensusRule[] = ["exact", "majority", "team_match"];

/**
 * One editor for all six answer modes, driven by the payload discriminator.
 * No mechanic gets its own page: each mode only reveals the fields it needs.
 */
export function AnswerPayloadFields({
  value,
  onChange,
  availableModes,
}: AnswerPayloadFieldsProps) {
  const set = (patch: Partial<AnswerFormState>) => onChange({ ...value, ...patch });
  const modes = availableModes.length ? availableModes : [value.mode];
  const usesOptions =
    value.mode === "multiple_choice" ||
    value.mode === "vote" ||
    value.mode === "ryo";
  const usesNumeric =
    value.mode === "closest" ||
    (value.mode === "ryo" && !value.options.some((option) => option.label.trim()));
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
            <label className="mb-1.5 block text-sm font-medium">
              القيمة الصحيحة
            </label>
            <Input
              type="number"
              value={value.correctValue}
              onChange={(event) => set({ correctValue: event.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              هامش القبول
            </label>
            <Input
              type="number"
              min={0}
              value={value.acceptedTolerance}
              onChange={(event) => set({ acceptedTolerance: event.target.value })}
            />
          </div>
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
            تُقارن آلياً بعد تطبيع النص العربي، فلا حاجة لتكرار صيغ الألف والهمزة.
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
