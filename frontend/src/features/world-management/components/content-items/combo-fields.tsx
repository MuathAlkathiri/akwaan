"use client";

import {
  COMBO_DIFFICULTIES,
  type ComboFormState,
  type ComboStageValue,
} from "../../services/content-item-form.service";
import { MechanicDifficultySelect } from "./mechanic-difficulty-select";

/**
 * "صعوبة السؤال" for a الكومبو item.
 *
 * A Combo run plays four questions of rising difficulty in a fixed order, so this
 * is really the question's position in that run — which is why every Combo item
 * must declare one, and why the value is Combo's own rather than a shared
 * difficulty other mechanics would have to mean something by.
 *
 * The author picks a label; the canonical stage is what persists.
 */
export function ComboFields({
  value,
  onChange,
}: {
  value: ComboFormState;
  onChange: (value: ComboFormState) => void;
}) {
  return (
    <div data-testid="combo-fields">
      <MechanicDifficultySelect
        id="combo-stage"
        testId="combo-stage-select"
        value={value.stage === "" ? "" : String(value.stage)}
        options={COMBO_DIFFICULTIES.map((entry) => ({
          value: String(entry.stage),
          label: entry.label,
        }))}
        onChange={(next) =>
          onChange({ ...value, stage: Number(next) as ComboStageValue })
        }
        help="الكومبو يلعب أربعة أسئلة بصعوبة متصاعدة، وهذا الاختيار يحدد موضع السؤال في الجولة."
      />
    </div>
  );
}
