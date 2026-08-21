"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The one "صعوبة السؤال" control, for the mechanics that author a difficulty.
 *
 * الكومبو and المرحلة both ask an author to pick one value from a short ordered
 * list and both persist the canonical value rather than the Arabic label — that is
 * the whole of what they share, and it is this component. What each *means* by
 * difficulty stays with the mechanic: its own vocabulary, its own help text, its
 * own payload key, its own required-ness.
 *
 * Values arrive as strings because that is what a select emits; the caller
 * converts back to its own canonical type, so no mechanic's vocabulary leaks into
 * another's.
 */
export function MechanicDifficultySelect({
  id,
  testId,
  value,
  options,
  onChange,
  help,
}: {
  id: string;
  testId: string;
  /** The selected canonical value as a string, or empty when unchosen. */
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  help: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium" htmlFor={id}>
        صعوبة السؤال <span aria-hidden>*</span>
      </label>
      {/* Controlled from the first render, with "" meaning "nothing chosen yet":
          flipping between uncontrolled and controlled is what makes React warn,
          and a difficulty is never defaulted on the author's behalf. */}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} data-testid={testId}>
          <SelectValue placeholder="اختر صعوبة السؤال" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1.5 text-xs text-muted-foreground">{help}</p>
    </div>
  );
}
