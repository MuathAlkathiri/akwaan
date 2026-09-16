"use client";

import { Flame, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  LA_TAHRIQHA_CORRECT_COUNT,
  LA_TAHRIQHA_DISTRACTOR_COUNT,
  type LaTahriqhaFormState,
} from "../../services/content-item-form.service";

/**
 * Authoring one dish and its eight cards.
 *
 * The split is the whole balance — five that belong in the dish, three that
 * plausibly could — so this editor makes the running count the loudest thing on
 * screen rather than leaving the author to count rows. Marking a card correct is
 * a toggle on the row itself, because "which five" is the decision being made
 * and it should read as one list, not as two.
 *
 * Authoring order is not presentation order: the runtime shuffles the eight
 * before anybody sees them, so an author may keep the correct ones together
 * without handing the room the answer.
 */
export function LaTahriqhaFields({
  value,
  onChange,
}: {
  value: LaTahriqhaFormState;
  onChange: (next: LaTahriqhaFormState) => void;
}) {
  const correct = value.ingredients.filter(
    (ingredient) => ingredient.correct,
  ).length;
  const distractors = value.ingredients.length - correct;
  const balanced =
    correct === LA_TAHRIQHA_CORRECT_COUNT &&
    distractors === LA_TAHRIQHA_DISTRACTOR_COUNT;

  const setIngredient = (
    index: number,
    patch: Partial<LaTahriqhaFormState["ingredients"][number]>,
  ) =>
    onChange({
      ...value,
      ingredients: value.ingredients.map((ingredient, position) =>
        position === index ? { ...ingredient, ...patch } : ingredient,
      ),
    });

  return (
    <section
      className="space-y-4 rounded-xl border p-4"
      data-testid="la-tahriqha-fields"
      dir="rtl"
    >
      <div>
        <h3 className="font-bold">لا تحرقها</h3>
        <p className="text-xs text-muted-foreground">
          ثمانية مكوّنات لكل طبق: {LA_TAHRIQHA_CORRECT_COUNT} صحيحة و
          {LA_TAHRIQHA_DISTRACTOR_COUNT} محتملة غير صحيحة. الترتيب هنا للتحرير
          فقط — اللعبة تخلط المكوّنات قبل عرضها.
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-semibold">اسم الطبق</span>
        <Input
          value={value.dishName}
          onChange={(event) =>
            onChange({ ...value, dishName: event.target.value })
          }
          placeholder="كبسة دجاج"
          data-testid="la-tahriqha-dish-name"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-semibold">ملاحظة الطبق (اختيارية)</span>
        <Input
          value={value.dishNote}
          onChange={(event) =>
            onChange({ ...value, dishNote: event.target.value })
          }
          placeholder="الطريقة النجدية"
          data-testid="la-tahriqha-dish-note"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-semibold">وقت الطبق بالثواني (اختياري)</span>
        <Input
          inputMode="numeric"
          value={value.timerSeconds}
          onChange={(event) =>
            onChange({ ...value, timerSeconds: event.target.value })
          }
          placeholder="اتركه فارغًا للوقت الافتراضي"
          data-testid="la-tahriqha-timer"
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">المكوّنات</span>
          <span
            className={cn(
              "text-xs font-bold",
              balanced ? "text-emerald-600" : "text-destructive",
            )}
            data-testid="la-tahriqha-balance"
          >
            {correct} صحيحة · {distractors} محتملة
          </span>
        </div>
        <ul className="space-y-2">
          {value.ingredients.map((ingredient, index) => (
            <li key={ingredient.localId} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setIngredient(index, { correct: !ingredient.correct })
                }
                aria-pressed={ingredient.correct}
                aria-label={
                  ingredient.correct
                    ? "مكوّن صحيح — اضغط لجعله محتملًا"
                    : "مكوّن محتمل — اضغط لجعله صحيحًا"
                }
                data-testid={`la-tahriqha-correct-${index}`}
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-md border-2",
                  ingredient.correct
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-600"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                {ingredient.correct ? (
                  <Star className="size-4" aria-hidden />
                ) : (
                  <Flame className="size-4" aria-hidden />
                )}
              </button>
              <Input
                value={ingredient.label}
                onChange={(event) =>
                  setIngredient(index, { label: event.target.value })
                }
                placeholder={
                  ingredient.correct ? "مكوّن من الطبق" : "مكوّن محتمل"
                }
                data-testid={`la-tahriqha-ingredient-${index}`}
              />
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          المكوّن المحتمل هو الذي يظن اللاعبون أنه في الطبق وليس فيه — واحد منها
          يكفي ليحرق الطبق كاملًا.
        </p>
      </div>
    </section>
  );
}
