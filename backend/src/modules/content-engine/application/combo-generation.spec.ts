import { ConfigService } from '@nestjs/config';
import { DeterministicScreenService } from './deterministic-screen.service';
import {
  CandidateGeneratorService,
  COMBO_CANDIDATE_SCHEMA,
  COMBO_MAX_ACCEPTED_ANSWERS,
  COMBO_TASK_GUIDANCE,
  generatorAnswerModeFor,
} from './candidate-generator.service';
import { ContentItemCompatibilityPolicy } from '../../world-content/domain/content-item-compatibility.policy';
import { MEDIA_REQUIREMENTS } from '../domain/media-requirements';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  COMBO_SLUG,
  ContentItemStatus,
  WorldContentStatus,
} from '../../world-content/domain/world-content.constants';
import {
  challengeType,
  scope,
} from '../../world-content/domain/world-content.fixtures';
import { ContentItemView } from '../../world-content/domain/world-content.types';
import { ResolvedAuthoringContext } from './authoring-context.service';
import {
  MECHANIC_ANSWER_MODES as DOMAIN_MECHANIC_ANSWER_MODES,
  PROMPT_VERSIONS as DOMAIN_PROMPT_VERSIONS,
  buildGenerationSpecification,
  generatorAnswerModeFor as domainGeneratorAnswerModeFor,
  isGenerationSpecificationComplete,
} from '../domain/generation-specification';
import {
  MECHANIC_ANSWER_MODES,
  PROMPT_VERSIONS,
} from './candidate-generator.service';

/**
 * الكومبو as a generatable mechanic (roadmap §30.22 follow-up).
 *
 * The engine could author only `read-your-opponent` and `closest`, both
 * text-only and both ungoverned by the media contract. الكومبو is the third:
 * a text-matched answer on a four-stage ladder, with no media of its own.
 *
 * What these tests hold down is the seam, not the wording: the mechanic is
 * reachable, the prompt carries its own guidance and nobody else's, the parser
 * refuses a broken grading contract instead of repairing it, and the draft it
 * produces survives the canonical READY gate — which is the only thing that
 * decides whether generated content can ever reach a player.
 */
describe('الكومبو generation (combo → match)', () => {
  const generator = () =>
    new CandidateGeneratorService(
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as unknown as ConfigService,
    );

  const context = (): ResolvedAuthoringContext =>
    ({
      mechanicKey: COMBO_SLUG,
      worldKey: 'anime',
      scopeKey: 'naruto',
      global: 'GLOBAL-TEXT',
      mechanic: 'MECHANIC-TEXT',
      world: 'WORLD-TEXT',
      scope: 'SCOPE-TEXT',
      knowledge: 'KNOWLEDGE-TEXT',
    }) as ResolvedAuthoringContext;

  const response = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      candidates: [
        {
          concept: 'A character the Scope treats as common knowledge.',
          comboStage: 2,
          stageJustification: 'Known to anyone who watched the first arc.',
          prompt: 'من هو معلم ناروتو في فريق السابع؟',
          acceptedAnswers: ['كاكاشي', 'Kakashi'],
          factualClaims: ['كاكاشي هاتاكي هو قائد الفريق السابع.'],
          ...over,
        },
      ],
    });

  it('is a mechanic the engine can author', () => {
    expect(generatorAnswerModeFor(COMBO_SLUG)).toBe('match');
    expect(COMBO_CANDIDATE_SCHEMA).toBeDefined();
  });

  it('stays outside the media contract', () => {
    // §30.22 governs media-native mechanics only. A text mechanic that drifted
    // into that registry would gate approval on an asset nobody can supply.
    expect(
      MEDIA_REQUIREMENTS.some((entry) => entry.mechanicKey === COMBO_SLUG),
    ).toBe(false);
  });

  it('prompts with its own guidance and no other mechanic’s', () => {
    const prompt = generator().buildPrompt(context(), 4, 'match');
    expect(prompt).toContain(COMBO_TASK_GUIDANCE);
    expect(prompt).toContain('MECHANIC-TEXT');
    expect(prompt).not.toMatch(/Steal\/Trust|slider|مين أقرب/);
  });

  it('parses a candidate into a match payload on a stage', () => {
    const [candidate] = generator().parse(response(), 1, 'match');
    expect(candidate.draft).toMatchObject({
      prompt: { ar: 'من هو معلم ناروتو في فريق السابع؟' },
      answerPayload: {
        mode: 'match',
        acceptedAnswers: ['كاكاشي', 'Kakashi'],
      },
      mechanicPayload: { comboStage: 2 },
    });
    expect(candidate.factualClaims).toHaveLength(1);
    expect(candidate.authoring?.stageJustification).toBeTruthy();
  });

  it('drops a repeated answer instead of grading it twice', () => {
    const [candidate] = generator().parse(
      response({ acceptedAnswers: ['كاكاشي', ' كاكاشي ', 'Kakashi'] }),
      1,
      'match',
    );
    expect(
      (candidate.draft.answerPayload as { acceptedAnswers: string[] })
        .acceptedAnswers,
    ).toEqual(['كاكاشي', 'Kakashi']);
  });

  describe('refusals', () => {
    const parse = (over: Record<string, unknown>) => () =>
      generator().parse(response(over), 1, 'match');

    it('refuses a stage off the ladder', () => {
      expect(parse({ comboStage: 5 })).toThrow(/COMBO_STAGE_INVALID/);
      expect(parse({ comboStage: 2.5 })).toThrow(/COMBO_STAGE_INVALID/);
      expect(parse({ comboStage: '2' })).toThrow(/COMBO_STAGE_INVALID/);
    });

    it('refuses an unanswerable or over-long grading contract', () => {
      expect(parse({ acceptedAnswers: [] })).toThrow(
        /COMBO_ACCEPTED_ANSWERS_INVALID/,
      );
      expect(parse({ acceptedAnswers: ['   '] })).toThrow(
        /COMBO_ACCEPTED_ANSWERS_INVALID/,
      );
      expect(
        parse({
          acceptedAnswers: Array.from(
            { length: COMBO_MAX_ACCEPTED_ANSWERS + 1 },
            (_, i) => `answer-${i}`,
          ),
        }),
      ).toThrow(/COMBO_ACCEPTED_ANSWERS_INVALID/);
    });

    it('refuses a candidate that states no answer-critical claim', () => {
      expect(parse({ factualClaims: [] })).toThrow(
        /CANDIDATE_FACTUAL_CLAIMS_REQUIRED/,
      );
    });
  });

  describe('the generated draft can actually be published', () => {
    const policy = new ContentItemCompatibilityPolicy();
    const naruto = scope({
      id: 'scope-naruto',
      slug: 'naruto',
      name: 'Naruto',
      worldId: 'world-anime',
      status: WorldContentStatus.ACTIVE,
    });
    const combo = challengeType({
      id: 'challenge-combo',
      slug: COMBO_SLUG,
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.MATCH,
      status: WorldContentStatus.ACTIVE,
    });

    const blockersAt = (
      status: ContentItemStatus,
      over: Partial<ContentItemView> = {},
    ) => {
      const [candidate] = generator().parse(response(), 1, 'match');
      return policy
        .evaluate({
          item: {
            id: 'engine-combo-draft',
            scopeId: naruto.id,
            worldId: naruto.worldId,
            prompt: candidate.draft.prompt as ContentItemView['prompt'],
            compatibleChallengeTypeIds: [combo.id],
            answerPayload: candidate.draft
              .answerPayload as ContentItemView['answerPayload'],
            mechanicPayload: candidate.draft
              .mechanicPayload as ContentItemView['mechanicPayload'],
            isReusableAcrossSessions: false,
            status,
            ...over,
          },
          scope: naruto,
          worldStatus: WorldContentStatus.ACTIVE,
          challengeTypes: new Map([[combo.id, combo]]),
          authoring: { isNewItem: true },
        })
        .blockers.map((problem) => problem.code);
    };

    it('reaches READY with no blockers', () => {
      expect(blockersAt(ContentItemStatus.READY)).toEqual([]);
    });

    it('is refused without the stage the parser requires', () => {
      // The negative control: an empty blocker list above must mean the item
      // passed the gate, not that the gate never looked at it.
      expect(
        blockersAt(ContentItemStatus.READY, { mechanicPayload: undefined }),
      ).toContain('COMBO_ITEM_STAGE_INVALID');
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

    const comboDraft = (over: Record<string, unknown> = {}) => ({
      prompt: { ar: 'من هو معلم ناروتو في فريق السابع؟' },
      answerPayload: { mode: 'match', acceptedAnswers: ['كاكاشي'] },
      mechanicPayload: { comboStage: 2 },
      ...over,
    });

    const codes = (
      over: Record<string, unknown> = {},
      severity: 'blocking' | 'warning' = 'blocking',
    ) =>
      screener()
        .screen(comboDraft(over))
        .findings.filter((finding) => finding.severity === severity)
        .map((finding) => finding.code);

    it('accepts a well-formed combo candidate', () => {
      // Before this path existed the screen refused every match-mode
      // candidate as an unsupported answer mode, so generation produced items
      // that could never survive screening.
      expect(codes()).toEqual([]);
    });

    it('blocks an answer the prompt already gives away', () => {
      expect(
        codes({ prompt: { ar: 'هل كاكاشي هو معلم فريق السابع؟' } }),
      ).toContain('ANSWER_LEAKAGE');
    });

    it('blocks a missing or off-ladder stage', () => {
      expect(codes({ mechanicPayload: undefined })).toContain(
        'COMBO_STAGE_REQUIRED',
      );
      expect(codes({ mechanicPayload: { comboStage: 9 } })).toContain(
        'COMBO_STAGE_REQUIRED',
      );
    });

    it('blocks an empty grading contract', () => {
      expect(
        codes({ answerPayload: { mode: 'match', acceptedAnswers: [] } }),
      ).toContain('ACCEPTED_ANSWERS_REQUIRED');
    });

    it('warns on answers the grader cannot tell apart', () => {
      // أحمد and احمد differ only by a fold the normalizer applies to both.
      expect(
        codes(
          {
            prompt: { ar: 'من قاد الفريق في النهائي؟' },
            answerPayload: {
              mode: 'match',
              acceptedAnswers: ['أحمد', 'احمد'],
            },
          },
          'warning',
        ),
      ).toContain('ACCEPTED_ANSWER_DUPLICATE');
    });

    it('warns on digits, which grading does not fold', () => {
      expect(
        codes(
          {
            prompt: { ar: 'ما اسم الفريق الفائز؟' },
            answerPayload: { mode: 'match', acceptedAnswers: ['فريق 7'] },
          },
          'warning',
        ),
      ).toContain('ACCEPTED_ANSWER_CONTAINS_DIGITS');
    });
  });

  /**
   * The generator is not the only thing that has to know a mechanic exists.
   * Job creation, the Admin capability surface, the specification builder and
   * the orchestrator's provenance guard all ask the *domain* module which
   * answer mode a mechanic has — so a mechanic the generator alone knows is a
   * generator nothing can call. These tests hold that single seam.
   */
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
      mechanicKey: COMBO_SLUG,
      worldKey: 'anime',
      scopeKey: 'naruto',
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

    it('is one map, not a generator-local copy', () => {
      expect(MECHANIC_ANSWER_MODES).toBe(DOMAIN_MECHANIC_ANSWER_MODES);
      expect(PROMPT_VERSIONS).toBe(DOMAIN_PROMPT_VERSIONS);
    });

    it('every authorable mechanic has a prompt version', () => {
      for (const mode of Object.values(DOMAIN_MECHANIC_ANSWER_MODES)) {
        expect(typeof DOMAIN_PROMPT_VERSIONS[mode]).toBe('string');
        expect(DOMAIN_PROMPT_VERSIONS[mode]).not.toHaveLength(0);
      }
    });

    it('answers the capability lookup that job creation uses', () => {
      // `generation-job.service` refuses to build a specification — and so the
      // job — for a mechanic this returns undefined for.
      expect(domainGeneratorAnswerModeFor(COMBO_SLUG)).toBe('match');
    });

    it('builds a complete specification a job can be queued with', () => {
      const spec = buildGenerationSpecification({
        config: config(),
        context: specContext,
        targetCount: 8,
      });
      expect(spec.answerMode).toBe('match');
      expect(spec.promptVersion).toBe('combo-v1');
      // الكومبو takes no difficulty selection: the stage ladder is its difficulty.
      expect(spec.difficulty).toBeNull();
      expect(isGenerationSpecificationComplete(spec)).toBe(true);
    });

    it('satisfies the orchestrator provenance guard', () => {
      const spec = buildGenerationSpecification({
        config: config(),
        context: specContext,
        targetCount: 8,
      });
      // The guard's own comparison, on the domain values it reads.
      const expectedAnswerMode = domainGeneratorAnswerModeFor(COMBO_SLUG);
      expect(expectedAnswerMode).toBeDefined();
      expect(spec.answerMode).toBe(expectedAnswerMode);
      expect(spec.promptVersion).toBe(
        DOMAIN_PROMPT_VERSIONS[expectedAnswerMode!],
      );
    });

    it('leaves the established prompt versions untouched', () => {
      // Changing either would change every request hash and pinned plan.
      expect(DOMAIN_PROMPT_VERSIONS.multiple_choice).toBe('mc-v2');
      expect(DOMAIN_PROMPT_VERSIONS.closest).toBe('closest-v2');
    });
  });
});
