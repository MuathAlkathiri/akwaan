import { ConfigService } from '@nestjs/config';
import { DeterministicScreenService } from './deterministic-screen.service';
import {
  BOMB_ANGLES,
  BOMB_CANDIDATE_SCHEMA,
  BOMB_MAX_PROMPT_LENGTH,
  BOMB_TASK_GUIDANCE,
  CandidateGeneratorService,
  COMBO_MAX_ACCEPTED_ANSWERS,
  COMBO_TASK_GUIDANCE,
  generatorAnswerModeFor,
} from './candidate-generator.service';
import { ContentItemCompatibilityPolicy } from '../../world-content/domain/content-item-compatibility.policy';
import {
  BOMB_IMAGE_SLOT,
  resolveMediaRequirements,
} from '../domain/media-requirements';
import { planCandidateMedia } from '../domain/candidate-media-planning';
import { mediaIntentOf } from '../domain/candidate-media-intent';
import { adaptSchemaForOpenAiStrict } from '../infrastructure/openrouter-ai.provider';
import {
  BOMB_SLUG,
  ChallengeAnswerMode,
  ChallengeFamily,
  ContentItemStatus,
  ContentMediaType,
  WorldContentStatus,
} from '../../world-content/domain/world-content.constants';
import {
  challengeType,
  scope,
} from '../../world-content/domain/world-content.fixtures';
import { ContentItemView } from '../../world-content/domain/world-content.types';
import { ResolvedAuthoringContext } from './authoring-context.service';
import {
  buildGenerationSpecification,
  isGenerationSpecificationComplete,
  promptVersionFor,
} from '../domain/generation-specification';

/**
 * القنبلة as a generatable mechanic.
 *
 * The fourth mechanic the engine can author and the first whose content is a
 * picture. It shares the `match` answer mode with الكومبو, so the seam these
 * tests hold is the one between the two: القنبلة must get its own prompt,
 * schema, parser and screen, and الكومبو must keep every rule it had.
 *
 * The other half is the picture. A generated Bomb candidate has no image yet —
 * it has a statement of which real image it needs — and the canonical media
 * contract must hold it back until a person has approved one.
 */
describe('القنبلة generation (bomb → match, one picture)', () => {
  const generator = () =>
    new CandidateGeneratorService(
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as unknown as ConfigService,
    );

  const context = (): ResolvedAuthoringContext =>
    ({
      mechanicKey: BOMB_SLUG,
      worldKey: 'football',
      scopeKey: 'premier-league',
      global: 'GLOBAL-TEXT',
      mechanic: 'MECHANIC-TEXT',
      world: 'WORLD-TEXT',
      scope: 'SCOPE-TEXT',
      knowledge: 'KNOWLEDGE-TEXT',
    }) as ResolvedAuthoringContext;

  const recognition = {
    concept: 'A manager any Premier League follower knows on sight.',
    imageSubject: 'Arsène Wenger',
    imageSubjectAr: 'أرسين فينغر',
    imageKind: 'person',
    imageMustNotShow: ['his name in a caption'],
    imageAltText: 'مدرب فرنسي يقف على خط التماس.',
    prompt: 'من هذا المدرب؟',
    acceptedAnswers: ['فينغر', 'أرسين فينغر', 'Wenger'],
    factualClaims: ['أرسين فينغر درّب أرسنال من 1996 إلى 2018.'],
  };

  const response = (over: Record<string, unknown> = {}) =>
    JSON.stringify({ candidates: [{ ...recognition, ...over }] });

  const parse = (over: Record<string, unknown> = {}) =>
    generator().parse(response(over), 1, 'match', { mechanicKey: BOMB_SLUG });

  it('is a mechanic the engine can author, in the match answer mode', () => {
    expect(generatorAnswerModeFor(BOMB_SLUG)).toBe('match');
    expect(promptVersionFor(BOMB_SLUG)).toBe('bomb-v3');
  });

  describe('prompt and schema', () => {
    it('prompts with its own guidance and not الكومبو’s', () => {
      const prompt = generator().buildPrompt(context(), 10, 'match');
      expect(prompt).toContain(BOMB_TASK_GUIDANCE);
      expect(prompt).not.toContain(COMBO_TASK_GUIDANCE);
      expect(prompt).toContain('MECHANIC-TEXT');
      expect(prompt).not.toMatch(/comboStage|ladder|Steal\/Trust|slider/);
    });

    it('leaves الكومبو’s prompt exactly as it was', () => {
      const combo = generator().buildPrompt(
        { ...context(), mechanicKey: 'combo' },
        4,
        'match',
      );
      expect(combo).toContain(COMBO_TASK_GUIDANCE);
      expect(combo).not.toContain(BOMB_TASK_GUIDANCE);
    });

    it('asks for the picture before the wording', () => {
      const item = (
        BOMB_CANDIDATE_SCHEMA.properties as {
          candidates: { items: { required: string[] } };
        }
      ).candidates.items;
      expect(item.required.indexOf('imageSubject')).toBeLessThan(
        item.required.indexOf('prompt'),
      );
      expect(item.required).toEqual(
        expect.arrayContaining([
          'imageSubject',
          'imageSubjectAr',
          'imageKind',
          'imageMustNotShow',
          'imageAltText',
          'acceptedAnswers',
          'factualClaims',
        ]),
      );
    });

    it('makes the model commit to an angle and to the moment its answer is true for', () => {
      const item = (
        BOMB_CANDIDATE_SCHEMA.properties as {
          candidates: {
            items: {
              required: string[];
              properties: Record<string, { enum?: string[] }>;
            };
          };
        }
      ).candidates.items;
      expect(item.required).toEqual(
        expect.arrayContaining(['angle', 'timeAnchor']),
      );
      // Chosen before the wording, like the picture.
      expect(item.required.indexOf('angle')).toBeLessThan(
        item.required.indexOf('prompt'),
      );
      expect(item.properties.angle.enum).toEqual([...BOMB_ANGLES]);
    });

    it('tells the model to spread the angles and to pin changeable answers to a date', () => {
      expect(BOMB_TASK_GUIDANCE).toContain('SPREAD THE ANGLES');
      expect(BOMB_TASK_GUIDANCE).toContain('NO TROPHY QUIZZES');
      expect(BOMB_TASK_GUIDANCE).not.toContain('ترمز');
      expect(BOMB_TASK_GUIDANCE).toContain(
        'at least min(N, 4) different angles',
      );
      expect(BOMB_TASK_GUIDANCE).toContain('at most one item per batch');
      // Recall angles are the slow ones and are rationed.
      expect(BOMB_TASK_GUIDANCE).toContain(
        'Use at most ceil(N / 3) of them in a batch of N',
      );
      expect(BOMB_TASK_GUIDANCE).toContain('two or three seconds of thought');
      expect(BOMB_TASK_GUIDANCE).toContain(
        'ANSWERS THAT CAN CHANGE MUST BE PINNED TO A DATE',
      );
      // The old instruction that there were only two shapes is gone.
      expect(BOMB_TASK_GUIDANCE).not.toContain('only two');
    });

    it('tells the model the image is found, never drawn', () => {
      expect(BOMB_TASK_GUIDANCE).toMatch(/real photograph of already exists/);
      expect(BOMB_TASK_GUIDANCE).toMatch(/Never describe an illustration/);
      expect(BOMB_TASK_GUIDANCE).toContain(
        `under ${BOMB_MAX_PROMPT_LENGTH} characters`,
      );
    });

    it('survives the OpenAI strict-schema adaptation', () => {
      // An unclassified keyword throws before a paid request is sent. A schema
      // that cannot be adapted would make every openai/* Bomb batch fail.
      expect(() =>
        adaptSchemaForOpenAiStrict(BOMB_CANDIDATE_SCHEMA),
      ).not.toThrow();
    });
  });

  describe('parsing', () => {
    it('parses a recognition item into a match payload with no media yet', () => {
      const [candidate] = parse();
      expect(candidate.draft).toEqual({
        prompt: { ar: 'من هذا المدرب؟' },
        answerPayload: {
          mode: 'match',
          acceptedAnswers: ['فينغر', 'أرسين فينغر', 'Wenger'],
        },
      });
      // No stage: that is الكومبو’s, and the Bomb READY gate does not ask for it.
      expect(candidate.draft).not.toHaveProperty('mechanicPayload');
      expect(candidate.draft).not.toHaveProperty('media');
      expect(candidate.factualClaims).toHaveLength(1);
    });

    it('records which real picture the item needs, beside the draft', () => {
      const [candidate] = parse();
      expect(candidate.authoring?.mediaIntent).toEqual({
        slotKey: BOMB_IMAGE_SLOT,
        subject: 'Arsène Wenger',
        subjectAr: 'أرسين فينغر',
        kind: 'person',
        mustNotShow: ['his name in a caption'],
        altText: 'مدرب فرنسي يقف على خط التماس.',
      });
      expect(mediaIntentOf(candidate.authoring, BOMB_IMAGE_SLOT)).toEqual(
        candidate.authoring?.mediaIntent,
      );
    });

    it('parses a name-completion item whose picture shows the person named', () => {
      const [candidate] = parse({
        concept: 'A surname everyone knows, a first name fewer recall.',
        imageSubject: 'Luka Modrić',
        imageSubjectAr: 'لوكا مودريتش',
        imageMustNotShow: ['the first name Luka as readable text'],
        imageAltText: 'لاعب وسط كرواتي بقميص أبيض.',
        prompt: 'وش الاسم الأول لمودريتش؟',
        acceptedAnswers: ['لوكا', 'Luka'],
        factualClaims: ['اسم مودريتش الأول هو لوكا.'],
      });
      expect(candidate.draft.prompt).toEqual({
        ar: 'وش الاسم الأول لمودريتش؟',
      });
      expect(candidate.authoring?.mediaIntent).toMatchObject({
        subject: 'Luka Modrić',
        mustNotShow: ['the first name Luka as readable text'],
      });
    });

    it('keeps the angle and the time anchor beside the draft, and drops an angle it does not know', () => {
      const [pinned] = parse({
        angle: 'affiliation',
        timeAnchor: 'موسم 2003-04',
        prompt: 'وش النادي اللي درّبه هذا المدرب موسم 2003-04؟',
        acceptedAnswers: ['أرسنال'],
      });
      expect(pinned.authoring).toMatchObject({
        angle: 'affiliation',
        timeAnchor: 'موسم 2003-04',
      });
      const [plain] = parse({ angle: 'something-else', timeAnchor: '' });
      expect(plain.authoring).not.toHaveProperty('angle');
      expect(plain.authoring).not.toHaveProperty('timeAnchor');
    });

    it('keeps an item whose kind it does not recognise', () => {
      const [candidate] = parse({ imageKind: 'hologram' });
      expect(candidate.authoring?.mediaIntent?.kind).toBe('other');
    });

    it('drops a repeated answer instead of grading it twice', () => {
      const [candidate] = parse({
        acceptedAnswers: ['فينغر', ' فينغر ', 'Wenger'],
      });
      expect(
        (candidate.draft.answerPayload as { acceptedAnswers: string[] })
          .acceptedAnswers,
      ).toEqual(['فينغر', 'Wenger']);
    });

    it('refuses a candidate that does not say what its picture shows', () => {
      expect(() => parse({ imageSubject: '' })).toThrow(
        /BOMB_IMAGE_SUBJECT_REQUIRED/,
      );
      expect(() => parse({ imageSubject: undefined })).toThrow(
        /BOMB_IMAGE_SUBJECT_REQUIRED/,
      );
    });

    it('refuses an unanswerable or over-long grading contract', () => {
      expect(() => parse({ acceptedAnswers: [] })).toThrow(
        /BOMB_ACCEPTED_ANSWERS_INVALID/,
      );
      expect(() =>
        parse({
          acceptedAnswers: Array.from(
            { length: COMBO_MAX_ACCEPTED_ANSWERS + 1 },
            (_, i) => `answer-${i}`,
          ),
        }),
      ).toThrow(/BOMB_ACCEPTED_ANSWERS_INVALID/);
    });

    it('refuses a candidate that states no answer-critical claim', () => {
      expect(() => parse({ factualClaims: [] })).toThrow(
        /CANDIDATE_FACTUAL_CLAIMS_REQUIRED/,
      );
    });

    it('still parses a match response as الكومبو when no mechanic is named', () => {
      // The pre-Bomb call shape. A Bomb-shaped item has no stage, so it is
      // refused there rather than slipping through as a stage-less combo.
      expect(() => generator().parse(response(), 1, 'match')).toThrow(
        /COMBO_STAGE_INVALID/,
      );
    });
  });

  describe('the media contract holds the candidate until it has a picture', () => {
    const flags = {
      enrichment: true,
      imageGeneration: false,
      wigoloDiscovery: false,
    };

    it('governs every Bomb candidate with one required image slot', () => {
      expect(
        resolveMediaRequirements({ mechanicKey: BOMB_SLUG, scopeKey: 'any' }),
      ).toHaveLength(1);
      const outcome = planCandidateMedia({
        mechanicKey: BOMB_SLUG,
        scopeKey: 'premier-league',
        flags,
      });
      expect(outcome.governed).toBe(true);
      expect(outcome.planned).toEqual([BOMB_IMAGE_SLOT]);
      expect(outcome.mediaPlan).toEqual([
        expect.objectContaining({
          slotKey: BOMB_IMAGE_SLOT,
          purpose: 'gameplay',
          required: true,
          status: 'planned',
        }),
      ]);
    });
  });

  describe('the generated draft can actually be published once it has its image', () => {
    const policy = new ContentItemCompatibilityPolicy();
    const premierLeague = scope({
      id: 'scope-pl',
      slug: 'premier-league',
      name: 'Premier League',
      worldId: 'world-football',
      status: WorldContentStatus.ACTIVE,
    });
    const bomb = challengeType({
      id: 'challenge-bomb',
      slug: BOMB_SLUG,
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.MATCH,
      status: WorldContentStatus.ACTIVE,
    });

    const blockers = (over: Partial<ContentItemView> = {}) => {
      const [candidate] = parse();
      return policy
        .evaluate({
          item: {
            id: 'engine-bomb-draft',
            scopeId: premierLeague.id,
            worldId: premierLeague.worldId,
            prompt: candidate.draft.prompt as ContentItemView['prompt'],
            compatibleChallengeTypeIds: [bomb.id],
            answerPayload: candidate.draft
              .answerPayload as ContentItemView['answerPayload'],
            // What the media stage writes at the slot’s target path.
            media: {
              type: ContentMediaType.IMAGE,
              assets: [
                {
                  url: '/uploads/world-content/content-items/engine-abc.jpg',
                  altText: 'مدرب فرنسي يقف على خط التماس.',
                },
              ],
            } as ContentItemView['media'],
            isReusableAcrossSessions: false,
            status: ContentItemStatus.READY,
            ...over,
          },
          scope: premierLeague,
          worldStatus: WorldContentStatus.ACTIVE,
          challengeTypes: new Map([[bomb.id, bomb]]),
          authoring: { isNewItem: true },
        })
        .blockers.map((problem) => problem.code);
    };

    it('reaches READY with no blockers', () => {
      expect(blockers()).toEqual([]);
    });

    it('is refused without an accepted answer', () => {
      // The negative control: an empty blocker list above must mean the item
      // passed the gate, not that the gate never looked at it.
      expect(
        blockers({
          answerPayload: {
            mode: 'match',
            acceptedAnswers: [],
          } as unknown as ContentItemView['answerPayload'],
        }),
      ).not.toEqual([]);
    });
  });

  describe('deterministic screening', () => {
    const screener = () => {
      const service = new DeterministicScreenService({
        get: () => undefined,
      } as unknown as ConfigService);
      service.beginBatch();
      return service;
    };

    const findings = (
      draftOver: Record<string, unknown> = {},
      options: {
        mechanicKey?: string;
        authoring?: Record<string, unknown> | null;
        severity?: 'blocking' | 'warning';
      } = {},
    ) => {
      const [candidate] = parse();
      return screener()
        .screen(
          { ...candidate.draft, ...draftOver },
          options.authoring === undefined
            ? (candidate.authoring as Record<string, unknown>)
            : options.authoring,
          {
            mechanicKey:
              'mechanicKey' in options ? options.mechanicKey : BOMB_SLUG,
          },
        )
        .findings.filter(
          (finding) => finding.severity === (options.severity ?? 'blocking'),
        )
        .map((finding) => finding.code);
    };

    it('accepts a well-formed Bomb candidate', () => {
      expect(findings()).toEqual([]);
      expect(findings({}, { severity: 'warning' })).not.toContain(
        'BOMB_IMAGE_SUBJECT_MISSING',
      );
    });

    it('does not ask a Bomb item for a combo stage', () => {
      expect(findings()).not.toContain('COMBO_STAGE_REQUIRED');
    });

    it('holds a Bomb-shaped item to الكومبو’s contract when the mechanic is not named', () => {
      // Fail closed: a call site that forgets the mechanic blocks the
      // candidate, rather than letting a stage-less combo through.
      expect(findings({}, { mechanicKey: undefined })).toContain(
        'COMBO_STAGE_REQUIRED',
      );
    });

    it('blocks an answer the prompt already gives away', () => {
      expect(findings({ prompt: { ar: 'هل هذا فينغر؟' } })).toContain(
        'ANSWER_LEAKAGE',
      );
    });

    it.each(['حاليًا', 'الحين', 'هذا الموسم'])(
      'blocks a question about the present moment (%s), whose answer will change',
      (word) => {
        expect(
          findings({
            prompt: { ar: `وش النادي اللي يدربه هذا المدرب ${word}؟` },
          }),
        ).toContain('BOMB_ANSWER_NOT_PINNED_IN_TIME');
      },
    );

    it('accepts a changeable answer once it is pinned to a season in the prompt', () => {
      const [candidate] = parse({
        angle: 'affiliation',
        timeAnchor: 'موسم 2003-04',
      });
      const pinned = {
        prompt: { ar: 'وش النادي اللي درّبه هذا المدرب موسم 2003-04؟' },
        answerPayload: { mode: 'match', acceptedAnswers: ['أرسنال'] },
      };
      const authoring = candidate.authoring as Record<string, unknown>;
      expect(findings(pinned, { authoring })).toEqual([]);
      expect(
        findings(pinned, { authoring, severity: 'warning' }),
      ).not.toContain('BOMB_TIME_ANCHOR_NOT_IN_PROMPT');
    });

    it('warns when the item names a moment its prompt never mentions', () => {
      const [candidate] = parse({ timeAnchor: 'موسم 2003-04' });
      expect(
        findings(
          {},
          {
            authoring: candidate.authoring as Record<string, unknown>,
            severity: 'warning',
          },
        ),
      ).toContain('BOMB_TIME_ANCHOR_NOT_IN_PROMPT');
    });

    it('blocks a prompt too long to read at a glance', () => {
      const long = 'من هذا المدرب الذي '.repeat(5);
      expect([...long.trim()].length).toBeGreaterThanOrEqual(
        BOMB_MAX_PROMPT_LENGTH,
      );
      expect(findings({ prompt: { ar: long } })).toContain(
        'BOMB_PROMPT_TOO_LONG',
      );
    });

    it('accepts a prompt just under the bound', () => {
      const prompt = `${'م'.repeat(BOMB_MAX_PROMPT_LENGTH - 2)}؟`;
      expect([...prompt].length).toBe(BOMB_MAX_PROMPT_LENGTH - 1);
      expect(findings({ prompt: { ar: prompt } })).not.toContain(
        'BOMB_PROMPT_TOO_LONG',
      );
    });

    it('blocks an empty grading contract', () => {
      expect(
        findings({ answerPayload: { mode: 'match', acceptedAnswers: [] } }),
      ).toContain('ACCEPTED_ANSWERS_REQUIRED');
    });

    it('warns, without blocking, when the candidate cannot be searched for', () => {
      // The image is still required — by the media contract. This only tells
      // the reviewer that it will have to be supplied by hand.
      expect(findings({}, { authoring: null })).toEqual([]);
      expect(findings({}, { authoring: null, severity: 'warning' })).toContain(
        'BOMB_IMAGE_SUBJECT_MISSING',
      );
    });
  });

  describe('the pipeline can reach the mechanic', () => {
    const config = () =>
      ({
        get: (key: string) =>
          ({
            CONTENT_ENGINE_ENABLED: 'true',
            ENGINE_PROVIDER_NAME: 'fake',
            ENGINE_GENERATION_MODEL: 'fake-model',
            ENGINE_OUTPUT_TOKENS_PER_CANDIDATE: '800',
          })[key],
      }) as unknown as ConfigService;

    const specContext = {
      mechanicKey: BOMB_SLUG,
      worldKey: 'football',
      scopeKey: 'premier-league',
      contextHash: 'a'.repeat(64),
      effectiveRules: {
        version: 1 as const,
        digest: 'b'.repeat(64),
        rules: [],
        resolved: [],
        conflicts: [],
        structuredSources: [],
      },
    };

    it('builds a complete specification a job can be queued with', () => {
      const spec = buildGenerationSpecification({
        config: config(),
        context: specContext,
        targetCount: 10,
      });
      expect(spec.answerMode).toBe('match');
      expect(spec.promptVersion).toBe('bomb-v3');
      expect(spec.difficulty).toBeNull();
      expect(isGenerationSpecificationComplete(spec)).toBe(true);
    });

    it('refuses a difficulty selection, which Bomb does not have', () => {
      expect(() =>
        buildGenerationSpecification({
          config: config(),
          context: specContext,
          targetCount: 10,
          difficulty: 'easy',
        } as never),
      ).toThrow(/DIFFICULTY_SELECTION_NOT_SUPPORTED/);
    });
  });
});
