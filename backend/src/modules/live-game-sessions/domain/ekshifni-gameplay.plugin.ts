import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  EKSHIFNI_IMAGE_SAFETY_SECONDS,
  EKSHIFNI_ITEM_COUNT,
  EKSHIFNI_REGION_COUNT,
  EKSHIFNI_REGION_ROLES,
  EKSHIFNI_SLUG,
  EKSHIFNI_VALUES,
  EkshifniRegionRole,
} from '../../world-content/domain/world-content.constants';
import {
  ekshifniImageIssue,
  ekshifniRegionShapeIssue,
} from '../../world-content/domain/ekshifni-content.policy';
import {
  ContentItemMedia,
  LocalizedText,
} from '../../world-content/domain/world-content.types';
import {
  GameplayCommandPayload,
  GameplayCommandResult,
  GameplayModePlugin,
  GameplayModeState,
  GameplayPluginContext,
} from './gameplay-mode.plugin';
import { InteractionActorProjection } from './gameplay-interaction.plugin';
import { LiveSessionDomainError } from './live-session.errors';

export const EKSHIFNI_MODE_KEY = EKSHIFNI_SLUG;
export { EKSHIFNI_ITEM_COUNT, EKSHIFNI_REGION_COUNT, EKSHIFNI_VALUES };

/**
 * "اكشفني" — the Celebrities Signature.
 *
 * Three celebrity photographs, each covered by six authored regions. Every
 * region a team uncovers makes the picture easier and the image cheaper: 5
 * points while nothing is off, then one less per reveal down to a floor of 1.
 * That is the whole mechanic — information bought with value — and the two
 * rights it splits are what make it a game rather than a quiz.
 *
 * **Initiative** decides who may uncover the next region, and nothing else.
 * **Answer eligibility** is separate and normally belongs to both teams:
 * answering is an open race through the ordinary server-graded text path, with
 * no claim window, no lock, and no host judging.
 *
 * A wrong answer therefore costs a team its turn rather than its place in the
 * game. It hands initiative to the opponent and parks its own eligibility; the
 * opponent's next authoritative action — a reveal or an answer of its own — is
 * what un-parks it. Nobody is ever eliminated from an image, and a wrong answer
 * never uncovers the celebrity. The picture is the only thing that talks.
 *
 * Opening initiative rotates across the three images A → B → A, where A is the
 * team that selected the challenge. That is an *opening* order, not a turn
 * order: within one image `initiativeTeamId` is explicit state that moves only
 * when a wrong answer moves it.
 */

/** The phases of one image. */
export type EkshifniPhase = 'preparing' | 'playing' | 'resolved' | 'completed';

const EKSHIFNI_PHASES: readonly EkshifniPhase[] = [
  'preparing',
  'playing',
  'resolved',
  'completed',
];

/**
 * One authored region.
 *
 * `role` is authoring vocabulary — eyes, hair, outfit — and never leaves the
 * server: a player who is told which mask is "the eyes" has been told half the
 * answer. `shape` is fractions of the source image, so one authored geometry
 * lands identically on a television and on a phone.
 */
export interface EkshifniRegion {
  /** Stable across authoring edits, so a reveal can never drift onto another mask. */
  id: string;
  role: EkshifniRegionRole;
  shape: { x: number; y: number; width: number; height: number };
}

/** One celebrity image, as the launcher composes it from a ContentItem. */
export interface EkshifniRuntimeImage {
  contentItemId: string;
  /** The celebrity's name, surfaced only in the post-resolution reveal. */
  identity: string;
  prompt?: LocalizedText | null;
  media: ContentItemMedia;
  /** Server-only grading truth; never projected while the image is live. */
  acceptedAnswers: string[];
  regions: EkshifniRegion[];
}

export interface EkshifniImageResult {
  imageIndex: number;
  contentItemId: string;
  identity: string;
  /** Region ids uncovered before the image resolved, in the order taken. */
  revealedRegionIds: string[];
  /** What the image was worth when it resolved. */
  value: number;
  winnerTeamId: string | null;
  resolvedBy: 'answer' | 'timeout';
  /** Every attempt made on this image, in order. */
  attempts: Array<{ teamId: string; answer: string; correct: boolean }>;
  points: Record<string, number>;
  resolvedAt: string;
}

export interface EkshifniChallengeResult {
  winnerTeamId: string | null;
  tie: boolean;
  points: Record<string, number>;
}

function fail(message: string): never {
  throw new LiveSessionDomainError('INVALID_EKSHIFNI_STATE', message);
}

function parse<T>(value: unknown, label: string): T {
  if (typeof value !== 'string') return fail(`${label} is missing`);
  try {
    return JSON.parse(value) as T;
  } catch {
    return fail(`${label} is invalid`);
  }
}

const imagesOf = (s: GameplayModeState) =>
  parse<EkshifniRuntimeImage[]>(s.imagesJson, 'images');
const teamsOf = (s: GameplayModeState) =>
  parse<string[]>(s.teamIdsJson, 'teams');
const revealedOf = (s: GameplayModeState) =>
  parse<string[]>(s.revealedRegionIdsJson ?? '[]', 'revealed regions');
const attemptsOf = (s: GameplayModeState) =>
  parse<EkshifniImageResult['attempts']>(s.attemptsJson ?? '[]', 'attempts');
const resultsOf = (s: GameplayModeState) =>
  parse<EkshifniImageResult[]>(s.resultsJson ?? '[]', 'results');
const currentImage = (s: GameplayModeState) =>
  imagesOf(s)[Number(s.currentImageIndex)];

/**
 * What the image is worth right now: 5 before anything is off, then one less per
 * reveal, floored at 1.
 *
 * The floor is the point of the sixth region — it stays worth taking, so a team
 * that has spent everything still has one move left rather than a dead board.
 */
export function ekshifniValue(revealedCount: number): number {
  const first = EKSHIFNI_VALUES[0];
  const floor = EKSHIFNI_VALUES[EKSHIFNI_VALUES.length - 1];
  return Math.max(floor, first - revealedCount);
}

/**
 * Who opens image `index`: A → B → A, where A selected the challenge.
 *
 * The *opening* holder only. Once an image is live, initiative is explicit state
 * and this has no further say in it.
 */
export function ekshifniOpeningTeam(
  teams: readonly string[],
  selectingTeamId: string,
  index: number,
): string {
  const opponent = teams.find((team) => team !== selectingTeamId);
  return index % 2 === 0 ? selectingTeamId : (opponent ?? selectingTeamId);
}

export function validateEkshifniImage(
  image: EkshifniRuntimeImage,
): EkshifniRuntimeImage {
  const invalid = (message: string): never => {
    throw new LiveSessionDomainError('EKSHIFNI_CONTENT_INVALID', message);
  };
  if (!image?.contentItemId || !image.identity?.trim()) {
    invalid('اكشفني needs a content item and the celebrity name');
  }
  if (
    !image.acceptedAnswers?.length ||
    image.acceptedAnswers.some((answer) => !normalizeAnswer(answer))
  ) {
    invalid('اكشفني needs at least one accepted answer');
  }
  // The same image and geometry predicates the Admin ran when the item was
  // authored, so an accepted item cannot be rejected here on game night.
  const imageProblem = ekshifniImageIssue(image.media);
  if (imageProblem) invalid(imageProblem.message);
  const regions = image.regions ?? [];
  if (regions.length !== EKSHIFNI_REGION_COUNT) {
    invalid(`اكشفني needs exactly ${EKSHIFNI_REGION_COUNT} reveal regions`);
  }
  if (
    new Set(regions.map((region) => region.id)).size !== EKSHIFNI_REGION_COUNT
  ) {
    invalid('اكشفني region ids must be unique and stable');
  }
  for (const [index, region] of regions.entries()) {
    if (!region.id?.trim() || !EKSHIFNI_REGION_ROLES.includes(region.role)) {
      invalid('اكشفني region needs a stable id and an authored role');
    }
    const shapeProblem = ekshifniRegionShapeIssue(
      region.shape,
      `اكشفني region ${index + 1}`,
    );
    if (shapeProblem) invalid(shapeProblem.message);
  }
  return image;
}

function validate(state: GameplayModeState): GameplayModeState {
  const images = imagesOf(state);
  const teams = teamsOf(state);
  const revealed = revealedOf(state);
  if (
    images.length !== EKSHIFNI_ITEM_COUNT ||
    new Set(images.map((image) => image.contentItemId)).size !==
      EKSHIFNI_ITEM_COUNT ||
    teams.length !== 2 ||
    new Set(teams).size !== 2 ||
    !EKSHIFNI_PHASES.includes(String(state.phase) as EkshifniPhase) ||
    !Number.isInteger(state.currentImageIndex) ||
    Number(state.currentImageIndex) < 0 ||
    Number(state.currentImageIndex) >= EKSHIFNI_ITEM_COUNT ||
    typeof state.selectingTeamId !== 'string' ||
    !teams.includes(state.selectingTeamId) ||
    revealed.length > EKSHIFNI_REGION_COUNT ||
    new Set(revealed).size !== revealed.length
  ) {
    return fail('اكشفني runtime shape is invalid');
  }
  // Initiative and eligibility are separate concerns, and each must name a team
  // that is actually playing — or nobody at all.
  for (const key of ['initiativeTeamId', 'answerPenaltyTeamId'] as const) {
    const value = state[key];
    if (
      value !== null &&
      value !== undefined &&
      !teams.includes(String(value))
    ) {
      return fail(`اكشفني ${key} is not a competing team`);
    }
  }
  images.forEach(validateEkshifniImage);
  attemptsOf(state);
  resultsOf(state);
  return state;
}

const submitterTeam = (context: GameplayPluginContext, teams: string[]) => {
  const participant = context.eligibleParticipants?.find(
    (candidate) => candidate.participantId === context.submitterParticipantId,
  );
  const teamId = participant?.teamId;
  if (!participant || !teamId || !teams.includes(teamId)) {
    throw new LiveSessionDomainError(
      'EKSHIFNI_FORBIDDEN',
      'Only an eligible competing player may act',
    );
  }
  return teamId;
};

const answerPayload = (payload: GameplayCommandPayload) => {
  if (
    Object.keys(payload).length !== 1 ||
    typeof payload.answer !== 'string' ||
    !payload.answer.trim()
  ) {
    throw new LiveSessionDomainError(
      'INVALID_EKSHIFNI_SUBMISSION',
      'Submit one non-empty celebrity name',
    );
  }
  return { answer: payload.answer.trim() };
};

const regionPayload = (payload: GameplayCommandPayload) => {
  if (
    Object.keys(payload).length !== 1 ||
    typeof payload.regionId !== 'string' ||
    !payload.regionId.trim()
  ) {
    throw new LiveSessionDomainError(
      'INVALID_EKSHIFNI_REVEAL',
      'Choose one region to reveal',
    );
  }
  return { regionId: payload.regionId.trim() };
};

const noPayload = (payload: GameplayCommandPayload) => {
  if (Object.keys(payload).length) {
    throw new LiveSessionDomainError(
      'INVALID_EKSHIFNI_COMMAND',
      'This command accepts no payload',
    );
  }
  return {};
};

const challengeResult = (state: GameplayModeState): EkshifniChallengeResult => {
  const teams = teamsOf(state);
  const points = Object.fromEntries(teams.map((teamId) => [teamId, 0]));
  for (const entry of resultsOf(state)) {
    for (const teamId of teams) {
      points[teamId] += entry.points[teamId] ?? 0;
    }
  }
  const [first, second] = teams;
  const tie = points[first] === points[second];
  return {
    winnerTeamId: tie ? null : points[first] > points[second] ? first : second,
    tie,
    points,
  };
};

const result = (
  runtimeState: GameplayModeState,
  eventType: string,
  eventPayload: GameplayModeState = {},
  prepareNextPresentation = false,
): GameplayCommandResult => ({
  runtimeState: validate(runtimeState),
  roundState: {
    phase: runtimeState.phase,
    imageIndex: runtimeState.currentImageIndex,
  },
  eventType,
  eventPayload,
  effects: [],
  prepareNextPresentation,
});

/**
 * Close the current image and hold it on the reveal.
 *
 * The identity, the attempts and the earned value are written here and only
 * here: an image that is still being played has none of them anywhere a client
 * can reach.
 */
function resolveImage(
  state: GameplayModeState,
  now: Date,
  winnerTeamId: string | null,
  resolvedBy: 'answer' | 'timeout',
  eventType: string,
): GameplayCommandResult {
  const teams = teamsOf(state);
  const image = currentImage(state);
  const revealed = revealedOf(state);
  const value = ekshifniValue(revealed.length);
  const imageResult: EkshifniImageResult = {
    imageIndex: Number(state.currentImageIndex),
    contentItemId: image.contentItemId,
    identity: image.identity,
    revealedRegionIds: revealed,
    value,
    winnerTeamId,
    resolvedBy,
    attempts: attemptsOf(state),
    // A timeout resolves the image but rewards nobody.
    points: Object.fromEntries(
      teams.map((teamId) => [teamId, teamId === winnerTeamId ? value : 0]),
    ),
    resolvedAt: now.toISOString(),
  };
  return result(
    {
      ...state,
      phase: 'resolved',
      deadlineAt: null,
      // A parked team is parked inside one image, never across the boundary.
      answerPenaltyTeamId: null,
      resultsJson: JSON.stringify([...resultsOf(state), imageResult]),
    },
    eventType,
    { imageIndex: state.currentImageIndex },
  );
}

/**
 * Un-park the opponent, if one is parked.
 *
 * A wrong answer parks the answering team until the *other* team takes one
 * authoritative action. Any action counts — a reveal or an answer, right or
 * wrong — so two consecutive wrong answers can never deadlock an image with
 * both teams waiting on each other.
 */
function releaseOpponentPenalty(
  state: GameplayModeState,
  actingTeamId: string,
): GameplayModeState {
  const parked = state.answerPenaltyTeamId;
  if (typeof parked !== 'string' || parked === actingTeamId) return state;
  return { ...state, answerPenaltyTeamId: null };
}

/**
 * The player-facing image: the picture, and six numbered masks over it.
 *
 * The shared board has to draw all six regions — a mask needs a box, and so does
 * the number printed on it — so it receives every region's geometry. That leaks
 * nothing: a rectangle says where a mask sits, never what is under it. What the
 * shared board never receives is the *role*, because "the eyes" names the
 * feature and half the answer with it.
 *
 * A phone is a different surface with a different answer: it renders no picture,
 * so it is given no picture and no geometry at all — only the numbers it may
 * press. The celebrity's name and the accepted answers appear exactly once, in
 * the record written at resolution.
 */
function publicState(
  state: GameplayModeState,
  actor?: InteractionActorProjection,
): GameplayModeState {
  const valid = validate(state);
  const image = currentImage(valid);
  const teams = teamsOf(valid);
  const phase = String(valid.phase) as EkshifniPhase;
  const revealed = revealedOf(valid);
  const resolved = phase === 'resolved' || phase === 'completed';
  const latest = resultsOf(valid).at(-1);

  /** Neutral player-facing identity: authoring order becomes 1..6. */
  const numbered = image.regions.map((region, index) => ({
    id: region.id,
    number: index + 1,
    revealed: revealed.includes(region.id),
  }));

  // Every region's box, for the surface that actually draws the masks. The role
  // is not here, and never is.
  const boardRegions = numbered.map((region, index) => ({
    ...region,
    shape: image.regions[index].shape,
  }));

  const safeMedia = {
    type: image.media.type,
    // Player-facing url and alt text only; path/filename/mimetype can carry
    // answer-bearing names.
    assets: (image.media.assets ?? []).map((asset) => ({
      url: asset.url,
      ...(asset.altText ? { altText: asset.altText } : {}),
    })),
  };

  const projected: GameplayModeState = {
    phase: valid.phase,
    currentImageIndex: valid.currentImageIndex,
    imageCount: EKSHIFNI_ITEM_COUNT,
    imageNumber: Number(valid.currentImageIndex) + 1,
    regionCount: EKSHIFNI_REGION_COUNT,
    teamIdsJson: JSON.stringify(teams),
    selectingTeamId: valid.selectingTeamId,
    initiativeTeamId: valid.initiativeTeamId ?? null,
    answerPenaltyTeamId: valid.answerPenaltyTeamId ?? null,
    currentValue: ekshifniValue(revealed.length),
    regionsJson: JSON.stringify(boardRegions),
    revealedRegionIdsJson: JSON.stringify(revealed),
    deadlineAt: valid.deadlineAt ?? null,
    // Fair-Start: a `preparing` image is not on screen yet, so its picture is
    // not in the snapshot either. Activation is what publishes the media.
    ...(phase === 'preparing'
      ? {}
      : { imageMediaJson: JSON.stringify(safeMedia) }),
    ...(image.prompt && phase !== 'preparing'
      ? { promptJson: JSON.stringify(image.prompt) }
      : {}),
    ...(resolved && latest
      ? {
          revealJson: JSON.stringify({
            imageIndex: latest.imageIndex,
            identity: latest.identity,
            value: latest.value,
            winnerTeamId: latest.winnerTeamId,
            resolvedBy: latest.resolvedBy,
            attempts: latest.attempts,
            points: latest.points,
            revealedRegionIds: latest.revealedRegionIds,
            resolvedAt: latest.resolvedAt,
          }),
        }
      : {}),
    ...(phase === 'completed' && valid.resultJson
      ? { resultJson: valid.resultJson }
      : {}),
    // A finished image is safe to show whole; the open one is only ever an index.
    resultsJson: JSON.stringify(
      resultsOf(valid).map((entry) =>
        resolved || entry.imageIndex < Number(valid.currentImageIndex)
          ? entry
          : { imageIndex: entry.imageIndex },
      ),
    ),
  };

  const teamId = actor?.teamId;
  if (!teamId) return projected;
  // A phone is a controller, not a second screen: it renders no picture, so it
  // is given no picture and no geometry — only the numbers it may press and the
  // server's word on which of its two rights are live right now.
  return {
    ...projected,
    imageMediaJson: null,
    regionsJson: JSON.stringify(
      numbered.map(({ id, number, revealed: isRevealed }) => ({
        id,
        number,
        revealed: isRevealed,
      })),
    ),
    actorTeamId: teamId,
    hasInitiative: valid.initiativeTeamId === teamId,
    canReveal:
      phase === 'playing' &&
      valid.initiativeTeamId === teamId &&
      revealed.length < EKSHIFNI_REGION_COUNT,
    canAnswer: phase === 'playing' && valid.answerPenaltyTeamId !== teamId,
  };
}

export const EKSHIFNI_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: EKSHIFNI_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  deadline: {
    // A technical safety clock only: اكشفني has no product answer timer, but an
    // image nobody answers must still end so the match can converge.
    source: 'runtime-state',
    commandType: 'expire-ekshifni-image',
    activePhases: ['playing'],
    requiresPresentationActivation: true,
  },
  // Only the shared board renders the celebrity image and its masks. Phones are
  // number pads and an answer field, so an idle handset must not stall the room.
  requiredPresentationSurfaces: () => [{ capability: 'shared' }],
  createInitialRuntimeState: (context) => validate(context.initialState ?? {}),
  createInitialRoundState: (context) => ({
    phase: context.initialState?.phase ?? 'preparing',
    imageIndex: context.initialState?.currentImageIndex ?? 0,
  }),
  validateRuntimeState: validate,
  validateRoundState: (s) => s,
  command: (type) => {
    if (type === 'reveal-ekshifni-region')
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: regionPayload,
      };
    if (type === 'submit-ekshifni')
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: answerPayload,
      };
    if (type === 'advance-ekshifni')
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    if (type === 'expire-ekshifni-image')
      return {
        type,
        authorization: 'internal',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    return undefined;
  },
  // Fair-Start, for the first image and every later one alike: an image sits in
  // `preparing` with no picture and no clock until the shared surface is ready.
  // Activation publishes the media and anchors the safety clock to `now`.
  activatePresentation: (state, now) =>
    String((state as { phase?: unknown }).phase) === 'preparing'
      ? validate({
          ...state,
          phase: 'playing',
          deadlineAt: new Date(
            now.getTime() + EKSHIFNI_IMAGE_SAFETY_SECONDS * 1000,
          ).toISOString(),
        })
      : state,
  handleCommand: (context, command) => {
    const state = validate(command.runtimeState);
    const teams = teamsOf(state);
    const phase = String(state.phase);
    const now = context.now ?? fail('Server command time is missing');

    if (command.type === 'reveal-ekshifni-region') {
      const teamId = submitterTeam(context, teams);
      if (phase !== 'playing') {
        throw new LiveSessionDomainError(
          'EKSHIFNI_IMAGE_CLOSED',
          'No اكشفني image is open',
        );
      }
      // Initiative is the entire right being spent here.
      if (state.initiativeTeamId !== teamId) {
        throw new LiveSessionDomainError(
          'EKSHIFNI_NOT_YOUR_TURN',
          'The other team chooses the next region',
        );
      }
      const image = currentImage(state);
      const regionId = String(command.payload.regionId);
      if (!image.regions.some((region) => region.id === regionId)) {
        throw new LiveSessionDomainError(
          'EKSHIFNI_UNKNOWN_REGION',
          'That region is not on this image',
        );
      }
      const revealed = revealedOf(state);
      // The CAS revision guard stops a replayed command from landing twice; this
      // stops a second *distinct* command from spending value on a mask that is
      // already off.
      if (revealed.includes(regionId)) {
        throw new LiveSessionDomainError(
          'EKSHIFNI_REGION_ALREADY_REVEALED',
          'That region is already uncovered',
        );
      }
      const next = [...revealed, regionId];
      return result(
        {
          ...releaseOpponentPenalty(state, teamId),
          revealedRegionIdsJson: JSON.stringify(next),
        },
        'ekshifni-region-revealed',
        {
          teamId,
          imageIndex: state.currentImageIndex,
          revealedCount: next.length,
          value: ekshifniValue(next.length),
        },
      );
    }

    if (command.type === 'submit-ekshifni') {
      const teamId = submitterTeam(context, teams);
      if (phase !== 'playing') {
        throw new LiveSessionDomainError(
          'EKSHIFNI_IMAGE_CLOSED',
          'No اكشفني image is open',
        );
      }
      // Answering is open between eligible teams; only a parked one is out, and
      // only until the opponent acts.
      if (state.answerPenaltyTeamId === teamId) {
        throw new LiveSessionDomainError(
          'EKSHIFNI_ANSWER_NOT_ELIGIBLE',
          'Wait for the other team to act before answering again',
        );
      }
      const image = currentImage(state);
      const answer = String(command.payload.answer);
      const correct = image.acceptedAnswers.some(
        (accepted) => normalizeAnswer(accepted) === normalizeAnswer(answer),
      );
      const recorded: GameplayModeState = {
        ...state,
        attemptsJson: JSON.stringify([
          ...attemptsOf(state),
          { teamId, answer, correct },
        ]),
      };
      if (correct) {
        return resolveImage(
          recorded,
          now,
          teamId,
          'answer',
          'ekshifni-answer-correct',
        );
      }
      // Wrong: this team hands initiative over and parks itself. Nothing about
      // the celebrity is disclosed, and no region is uncovered as a penalty.
      const opponent = teams.find((team) => team !== teamId) ?? teamId;
      return result(
        {
          ...releaseOpponentPenalty(recorded, teamId),
          answerPenaltyTeamId: teamId,
          initiativeTeamId: opponent,
        },
        'ekshifni-answer-wrong',
        { teamId, imageIndex: state.currentImageIndex },
      );
    }

    if (command.type === 'expire-ekshifni-image') {
      if (
        phase !== 'playing' ||
        typeof state.deadlineAt !== 'string' ||
        now.getTime() < Date.parse(state.deadlineAt)
      ) {
        throw new LiveSessionDomainError(
          'EKSHIFNI_NOT_EXPIRED',
          'The اكشفني safety deadline has not elapsed',
        );
      }
      // Nobody is rewarded for a stalled image, and the identity still reaches
      // the room through the ordinary terminal reveal.
      return resolveImage(
        state,
        now,
        null,
        'timeout',
        'ekshifni-image-expired',
      );
    }

    if (command.type === 'advance-ekshifni') {
      if (phase !== 'resolved') {
        throw new LiveSessionDomainError(
          'EKSHIFNI_NOT_RESOLVED',
          'Resolve this image first',
        );
      }
      const next = Number(state.currentImageIndex) + 1;
      if (next >= EKSHIFNI_ITEM_COUNT) {
        return result(
          {
            ...state,
            phase: 'completed',
            deadlineAt: null,
            resultJson: JSON.stringify(challengeResult(state)),
          },
          'ekshifni-completed',
        );
      }
      // Open a fresh Fair-Start generation: the next image sits hidden and
      // clockless in `preparing` until the shared surface re-acknowledges.
      return result(
        {
          ...state,
          phase: 'preparing',
          currentImageIndex: next,
          revealedRegionIdsJson: '[]',
          attemptsJson: '[]',
          answerPenaltyTeamId: null,
          initiativeTeamId: ekshifniOpeningTeam(
            teams,
            String(state.selectingTeamId),
            next,
          ),
          deadlineAt: null,
        },
        'ekshifni-image-prepared',
        { imageIndex: next },
        true,
      );
    }

    throw new LiveSessionDomainError(
      'EKSHIFNI_COMMAND_UNKNOWN',
      'Unsupported اكشفني command',
    );
  },
  projectRuntimeState: (state) => publicState(state),
  projectRuntimeStateForActor: (state, actor) => publicState(state, actor),
  projectRoundState: (s) => s,
  // One image at a time: what has been resolved, plus the one on screen. A
  // planned image is never burned.
  presentedContentItemIds: ({ runtimeState }) =>
    imagesOf(runtimeState)
      .slice(0, Number(runtimeState.currentImageIndex) + 1)
      .map((image) => image.contentItemId),
};
