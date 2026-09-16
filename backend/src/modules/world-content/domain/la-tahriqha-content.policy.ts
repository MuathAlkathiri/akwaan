import {
  LA_TAHRIQHA_CORRECT_COUNT,
  LA_TAHRIQHA_DISTRACTOR_COUNT,
  LA_TAHRIQHA_INGREDIENT_COUNT,
  LA_TAHRIQHA_MAX_SELECTION,
  LA_TAHRIQHA_MIN_SELECTION,
  LA_TAHRIQHA_PERFECT_BONUS,
} from './world-content.constants';
import {
  LaTahriqhaIngredientAuthoring,
  LaTahriqhaPayload,
  WorldContentIssue,
} from './world-content.types';

/**
 * The one structural contract for a "لا تحرقها" dish, shared by Admin authoring
 * and the launcher.
 *
 * Both call this, so a dish the Admin accepted cannot fail at launch — the
 * failure mode where a producer publishes a dish on Thursday and the room
 * discovers on Friday that it will not start.
 *
 * Scoring lives here too, and only here. The runtime grades a locked set with
 * it, the launcher totals a finished challenge with it, and the reveal is
 * rendered from its output, so nothing anywhere holds a second opinion about
 * what a burn costs or what a perfect dish pays.
 */

const issue = (code: string, message: string): WorldContentIssue => ({
  code,
  message,
});

const text = (value: unknown): string =>
  typeof (value as { ar?: unknown } | undefined)?.ar === 'string'
    ? String((value as { ar: string }).ar).trim()
    : '';

/**
 * The eight cards.
 *
 * Eight exactly, five of them correct, because those two numbers *are* the
 * balance: five correct out of eight is what makes a fifth pick tempting rather
 * than obvious, and three plausible distractors is what makes it dangerous.
 * Unique stable ids, because a selection recorded against an id must never
 * drift onto another card when an author edits the dish.
 */
export function validateLaTahriqhaPayload(
  raw: Partial<LaTahriqhaPayload> | undefined,
): WorldContentIssue[] {
  const problems: WorldContentIssue[] = [];
  if (raw?.variant !== 'la-tahriqha') {
    problems.push(
      issue(
        'LA_TAHRIQHA_PAYLOAD_REQUIRED',
        'لا تحرقها requires its canonical dish payload',
      ),
    );
  }
  if (!text(raw?.dishName)) {
    problems.push(
      issue('LA_TAHRIQHA_DISH_NAME_REQUIRED', 'لا تحرقها requires a dish name'),
    );
  }
  const ingredients: Array<Partial<LaTahriqhaIngredientAuthoring>> =
    Array.isArray(raw?.ingredients) ? raw.ingredients : [];
  if (ingredients.length !== LA_TAHRIQHA_INGREDIENT_COUNT) {
    problems.push(
      issue(
        'LA_TAHRIQHA_INGREDIENT_COUNT_INVALID',
        `لا تحرقها requires exactly ${LA_TAHRIQHA_INGREDIENT_COUNT} ingredient cards`,
      ),
    );
  }
  const ids = ingredients
    .map((ingredient) => ingredient?.localId?.trim())
    .filter(Boolean);
  if (
    ids.length !== ingredients.length ||
    new Set(ids).size !== ingredients.length
  ) {
    problems.push(
      issue(
        'LA_TAHRIQHA_INGREDIENT_IDS_INVALID',
        'Every لا تحرقها ingredient needs a unique stable local id',
      ),
    );
  }
  if (ingredients.some((ingredient) => !text(ingredient?.label))) {
    problems.push(
      issue(
        'LA_TAHRIQHA_INGREDIENT_LABEL_REQUIRED',
        'Every لا تحرقها ingredient needs an Arabic label',
      ),
    );
  }
  // Explicit on every card. An ingredient whose correctness was never stated is
  // a card the room would be graded against without anyone having decided.
  if (
    ingredients.some((ingredient) => typeof ingredient?.correct !== 'boolean')
  ) {
    problems.push(
      issue(
        'LA_TAHRIQHA_INGREDIENT_CORRECTNESS_REQUIRED',
        'Every لا تحرقها ingredient must state explicitly whether it belongs in the dish',
      ),
    );
  }
  const correct = ingredients.filter(
    (ingredient) => ingredient?.correct === true,
  ).length;
  const distractors = ingredients.filter(
    (ingredient) => ingredient?.correct === false,
  ).length;
  if (correct !== LA_TAHRIQHA_CORRECT_COUNT) {
    problems.push(
      issue(
        'LA_TAHRIQHA_CORRECT_COUNT_INVALID',
        `لا تحرقها requires exactly ${LA_TAHRIQHA_CORRECT_COUNT} correct ingredients`,
      ),
    );
  }
  if (distractors !== LA_TAHRIQHA_DISTRACTOR_COUNT) {
    problems.push(
      issue(
        'LA_TAHRIQHA_DISTRACTOR_COUNT_INVALID',
        `لا تحرقها requires exactly ${LA_TAHRIQHA_DISTRACTOR_COUNT} plausible distractors`,
      ),
    );
  }
  if (
    raw?.timerSeconds !== undefined &&
    (!Number.isInteger(raw.timerSeconds) || Number(raw.timerSeconds) < 5)
  ) {
    problems.push(
      issue(
        'LA_TAHRIQHA_TIMER_INVALID',
        'A لا تحرقها dish window must be a whole number of seconds, at least five',
      ),
    );
  }
  return problems;
}

export interface LaTahriqhaDishGrade {
  /** Of the set the team committed, the ones that belong in the dish. */
  correctIds: string[];
  /** The ones that do not. Any single one of these burns the dish. */
  wrongIds: string[];
  points: number;
  burned: boolean;
  perfect: boolean;
  /** Fewer than three committed cards is not a recipe, and scores nothing. */
  understaffed: boolean;
}

/**
 * What one team's committed set is worth on one dish.
 *
 * Three correct pays three and four pays four, so the ladder is flat until the
 * last card: five correct pays five plus the perfect-dish bonus. One wrong card
 * pays nothing at all, with deliberately no partial credit behind the burn —
 * the whole tension of reaching for a fifth ingredient depends on the downside
 * being total rather than proportional.
 *
 * A set below the minimum scores zero too. That case is reachable only at the
 * deadline, because a team can never *lock* fewer than three, and it is scored
 * rather than auto-filled: completing a team's recipe for them would be the
 * server playing the game.
 *
 * `selected` is deduplicated, and an id nobody authored counts as wrong, so a
 * malformed client can never buy a cheaper grade than an honest one.
 */
export function scoreLaTahriqhaDish(
  ingredients: readonly { localId: string; correct: boolean }[],
  selected: readonly string[],
): LaTahriqhaDishGrade {
  const picked = [...new Set(selected)];
  const byId = new Map(
    ingredients.map((ingredient) => [ingredient.localId, ingredient]),
  );
  const correctIds = picked.filter((id) => byId.get(id)?.correct === true);
  const wrongIds = picked.filter((id) => byId.get(id)?.correct !== true);
  const burned = wrongIds.length > 0;
  const understaffed = picked.length < LA_TAHRIQHA_MIN_SELECTION;
  const perfect =
    !burned &&
    !understaffed &&
    correctIds.length === LA_TAHRIQHA_MAX_SELECTION &&
    picked.length === LA_TAHRIQHA_MAX_SELECTION;
  const points =
    burned || understaffed
      ? 0
      : perfect
        ? LA_TAHRIQHA_MAX_SELECTION + LA_TAHRIQHA_PERFECT_BONUS
        : correctIds.length;
  return { correctIds, wrongIds, points, burned, perfect, understaffed };
}
