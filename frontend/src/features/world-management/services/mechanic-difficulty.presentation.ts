import {
  COMBO_DIFFICULTIES,
  MARHALA_DIFFICULTIES,
  type ComboStageValue,
  type MarhalaDifficultyValue,
} from "./content-item-form.service";
import type { ContentItem } from "../types";

/**
 * "الصعوبة" in the authoring catalog, for the mechanics that author one.
 *
 * Two mechanics ask an author how hard a question is, and they mean different
 * things by it. الكومبو means *position in a rising four-question run*; المرحلة
 * means *the risk band a team elects before the question is drawn*. Neither is a
 * shared `ContentItem.difficulty`, and neither may be read as the other — a Combo
 * rebalance must never move a Marhala movement range.
 *
 * What they genuinely share is the catalog machinery: read the authored value off
 * the item, label it in Arabic, filter by it, order by it, count it. That is what
 * a *dimension* is here — the vocabulary and the reader stay with the mechanic,
 * the presentation is shared.
 *
 * One rule holds for every dimension: **no function here takes a Scope.** A Scope
 * answers what a question is about, a difficulty answers how hard it is, and the
 * simplest way to keep them independent is to give this module no way to see one.
 */

export interface MechanicDifficultyDimension<Value extends string | number> {
  /**
   * The mechanic's canonical slug.
   *
   * Also the prefix of the catalog's test ids and the key of its filter state, so
   * one mechanic's controls can never be mistaken for another's.
   */
  key: string;
  /** The mechanic's author-facing name, for control copy. */
  mechanicName: string;
  /** The whole vocabulary, in the mechanic's own ascending order. */
  values: ReadonlyArray<{ value: Value; label: string }>;
  /** The authored value on an item, or undefined when it carries none. */
  read: (item: ContentItem) => Value | undefined;
}

export type DifficultyFilter<Value extends string | number> = Value | "all";

/**
 * Any dimension, for code that presents them all without caring which.
 *
 * Every position of the interface is covariant in `Value`, so each mechanic's
 * concrete dimension is assignable here and no cast is needed anywhere.
 */
export type AnyDifficultyDimension = MechanicDifficultyDimension<
  string | number
>;

/** الكومبو: a position in the run, persisted as `mechanicPayload.comboStage`. */
export const COMBO_DIFFICULTY_DIMENSION: MechanicDifficultyDimension<ComboStageValue> =
  {
    key: "combo",
    mechanicName: "الكومبو",
    values: COMBO_DIFFICULTIES.map((entry) => ({
      value: entry.stage,
      label: entry.label,
    })),
    read: (item) =>
      COMBO_DIFFICULTIES.find(
        (entry) => entry.stage === item.mechanicPayload?.comboStage,
      )?.stage,
  };

/**
 * المرحلة: the risk band, persisted as `mechanicPayload.marhalaDifficulty`.
 *
 * The values are the backend's own — `easy`, `medium`, `hard` — read through the
 * one table the form writes from, so a label can never be persisted and an
 * unrecognised value can never be presented as a difficulty.
 */
export const MARHALA_DIFFICULTY_DIMENSION: MechanicDifficultyDimension<MarhalaDifficultyValue> =
  {
    key: "marhala",
    mechanicName: "المرحلة",
    values: MARHALA_DIFFICULTIES.map((entry) => ({
      value: entry.value,
      label: entry.label,
    })),
    read: (item) =>
      MARHALA_DIFFICULTIES.find(
        (entry) => entry.value === item.mechanicPayload?.marhalaDifficulty,
      )?.value,
  };

/** Every dimension the catalog knows, in the order its controls appear. */
export const MECHANIC_DIFFICULTY_DIMENSIONS: readonly AnyDifficultyDimension[] =
  [COMBO_DIFFICULTY_DIMENSION, MARHALA_DIFFICULTY_DIMENSION];

/** The author-facing label, or undefined for content this mechanic never authored. */
export function difficultyLabelOf<Value extends string | number>(
  dimension: MechanicDifficultyDimension<Value>,
  item: ContentItem,
): string | undefined {
  const value = dimension.read(item);
  return dimension.values.find((entry) => entry.value === value)?.label;
}

/** Whether this list holds any content worth showing this mechanic's controls for. */
export function hasDifficultyContent<Value extends string | number>(
  dimension: MechanicDifficultyDimension<Value>,
  items: readonly ContentItem[],
): boolean {
  return items.some((item) => dimension.read(item) !== undefined);
}

/** The dimensions actually represented in a list — nothing is offered emptily. */
export function difficultyDimensionsOf(
  items: readonly ContentItem[],
): readonly AnyDifficultyDimension[] {
  return MECHANIC_DIFFICULTY_DIMENSIONS.filter((dimension) =>
    hasDifficultyContent(dimension, items),
  );
}

/**
 * The one dimension an item carries, for a card that shows a single badge.
 *
 * An item authored for two mechanics that both take a difficulty is legal, and
 * the first match wins for display; both values are still stored, filtered and
 * counted separately.
 */
export function difficultyBadgeOf(
  item: ContentItem,
): { dimension: AnyDifficultyDimension; label: string } | undefined {
  for (const dimension of MECHANIC_DIFFICULTY_DIMENSIONS) {
    const label = difficultyLabelOf(dimension, item);
    if (label) return { dimension, label };
  }
  return undefined;
}

/**
 * Ordered by the mechanic's own ascending difficulty.
 *
 * The order comes from the position of the value in the mechanic's table, never
 * from its Arabic label — sorting سهل / متوسط / صعب lexicographically would put
 * them in an order that means nothing.
 *
 * A catalog view only: no runtime reads this.
 */
export function sortByDifficulty<Value extends string | number>(
  dimension: MechanicDifficultyDimension<Value>,
  items: readonly ContentItem[],
  direction: "asc" | "desc" = "asc",
): ContentItem[] {
  const sign = direction === "asc" ? 1 : -1;
  const rank = (item: ContentItem) => {
    const value = dimension.read(item);
    const index = dimension.values.findIndex((entry) => entry.value === value);
    return index === -1 ? undefined : index;
  };
  return [...items].sort((left, right) => {
    const a = rank(left);
    const b = rank(right);
    // Items this mechanic never authored have no place in its ordering, so they
    // settle after the ranked ones rather than sorting as the easiest.
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return (a - b) * sign;
  });
}

/** Only items at one difficulty; `all` is the identity. */
export function filterByDifficulty<Value extends string | number>(
  dimension: MechanicDifficultyDimension<Value>,
  items: readonly ContentItem[],
  filter: DifficultyFilter<Value>,
): ContentItem[] {
  if (filter === "all") return [...items];
  return items.filter((item) => dimension.read(item) === filter);
}

/**
 * How many questions sit at each difficulty of one mechanic.
 *
 * `ready` is the count the runtime could actually draw today; `count` is
 * everything authored, drafts included. Both are reported because a shortage that
 * is only a shortage of *published* content is a different problem from having
 * written nothing.
 *
 * Authoring information, deliberately not a rule: nothing requires the counts to
 * match each other or to reach any number. There is no approved threshold in the
 * product, so nothing here calls a difficulty complete.
 */
export function difficultyCoverage<Value extends string | number>(
  dimension: MechanicDifficultyDimension<Value>,
  items: readonly ContentItem[],
): Array<{ value: Value; label: string; count: number; ready: number }> {
  return dimension.values.map((entry) => {
    const matching = items.filter(
      (item) => dimension.read(item) === entry.value,
    );
    return {
      value: entry.value,
      label: entry.label,
      count: matching.length,
      ready: matching.filter((item) => item.status === "ready").length,
    };
  });
}
