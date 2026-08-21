"use client";

import { AlertTriangle } from "lucide-react";

import {
  MARHALA_DIFFICULTIES,
  type MarhalaDifficultyValue,
  type MarhalaFormState,
} from "../../services/content-item-form.service";
import { MechanicDifficultySelect } from "./mechanic-difficulty-select";

/**
 * "صعوبة السؤال" for a المرحلة item.
 *
 * In المرحلة the team picks a difficulty *before* seeing the question, and the
 * pick decides how far a correct answer moves them — so every item must declare
 * which band it belongs to, and the band is the mechanic's own metadata rather
 * than a shared difficulty other mechanics would have to mean something by.
 *
 * The band says nothing about the item's Scope. GTA holds سهل, متوسط and صعب
 * questions, and choosing a Scope neither implies a band nor changes one.
 */
export function MarhalaFields({
  value,
  onChange,
}: {
  value: MarhalaFormState;
  onChange: (value: MarhalaFormState) => void;
}) {
  return (
    <div data-testid="marhala-fields" className="space-y-2">
      <MechanicDifficultySelect
        id="marhala-difficulty"
        testId="marhala-difficulty-select"
        value={value.difficulty}
        options={MARHALA_DIFFICULTIES}
        onChange={(next) =>
          onChange({
            ...value,
            difficulty: next as MarhalaDifficultyValue,
            // Choosing resolves an unusable stored value; keeping the flag would
            // keep warning about a problem the author has just fixed.
            unknownStored: undefined,
          })
        }
        help="يختار الفريق الصعوبة قبل ظهور السؤال، وهي تحدد مقدار التقدّم على اللوحة. الصعوبة مستقلة عن النطاق."
      />
      {value.unknownStored !== undefined && (
        <p
          role="alert"
          data-testid="marhala-difficulty-unknown"
          className="flex items-start gap-1.5 text-xs font-medium text-warning"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          الصعوبة المحفوظة لهذا العنصر غير معروفة، ولا يمكن استخدامه في اللعب.
          اختر صعوبة من القائمة.
        </p>
      )}
    </div>
  );
}
