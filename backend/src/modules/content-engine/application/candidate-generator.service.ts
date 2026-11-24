import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { AiProvider } from '../../ai-agent/domain/ai-provider.interface';
import {
  AmbiguousProviderOutcomeError,
  ENGINE_AI_PROVIDER,
  LeaseLostError,
  outputTokensExhaustion,
  ProviderOutputTokensExhaustedError,
  providerEvidenceOf,
} from '../domain/content-engine.constants';
import {
  DEFAULT_GENERATION_TEMPERATURE,
  GenerationSpecification,
  MAX_BATCH_GUIDANCE_LENGTH,
  MECHANIC_ANSWER_MODES,
  PROMPT_VERSIONS,
  RYO_REQUESTED_DIFFICULTIES,
  RyoRequestedDifficulty,
  buildGenerationSpecification,
  normalizeBatchGuidance,
  resolveEffectiveRyoDifficultyTargets,
  resolveGenerationTemperature,
  resolveMaxBatchSize,
  resolveOmitTemperature,
  resolveOutputTokensPerCandidate,
  resolveReasoningEffort,
  resolveRequestedDifficulty,
  resolveRyoMixedDifficultyTargets,
  generatorAnswerModeFor,
  promptVersionFor,
  validateTargetCount,
} from '../domain/generation-specification';
import {
  BOMB_SLUG,
  MOVING_XO_SLUG,
} from '../../world-content/domain/world-content.constants';
import {
  BOMB_IMAGE_KINDS,
  BombImageKind,
  CandidateMediaIntent,
} from '../domain/candidate-media-intent';
import { EngineCandidateDocument } from '../schemas/engine-candidate.schema';
import { ResolvedAuthoringContext } from './authoring-context.service';
import { EngineBudgetService } from './engine-budget.service';
import { GenerationJobService } from './generation-job.service';

/**
 * Output tokens allowed per requested candidate.
 *
 * One number, used twice: it sizes the budget reservation and it is sent to
 * the provider as `max_tokens`. Keeping both from the same constant is what
 * makes the reservation a real ceiling — the cap is enforced when money is
 * reserved, and an unbounded completion could settle above it.
 *
 * A structured Closest or RYO candidate runs ~150-200 tokens in Arabic, so
 * this carries roughly 4x headroom. Truncating the batch mid-JSON would waste
 * the entire paid call, and that is the worse failure.
 */
export const OUTPUT_TOKENS_PER_CANDIDATE = 800;

/** الكومبو grading contract: at most ten accepted spellings of one answer. */
export const COMBO_MAX_ACCEPTED_ANSWERS = 10;

/**
 * Re-exported, never redeclared: the mechanic map, its prompt versions and the
 * capability lookup live in the domain module, which is what job creation and
 * the orchestrator read. A copy here would let the generator claim a mechanic
 * the rest of the pipeline refuses.
 */
export { MECHANIC_ANSWER_MODES, PROMPT_VERSIONS, generatorAnswerModeFor };

/** Back-compat for callers and stored candidates written before per-mechanic versions. */
export const PROMPT_VERSION = PROMPT_VERSIONS['multiple_choice'];

/**
 * Which item answer mode a mechanic's content is authored in.
 *
 * Mirrors `ANSWER_MODE_COMPATIBLE_ITEM_MODES` for the mechanics the engine can
 * author today. A mechanic absent from this map cannot be generated — the
 * engine refuses rather than guessing a shape the policy would reject.
 */
/**
 * How hard a typical Akwaan table would find a question.
 *
 * Five coarse bands rather than a percentage, because a model cannot measure
 * player performance and a fabricated number would read as if it had. The
 * mechanic needs the middle: roadmap §6.1's payoff matrix only produces a real
 * Steal/Trust decision when the opposing team genuinely cannot call it.
 */
export const RYO_CONFIDENCE_BANDS = [
  'near-certain',
  'likely',
  'even',
  'unlikely',
  'near-impossible',
] as const;
export type RyoConfidenceBand = (typeof RYO_CONFIDENCE_BANDS)[number];

/** The bands that leave the opponent's decision genuinely open. */
export const RYO_TARGET_CONFIDENCE_BANDS: readonly RyoConfidenceBand[] = [
  'likely',
  'even',
];

/**
 * Experimental batch guidance, not measured player performance or balance.
 *
 * These live at the generator configuration seam because they control an
 * experiment, not the canonical RYO mechanic. The Skill still owns the
 * certainty/fairness contract and every configured mix must obey it.
 */
export const DEFAULT_RYO_DIFFICULTY_TARGETS = {
  easy: 25,
  medium: 50,
  relativelyDifficult: 25,
} as const;

export const RYO_DIFFICULTY_CONFIG_KEYS = {
  easy: 'ENGINE_RYO_DIFFICULTY_EASY_PERCENT',
  medium: 'ENGINE_RYO_DIFFICULTY_MEDIUM_PERCENT',
  relativelyDifficult: 'ENGINE_RYO_DIFFICULTY_RELATIVELY_DIFFICULT_PERCENT',
} as const;

interface RyoDifficultyTargets {
  easy: number;
  medium: number;
  relativelyDifficult: number;
}

/**
 * What the model must return. Passed to the provider as `responseSchema`, so a
 * provider that supports structured output cannot drift from the shape, and
 * parsing is a validation step rather than a hope.
 *
 * Deliberately a *subset* of `CreateContentItemDto`: the engine supplies
 * `scopeId` and `compatibleChallengeTypeIds` itself. A model has no business
 * inventing database identifiers.
 */
export const RYO_CANDIDATE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  // `strict: true` enforcement varies by provider, and several reject a schema
  // that leaves an object open. Closing every object is what makes the same
  // request behave identically wherever OpenRouter routes it.
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        // Field order is the authoring order. The concept is named before any
        // wording exists, and the distractor rationale and confidence come
        // after the options they describe.
        required: [
          'concept',
          'prompt',
          'options',
          'correctOptionId',
          'distractorRationale',
          'estimatedConfidence',
          'factualClaims',
        ],
        properties: {
          concept: {
            type: 'string',
            description:
              'The knowledge or misconception the question turns on, and why that makes it worth betting on. One line, before any wording exists.',
          },
          prompt: { type: 'string' },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'label'],
              properties: { id: { type: 'string' }, label: { type: 'string' } },
            },
          },
          correctOptionId: { type: 'string' },
          distractorRationale: {
            type: 'array',
            description:
              'One entry per INCORRECT option, keyed by its id. Never include the correct option.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['optionId', 'why'],
              properties: {
                optionId: {
                  type: 'string',
                  description: 'The id of an incorrect option.',
                },
                why: {
                  type: 'string',
                  description:
                    'Why a real player might pick this one. If nothing plausible can be said, the option is filler and should be replaced.',
                },
              },
            },
          },
          estimatedConfidence: {
            type: 'object',
            additionalProperties: false,
            required: ['band', 'why'],
            description:
              'An authoring hypothesis about how a typical Akwaan team would fare. Not measured player performance.',
            properties: {
              band: {
                type: 'string',
                enum: RYO_CONFIDENCE_BANDS as unknown as string[],
                description:
                  'near-certain: almost every team gets it. likely: most do. even: roughly half. unlikely: most do not. near-impossible: almost none do. The mechanic needs "likely" or "even" — at the extremes the Steal/Trust decision answers itself.',
              },
              why: {
                type: 'string',
                description:
                  "One line on what makes it that hard, from the table's point of view.",
              },
            },
          },
          /** Claims the model asserts, for Phase 1c to verify. Not trusted here. */
          factualClaims: {
            type: 'array',
            minItems: 1,
            items: { type: 'string' },
            description:
              'The answer-critical factual or logical claim(s) that justify why the correct answer is true. For knowledge questions, state the verifiable real-world fact. For self-contained puzzles, state the core mathematical, lexical, or logical rule/derivation proving the answer.',
          },
        },
      },
    },
  },
};

/**
 * Closest candidates.
 *
 * The slider is authored **before** the answer is looked at (the Skill's
 * domain-first rule), so the schema asks for the domain span and the target as
 * separate facts rather than letting one be derived from the other.
 *
 * Two sliders are authored. `numeric-range` shows the player numbers.
 * `between-anchors` shows a bare line between two labelled ends and no number
 * at all — the player places a mark — so it is offered only for a quantity
 * that is naturally a *position* (a date on the year, a letter in the
 * alphabet). `colour-hue` needs a picture and is authored by hand.
 */
export const CLOSEST_CANDIDATE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        // Field order is the authoring order. A strict schema is generated
        // top to bottom, so naming the concept and the player's route to it
        // *before* any number exists is what stops the model from picking a
        // fact it already knows and dressing a slider around it afterwards.
        required: [
          'concept',
          'answerBasis',
          'playerReasoningStrategy',
          'prompt',
          'domainDescription',
          'sliderMode',
          'leftAnchor',
          'rightAnchor',
          'min',
          'max',
          'step',
          'correctValue',
          'stepsFromMin',
          // `unit` and `displayFormat` are optional *content*, but OpenAI's
          // strict structured-output mode requires every declared property to
          // appear in `required` — a schema with optional keys is rejected
          // with HTTP 400 before any inference runs. Optionality is expressed
          // through a value instead: an empty unit, and "number" for the
          // ordinary display format.
          'unit',
          'displayFormat',
          'factualClaims',
        ],
        properties: {
          concept: {
            type: 'string',
            description:
              'The mechanic-native idea in one line, before any wording or number exists. What quantity is being estimated, and what makes it estimable rather than merely known?',
          },
          answerBasis: {
            type: 'string',
            enum: ['reasoning', 'knowledge-anchored'],
            description:
              'Which kind of Closest question this is. "reasoning": the prompt supplies everything needed to derive the answer. "knowledge-anchored": the answer is a real quantity a player may know, and others estimate from ordinary familiarity. Both are valid unless the World or Scope restricts one — read those sections.',
          },
          playerReasoningStrategy: {
            type: 'string',
            description:
              'How a player who does NOT know the exact answer still gets close. For "reasoning", the derivation from what the prompt supplies. For "knowledge-anchored", the familiar reference points a player estimates from — do NOT pretend the fact is derivable from the prompt. If the honest answer is "they would have no way in at all", the question is a lottery and must be replaced.',
          },
          prompt: { type: 'string', description: 'Arabic question text.' },
          domainDescription: {
            type: 'string',
            description:
              'The natural quantitative span this question lives in, decided before looking at the answer.',
          },
          sliderMode: {
            type: 'string',
            enum: ['numeric-range', 'between-anchors'],
            description:
              '"numeric-range": the player reads numbers on the slider. "between-anchors": the player sees only a line between two labelled ends and places a mark — use it ONLY when the slot asks for a position (its Task says position-estimation).',
          },
          leftAnchor: {
            type: 'string',
            description:
              'between-anchors only: the Arabic label of the end where the scale starts (the thing at min). An empty string for numeric-range.',
          },
          rightAnchor: {
            type: 'string',
            description:
              'between-anchors only: the Arabic label of the end where the scale finishes (the thing at max). An empty string for numeric-range.',
          },
          min: { type: 'number' },
          max: { type: 'number' },
          step: {
            type: 'number',
            description:
              'Chosen from the domain, not from the answer. Pick a step the quantity itself justifies.',
          },
          correctValue: { type: 'number' },
          stepsFromMin: {
            type: 'integer',
            description:
              'Whole number of steps from min to correctValue: correctValue must equal min + stepsFromMin * step exactly. Compute it; do not guess. If it is not a whole number, change the step to another the domain justifies — never move an endpoint and never round the answer.',
          },
          // Plain strings, not `['string', 'null']`. A nullable type written
          // as a type list is valid JSON Schema and OpenAI accepts it, but
          // Anthropic and Google reject the request outright when such a
          // field also carries an `enum` ("Enum value 'number' does not match
          // declared type") — so the same model fails or works depending on
          // which upstream OpenRouter happens to pick. "Nothing" is spelled as
          // a value every provider can express instead.
          unit: {
            type: 'string',
            description:
              'Unit of the quantity, or an empty string when the value takes none (a calendar year never takes one).',
          },
          displayFormat: {
            type: 'string',
            enum: ['number', 'calendar-year'],
            description:
              '"number" for an ordinary quantity; "calendar-year" only when the value is a year.',
          },
          factualClaims: {
            type: 'array',
            items: { type: 'string' },
            description:
              'The answer-critical factual or logical claim(s) that justify why the correct value is true. For knowledge questions, state the verifiable real-world fact. For self-contained puzzles, state the core mathematical or estimation rule/derivation proving the value.',
          },
        },
      },
    },
  },
};

export const COMBO_CANDIDATE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        // Authoring order, and the stage is settled second on purpose: the
        // ladder is the mechanic. Choosing the stage before the wording exists
        // is what stops a stage-1 question from being relabelled stage 4
        // because it happened to come out hard.
        required: [
          'concept',
          'comboStage',
          'stageJustification',
          'prompt',
          'acceptedAnswers',
          'factualClaims',
        ],
        properties: {
          concept: {
            type: 'string',
            description:
              'The idea in one line, before any wording exists: what the player has to know, and why it belongs to this Scope.',
          },
          comboStage: {
            type: 'integer',
            enum: [1, 2, 3, 4],
            description:
              'Which rung of the ladder this item is. 1 is recognisable to a casual follower of this Scope; 4 is for someone who follows it closely.',
          },
          stageJustification: {
            type: 'string',
            description:
              'Why this item sits at that rung rather than the one below or above it. Depth of knowledge only — never trick wording or an obscure spelling.',
          },
          prompt: {
            type: 'string',
            description:
              'Arabic question text. It must not contain the answer, any accepted spelling of it, or a word that gives it away.',
          },
          acceptedAnswers: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: { type: 'string' },
            description:
              'The typed answer, graded by text match. The canonical short name first, then only genuinely DIFFERENT forms a correct player would type: a well-known nickname or short form, the full name beside the common one, a widely used Latin transliteration. Do NOT list spelling variants that differ only in أ/إ/آ, ة/ه, ى/ي, diacritics, punctuation, letter case, or a leading ال — grading already folds those, so they add nothing. Never a different entity, a broader category, or a near-miss that should be wrong.',
          },
          factualClaims: {
            type: 'array',
            items: { type: 'string' },
            description:
              'The answer-critical claim(s) that make the accepted answer the correct one.',
          },
        },
      },
    },
  },
};

export const COMBO_TASK_GUIDANCE = [
  '## COMBO TASK',
  'الكومبو is a ladder inside one Scope: four stages, each strictly harder than the one below it. The stage is the difficulty, never the topic.',
  'Difficulty comes from how deep the knowledge runs. It never comes from trick wording, ambiguity, an obscure spelling, or a detail nobody records.',
  'A stage-1 question a casual follower cannot answer is mis-staged, and so is a stage-4 question they answer instantly.',
  'The answer is typed and graded by text match, so it must be ONE short canonical name or phrase — not a sentence, not a list, not a spelled-out number.',
  'If two correct players would plausibly type genuinely different words, the question has no stable written answer and belongs to another mechanic. Replace it.',
  'Grading folds أ/إ/آ, ة/ه, ى/ي, diacritics, punctuation, case and a leading ال, so never spend an accepted answer on those. List only forms that differ as words.',
  'Digits are NOT folded: ٧ and 7 grade as different answers, so an answer that is a number belongs to another mechanic.',
  'Spread the batch across the four stages rather than clustering on one rung.',
].join('\n');

/** The Bomb Skill's own bound: a prompt a player reads in one glance. */
export const BOMB_MAX_PROMPT_LENGTH = 70;

/**
 * What a Bomb question asks about the thing in its picture. Named so a batch
 * can be told to spread across them: left alone, a generator settles on "who
 * is this?" and "what is his first name?" and a round of it is a drill.
 */
export const BOMB_ANGLES = [
  'identify',
  'name-part',
  'affiliation',
  'origin',
  'home',
  'known-for',
  'moved',
  'opponent',
  'succession',
] as const;

export type BombAngle = (typeof BOMB_ANGLES)[number];

export const BOMB_CANDIDATE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        // Authoring order: the picture is decided before the wording. A Bomb
        // item whose image was an afterthought is a text question with a
        // decoration, which is the thing the mechanic exists to avoid.
        required: [
          'concept',
          'angle',
          'timeAnchor',
          'imageSubject',
          'imageSubjectAr',
          'imageKind',
          'imageMustNotShow',
          'imageAltText',
          'prompt',
          'acceptedAnswers',
          'factualClaims',
        ],
        properties: {
          concept: {
            type: 'string',
            description:
              'The idea in one line, before any wording exists: what the player recognises or recalls, and why it belongs to this Scope.',
          },
          angle: {
            type: 'string',
            enum: [...BOMB_ANGLES],
            description:
              'What the question asks about the pictured subject. identify: its name. name-part: a part of its name, the rest given in the prompt. affiliation: the team, club, maker, series or organisation it belongs to or is best known for. origin: the country, national team or city it comes from. home: for a place, what is based there or which city holds it. known-for: the title, role, work or event it is famous for. moved: where it came from or went next — a transfer, a move, a previous or following work. opponent: who it faced or beat at a named event. succession: who or what came immediately before or after it in the same role or series.',
          },
          timeAnchor: {
            type: 'string',
            description:
              'The season, year or named event the answer is true for, exactly as it appears in the prompt — "موسم 2015-16", "نهائي 2005". Empty string ONLY when the answer can never change (a name, a birthplace, a nationality, the city a stadium stands in).',
          },
          imageSubject: {
            type: 'string',
            description:
              'The one real thing the picture shows, as the exact name an encyclopedia files it under, in Latin script — "Luka Modrić", "Santiago Bernabéu Stadium", "Toyota Supra (A80)". A name to search for, never a description, a scene, or two subjects. It must be a real, specific, photographed subject: an existing photograph will be found for it, nothing is drawn or generated.',
          },
          imageSubjectAr: {
            type: 'string',
            description: 'The same subject by its common Arabic name.',
          },
          imageKind: {
            type: 'string',
            enum: [...BOMB_IMAGE_KINDS],
            description:
              'What kind of thing the subject is. Use "other" only when none fits.',
          },
          imageMustNotShow: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Anything that would give the answer away if it were readable in the picture: a name printed on a shirt, a caption, a scoreboard, a badge with the club name spelled out. Empty when nothing would.',
          },
          imageAltText: {
            type: 'string',
            description:
              'One short Arabic sentence describing the picture for a player who cannot see it, WITHOUT stating the answer.',
          },
          prompt: {
            type: 'string',
            description: `Arabic question text, under ${BOMB_MAX_PROMPT_LENGTH} characters, read in one glance. It must not contain the answer, any accepted spelling of it, or a word that gives it away.`,
          },
          acceptedAnswers: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: { type: 'string' },
            description:
              'The typed answer, graded by text match. The SHORTEST widely recognised unique name first, then only genuinely DIFFERENT forms a correct player would type: a well-known nickname or short form, the full name beside the common one, a widely used Latin transliteration. Do NOT list spelling variants that differ only in أ/إ/آ, ة/ه, ى/ي, diacritics, punctuation, letter case, or a leading ال — grading already folds those. Never a different entity, a broader category, or a near-miss that should be wrong.',
          },
          factualClaims: {
            type: 'array',
            items: { type: 'string' },
            description:
              'The answer-critical claim(s) that make the accepted answer the correct one for this subject.',
          },
        },
      },
    },
  },
};

export const BOMB_TASK_GUIDANCE = [
  '## BOMB TASK',
  'القنبلة is a recognition race against a running clock. A player glances, knows, types. Anything that needs working out belongs to another mechanic.',
  'EVERY item is about ONE real picture. Decide the picture first, then write the question for it.',
  'The picture always shows the subject; what changes is what you ask about it. Choose the `angle` before the wording. identify — name what the picture shows ("من هذا اللاعب؟", "وش اسم هذا الملعب؟"). name-part — the prompt gives part of the name and asks for the rest ("وش الاسم الأول لمودريتش؟"). affiliation — what it belongs to or is best known for ("وش النادي اللي اشتهر فيه هذا اللاعب؟", "وش الشركة اللي تصنع هذي السيارة؟"). origin — where it is from ("من أي منتخب هذا اللاعب؟", "من أي بلد هذا المدرب؟"). home — for a place, what is based there or where it stands ("وش النادي صاحب هذا الملعب؟", "في أي مدينة هذا الملعب؟"). known-for — the title, award, role or event a person or club is famous for, pinned to when ("وش الجائزة اللي فاز فيها هذا اللاعب سنة 2018؟"). moved — where it came from or went next ("من أي نادي انتقل هذا اللاعب لليفربول؟", "وش النادي اللي راح له بعد أرسنال؟"). opponent — who it faced at a named event ("ضد مين سجل هذا اللاعب في نهائي 2014؟"). succession — who came right before or after it in the same role ("مين المدرب اللي جا بعده في مانشستر يونايتد؟").',
  'moved, opponent and succession ask the player to recall, not just recognise, so they are the slow ones. Use at most ceil(N / 3) of them in a batch of N, and only where the fact is one a follower of this Scope actually remembers: a famous transfer, a final everyone watched, a succession people argued about.',
  'SPREAD THE ANGLES. A batch that asks the same thing five times is a drill, not a game. In a batch of N items use at least min(N, 4) different angles, use no angle more than ceil(N / 3) times, and never give two items the same prompt wording. `name-part` is one angle among nine, not the default: at most one item per batch.',
  'Spread the pictures too: players, managers, stadiums, kits, crests, and whatever else this Scope has that people know on sight. Not five photographs of five players.',
  'NO TROPHY QUIZZES. Never make the picture a trophy, cup, medal, ball or other object and ask which competition or award it stands for. The picture is a person, a club or a place; a competition or an award may be the ANSWER about them, never the thing shown.',
  'ANSWERS THAT CAN CHANGE MUST BE PINNED TO A DATE. Who someone plays for, who manages a club, who is captain, who holds a record — all of these change, and an item that was right when written becomes wrong in play. Either ask for something that cannot change (a name, a nationality, a birthplace, the city a stadium stands in, a finished event) or pin the question to a season, a year or a named event inside the prompt itself: "وش النادي اللي لعب له هذا اللاعب موسم 2015-16؟", "من درّب هذا الفريق في نهائي 2005؟". Put that same anchor in `timeAnchor`. Never write "currently", "now", "this season", "الحين", "حاليًا" or "هذا الموسم": an unpinned changeable answer is not allowed at all.',
  'A pinned question still needs an answer the table can recall. Pin to seasons and events people remember — a title win, a famous final, a long spell at one club — not to an arbitrary year.',
  'The subject must be something a real photograph of already exists: a named person, club, stadium, vehicle, place, object or work. Give its exact encyclopedia name in `imageSubject`. Never describe an illustration to be drawn, never invent a scene, never ask for two subjects in one picture.',
  'The picture must not answer the question in writing. List in `imageMustNotShow` whatever would: for a completion item that is the answer itself appearing as readable text; for a recognition item it is the name on a shirt, a caption, a scoreboard, a spelled-out badge.',
  `The prompt is under ${BOMB_MAX_PROMPT_LENGTH} characters and is one plain spoken question. No scene-setting, no clauses, no "which of the following".`,
  'The answer is typed and graded by text match, so it must be ONE short canonical name — the shortest name people actually use for it. Not a sentence, not a list.',
  'If two correct players would plausibly type genuinely different words, the item has no stable written answer. Replace it.',
  'Grading folds أ/إ/آ, ة/ه, ى/ي, diacritics, punctuation, case and a leading ال, so never spend an accepted answer on those. List only forms that differ as words.',
  'Digits are NOT folded: ٧ and 7 grade as different answers, so an answer that is a number belongs to another mechanic.',
  'DIFFICULTY HAS ONE TARGET: someone who follows this Scope well — not an expert, not a casual — should need two or three seconds of thought and then know it. If that person answers before the picture has finished loading, it is too easy: drop it or change the angle. If they would have to guess, look it up, or be a specialist, it is too hard: drop it. A world-famous face asked "who is this?" is too easy; the same face asked where he moved from is about right. An obscure squad player is too hard from any angle.',
  'Vary the subjects across the batch: do not return several items about the same person, club or place.',
  'An answer is still ONE short name whatever the angle: a club, a country, a city, a person. If the honest answer is a number, a date or a sentence, pick another angle.',
].join('\n');

/** Steps a slider may fall back to, roundest first. */
const CLOSEST_ROUND_STEPS = [
  1000, 500, 250, 200, 100, 50, 25, 20, 10, 5, 2, 1,
] as const;

/**
 * The step a derived مين أقرب answer can actually be reached on.
 *
 * When the answer is computed from the prompt — 22 teams home and away is 462
 * matches — the answer is fixed and only the step is a choice. A model that
 * picks a tidy step of 10 for a range starting at 50 has authored a slider
 * that cannot land on its own answer, and the screen rightly blocks it; the
 * first real عالم الألغاز batch lost four of five candidates that way. The
 * Skill's rule for this case is "change the step, never move an endpoint,
 * never round the answer", and that rule is arithmetic, so it is applied here
 * rather than asked of the model: the roundest step, no coarser than the one
 * stated, that reaches both the answer and the far end of the range.
 *
 * Returns nothing for values that are not whole numbers or a range that is
 * not a range — those are left exactly as stated for the screen to judge.
 */
export function settleClosestGrid(input: {
  min: number;
  max: number;
  step: number;
  correctValue: number;
}): { step: number; stepsFromMin: number } | undefined {
  const { min, max, step, correctValue } = input;
  if (
    ![min, max, correctValue].every(Number.isInteger) ||
    !(step > 0) ||
    max <= min ||
    correctValue < min ||
    correctValue > max
  )
    return undefined;
  const reaches = (candidate: number) =>
    (correctValue - min) % candidate === 0 && (max - min) % candidate === 0;
  const settled =
    Number.isInteger(step) && reaches(step)
      ? step
      : CLOSEST_ROUND_STEPS.find(
          (candidate) => candidate <= step && reaches(candidate),
        );
  // A stated step below 1 (0.5) has no rounder step under it; whole numbers
  // are always reachable in ones.
  const resolved = settled ?? 1;
  return { step: resolved, stepsFromMin: (correctValue - min) / resolved };
}

/**
 * Extends a candidate generation schema with an explicit `slotIndex` property
 * for jobs with pinned creative slots. Preserves strict-mode requirements by
 * marking the property in `required` and keeping `additionalProperties: false`.
 */
export function schemaWithCreativeSlots(
  baseSchema: Record<string, unknown>,
): Record<string, unknown> {
  const candidatesProp = (
    baseSchema.properties as {
      candidates: {
        type: string;
        items: {
          type: string;
          additionalProperties: boolean;
          required: string[];
          properties: Record<string, unknown>;
        };
      };
    }
  ).candidates;

  const baseItems = candidatesProp.items;
  return {
    ...baseSchema,
    properties: {
      ...(baseSchema.properties as Record<string, unknown>),
      candidates: {
        ...candidatesProp,
        items: {
          ...baseItems,
          required: ['slotIndex', ...baseItems.required],
          properties: {
            slotIndex: {
              type: 'integer',
              description:
                '0-based index of the assigned creative slot (from 0 to count-1) matching the slot directive in the prompt.',
            },
            ...baseItems.properties,
          },
        },
      },
    },
  };
}

/**
 * What the Skills cannot say generically, said once for Closest.
 *
 * The Skill text is already in the prompt verbatim; this restates only the two
 * rules a generator most often breaks — author the span before looking at the
 * answer, and make the target reachable on the step grid — plus the Scope's
 * intent, so the batch does not drift into arithmetic drills.
 */
/**
 * Originality, stated last for every mechanic.
 *
 * Position is the point. Closest carried this inside its own task block and so
 * ended on it; the multiple-choice path had no task guidance at all, so an RYO
 * prompt finished on three generic lines and its nearest mention of retired
 * subjects sat thousands of characters earlier, inside a Scope file. The Phase
 * 2m pilot returned three verbatim copies of that Scope's worked examples.
 *
 * One block, appended to every prompt, so neither mechanic depends on where a
 * document happened to say it — and so there is one place to change it.
 */
export const ORIGINALITY_GUIDANCE = [
  'ORIGINALITY — read this before you write anything.',
  '',
  'You have been shown worked examples, in the mechanic profile and in the Scope',
  'exemplars. They are there to teach you which PROPERTIES make an item work:',
  'the shape of a good misconception, what makes a distractor plausible, where',
  'the uncertainty should sit. Study them for that.',
  '',
  'Every example you have been shown is a RETIRED SUBJECT. It has already been',
  'authored and is not available. Specifically:',
  '  - do not copy or paraphrase an example question;',
  '  - do not reuse its subject, its answer target, or its option set;',
  '  - do not reproduce one with a value, a name or a number changed;',
  '  - do not keep its concept and merely reword the prompt. Superficial wording',
  '    changes do not make an item new, and a reviewer reads the concept too.',
  '',
  'Author genuinely new questions inside this same World, Scope and mechanic,',
  'carrying the same properties the examples demonstrate. Everything else still',
  'applies: the answer must be factually defensible, the distractors genuinely',
  'plausible, and the uncertainty real enough that the opposing team has a',
  'decision to make.',
  '',
  'If a concept you are considering is one of the examples, discard it and think',
  'of another. That is the work.',
].join('\n');

/**
 * What the Skills cannot say generically, said once for RYO.
 *
 * The multiple-choice path previously appended nothing, so its prompt ended on
 * generic formatting instructions while Closest ended on mechanic rules.
 */
/**
 * إكس أو المتحرك candidates: the اقرأ خصمك shape without its bet.
 *
 * `estimatedConfidence` is the Steal/Trust hypothesis, and the screen reads it
 * as one. A Moving XO item carries no such bet, so the field is not asked for
 * rather than asked for and ignored.
 */
export const MOVING_XO_CANDIDATE_SCHEMA: Record<string, unknown> = (() => {
  const ryoItem = (
    (RYO_CANDIDATE_SCHEMA.properties as Record<string, unknown>).candidates as {
      items: Record<string, unknown>;
    }
  ).items;
  const { estimatedConfidence: _bet, ...properties } =
    ryoItem.properties as Record<string, unknown>;
  void _bet;
  return {
    ...RYO_CANDIDATE_SCHEMA,
    properties: {
      candidates: {
        type: 'array',
        items: {
          ...ryoItem,
          required: (ryoItem.required as string[]).filter(
            (field) => field !== 'estimatedConfidence',
          ),
          properties: {
            ...properties,
            concept: {
              type: 'string',
              description:
                'The puzzle in one line, before any wording exists: what the team works out, and the natural mistake a rushed team makes.',
            },
            options: {
              type: 'array',
              minItems: 3,
              maxItems: 3,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'label'],
                properties: {
                  id: { type: 'string' },
                  label: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  };
})();

export const MOVING_XO_TASK_GUIDANCE = [
  'GAMEPLAY-FIRST INTENT. This is a turn of X-O. One team is on turn, sees the',
  'puzzle on the shared screen and taps one of three text buttons on a phone.',
  'Right: they play a move on the board. Wrong: the turn passes and they play',
  'nothing. There is no bet and no opponent prediction — only: can this team',
  'work it out, together, before the clock runs out?',
  '',
  'THE CLOCK. A team has about fifteen seconds. Everything is read aloud once',
  'and solved in the head:',
  '  - the prompt is at most two short sentences, in plain Arabic;',
  '  - at most three numbers or three named things to hold in mind;',
  '  - one step of insight, or two short steps — never a chain;',
  '  - each option is a few words at most, readable at a glance on a phone.',
  'If the fair way to solve it needs a pen, it is the wrong puzzle for this mechanic.',
  '',
  'Author each item in this order, and fill the schema fields in this order:',
  '  1. concept — the puzzle and the natural mistake, before any wording exists.',
  '  2. prompt, then exactly three options and correctOptionId.',
  '  3. distractorRationale — one entry per INCORRECT option: the specific mistake that produces it.',
  '  4. factualClaims — the derivation that proves the correct option, step by step, and why each other option fails.',
  '',
  'SOLVED, NOT RECALLED. Everything needed is in the prompt or is something',
  'every player knows. A team that has never heard of the subject must still be',
  'able to answer. No trivia, no dates, no records.',
  '',
  'EXACTLY ONE OPTION IS RIGHT. Solve the puzzle yourself from the prompt alone',
  'and check all three options against it. If a second option can be defended',
  'by any reasonable reading, rewrite the prompt until it cannot.',
  '',
  'EACH WRONG OPTION IS A REAL MISTAKE. It is the answer a specific, natural',
  'slip produces — the rushed reading, the off-by-one, the trap the puzzle',
  'sets. An option nobody would pick turns three choices into two.',
  '',
  'FAIR TO GUESS, WORTH SOLVING. One in three is luck; the puzzle must reward',
  'the team that thinks. Never make the correct option stand out by length,',
  'by being the middle value, or by being the only "careful" wording, and vary',
  'which position holds it across the batch.',
  '',
  'Text only. The prompt must not refer to a picture, a shape or a diagram:',
  'nothing is drawn yet. A pattern is written with words or emoji in the prompt itself.',
].join('\n');

export const RYO_TASK_GUIDANCE = [
  'GAMEPLAY-FIRST INTENT. Design the Steal/Trust decision before choosing the',
  'question. The subject must come from the resolved World and Scope, but the',
  'reason this item exists is that an opposing team must predict whether the',
  'answering team will get it right.',
  '',
  'This mechanic is a bet, not a quiz. The opposing team does not answer — they',
  'choose Steal or Trust, blind, betting on whether the answering team gets it',
  'right. A failed steal costs them a point, so the bet has to be hard to call.',
  '',
  'Author each item in this order, and fill the schema fields in this order:',
  '  1. concept — the knowledge or misconception the item turns on, before any wording exists.',
  '  2. prompt, then options (2-4) and correctOptionId.',
  '  3. distractorRationale — one entry per INCORRECT option, keyed by its id, saying why a real player might pick it.',
  '  4. estimatedConfidence — one of near-certain / likely / even / unlikely / near-impossible, with a line of reasoning.',
  '  5. factualClaims — one or more concise statements asserting the answer-critical fact or logical derivation that proves the correct option. For knowledge questions, state the verifiable real-world fact. For self-contained puzzles or wordplay, state the definitive rule, mathematical calculation, or lexical derivation.',
  '',
  'THE CERTAINTY TEST. Would a reasonable opposing team have to think about Steal',
  'or Trust? If almost everyone knows the answer they always steal; if almost',
  'nobody does they always trust. Either way the decision answers itself and the',
  'item is wasted. Aim for "likely" or "even".',
  '',
  'Difficulty changes the knowledge demand and how plausible the alternatives',
  'feel. It must never come from ambiguity, trick wording, an unstated criterion',
  'or a disputable answer. Easy, medium and relatively difficult items all have',
  'to be clear, fair and factually defensible. Difficulty is not proof that the',
  'opponent-prediction decision will work; apply the certainty test separately.',
  '',
  'Every option must be defensible. If you cannot say in one sentence why a real',
  'player might choose an incorrect option, that option is filler — replace it',
  'rather than writing a better sentence for it. Three obviously-wrong options',
  'turn a hard question into an easy one.',
  '',
  'THE 40-80% CONFIDENCE SWEET SPOT (BLUFF TENSION).',
  'The core mechanic of Read-Your-Opponent is opponent prediction, not trivia recall.',
  'If answering team certainty is near 100% (e.g. elementary plurals like "كتاب -> كتب" or',
  '"طفل -> أطفال", universally known facts, or obvious common sense), the opponent always',
  'steals with zero hesitation. The game collapses.',
  'If answering team certainty is near 0% (obscure facts no human knows), the opponent',
  'always trusts. The game collapses.',
  'Every valid item MUST land in the contested 40-80% confidence sweet spot ("likely" or "even"),',
  'where the answering team might know it or might fall for a plausible misconception.',
  '',
  'NEGATIVE ANTI-PATTERNS (THESE ARE REJECTED AUTOMATICALLY):',
  '  - NEVER write elementary school grammar or common vocabulary (FAIL: "جمع كتاب؟ كتب").',
  '  - NEVER write unsolvable anagrams (FAIL: Clue letters "ن م ب ج" but answer is "منجا" — missing "ا" and dropping "ب"). Clue letters must match answer letters with 100% multiset precision.',
  '  - NEVER leak the answer in the prompt text (FAIL: Clue asks "ما الحيوان في جملة طائر العصفور يغرد؟" with answer "العصفور"). The answer must never appear in the prompt.',
].join('\n');

export const CLOSEST_TASK_GUIDANCE = [
  'GAMEPLAY-FIRST INTENT. Design the estimation conversation before choosing the',
  'fact or writing the prompt. The item should give ordinary players plausible',
  'competing guesses, something to discuss, and a meaningful slider decision.',
  '',
  'Author each item in this order, and fill the schema fields in this order:',
  '  1. concept — the idea, before any wording or number. Then apply the anchor test below.',
  '  2. answerBasis — "reasoning" or "knowledge-anchored" (see 3 below).',
  '  3. playerReasoningStrategy — how a player WITHOUT the exact answer still gets close.',
  '  4. prompt — the Arabic question. For "reasoning" it must carry every number the strategy needs.',
  '  5. domainDescription, min, max, step — the natural span for this KIND of quantity, decided WITHOUT looking at the answer.',
  '  6. correctValue, then stepsFromMin — compute correctValue = min + stepsFromMin * step and check it holds exactly.',
  '  7. factualClaims — one or more concise statements asserting the exact quantity, record, or derivation proving the correct value. For knowledge questions, state the verifiable real-world fact. For reasoning problems, state the derivation.',
  '',
  'TWO VALID DIRECTIONS. Closest takes both, and neither is lesser:',
  '  - knowledge-anchored — the answer is a real quantity. A team that knows it wins; a team',
  '    that reasons from ordinary familiarity lands close. A factual answer is NOT a defect.',
  '  - reasoning — the prompt supplies what is needed and the answer is derived from it.',
  'Check the World and Scope sections: most Worlds permit both, some permit only one.',
  'If a Scope restricts you to reasoning, a knowledge question is good work in the wrong place.',
  '',
  'Do not author a worksheet problem that supplies every number and the exact',
  'operation, leaving only straightforward arithmetic. A reasoning prompt may',
  'supply necessary information, but the play must still be estimation,',
  'visualisation, comparison or approximation with room for competing guesses.',
  '',
  'THE ANCHOR TEST. Before writing anything else, answer: does a team that does NOT',
  'know the exact answer still have somewhere to stand — familiarity with the subject,',
  'or information you supplied? If neither, the question is a lottery. Discard it.',
  'The test is not "is the answer a fact". It is "is there a way in".',
  '',
  'Three concepts that are always rejected, whatever the subject:',
  '  - an answer that MOVES (a career total, a current record, a count that grows with new discoveries) — it cannot be graded once it drifts. Pin it to a stated date or choose another quantity;',
  '  - an undefined comparison set ("the average of major cities") — if the set is not stated, the question has no answer;',
  '  - a subject so specialist that only an enthusiast could place it at all.',
  '',
  'Never centre the range on the answer, never stretch an endpoint to admit it, and never derive bounds from a tolerance.',
  'If the answer does not land on the grid, change the STEP to another the domain justifies — never move an endpoint, never round the answer.',
  'Prefer one shared span across comparable questions over a bespoke range per item.',
  'Numbers should be reasonable to reach on a phone slider: aim for a span the step divides into at least a few dozen positions, not three or four.',
  '',
  'TWO SLIDERS. Set sliderMode for every item:',
  '  - numeric-range — the default. leftAnchor and rightAnchor are empty strings.',
  '  - between-anchors — ONLY for a slot whose Task says position-estimation. Use numeric-range for every other slot.',
  'A between-anchors item is a POSITION question. The player sees a bare line with a label at each end and NO numbers, and places a mark where the thing falls:',
  '  - the line is a complete order everybody knows (the days of the year, the letters of the alphabet), and min..max counts its positions in order (1..365, 1..28);',
  '  - leftAnchor is the thing at min and rightAnchor the thing at max, each a short Arabic label («1 يناير», «31 ديسمبر»). The prompt names both ends in the same words;',
  '  - correctValue is the position of the asked thing in that order, step is 1, unit is empty;',
  '  - the prompt never states a position, a count or a fraction — the player has no number to read, so a number in the prompt is either the answer or noise;',
  '  - NEVER pick a thing that falls in the middle fifth of the line, and avoid the two ends: a mark left in the centre must not win. Good targets sit clearly off-centre and still take thought to place;',
  '  - the asked thing must have ONE fixed position everyone would accept (a date that does not move from year to year, a letter in the standard order). A lunar-calendar date moves — never use one.',
].join('\n');

import {
  GenerationPlannerService,
  GenerationPlan,
} from './generation-planner.service';

export interface GenerateInput {
  jobId: string;
  leaseEpoch: number;
  attempt: number;
  context: ResolvedAuthoringContext;
  count: number;
  generationSpec?: GenerationSpecification;
  difficulty?: RyoRequestedDifficulty | string | null;
  batchGuidance?: string | null;
  generationPlan?: GenerationPlan | null;
}

export interface BuildPromptOptions {
  difficulty?: RyoRequestedDifficulty | string | null;
  ryoDifficultyTargets?: Readonly<RyoDifficultyTargets> | null;
  batchGuidance?: string | null;
  generationPlan?: GenerationPlan | null;
}

export function buildRyoDifficultyGuidance(
  difficulty: RyoRequestedDifficulty = 'mixed',
  targetsOverride?: Readonly<RyoDifficultyTargets> | null,
  fallbackResolver?: () => RyoDifficultyTargets,
): string {
  const targets =
    targetsOverride ??
    (difficulty === 'mixed'
      ? (fallbackResolver?.() ?? DEFAULT_RYO_DIFFICULTY_TARGETS)
      : resolveEffectiveRyoDifficultyTargets(difficulty)!);
  return [
    'EXPERIMENTAL DIFFICULTY MIX — batch guidance, not a quality score:',
    ...(difficulty !== 'mixed'
      ? [`  - requested difficulty mode: ${difficulty}`]
      : []),
    `  - easy: ${targets.easy}%`,
    `  - medium: ${targets.medium}%`,
    `  - relatively difficult: ${targets.relativelyDifficult}%`,
    'Aim for this mix across batches; do not force exact quotas in a small batch.',
    'These targets are configurable and unvalidated. They do not measure player',
    'performance and do not override the certainty, clarity or fairness rules.',
  ].join('\n');
}

/**
 * Shared canonical prompt composer used by both `CandidateGeneratorService`
 * and `EngineJobAdminService` preflight/submit cost estimation so token
 * estimates and actual execution reservations derive from the exact same text.
 */
export function composeGenerationPrompt(
  context: Pick<
    ResolvedAuthoringContext,
    'mechanicKey' | 'worldKey' | 'scopeKey'
  > &
    Partial<
      Pick<
        ResolvedAuthoringContext,
        'global' | 'mechanic' | 'world' | 'scope' | 'knowledge' | 'exemplars'
      >
    >,
  count: number,
  answerMode: 'multiple_choice' | 'closest' | 'match' = 'multiple_choice',
  options?: BuildPromptOptions,
  fallbackTargetsResolver?: () => RyoDifficultyTargets,
): string {
  const resolvedDifficulty =
    answerMode === 'closest'
      ? resolveRequestedDifficulty('closest', options?.difficulty)
      : answerMode === 'match'
        ? // Neither match mechanic takes a difficulty selection: الكومبو
          // carries its difficulty in the stage ladder, and القنبلة is a
          // recognition race with no difficulty axis at all.
          resolveRequestedDifficulty(
            context.mechanicKey === BOMB_SLUG ? BOMB_SLUG : 'combo',
            options?.difficulty,
          )
        : // Two mechanics author in options. Only اقرأ خصمك takes a
          // difficulty mix; إكس أو المتحرك has one level.
          resolveRequestedDifficulty(
            context.mechanicKey === MOVING_XO_SLUG
              ? MOVING_XO_SLUG
              : 'read-your-opponent',
            options?.difficulty,
          );
  const normalizedGuidance = normalizeBatchGuidance(options?.batchGuidance);

  const planner = new GenerationPlannerService();
  const generationPlan =
    options?.generationPlan ??
    planner.plan({
      worldKey: context.worldKey ?? '',
      scopeKey: context.scopeKey ?? '',
      mechanicKey: context.mechanicKey ?? '',
      count,
      difficulty: resolvedDifficulty,
      batchGuidance: normalizedGuidance,
    });
  const formattedPlan = planner.formatPlanForPrompt(generationPlan);

  return [
    '# AKWAAN AUTHORING CONTEXT',
    '## 1. GLOBAL GOVERNANCE',
    context.global ?? '',
    `## 2. MECHANIC PROFILE (${context.mechanicKey})`,
    context.mechanic ?? '',
    `## 3. WORLD (${context.worldKey})`,
    context.world ?? '',
    `## 4. SCOPE (${context.scopeKey})`,
    context.scope ?? '',
    '## 5. SCOPE KNOWLEDGE',
    context.knowledge ?? '',
    ...(context.exemplars ? ['## 6. EXEMPLARS', context.exemplars] : []),
    '## TASK',
    `Author exactly ${count} candidate items for the mechanic above, inside this Scope.`,
    'Return JSON matching the provided schema. Arabic prompt text. No commentary.',
    'The correct answer must never appear in the prompt text.',
    formattedPlan,
    answerMode === 'closest'
      ? CLOSEST_TASK_GUIDANCE
      : answerMode === 'match'
        ? context.mechanicKey === BOMB_SLUG
          ? BOMB_TASK_GUIDANCE
          : COMBO_TASK_GUIDANCE
        : context.mechanicKey === MOVING_XO_SLUG
          ? MOVING_XO_TASK_GUIDANCE
          : [
              RYO_TASK_GUIDANCE,
              buildRyoDifficultyGuidance(
                resolvedDifficulty ?? 'mixed',
                options?.ryoDifficultyTargets,
                fallbackTargetsResolver,
              ),
            ].join('\n\n'),
    ...(normalizedGuidance
      ? [
          [
            '## OPERATOR BATCH GUIDANCE (SUBORDINATE TO CANONICAL RULES)',
            'The following operator batch guidance narrows topic emphasis or framing within the resolved World and Scope only.',
            'It is strictly subordinate to the Global Governance, Mechanic Profile, World Profile, Scope Profile, Scope Knowledge, and Effective Rules above.',
            'If any instruction in this batch guidance conflicts with canonical mechanic, World, Scope, or schema rules, obey the canonical rules and ignore the conflicting instruction.',
            `<batch_guidance>\n${normalizedGuidance}\n</batch_guidance>`,
          ].join('\n'),
        ]
      : []),
    // Last, deliberately: the instruction a generator is most likely to act
    // on is the one it read most recently.
    ORIGINALITY_GUIDANCE,
  ].join('\n\n');
}

/**
 * Estimates generation prompt tokens from prompt character length for preflight reservations.
 *
 * Calibrated against real pilot usage data (where 90,519 characters produced 42,064
 * prompt tokens, reflecting ~2.15 chars/token for Arabic text, system guidelines, and JSON schemas).
 * Uses a conservative 2.0 characters per token to ensure preflight budget reservations safely
 * account for byte-pair tokenization overhead.
 *
 * Note: A character-based estimate is a preflight reservation guideline, not a guaranteed provider
 * billing ceiling. Providers bill on their own tokenizer metrics returned in completion usage.
 */
export function estimateGenerationPromptTokens(prompt: string): number {
  const trimmed = prompt?.trim() ?? '';
  if (!trimmed) return 0;
  return Math.ceil(trimmed.length / 2.0);
}

export {
  MAX_BATCH_GUIDANCE_LENGTH,
  RYO_REQUESTED_DIFFICULTIES,
  type RyoRequestedDifficulty,
};

export interface GeneratedCandidate {
  candidateId: string;
  ordinal: number;
  draft: Record<string, unknown>;
  factualClaims: string[];
}

/** Authoring rationale. Not a ContentItem field and never published. */
export interface CandidateAuthoring {
  concept?: string;
  /** RYO: why each *incorrect* option is plausible, keyed by option id. */
  distractorRationale?: { optionId: string; why: string }[];
  /** RYO: an authoring hypothesis about table difficulty, never a measurement. */
  estimatedConfidence?: { band: string; why: string };
  /** الكومبو: why the item sits on the stage it claims. */
  stageJustification?: string;
  /** القنبلة: the real picture this item needs, for discovery and review. */
  mediaIntent?: CandidateMediaIntent;
  /** Which Closest direction this item takes. Absent on pre-2g candidates. */
  answerBasis?: 'reasoning' | 'knowledge-anchored';
  playerReasoningStrategy?: string;
  domainDescription?: string;
  /** The model's own claim that correctValue = min + stepsFromMin * step. */
  stepsFromMin?: number;
  assignedSlot?: {
    slotIndex: number;
    familyKey: string;
    familyNameAr?: string;
    mode?: string;
    difficulty?: string;
    cognitiveTask?: string;
  };
}

/** Trimmed string, or undefined for anything empty or non-string. */
const text = (raw: unknown): string | undefined =>
  typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;

interface ParsedCandidate {
  draft: Record<string, unknown>;
  factualClaims: string[];
  authoring?: CandidateAuthoring;
}

/**
 * Turns an authoring context into structured candidates.
 *
 * Three things it deliberately does not do: call a live provider (Phase 1b runs
 * on `FakeAiProvider`), write a ContentItem, or spend without a reservation.
 * The budget call is not a formality — wiring it now is what stops a later
 * "just for testing" live call from bypassing the cap, because there is no code
 * path that reaches a provider without one.
 */
@Injectable()
export class CandidateGeneratorService {
  private readonly logger = new Logger(CandidateGeneratorService.name);

  constructor(
    @InjectModel(EngineCandidateDocument.name)
    private readonly candidates: Model<EngineCandidateDocument>,
    private readonly jobs: GenerationJobService,
    private readonly budget: EngineBudgetService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(ENGINE_AI_PROVIDER)
    private readonly provider?: AiProvider,
  ) {}

  maxBatchSize(): number {
    return resolveMaxBatchSize(this.config);
  }

  private batchSize(requested: number): number {
    return validateTargetCount(requested, this.maxBatchSize());
  }

  resolveSpecification(input: {
    context: ResolvedAuthoringContext;
    targetCount: number;
    difficulty?: unknown;
    batchGuidance?: unknown;
  }): GenerationSpecification {
    return buildGenerationSpecification({
      config: this.config,
      context: input.context,
      targetCount: input.targetCount,
      difficulty: input.difficulty,
      batchGuidance: input.batchGuidance,
    });
  }

  /** Stable across regeneration: same job, same slot, same context → same id. */
  private candidateId(
    jobId: string,
    ordinal: number,
    contextHash: string,
  ): string {
    return createHash('sha256')
      .update(`${jobId}:${ordinal}:${contextHash}`)
      .digest('hex')
      .slice(0, 32);
  }

  /**
   * Output tokens allowed per candidate, overridable per deployment.
   *
   * The default suits a non-reasoning model, where the whole allowance becomes
   * visible content. A reasoning model spends part of it thinking — the same
   * `max_tokens` bounds both — so it needs a larger figure to return three
   * complete candidates. The number still feeds the reservation and the
   * request from one place, so raising it raises the money reserved and the
   * ceiling sent together, and the cap stays a real cap.
   */
  private outputTokensPerCandidate(): number {
    return resolveOutputTokensPerCandidate(this.config);
  }

  private ryoDifficultyTargets(): RyoDifficultyTargets {
    try {
      return resolveRyoMixedDifficultyTargets(this.config);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        (error as { code?: string }).code === 'RYO_DIFFICULTY_TARGETS_INVALID'
      ) {
        throw new CandidateParseError(
          'RYO_DIFFICULTY_TARGETS_INVALID',
          `${RYO_DIFFICULTY_CONFIG_KEYS.easy}, ${RYO_DIFFICULTY_CONFIG_KEYS.medium} and ${RYO_DIFFICULTY_CONFIG_KEYS.relativelyDifficult} must be non-negative numbers totalling 100`,
        );
      }
      throw error;
    }
  }

  buildPrompt(
    context: ResolvedAuthoringContext,
    count: number,
    answerMode: 'multiple_choice' | 'closest' | 'match' = 'multiple_choice',
    options?: BuildPromptOptions,
  ): string {
    return composeGenerationPrompt(context, count, answerMode, options, () =>
      this.ryoDifficultyTargets(),
    );
  }

  /**
   * Generate and persist a batch.
   *
   * Every provider call is fenced by the job lease and preceded by a budget
   * reservation whose id encodes the attempt — so a retry is charged, and a
   * worker that lost its lease is refused before it can spend.
   */
  async generate(input: GenerateInput): Promise<GeneratedCandidate[]> {
    if (!(await this.jobs.holdsLease(input.jobId, input.leaseEpoch))) {
      throw new LeaseLostError(input.jobId, input.leaseEpoch);
    }

    const spec = input.generationSpec;
    const count = spec
      ? validateTargetCount(
          spec.targetCount,
          Math.max(this.maxBatchSize(), spec.targetCount),
        )
      : this.batchSize(input.count);
    const answerMode = generatorAnswerModeFor(input.context.mechanicKey);
    if (!answerMode) {
      // Refuse rather than emit a shape the compatibility policy would reject
      // after the call has already been paid for.
      throw new CandidateParseError(
        'MECHANIC_NOT_GENERATABLE',
        `no authored answer mode for mechanic "${input.context.mechanicKey}"`,
      );
    }
    if (spec && spec.answerMode !== answerMode) {
      throw new CandidateParseError(
        'ANSWER_MODE_DRIFT',
        `generationSpec answerMode "${spec.answerMode}" does not match canonical answerMode "${answerMode}" for mechanic "${input.context.mechanicKey}"`,
      );
    }
    const activePromptVersion = promptVersionFor(
      input.context.mechanicKey,
    ) as string;
    if (spec && spec.promptVersion !== activePromptVersion) {
      throw new CandidateParseError(
        'PROMPT_VERSION_DRIFT',
        `generationSpec promptVersion "${spec.promptVersion}" does not match active generator promptVersion "${activePromptVersion}"`,
      );
    }
    const resolvedDifficulty = resolveRequestedDifficulty(
      input.context.mechanicKey,
      spec !== undefined ? spec.difficulty : input.difficulty,
    );
    const normalizedGuidance = normalizeBatchGuidance(
      spec !== undefined ? spec.batchGuidance : input.batchGuidance,
    );
    const provider = this.provider;
    if (!provider) {
      throw new Error('No AiProvider is bound; refusing to generate');
    }
    if (
      input.generationPlan?.slots &&
      input.generationPlan.slots.length < count
    ) {
      throw new CandidateParseError(
        'PLAN_SLOT_COUNT_MISMATCH',
        `pinned generation plan declares ${input.generationPlan.slots.length} slots but requested count is ${count}`,
      );
    }
    const prompt = this.buildPrompt(input.context, count, answerMode, {
      difficulty: resolvedDifficulty,
      ryoDifficultyTargets: spec?.ryoDifficultyTargets,
      batchGuidance: normalizedGuidance,
      generationPlan: input.generationPlan,
    });
    // Reserved *and* sent, so actual output cost cannot exceed what the cap
    // approved. Sized with headroom: a bound tight enough to truncate the JSON
    // mid-batch would waste the whole paid call, which is the more expensive
    // failure of the two.
    const perCandidateTokens =
      spec?.outputTokensPerCandidate ?? this.outputTokensPerCandidate();
    const outputTokenBudget =
      spec?.maxOutputTokens ?? count * perCandidateTokens;
    const reservationId = `${input.jobId}:generation:${input.attempt}`;
    const providerName =
      spec?.provider ??
      this.config.get<string>('ENGINE_PROVIDER_NAME') ??
      'fake';
    const model =
      spec?.generationModel ??
      this.config.get<string>('ENGINE_GENERATION_MODEL') ??
      'fake-model';
    const promptVersion = spec?.promptVersion ?? activePromptVersion;
    const omitTemperature =
      spec?.omitTemperature ?? resolveOmitTemperature(this.config);
    const temperature = omitTemperature
      ? undefined
      : (spec?.temperature ??
        resolveGenerationTemperature(this.config) ??
        DEFAULT_GENERATION_TEMPERATURE);
    const reasoningEffort =
      spec !== undefined
        ? spec.reasoningEffort
        : resolveReasoningEffort(this.config);

    await this.budget.reserve({
      reservationId,
      jobId: input.jobId,
      stage: 'generation',
      provider: providerName,
      model,
      // A token estimate from characters. Crude, and deliberately generous:
      // under-reserving is what lets a bill land above the cap.
      expected: {
        promptTokens: estimateGenerationPromptTokens(prompt),
        maxOutputTokens: outputTokenBudget,
      },
    });

    const hasCreativeSlots = Boolean(input.generationPlan?.slots?.length);
    const baseSchema =
      answerMode === 'closest'
        ? CLOSEST_CANDIDATE_SCHEMA
        : answerMode === 'match'
          ? input.context.mechanicKey === BOMB_SLUG
            ? BOMB_CANDIDATE_SCHEMA
            : COMBO_CANDIDATE_SCHEMA
          : input.context.mechanicKey === MOVING_XO_SLUG
            ? MOVING_XO_CANDIDATE_SCHEMA
            : RYO_CANDIDATE_SCHEMA;
    const responseSchema = hasCreativeSlots
      ? schemaWithCreativeSlots(baseSchema)
      : baseSchema;

    let raw: string;
    try {
      const result = await provider.generateText({
        model,
        promptVersion,
        prompt,
        responseSchema,
        omitTemperature,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        // The same number that was reserved. Sending it makes the reservation
        // an actual ceiling rather than a guess: without `max_tokens` the
        // provider may bill for more output than the budget committed, and the
        // cap is checked when money is reserved, not when it is settled.
        maxOutputTokens: outputTokenBudget,
      });
      raw = result.text;
      await this.budget.settle({
        reservationId,
        usage: result.usage,
        // Measured, not inferred: reasoning-token splits and the provider's
        // own cost figure. Recorded beside the settlement so a reasoning
        // model's spend is auditable without re-deriving it from totals.
        ...((result as { diagnostics?: Record<string, unknown> }).diagnostics
          ? {
              diagnostics: (result as { diagnostics: Record<string, unknown> })
                .diagnostics,
            }
          : {}),
      });
    } catch (error) {
      // An ambiguous failure is charged, not retried blindly: the provider may
      // have billed us. The job's bounded attempts decide whether anything is
      // tried again, and that retry carries a different reservation id.
      //
      // The exception is a provider that answered and declined — an HTTP error
      // carrying an error body. No inference ran, so nothing was billed, and
      // charging the reservation would overstate spend by its full amount.
      // The flag is set by the adapter and read structurally rather than by
      // matching on error types, so no infrastructure class leaks in here; an
      // unexplained failure has no flag and stays billable.
      //
      // A completed request that ran out of output tokens before producing any
      // visible content is neither: the provider reported the finish and the
      // usage, so the cost is a fact. It settles at that usage and fails
      // deterministically — the identical call would exhaust the identical
      // ceiling, so retrying could only spend the same money again.
      const exhausted = outputTokensExhaustion(error);
      if (exhausted) {
        await this.budget.settle({
          reservationId,
          usage: exhausted.usage,
          diagnostics: { ...exhausted.evidence },
        });
        throw new ProviderOutputTokensExhaustedError(
          'generation',
          exhausted.evidence,
        );
      }
      const providerRejected =
        (error as { definitelyNotBilled?: unknown })?.definitelyNotBilled ===
        true;
      const evidence = providerEvidenceOf(error);
      await this.budget.settle({
        reservationId,
        ...(providerRejected ? { providerRejected: true } : { timedOut: true }),
        // Recorded beside the conservative settlement; never changes the charge.
        ...(evidence ? { diagnostics: { ...evidence } } : {}),
      });
      throw new AmbiguousProviderOutcomeError(
        'generation',
        error instanceof Error ? error.message : String(error),
      );
    }

    // Re-check the lease *after* the call: a slow call may have outlived it,
    // and persisting candidates under a lost lease is how two workers write
    // conflicting batches for one job.
    if (!(await this.jobs.holdsLease(input.jobId, input.leaseEpoch))) {
      throw new LeaseLostError(input.jobId, input.leaseEpoch);
    }

    const parsed = this.parse(raw, count, answerMode, {
      requireSlotIdentity: hasCreativeSlots,
      mechanicKey: input.context.mechanicKey,
    });
    const saved: GeneratedCandidate[] = [];
    const effectiveContextHash = spec?.contextHash ?? input.context.contextHash;

    for (let ordinal = 0; ordinal < parsed.length; ordinal += 1) {
      const { draft, factualClaims, authoring } = parsed[ordinal];
      const candidateId = this.candidateId(
        input.jobId,
        ordinal,
        effectiveContextHash,
      );
      const assignedSlot = input.generationPlan?.slots?.[ordinal];
      const mergedAuthoring = {
        ...(authoring ?? {}),
        ...(assignedSlot
          ? {
              assignedSlot: {
                slotIndex: assignedSlot.slotIndex,
                familyKey: assignedSlot.familyKey,
                familyNameAr: assignedSlot.familyNameAr,
                mode: assignedSlot.mode,
                difficulty: assignedSlot.difficulty,
                cognitiveTask: assignedSlot.cognitiveTask,
              },
            }
          : {}),
      };
      const candidateAuthoring =
        Object.keys(mergedAuthoring).length > 0 ? mergedAuthoring : null;

      // Upsert on (jobId, ordinal): a recovered job refills the same slots
      // instead of growing a second batch.
      await this.candidates
        .updateOne(
          { jobId: input.jobId, ordinal },
          {
            $set: {
              candidateId,
              status: 'generated',
              draft,
              findings: [],
              contextHash: effectiveContextHash,
              promptVersion,
              provider: providerName,
              model,
              attempt: input.attempt,
              failureReason: null,
              factualClaims,
              authoring: candidateAuthoring,
              factVerification: null,
              qualityEvaluation: null,
              compatibilityEvaluation: null,
              reviewRevision: 0,
              reviewStatus: 'pending',
              humanAssessment: null,
              reviewDecision: null,
              reviewEvents: [],
              publishedContentItemId: null,
              writeEpoch: input.leaseEpoch,
            },
          },
          { upsert: true },
        )
        .exec();
      saved.push({ candidateId, ordinal, draft, factualClaims });
    }
    return saved;
  }

  /**
   * Parse the structured response, strictly.
   *
   * A model that returns prose, truncated JSON or the wrong shape is a failed
   * generation, not something to repair by guessing. Phase 1c owns repair.
   */
  /**
   * One Closest candidate, parsed strictly.
   *
   * Shape only — range/step/target coherence is the deterministic screen's job
   * and the compatibility policy's after that. Parsing refuses non-finite
   * numbers here because a NaN would otherwise travel all the way to a Mongo
   * document before anything noticed.
   */
  /**
   * الكومبو: a staged, text-matched answer.
   *
   * The stage and the accepted answers are both refused rather than repaired.
   * A stage outside 1-4 cannot be guessed back into range, and an empty or
   * over-long answer list is a broken grading contract, not a formatting slip:
   * either one would reach a player's phone as a question that can never be
   * answered correctly.
   */
  private parseCombo(item: unknown): ParsedCandidate {
    const value = item as {
      concept?: unknown;
      comboStage?: unknown;
      stageJustification?: unknown;
      prompt?: unknown;
      acceptedAnswers?: unknown;
      factualClaims?: unknown;
    };

    const factualClaims = Array.isArray(value.factualClaims)
      ? value.factualClaims.filter(
          (claim): claim is string =>
            typeof claim === 'string' && Boolean(claim.trim()),
        )
      : [];
    if (!factualClaims.length) {
      throw new CandidateParseError(
        'CANDIDATE_FACTUAL_CLAIMS_REQUIRED',
        'every candidate must state its answer-critical claim',
      );
    }

    const stage = value.comboStage;
    if (
      typeof stage !== 'number' ||
      !Number.isInteger(stage) ||
      stage < 1 ||
      stage > 4
    ) {
      throw new CandidateParseError(
        'COMBO_STAGE_INVALID',
        'comboStage must be an integer from 1 to 4',
      );
    }

    // Case and surrounding space are not a different answer; the duplicate
    // check uses a folded key but the authored spelling is what is kept.
    const seen = new Set<string>();
    const acceptedAnswers: string[] = [];
    for (const raw of Array.isArray(value.acceptedAnswers)
      ? value.acceptedAnswers
      : []) {
      const answer = text(raw);
      if (!answer) continue;
      const key = answer.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      acceptedAnswers.push(answer);
    }
    if (
      !acceptedAnswers.length ||
      acceptedAnswers.length > COMBO_MAX_ACCEPTED_ANSWERS
    ) {
      throw new CandidateParseError(
        'COMBO_ACCEPTED_ANSWERS_INVALID',
        `acceptedAnswers must hold 1 to ${COMBO_MAX_ACCEPTED_ANSWERS} distinct non-empty answers`,
      );
    }

    return {
      factualClaims,
      draft: {
        prompt: { ar: typeof value.prompt === 'string' ? value.prompt : '' },
        answerPayload: { mode: 'match', acceptedAnswers },
        mechanicPayload: { comboStage: stage },
      },
      authoring: {
        ...(text(value.concept) ? { concept: text(value.concept) } : {}),
        ...(text(value.stageJustification)
          ? { stageJustification: text(value.stageJustification) }
          : {}),
      },
    };
  }

  /**
   * One القنبلة candidate, parsed strictly.
   *
   * The picture is part of the item, so a candidate that does not say what its
   * picture shows is refused like one with no answer: there would be nothing to
   * search for, and the item could only ever be finished by hand.
   *
   * The draft carries no `media` yet. The image is found, reviewed and written
   * into the draft by the media stage; until then the canonical media contract
   * holds the candidate back, which is the point.
   */
  private parseBomb(item: unknown): ParsedCandidate {
    const value = item as {
      concept?: unknown;
      imageSubject?: unknown;
      imageSubjectAr?: unknown;
      imageKind?: unknown;
      imageMustNotShow?: unknown;
      imageAltText?: unknown;
      prompt?: unknown;
      acceptedAnswers?: unknown;
      factualClaims?: unknown;
      angle?: unknown;
      timeAnchor?: unknown;
    };

    const factualClaims = Array.isArray(value.factualClaims)
      ? value.factualClaims.filter(
          (claim): claim is string =>
            typeof claim === 'string' && Boolean(claim.trim()),
        )
      : [];
    if (!factualClaims.length) {
      throw new CandidateParseError(
        'CANDIDATE_FACTUAL_CLAIMS_REQUIRED',
        'every candidate must state its answer-critical claim',
      );
    }

    const subject = text(value.imageSubject);
    if (!subject) {
      throw new CandidateParseError(
        'BOMB_IMAGE_SUBJECT_REQUIRED',
        'every Bomb candidate must name the real subject its picture shows',
      );
    }

    const seen = new Set<string>();
    const acceptedAnswers: string[] = [];
    for (const raw of Array.isArray(value.acceptedAnswers)
      ? value.acceptedAnswers
      : []) {
      const answer = text(raw);
      if (!answer) continue;
      const key = answer.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      acceptedAnswers.push(answer);
    }
    if (
      !acceptedAnswers.length ||
      acceptedAnswers.length > COMBO_MAX_ACCEPTED_ANSWERS
    ) {
      throw new CandidateParseError(
        'BOMB_ACCEPTED_ANSWERS_INVALID',
        `acceptedAnswers must hold 1 to ${COMBO_MAX_ACCEPTED_ANSWERS} distinct non-empty answers`,
      );
    }

    const angle = text(value.angle);
    const kind = text(value.imageKind);
    const mustNotShow = (
      Array.isArray(value.imageMustNotShow) ? value.imageMustNotShow : []
    )
      .map((entry) => text(entry))
      .filter((entry): entry is string => Boolean(entry));
    const mediaIntent: CandidateMediaIntent = {
      slotKey: 'item-image',
      subject,
      ...(text(value.imageSubjectAr)
        ? { subjectAr: text(value.imageSubjectAr) }
        : {}),
      // An unknown kind is not worth losing the item over; it only tunes search.
      kind: (BOMB_IMAGE_KINDS as readonly string[]).includes(kind ?? '')
        ? (kind as BombImageKind)
        : 'other',
      mustNotShow,
      ...(text(value.imageAltText)
        ? { altText: text(value.imageAltText) }
        : {}),
    };

    return {
      factualClaims,
      draft: {
        prompt: { ar: typeof value.prompt === 'string' ? value.prompt : '' },
        answerPayload: { mode: 'match', acceptedAnswers },
      },
      authoring: {
        ...(text(value.concept) ? { concept: text(value.concept) } : {}),
        // Kept so a reviewer, and the screen, can see what the item set out to
        // ask and which moment its answer is true for.
        ...((BOMB_ANGLES as readonly string[]).includes(angle ?? '')
          ? { angle }
          : {}),
        ...(text(value.timeAnchor)
          ? { timeAnchor: text(value.timeAnchor) }
          : {}),
        mediaIntent,
      },
    };
  }

  private parseClosest(item: unknown): ParsedCandidate {
    const value = item as {
      concept?: unknown;
      answerBasis?: unknown;
      playerReasoningStrategy?: unknown;
      prompt?: unknown;
      domainDescription?: unknown;
      sliderMode?: unknown;
      leftAnchor?: unknown;
      rightAnchor?: unknown;
      min?: unknown;
      max?: unknown;
      step?: unknown;
      correctValue?: unknown;
      stepsFromMin?: unknown;
      unit?: unknown;
      displayFormat?: unknown;
      factualClaims?: unknown;
    };

    const num = (raw: unknown, field: string): number => {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        throw new CandidateParseError(
          'CLOSEST_NUMERIC_FIELD_INVALID',
          `${field} must be a finite number`,
        );
      }
      return raw;
    };

    const factualClaims = Array.isArray(value.factualClaims)
      ? (value.factualClaims as unknown[]).filter(
          (claim): claim is string =>
            typeof claim === 'string' && Boolean(claim.trim()),
        )
      : [];
    if (!factualClaims.length) {
      throw new CandidateParseError(
        'CANDIDATE_FACTUAL_CLAIMS_REQUIRED',
        'every candidate must state its answer-critical claim',
      );
    }

    const displayFormat =
      value.displayFormat === 'calendar-year' ? 'calendar-year' : 'number';
    const unit =
      typeof value.unit === 'string' && value.unit.trim()
        ? value.unit.trim()
        : undefined;

    // Absent on replies shaped before the second slider existed: those are
    // ordinary numeric sliders.
    const betweenAnchors = value.sliderMode === 'between-anchors';
    const leftAnchor = text(value.leftAnchor) ?? '';
    const rightAnchor = text(value.rightAnchor) ?? '';
    if (
      betweenAnchors &&
      (!leftAnchor ||
        !rightAnchor ||
        leftAnchor === rightAnchor ||
        leftAnchor.length > 80 ||
        rightAnchor.length > 80)
    ) {
      throw new CandidateParseError(
        'CLOSEST_SLIDER_ANCHORS_INVALID',
        'a between-anchors slider needs two distinct labels of at most 80 characters',
      );
    }

    const correctValue = num(value.correctValue, 'correctValue');
    const min = num(value.min, 'min');
    const max = num(value.max, 'max');
    const statedStep = num(value.step, 'step');
    const statedStepsFromMin =
      typeof value.stepsFromMin === 'number' &&
      Number.isFinite(value.stepsFromMin)
        ? value.stepsFromMin
        : undefined;
    // A derived answer is whatever the derivation says it is; only the step
    // is a choice. So for a reasoning item the grid is settled here instead
    // of being left to the model's arithmetic. See `settleClosestGrid`.
    // A position line shows the player no numbers at all and counts whole
    // positions, so its step is never a product choice either: it is settled
    // the same way, from the finest step.
    const settled = betweenAnchors
      ? settleClosestGrid({ min, max, step: 1, correctValue })
      : value.answerBasis === 'reasoning'
        ? settleClosestGrid({ min, max, step: statedStep, correctValue })
        : undefined;
    const step = settled?.step ?? statedStep;
    // A reply that stated no stepsFromMin on a grid that was already right
    // keeps none: there is nothing to correct, and nothing was claimed.
    const stepsFromMin =
      settled &&
      (settled.step !== statedStep || statedStepsFromMin !== undefined)
        ? settled.stepsFromMin
        : statedStepsFromMin;
    const gridRepair =
      settled &&
      (settled.step !== statedStep ||
        (statedStepsFromMin !== undefined &&
          settled.stepsFromMin !== statedStepsFromMin))
        ? {
            statedStep,
            ...(statedStepsFromMin !== undefined ? { statedStepsFromMin } : {}),
          }
        : undefined;

    return {
      factualClaims,
      draft: {
        prompt: { ar: typeof value.prompt === 'string' ? value.prompt : '' },
        answerPayload: {
          mode: 'closest',
          correctValue,
          // No tolerance is authored. The Closest runtime never reads it —
          // grading is nearest-wins — so inventing one would add a field that
          // changes nothing and misleads a reviewer.
        },
        mechanicPayload: {
          closestSlider: betweenAnchors
            ? {
                // No unit and no display format: nothing on this slider is
                // ever shown as a number.
                mode: 'between-anchors',
                min,
                max,
                step,
                leftAnchor,
                rightAnchor,
              }
            : {
                mode: 'numeric-range',
                min,
                max,
                step,
                // A calendar year is a value, not an amount: the policy
                // forbids a unit on one, so it is dropped rather than passed
                // through.
                ...(unit && displayFormat !== 'calendar-year' ? { unit } : {}),
                ...(displayFormat === 'calendar-year' ? { displayFormat } : {}),
              },
        },
        metadata: {
          notes: text(value.domainDescription)
            ? `Domain: ${text(value.domainDescription)}`
            : undefined,
        },
      },
      // Kept beside the draft, never inside it. `CreateContentItemDto` is
      // validated with `forbidNonWhitelisted`, so an extra key on the draft
      // would fail publication — and these are authoring rationale, not
      // gameplay fields. They let the screen check the grid arithmetic the
      // model claims, and let a reviewer read the reasoning that was supposed
      // to justify the item instead of inferring it from the prompt.
      authoring: {
        concept: text(value.concept),
        // Absent on candidates generated before this field existed; the
        // reviewer sees "unstated" rather than a wrong default.
        ...(value.answerBasis === 'reasoning' ||
        value.answerBasis === 'knowledge-anchored'
          ? { answerBasis: value.answerBasis }
          : {}),
        playerReasoningStrategy: text(value.playerReasoningStrategy),
        domainDescription: text(value.domainDescription),
        ...(stepsFromMin !== undefined ? { stepsFromMin } : {}),
        // What the model stated before the grid was settled, kept so a
        // reviewer can see the slider's step is ours and not the model's.
        ...(gridRepair ? { gridRepair } : {}),
      },
    };
  }

  public parse(
    raw: string,
    count: number,
    answerMode: 'multiple_choice' | 'closest' | 'match' = 'multiple_choice',
    options?: {
      requireSlotIdentity?: boolean;
      /**
       * Two mechanics share the `match` answer mode. Absent means الكومبو, the
       * first of them, so a caller that predates القنبلة keeps its behaviour.
       */
      mechanicKey?: string;
    },
  ): ParsedCandidate[] {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new CandidateParseError(
        'CANDIDATE_JSON_INVALID',
        raw.slice(0, 200),
      );
    }
    const candidates = (payload as { candidates?: unknown })?.candidates;
    if (!Array.isArray(candidates)) {
      throw new CandidateParseError(
        'CANDIDATE_SHAPE_INVALID',
        'missing candidates[]',
      );
    }
    if (!candidates.length) {
      throw new CandidateParseError(
        'CANDIDATE_EMPTY',
        'no candidates returned',
      );
    }
    if (candidates.length !== count) {
      throw new CandidateParseError(
        'CANDIDATE_COUNT_INVALID',
        `expected exactly ${count} candidate(s), received ${candidates.length}`,
      );
    }

    // Inspect for explicit slot indexing (slotIndex or slotNumber)
    let orderedCandidates = candidates;
    const explicitIndices: Array<number | null> = candidates.map(
      (item, idx) => {
        const itemObj =
          item && typeof item === 'object'
            ? (item as Record<string, unknown>)
            : {};
        const hasSlotIndex =
          itemObj.slotIndex !== undefined && itemObj.slotIndex !== null;
        const hasSlotNumber =
          itemObj.slotNumber !== undefined && itemObj.slotNumber !== null;

        if (!hasSlotIndex && !hasSlotNumber) {
          if (options?.requireSlotIdentity) {
            throw new CandidateParseError(
              'SLOT_IDENTITY_MISSING',
              `Candidate at index ${idx} is missing required slotIndex for pinned creative plan`,
            );
          }
          return null;
        }

        let parsedSlotIndex: number | null = null;
        if (hasSlotIndex) {
          if (
            typeof itemObj.slotIndex !== 'number' ||
            !Number.isInteger(itemObj.slotIndex)
          ) {
            throw new CandidateParseError(
              'SLOT_INDEX_OUT_OF_BOUNDS',
              `slotIndex must be an integer, received ${itemObj.slotIndex}`,
            );
          }
          parsedSlotIndex = itemObj.slotIndex;
        }

        let parsedSlotNumber: number | null = null;
        if (hasSlotNumber) {
          if (
            typeof itemObj.slotNumber !== 'number' ||
            !Number.isInteger(itemObj.slotNumber)
          ) {
            throw new CandidateParseError(
              'SLOT_INDEX_OUT_OF_BOUNDS',
              `slotNumber must be an integer, received ${itemObj.slotNumber}`,
            );
          }
          parsedSlotNumber = itemObj.slotNumber;
        }

        if (parsedSlotIndex !== null && parsedSlotNumber !== null) {
          const normNumber =
            parsedSlotNumber >= 1 && parsedSlotNumber <= count
              ? parsedSlotNumber - 1
              : parsedSlotNumber;
          if (parsedSlotIndex !== normNumber) {
            throw new CandidateParseError(
              'SLOT_INDEX_CONFLICT',
              `Candidate has conflicting slotIndex (${parsedSlotIndex}) and slotNumber (${parsedSlotNumber})`,
            );
          }
        }

        if (parsedSlotIndex !== null) {
          if (parsedSlotIndex >= 0 && parsedSlotIndex < count) {
            return parsedSlotIndex;
          }
          throw new CandidateParseError(
            'SLOT_INDEX_OUT_OF_BOUNDS',
            `slotIndex ${parsedSlotIndex} is out of bounds for batch size ${count}`,
          );
        }

        if (parsedSlotNumber !== null) {
          if (parsedSlotNumber >= 1 && parsedSlotNumber <= count) {
            return parsedSlotNumber - 1;
          }
          if (parsedSlotNumber >= 0 && parsedSlotNumber < count) {
            return parsedSlotNumber;
          }
          throw new CandidateParseError(
            'SLOT_INDEX_OUT_OF_BOUNDS',
            `slotNumber ${parsedSlotNumber} is out of bounds for batch size ${count}`,
          );
        }

        return null;
      },
    );

    const hasExplicitIndices = explicitIndices.some((idx) => idx !== null);
    if (hasExplicitIndices) {
      if (explicitIndices.some((idx) => idx === null)) {
        throw new CandidateParseError(
          'SLOT_INDEX_PARTIALLY_SPECIFIED',
          'Candidate response contains mixed explicit and omitted slot indices',
        );
      }
      const uniqueIndices = new Set(explicitIndices as number[]);
      if (uniqueIndices.size !== count) {
        throw new CandidateParseError(
          'DUPLICATE_SLOT_INDEX',
          'Candidate response contains duplicate or incomplete slot indices',
        );
      }
      orderedCandidates = new Array(count);
      for (let i = 0; i < candidates.length; i++) {
        orderedCandidates[explicitIndices[i] as number] = candidates[i];
      }
    }

    if (answerMode === 'closest') {
      return orderedCandidates.map((item) => this.parseClosest(item));
    }
    if (answerMode === 'match') {
      return options?.mechanicKey === BOMB_SLUG
        ? orderedCandidates.map((item) => this.parseBomb(item))
        : orderedCandidates.map((item) => this.parseCombo(item));
    }
    return orderedCandidates.map((item) => {
      const value = item as {
        concept?: unknown;
        prompt?: unknown;
        options?: { id?: unknown; label?: unknown }[];
        correctOptionId?: unknown;
        distractorRationale?: { optionId?: unknown; why?: unknown }[];
        estimatedConfidence?: { band?: unknown; why?: unknown };
        factualClaims?: unknown;
      };
      // Shaped as CreateContentItemDto. scopeId and compatibleChallengeTypeIds
      // are filled by the publisher in Phase 1d, never by the model.
      const factualClaims = Array.isArray(value.factualClaims)
        ? value.factualClaims.filter(
            (claim): claim is string =>
              typeof claim === 'string' && Boolean(claim.trim()),
          )
        : [];
      if (!factualClaims.length) {
        throw new CandidateParseError(
          'CANDIDATE_FACTUAL_CLAIMS_REQUIRED',
          'every candidate must state its answer-critical claim',
        );
      }
      return {
        factualClaims,
        draft: {
          prompt: { ar: typeof value.prompt === 'string' ? value.prompt : '' },
          answerPayload: {
            mode: 'multiple_choice',
            options: (value.options ?? []).map((option) => ({
              id: String(option?.id ?? ''),
              label: { ar: String(option?.label ?? '') },
            })),
            correctOptionId: String(value.correctOptionId ?? ''),
          },
          metadata: {
            notes: factualClaims.length
              ? 'Engine factual claims are stored in the candidate evaluation record.'
              : undefined,
          },
        },
        // Authoring rationale, beside the draft and never inside it. The draft
        // becomes a `CreateContentItemDto`, validated with
        // `forbidNonWhitelisted`, so an extra key there would fail publication
        // — and this is review context, not gameplay. Nothing here is copied
        // into a ContentItem, so nothing here can reach a player's phone.
        //
        // Absent fields stay absent rather than defaulting: a candidate
        // generated before these existed must read as "not stated", not as a
        // fabricated value.
        authoring: {
          ...(text(value.concept) ? { concept: text(value.concept) } : {}),
          ...(Array.isArray(value.distractorRationale)
            ? {
                distractorRationale: value.distractorRationale
                  .map((entry) => ({
                    optionId: String(entry?.optionId ?? '').trim(),
                    why: text(entry?.why) ?? '',
                  }))
                  .filter((entry) => entry.optionId || entry.why),
              }
            : {}),
          ...(value.estimatedConfidence &&
          typeof value.estimatedConfidence === 'object'
            ? {
                estimatedConfidence: {
                  band: String(value.estimatedConfidence.band ?? '').trim(),
                  why: text(value.estimatedConfidence.why) ?? '',
                },
              }
            : {}),
        },
      };
    });
  }
}

export class CandidateParseError extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
  }
}
