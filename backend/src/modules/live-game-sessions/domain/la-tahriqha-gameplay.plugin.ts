import {
  GameplayCommandPayload,
  GameplayCommandResult,
  GameplayModePlugin,
  GameplayModeState,
  GameplayPluginContext,
} from './gameplay-mode.plugin';
import { InteractionActorProjection } from './gameplay-interaction.plugin';
import { LiveSessionDomainError } from './live-session.errors';
import {
  assertTeamActionAuthorized,
  assignNextTeamAction,
  assignmentFor,
  clearTeamAction,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
  TeamActionAssignmentState,
} from './team-action-assignment';
import { toSafeQuestionMedia } from './safe-question-media';
import {
  LaTahriqhaDishGrade,
  scoreLaTahriqhaDish,
} from '../../world-content/domain/la-tahriqha-content.policy';
import {
  LA_TAHRIQHA_DEFAULT_DISH_SECONDS,
  LA_TAHRIQHA_DISH_COUNT,
  LA_TAHRIQHA_INGREDIENT_COUNT,
  LA_TAHRIQHA_MAX_SELECTION,
  LA_TAHRIQHA_MIN_SELECTION,
  LA_TAHRIQHA_SLUG,
} from '../../world-content/domain/world-content.constants';
import { ContentItemMedia } from '../../world-content/domain/world-content.types';

/**
 * "لا تحرقها" — the Food Signature.
 *
 * Three dishes, eight ingredient cards each, five of which belong in the dish.
 * Both teams cook the same dish at the same time and each commits three to five
 * cards. Three correct pays three and four pays four — a flat ladder, on purpose
 * — but the exact five pays seven, and a single wrong card burns the dish to
 * zero with no partial credit. That asymmetry is the whole mechanic: the fifth
 * ingredient is the only one worth more than it costs and the one most likely to
 * cost everything.
 *
 * Nobody is a permanent captain. Each dish has one temporary **قائد الطبق** per
 * team, handed out by the canonical `team-action-assignment` rotation, so over
 * three dishes a team of three cooks A → B → C and a team of one cooks alone
 * without the mechanic needing a special case. The captain is the only player
 * who may touch a card; their teammates see the same dish, the same eight
 * options and their own captain's live selections, and play by arguing. That is
 * a deliberate design choice rather than a limitation — a simultaneous
 * eight-card decision made by four thumbs at once is not a decision.
 *
 * What the other team may see is the pressure and never the answer: whether a
 * team is still choosing, whether it has committed, and — once committed — how
 * many cards it committed to. Three, four or five is genuinely informative
 * (it says how far the opponent reached) without naming a single ingredient,
 * which is exactly the line this projection holds until the dish resolves.
 */

export const LA_TAHRIQHA_MODE_KEY = LA_TAHRIQHA_SLUG;
export { LA_TAHRIQHA_DISH_COUNT, LA_TAHRIQHA_DEFAULT_DISH_SECONDS };

/** One team's authoritative action on one dish. */
export const laTahriqhaDishAction = (teamId: string) =>
  `la-tahriqha.dish.${teamId}`;

export interface LaTahriqhaRuntimeIngredient {
  localId: string;
  label: string;
  /** Server-only truth. Never projected before the dish resolves. */
  correct: boolean;
}

export interface LaTahriqhaRuntimeDish {
  /** The ContentItem this dish was composed from. */
  id: string;
  dishName: string;
  dishNote?: string;
  media?: unknown;
  /** Presentation order, shuffled once at launch and then fixed. */
  ingredients: LaTahriqhaRuntimeIngredient[];
  /** This dish's resolved window in seconds — authored, or the baseline. */
  timerSeconds: number;
}

export type LaTahriqhaLockReason = 'manual' | 'deadline' | 'none';

export interface LaTahriqhaTeamDishResult extends LaTahriqhaDishGrade {
  teamId: string;
  selected: string[];
  lockReason: LaTahriqhaLockReason;
  /** Who held قائد الطبق for this team on this dish. */
  captainParticipantId: string;
}

export interface LaTahriqhaDishResult {
  dishIndex: number;
  contentItemId: string;
  dishName: string;
  /** The canonical five, released only with the reveal. */
  correctIngredientIds: string[];
  teams: LaTahriqhaTeamDishResult[];
  /** Internal running totals as of this dish. Never a Match score. */
  totalsAfter: Record<string, number>;
  resolutionReason: 'both-locked' | 'deadline';
  resolvedAt: string;
}

export interface LaTahriqhaChallengeResult {
  winnerTeamId: string | null;
  tie: boolean;
  totals: Record<string, number>;
}

const PHASES = ['preparing', 'selecting', 'revealed', 'completed'] as const;

function fail(message: string): never {
  throw new LiveSessionDomainError('INVALID_LA_TAHRIQHA_STATE', message);
}

function parse<T>(value: unknown, label: string): T {
  if (typeof value !== 'string') return fail(`${label} is missing`);
  try {
    return JSON.parse(value) as T;
  } catch {
    return fail(`${label} is invalid`);
  }
}

const dishesOf = (state: GameplayModeState) =>
  parse<LaTahriqhaRuntimeDish[]>(state.dishesJson, 'dishes');
const teamsOf = (state: GameplayModeState) =>
  parse<string[]>(state.teamIdsJson, 'teams');
const resultsOf = (state: GameplayModeState) =>
  parse<LaTahriqhaDishResult[]>(state.resultsJson ?? '[]', 'results');
const selectionsOf = (state: GameplayModeState) =>
  parse<Record<string, string[]>>(state.selectionsJson ?? '{}', 'selections');
const lockedOf = (state: GameplayModeState) =>
  parse<Record<string, boolean>>(state.lockedJson ?? '{}', 'locks');
const currentDish = (state: GameplayModeState) =>
  dishesOf(state)[Number(state.currentDishIndex)];

/**
 * Running internal totals from the dishes already resolved.
 *
 * Derived rather than stored, so the number on the shared screen and the number
 * that decides the Signature are the same arithmetic over the same results and
 * cannot drift apart across a reconnect or a replayed read.
 */
export function laTahriqhaTotals(
  state: GameplayModeState,
): Record<string, number> {
  const totals = Object.fromEntries(teamsOf(state).map((id) => [id, 0]));
  for (const result of resultsOf(state)) {
    for (const team of result.teams) {
      if (team.teamId in totals) totals[team.teamId] += team.points;
    }
  }
  return totals;
}

/**
 * The Signature's own outcome after three dishes.
 *
 * Higher total wins and an equal total is a real, reportable tie. There is no
 * fourth dish and no sudden death: the mechanic is allowed to end level, and the
 * Match's canonical convergence is what decides what a tie is worth.
 */
export function laTahriqhaChallengeResult(
  state: GameplayModeState,
): LaTahriqhaChallengeResult {
  const totals = laTahriqhaTotals(state);
  const [teamA, teamB] = teamsOf(state);
  const tie = totals[teamA] === totals[teamB];
  return {
    winnerTeamId: tie ? null : totals[teamA] > totals[teamB] ? teamA : teamB,
    tie,
    totals,
  };
}

function validateRuntime(state: GameplayModeState): GameplayModeState {
  const dishes = dishesOf(state);
  const teams = teamsOf(state);
  const results = resultsOf(state);
  const selections = selectionsOf(state);
  const locked = lockedOf(state);
  if (
    dishes.length !== LA_TAHRIQHA_DISH_COUNT ||
    new Set(dishes.map((dish) => dish.id)).size !== LA_TAHRIQHA_DISH_COUNT ||
    dishes.some(
      (dish) =>
        !dish.dishName?.trim() ||
        dish.ingredients?.length !== LA_TAHRIQHA_INGREDIENT_COUNT ||
        new Set(dish.ingredients.map((item) => item.localId)).size !==
          LA_TAHRIQHA_INGREDIENT_COUNT ||
        dish.ingredients.some(
          (item) =>
            !item.localId?.trim() ||
            !item.label?.trim() ||
            typeof item.correct !== 'boolean',
        ) ||
        !Number.isInteger(dish.timerSeconds) ||
        dish.timerSeconds <= 0,
    )
  ) {
    return fail(
      'لا تحرقها needs three dishes of eight fully identified ingredient cards',
    );
  }
  if (teams.length !== 2 || new Set(teams).size !== 2) {
    return fail('لا تحرقها requires exactly two teams');
  }
  if (
    !PHASES.includes(String(state.phase) as (typeof PHASES)[number]) ||
    !Number.isInteger(state.currentDishIndex) ||
    Number(state.currentDishIndex) < 0 ||
    Number(state.currentDishIndex) >= LA_TAHRIQHA_DISH_COUNT ||
    results.length > LA_TAHRIQHA_DISH_COUNT
  ) {
    return fail('لا تحرقها progress is incomplete');
  }
  // A live selection can never exceed the recipe, and can only ever name cards
  // that are on the dish in play — the two invariants the reducer maintains, so
  // a state that lost either one is refused rather than graded.
  const onDish = new Set(
    dishes[Number(state.currentDishIndex)].ingredients.map(
      (item) => item.localId,
    ),
  );
  for (const teamId of teams) {
    const picked = selections[teamId] ?? [];
    if (
      !Array.isArray(picked) ||
      picked.length > LA_TAHRIQHA_MAX_SELECTION ||
      new Set(picked).size !== picked.length ||
      picked.some((id) => !onDish.has(id))
    ) {
      return fail('A لا تحرقها selection is not a subset of the dish in play');
    }
  }
  parseTeamActionAssignments(state.teamActionJson);
  return {
    ...state,
    dishesJson: JSON.stringify(dishes),
    teamIdsJson: JSON.stringify(teams),
    resultsJson: JSON.stringify(results),
    selectionsJson: JSON.stringify(
      Object.fromEntries(teams.map((id) => [id, selections[id] ?? []])),
    ),
    lockedJson: JSON.stringify(
      Object.fromEntries(teams.map((id) => [id, locked[id] === true])),
    ),
  };
}

function validateRound(state: GameplayModeState): GameplayModeState {
  if (
    !PHASES.includes(String(state.phase) as (typeof PHASES)[number]) ||
    !Number.isInteger(state.dishIndex)
  ) {
    return fail('لا تحرقها round progress is incomplete');
  }
  return state;
}

function ingredientPayload(
  payload: GameplayCommandPayload,
): GameplayCommandPayload {
  if (
    Object.keys(payload).some(
      (key) => !['ingredientId', 'assignmentSequence'].includes(key),
    ) ||
    typeof payload.ingredientId !== 'string' ||
    !payload.ingredientId.trim() ||
    (payload.assignmentSequence !== undefined &&
      typeof payload.assignmentSequence !== 'number')
  ) {
    throw new LiveSessionDomainError(
      'INVALID_LA_TAHRIQHA_SUBMISSION',
      'Name exactly one ingredient card',
    );
  }
  return payload;
}

function lockPayload(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (
    Object.keys(payload).some((key) => key !== 'assignmentSequence') ||
    (payload.assignmentSequence !== undefined &&
      typeof payload.assignmentSequence !== 'number')
  ) {
    throw new LiveSessionDomainError(
      'INVALID_LA_TAHRIQHA_COMMAND',
      'Locking a dish takes no payload beyond the assignment sequence',
    );
  }
  return payload;
}

function noPayload(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (Object.keys(payload).length) {
    throw new LiveSessionDomainError(
      'INVALID_LA_TAHRIQHA_COMMAND',
      'This command does not accept a payload',
    );
  }
  return {};
}

function captainIds(
  assignments: TeamActionAssignmentState,
  teams: string[],
): Record<string, string> {
  return Object.fromEntries(
    teams.map((teamId) => [
      teamId,
      assignmentFor(assignments, laTahriqhaDishAction(teamId))?.participantId ??
        '',
    ]),
  );
}

/**
 * Hands each team its قائد الطبق for the dish about to be played.
 *
 * Called exactly once per dish, from the reducer that opens that dish — never
 * from `activatePresentation`. A Fair-Start acknowledgement, a reconnect, a
 * refresh or a resnapshot therefore cannot rotate the captaincy no matter how
 * many times it arrives, because none of them run a reducer.
 */
function openCaptaincies(
  state: TeamActionAssignmentState,
  teams: string[],
  context: GameplayPluginContext,
): { state: TeamActionAssignmentState; captains: Record<string, string> } {
  let next = state;
  const captains: Record<string, string> = {};
  for (const teamId of teams) {
    const opened = assignNextTeamAction(next, {
      teamId,
      action: laTahriqhaDishAction(teamId),
      participants: context.eligibleParticipants ?? [],
    });
    next = opened.state;
    captains[teamId] = opened.assignment.participantId;
  }
  return { state: next, captains };
}

/**
 * The team this command speaks for, proven from the server's own assignment.
 *
 * The participant is resolved to a team by *finding the open captaincy they
 * hold*, never by reading a team id off the payload, so a player on the other
 * team cannot address this team's dish at all and a teammate of the captain is
 * refused by name rather than by role.
 */
function captainTeam(
  context: GameplayPluginContext,
  runtime: GameplayModeState,
  assignments: TeamActionAssignmentState,
  sequence?: number,
): string {
  const participantId = context.submitterParticipantId;
  const teamId = participantId
    ? teamsOf(runtime).find(
        (id) =>
          assignmentFor(assignments, laTahriqhaDishAction(id))
            ?.participantId === participantId,
      )
    : undefined;
  if (!participantId || !teamId) {
    throw new LiveSessionDomainError(
      'LA_TAHRIQHA_NOT_DISH_CAPTAIN',
      'Only قائد الطبق may choose ingredients for their team',
    );
  }
  assertTeamActionAuthorized(assignments, {
    action: laTahriqhaDishAction(teamId),
    participantId,
    ...(sequence !== undefined ? { sequence } : {}),
  });
  return teamId;
}

function requireSelecting(runtime: GameplayModeState): void {
  if (runtime.phase !== 'selecting') {
    throw new LiveSessionDomainError(
      'MODE_COMMAND_UNAVAILABLE',
      'This dish is not open for choosing',
    );
  }
}

/**
 * Grades the dish in play and moves it to the reveal.
 *
 * Both teams are graded by the same function on the same instant, whether the
 * dish ended because both captains committed or because the clock ran out. At
 * the deadline a team holding three to five cards has exactly that set locked as
 * it stands — never topped up — and a team holding fewer than three scores zero.
 */
function resolve(
  context: GameplayPluginContext,
  runtime: GameplayModeState,
  reason: 'both-locked' | 'deadline',
): GameplayCommandResult {
  const now = context.now ?? fail('Server command time is missing');
  const teams = teamsOf(runtime);
  const dish = currentDish(runtime);
  const assignments = parseTeamActionAssignments(runtime.teamActionJson);
  const captains = captainIds(assignments, teams);
  const selections = selectionsOf(runtime);
  const locked = lockedOf(runtime);
  const dishIndex = Number(runtime.currentDishIndex);

  const graded: LaTahriqhaTeamDishResult[] = teams.map((teamId) => {
    const selected = selections[teamId] ?? [];
    const grade = scoreLaTahriqhaDish(dish.ingredients, selected);
    return {
      ...grade,
      teamId,
      selected,
      lockReason: locked[teamId]
        ? 'manual'
        : selected.length >= LA_TAHRIQHA_MIN_SELECTION
          ? 'deadline'
          : 'none',
      captainParticipantId: captains[teamId] ?? '',
    };
  });

  const results = [
    ...resultsOf(runtime),
    {
      dishIndex,
      contentItemId: dish.id,
      dishName: dish.dishName,
      correctIngredientIds: dish.ingredients
        .filter((ingredient) => ingredient.correct)
        .map((ingredient) => ingredient.localId),
      teams: graded,
      totalsAfter: {},
      resolutionReason: reason,
      resolvedAt: now.toISOString(),
    } satisfies LaTahriqhaDishResult,
  ];
  // Stamped after the dish is in the list so the reveal carries the standing
  // that includes it, which is the number the room is actually shown.
  const withTotals = validateRuntime({
    ...runtime,
    resultsJson: JSON.stringify(results),
  });
  results[results.length - 1].totalsAfter = laTahriqhaTotals(withTotals);

  let cleared = assignments;
  for (const teamId of teams) {
    cleared = clearTeamAction(cleared, laTahriqhaDishAction(teamId));
  }
  const next = validateRuntime({
    ...runtime,
    phase: 'revealed',
    deadlineAt: null,
    resultsJson: JSON.stringify(results),
    teamActionJson: serializeTeamActionAssignments(cleared),
  });
  return {
    runtimeState: next,
    roundState: validateRound({ phase: 'revealed', dishIndex }),
    eventType: 'la-tahriqha-dish-resolved',
    eventPayload: {
      dishIndex,
      resolutionReason: reason,
      burnedCount: graded.filter((team) => team.burned).length,
      perfectCount: graded.filter((team) => team.perfect).length,
    },
    effects: [],
  };
}

function handle(
  context: GameplayPluginContext,
  command: {
    type: string;
    payload: GameplayCommandPayload;
    runtimeState: GameplayModeState;
    roundState: GameplayModeState;
  },
): GameplayCommandResult {
  const runtime = validateRuntime(command.runtimeState);
  validateRound(command.roundState);
  const dishIndex = Number(runtime.currentDishIndex);
  const sequence =
    typeof command.payload.assignmentSequence === 'number'
      ? command.payload.assignmentSequence
      : undefined;

  if (
    command.type === 'select-la-tahriqha-ingredient' ||
    command.type === 'deselect-la-tahriqha-ingredient'
  ) {
    requireSelecting(runtime);
    const assignments = parseTeamActionAssignments(runtime.teamActionJson);
    const teamId = captainTeam(context, runtime, assignments, sequence);
    const locked = lockedOf(runtime);
    if (locked[teamId]) {
      throw new LiveSessionDomainError(
        'LA_TAHRIQHA_DISH_ALREADY_LOCKED',
        'This team has already committed its ingredients',
      );
    }
    const dish = currentDish(runtime);
    const ingredientId = String(command.payload.ingredientId);
    if (!dish.ingredients.some((item) => item.localId === ingredientId)) {
      throw new LiveSessionDomainError(
        'LA_TAHRIQHA_INGREDIENT_NOT_ON_DISH',
        'That ingredient is not on this dish',
      );
    }
    const selections = selectionsOf(runtime);
    const picked = selections[teamId] ?? [];
    const adding = command.type === 'select-la-tahriqha-ingredient';
    if (adding && picked.includes(ingredientId)) {
      throw new LiveSessionDomainError(
        'LA_TAHRIQHA_INGREDIENT_ALREADY_CHOSEN',
        'That ingredient is already in this team’s dish',
      );
    }
    if (!adding && !picked.includes(ingredientId)) {
      throw new LiveSessionDomainError(
        'LA_TAHRIQHA_INGREDIENT_NOT_CHOSEN',
        'That ingredient is not in this team’s dish',
      );
    }
    if (adding && picked.length >= LA_TAHRIQHA_MAX_SELECTION) {
      throw new LiveSessionDomainError(
        'LA_TAHRIQHA_MAX_SELECTION_REACHED',
        'Five ingredients is the whole recipe — remove one before adding another',
      );
    }
    selections[teamId] = adding
      ? [...picked, ingredientId]
      : picked.filter((id) => id !== ingredientId);
    return {
      runtimeState: validateRuntime({
        ...runtime,
        selectionsJson: JSON.stringify(selections),
      }),
      roundState: command.roundState,
      eventType: adding
        ? 'la-tahriqha-ingredient-chosen'
        : 'la-tahriqha-ingredient-removed',
      // The count travels, the identity does not: this event reaches the same
      // clients the projection is careful with.
      eventPayload: { teamId, dishIndex, count: selections[teamId].length },
      effects: [],
    };
  }

  if (command.type === 'lock-la-tahriqha-dish') {
    requireSelecting(runtime);
    const assignments = parseTeamActionAssignments(runtime.teamActionJson);
    const teamId = captainTeam(context, runtime, assignments, sequence);
    const locked = lockedOf(runtime);
    if (locked[teamId]) {
      throw new LiveSessionDomainError(
        'LA_TAHRIQHA_DISH_ALREADY_LOCKED',
        'This team has already committed its ingredients',
      );
    }
    const picked = selectionsOf(runtime)[teamId] ?? [];
    if (picked.length < LA_TAHRIQHA_MIN_SELECTION) {
      throw new LiveSessionDomainError(
        'LA_TAHRIQHA_MIN_SELECTION_REQUIRED',
        'A dish needs at least three ingredients before it can be committed',
      );
    }
    locked[teamId] = true;
    const committed = validateRuntime({
      ...runtime,
      lockedJson: JSON.stringify(locked),
    });
    // Both captains have committed, so nothing is left to wait for: the dish
    // resolves now rather than burning the rest of a clock nobody is using.
    if (teamsOf(runtime).every((id) => locked[id])) {
      return resolve(context, committed, 'both-locked');
    }
    return {
      runtimeState: committed,
      roundState: command.roundState,
      eventType: 'la-tahriqha-dish-locked',
      eventPayload: { teamId, dishIndex, count: picked.length },
      effects: [],
    };
  }

  if (command.type === 'expire-la-tahriqha-dish') {
    const now = context.now ?? fail('Server command time is missing');
    // Two different refusals, said differently on purpose. A stale timer firing
    // at a dish the server has already graded is not the same event as a timer
    // firing early, and one shared message makes the first look like the second
    // in a log.
    if (runtime.phase !== 'selecting') {
      throw new LiveSessionDomainError(
        'MODE_COMMAND_UNAVAILABLE',
        'This dish is not open for choosing',
      );
    }
    if (
      typeof runtime.deadlineAt !== 'string' ||
      now.getTime() < Date.parse(runtime.deadlineAt)
    ) {
      throw new LiveSessionDomainError(
        'MODE_COMMAND_UNAVAILABLE',
        'This dish’s window has not elapsed',
      );
    }
    return resolve(context, runtime, 'deadline');
  }

  if (command.type !== 'advance-la-tahriqha') {
    throw new LiveSessionDomainError(
      'MODE_COMMAND_UNAVAILABLE',
      'لا تحرقها does not answer to this command',
    );
  }
  if (runtime.phase !== 'revealed') {
    throw new LiveSessionDomainError(
      'LA_TAHRIQHA_NOT_REVEALED',
      'Show this dish’s result before moving on',
    );
  }
  if (dishIndex === LA_TAHRIQHA_DISH_COUNT - 1) {
    const completed = validateRuntime({
      ...runtime,
      phase: 'completed',
      deadlineAt: null,
      resultJson: JSON.stringify(laTahriqhaChallengeResult(runtime)),
    });
    return {
      runtimeState: completed,
      roundState: validateRound({ phase: 'completed', dishIndex }),
      eventType: 'la-tahriqha-challenge-completed',
      eventPayload: { dishCount: LA_TAHRIQHA_DISH_COUNT },
      effects: [
        { type: 'emit-runtime-event', eventType: 'la-tahriqha-completed' },
      ],
    };
  }
  const teams = teamsOf(runtime);
  const opened = openCaptaincies(
    parseTeamActionAssignments(runtime.teamActionJson),
    teams,
    context,
  );
  const nextIndex = dishIndex + 1;
  // Prepared, not open. The next dish carries no clock until every required
  // surface has acknowledged it, so a thirty-second window is thirty seconds of
  // play rather than thirty seconds minus whatever the room's screen took.
  const next = validateRuntime({
    ...runtime,
    currentDishIndex: nextIndex,
    phase: 'preparing',
    deadlineAt: null,
    selectionsJson: JSON.stringify(
      Object.fromEntries(teams.map((teamId) => [teamId, []])),
    ),
    lockedJson: JSON.stringify(
      Object.fromEntries(teams.map((teamId) => [teamId, false])),
    ),
    teamActionJson: serializeTeamActionAssignments(opened.state),
  });
  return {
    runtimeState: next,
    roundState: validateRound({ phase: 'preparing', dishIndex: nextIndex }),
    eventType: 'la-tahriqha-dish-prepared',
    eventPayload: { dishIndex: nextIndex },
    effects: [],
    prepareNextPresentation: true,
  };
}

/**
 * What one actor may know right now.
 *
 * The dish, its eight cards and the clock are public from the first second —
 * that is the shared screen's whole job. The `correct` flag is not, and neither
 * is any team's selection: a team sees only its own captain's choices, and the
 * other side sees only whether that team is still choosing, whether it has
 * committed, and how many cards it committed to. A count of three, four or five
 * says how far the opponent reached without naming one ingredient, which is the
 * pressure this mechanic wants and the line it must not cross.
 *
 * Everything withheld is released together at the reveal, from the committed
 * result rather than from live state, so a client that joins mid-reveal sees the
 * same proof as one that watched it arrive.
 */
function publicState(
  state: GameplayModeState,
  actor?: InteractionActorProjection,
): GameplayModeState {
  const valid = validateRuntime(state);
  const teams = teamsOf(valid);
  const dish = currentDish(valid);
  const selections = selectionsOf(valid);
  const locked = lockedOf(valid);
  const assignments = parseTeamActionAssignments(valid.teamActionJson);
  const captains = captainIds(assignments, teams);
  const revealed = valid.phase === 'revealed' || valid.phase === 'completed';
  const results = resultsOf(valid);
  const ownTeam = actor?.teamId;
  return {
    phase: valid.phase,
    currentDishIndex: valid.currentDishIndex,
    dishCount: LA_TAHRIQHA_DISH_COUNT,
    minSelection: LA_TAHRIQHA_MIN_SELECTION,
    maxSelection: LA_TAHRIQHA_MAX_SELECTION,
    dishSeconds: dish.timerSeconds,
    currentDishJson: JSON.stringify({
      id: dish.id,
      dishName: dish.dishName,
      ...(dish.dishNote ? { dishNote: dish.dishNote } : {}),
      // Player-facing shape only: never the raw ContentItem media object, which
      // can carry storage path, filename, mimetype and size.
      media: toSafeQuestionMedia(
        dish.media as ContentItemMedia | null | undefined,
      ),
      ingredients: dish.ingredients.map((ingredient) => ({
        localId: ingredient.localId,
        label: ingredient.label,
      })),
    }),
    deadlineAt: valid.deadlineAt ?? null,
    teamIdsJson: JSON.stringify(teams),
    // Pressure, never information. `committedCount` is null until a team
    // commits, so an opponent watching the strip learns that someone is still
    // choosing and nothing whatsoever about what they chose.
    teamStatusJson: JSON.stringify(
      Object.fromEntries(
        teams.map((teamId) => [
          teamId,
          {
            locked: locked[teamId] === true,
            committedCount: locked[teamId]
              ? (selections[teamId] ?? []).length
              : null,
          },
        ]),
      ),
    ),
    captainParticipantIdsJson: JSON.stringify(captains),
    totalsJson: JSON.stringify(laTahriqhaTotals(valid)),
    resultsJson: JSON.stringify(results),
    ...(revealed && results.length
      ? { revealJson: JSON.stringify(results[results.length - 1]) }
      : {}),
    ...(valid.phase === 'completed' && valid.resultJson
      ? { resultJson: valid.resultJson }
      : {}),
    ...(actor
      ? {
          actorTeamId: ownTeam ?? null,
          isDishCaptain: Boolean(
            actor.participantId &&
            teams.some((teamId) => captains[teamId] === actor.participantId),
          ),
          // Own team only, captain and teammates alike: the teammates' whole
          // contribution is arguing about a set they can actually see.
          ownSelectedJson: JSON.stringify(
            ownTeam && teams.includes(ownTeam)
              ? (selections[ownTeam] ?? [])
              : [],
          ),
        }
      : {}),
  };
}

export const LA_TAHRIQHA_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: LA_TAHRIQHA_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  deadline: {
    source: 'runtime-state',
    commandType: 'expire-la-tahriqha-dish',
    // Only while a dish is actually open. `preparing` is deliberately unarmed,
    // which is what lets a dish wait for its surfaces without its clock running.
    activePhases: ['selecting'],
    requiresPresentationActivation: true,
  },
  /**
   * The dish and its eight cards are the shared screen's picture; the phones
   * carry controls over the same snapshot. So the room's screen is the surface
   * that gates the clock, exactly as it is for القطعة الدخيلة and اكشفني — an
   * idle handset must never hold thirty seconds of everyone else's game.
   */
  requiredPresentationSurfaces: () => [{ capability: 'shared' }],
  /**
   * Opens the prepared dish and anchors its window to this instant.
   *
   * Deliberately nothing else: no rotation, no selection reset, no result. A
   * duplicate or repeated activation therefore re-anchors the clock of the dish
   * already on screen and cannot move the captaincy, which is what makes
   * reconnect, refresh and a second Fair-Start acknowledgement all safe.
   */
  activatePresentation: (state, now) => {
    const valid = validateRuntime(state);
    if (valid.phase !== 'preparing' && valid.phase !== 'selecting')
      return valid;
    return validateRuntime({
      ...valid,
      phase: 'selecting',
      deadlineAt: new Date(
        now.getTime() + currentDish(valid).timerSeconds * 1000,
      ).toISOString(),
    });
  },
  createInitialRuntimeState: (context) =>
    validateRuntime(context.initialState ?? {}),
  createInitialRoundState(context) {
    const runtime = validateRuntime(context.runtimeState ?? {});
    return validateRound({
      phase: runtime.phase,
      dishIndex: runtime.currentDishIndex,
    });
  },
  validateRuntimeState: validateRuntime,
  validateRoundState: validateRound,
  command(type) {
    if (
      type === 'select-la-tahriqha-ingredient' ||
      type === 'deselect-la-tahriqha-ingredient'
    ) {
      return {
        type,
        // Any connected player may *send* it; the reducer proves they hold this
        // team's open captaincy before it changes anything.
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: ingredientPayload,
      };
    }
    if (type === 'lock-la-tahriqha-dish') {
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: lockPayload,
      };
    }
    if (type === 'advance-la-tahriqha') {
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    if (type === 'expire-la-tahriqha-dish') {
      return {
        type,
        // Invoked by the server's deadline scheduler, which runs under the
        // session controller's identity — so `internal` would refuse the only
        // caller this command has. The reducer still proves the persisted
        // deadline elapsed before it grades anything, so a host cannot use this
        // to force an early commit.
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    return undefined;
  },
  handleCommand: handle,
  /**
   * Dishes that were actually put on screen.
   *
   * A dish sitting in `preparing` has been drawn but not shown, so it is not
   * spent: a challenge abandoned between dish two's reveal and dish three's
   * activation returns dish three to the World.
   */
  presentedContentItemIds({ runtimeState }) {
    if (typeof runtimeState.dishesJson !== 'string') return [];
    let dishes: Array<{ id?: unknown }> = [];
    try {
      const parsed: unknown = JSON.parse(runtimeState.dishesJson);
      if (!Array.isArray(parsed)) return [];
      dishes = parsed as Array<{ id?: unknown }>;
    } catch {
      return [];
    }
    const index = Number(runtimeState.currentDishIndex);
    if (!Number.isInteger(index) || index < 0) return [];
    const shown = runtimeState.phase === 'preparing' ? index : index + 1;
    return dishes
      .slice(0, Math.max(0, Math.min(shown, dishes.length)))
      .map((dish) => String(dish?.id ?? ''))
      .filter(Boolean);
  },
  projectRuntimeState: (state) => publicState(state),
  projectRuntimeStateForActor: (state, actor) => publicState(state, actor),
  projectRoundState: validateRound,
};
