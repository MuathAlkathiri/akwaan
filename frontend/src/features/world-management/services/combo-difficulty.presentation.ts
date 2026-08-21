import {
  COMBO_DIFFICULTY_DIMENSION,
  difficultyCoverage,
  difficultyLabelOf,
  filterByDifficulty,
  hasDifficultyContent,
  sortByDifficulty,
  type DifficultyFilter,
} from "./mechanic-difficulty.presentation";
import { type ComboStageValue } from "./content-item-form.service";
import type { ContentItem } from "../types";

/**
 * Reading "الصعوبة" of الكومبو content for the authoring catalog.
 *
 * The difficulty of a Combo question is the stage the author saved on the item
 * and nothing else. In particular it is **not** a property of the Scope: a Scope
 * answers "what is this question about", the stage answers "how hard is it inside
 * the Run", and the two are independent — ناروتو legitimately holds questions at
 * all four difficulties.
 *
 * Everything below is Combo's vocabulary applied to the shared catalog machinery
 * in `mechanic-difficulty.presentation`, which المرحلة uses with its own. Combo
 * keeps its own module because its callers speak in *stages*: the shared layer
 * knows how to filter, order and count a difficulty, and knows nothing about what
 * either mechanic means by one.
 */

export type ComboDifficultyFilter = DifficultyFilter<ComboStageValue>;

/** The saved stage, or undefined when the item carries no Combo stage. */
export function comboStageOf(item: ContentItem): ComboStageValue | undefined {
  return COMBO_DIFFICULTY_DIMENSION.read(item);
}

/** The author-facing label, or undefined for content that is not Combo's. */
export function comboDifficultyLabel(item: ContentItem): string | undefined {
  return difficultyLabelOf(COMBO_DIFFICULTY_DIMENSION, item);
}

/** Whether this list holds any Combo content worth showing the controls for. */
export function hasComboContent(items: readonly ContentItem[]): boolean {
  return hasDifficultyContent(COMBO_DIFFICULTY_DIMENSION, items);
}

/**
 * Ordered by difficulty, ascending through متوسط → متوسط صعب → صعب → صعب جدًا.
 *
 * A catalog view only. The runtime never reads this order — the server's Combo
 * plan owns which stage each question of a Run is drawn from.
 */
export function sortByComboDifficulty(
  items: readonly ContentItem[],
  direction: "asc" | "desc" = "asc",
): ContentItem[] {
  return sortByDifficulty(COMBO_DIFFICULTY_DIMENSION, items, direction);
}

/** Only items at one difficulty; `all` is the identity. */
export function filterByComboDifficulty(
  items: readonly ContentItem[],
  filter: ComboDifficultyFilter,
): ContentItem[] {
  return filterByDifficulty(COMBO_DIFFICULTY_DIMENSION, items, filter);
}

/**
 * How many questions sit at each difficulty, for the list currently on screen.
 *
 * Authoring information, deliberately not a rule: nothing requires the four
 * counts to match, and nothing requires a Scope to cover every difficulty. It
 * exists so a shortage at one stage is visible before a launch trips over it.
 */
export function comboDifficultyCoverage(
  items: readonly ContentItem[],
): Array<{ stage: ComboStageValue; label: string; count: number }> {
  return difficultyCoverage(COMBO_DIFFICULTY_DIMENSION, items).map((entry) => ({
    stage: entry.value as ComboStageValue,
    label: entry.label,
    count: entry.count,
  }));
}
