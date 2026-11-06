import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { AuthoringContextService } from './authoring-context.service';
import { composeGenerationPrompt } from './candidate-generator.service';
import { ContentEngineReviewService } from './content-engine-review.service';
import { DeterministicScreenService } from './deterministic-screen.service';

/**
 * Review re-screens must see the same duplicate-screening corpus as the first
 * screening: the Scope's complete EXEMPLARS.md (every status) and the
 * mechanic profile, resolved canonically from the candidate's job.
 *
 * Real ContentEngineReviewService, real DeterministicScreenService and real
 * AuthoringContextService over a throwaway authoring root. Only persistence
 * and the canonical World/Scope repositories are stubbed, as in
 * content-engine-review.service.spec.ts. Findings are always read from what
 * the service writes, never from what a test seeded.
 */
const RESEMBLES = 'CANDIDATE_RESEMBLES_EXEMPLAR';

// Each line below is a distinct subject so a hit names exactly one entry.
const REJECTED_Q =
  'وش اسم السيارة الرياضية الحمراء اللي يسوقها البطل في المرحلة الأولى؟';
const WITHHELD_Q =
  'كم عدد الطوابق في البرج الأزرق اللي في وسط المدينة القديمة؟';
const APPROVED_Q = 'مين المدرب اللي قاد الفريق الأخضر للبطولة القارية الأولى؟';
const UNTARGETED_Q = 'وش لون العلم اللي يرفعه الفريق الفائز بعد نهاية الموسم؟';
const ITEM_Q = 'وش اسم المدينة الساحلية اللي تبدأ فيها القصة الرئيسية للعبة؟';
const OTHER_SCOPE_Q =
  'وش اسم الكوكب الأحمر اللي تزوره المركبة في الرحلة الثالثة؟';
const UNRELATED_Q =
  'كم عدد اللاعبين الأساسيين في فريق كرة الطائرة داخل الملعب؟';

const block = (fields: Record<string, unknown>, body: string) =>
  `<!-- AKWAAN_EXEMPLAR_META ${JSON.stringify({
    version: 1,
    reusePolicy: 'DO_NOT_REGENERATE',
    ...fields,
  })} -->\n${body}\n<!-- /AKWAAN_EXEMPLAR_META -->`;

const SCOPE_EXEMPLARS = [
  '# Scope Exemplars: s',
  block({ id: 'rejected-car', status: 'REJECTED' }, `> ${REJECTED_Q}`),
  block({ id: 'withheld-tower', status: 'WITHHELD' }, `> ${WITHHELD_Q}`),
  block(
    {
      id: 'approved-coach',
      status: 'APPROVED',
      mechanics: ['read-your-opponent'],
    },
    `> ${APPROVED_Q}`,
  ),
  block({ id: 'legacy-flag', status: 'APPROVED' }, `> ${UNTARGETED_Q}`),
  block(
    { id: 'historical-city', status: 'REJECTED' },
    `## REJECTED: City\n- **Item**: ${ITEM_Q} (Answers: x)\n- **Lesson**: prose`,
  ),
].join('\n\n');

const OTHER_EXEMPLARS = [
  '# Scope Exemplars: s2',
  block({ id: 'rejected-planet', status: 'REJECTED' }, `> ${OTHER_SCOPE_Q}`),
].join('\n\n');

const scopeEntry = (world: string, scope: string) => ({
  world,
  scopePath: `ai/.opencode/skills/worlds/${world}/scopes/${scope}/SCOPE.md`,
  knowledgePath: `ai/.opencode/skills/worlds/${world}/scopes/${scope}/KNOWLEDGE.md`,
  exemplarsPath: `ai/.opencode/skills/worlds/${world}/scopes/${scope}/EXEMPLARS.md`,
});

const MANIFEST = {
  mechanics: {
    'read-your-opponent': {
      category: 'SHARED',
      status: 'AUTHORABLE',
      profile: 'ai/.opencode/skills/challenge-types/ryo/SKILL.md',
    },
  },
  worlds: {
    w: {
      profile: 'ai/.opencode/skills/worlds/w/WORLD.md',
      scopes: ['s', 'empty'],
    },
    w2: { profile: 'ai/.opencode/skills/worlds/w2/WORLD.md', scopes: ['s2'] },
  },
  scopes: {
    'w/s': scopeEntry('w', 's'),
    'w/empty': scopeEntry('w', 'empty'),
    'w2/s2': scopeEntry('w2', 's2'),
  },
};

const chain = <T>(value: T) => ({
  lean: () => ({ exec: async () => value }),
  exec: async () => value,
});
const actor = { id: 'reviewer-1', email: 'reviewer@example.test' } as never;

const draftFor = (ar: string) => ({
  prompt: { ar },
  answerPayload: {
    mode: 'multiple_choice',
    options: [
      { id: 'a', label: { ar: 'الأول' } },
      { id: 'b', label: { ar: 'الثاني' } },
    ],
    correctOptionId: 'a',
  },
});

describe('review re-screens keep the Scope exemplar corpus', () => {
  let root: string;

  const write = (relative: string, text: string) => {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, 'utf8');
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'akwaan-rescreen-'));
    write('ai/.opencode/authoring-manifest.json', JSON.stringify(MANIFEST));
    write('ai/.opencode/knowledge/architecture/QUESTION-CRAFT.md', '# Global');
    write('ai/.opencode/skills/challenge-types/ryo/SKILL.md', '# RYO');
    for (const [world, scope] of [
      ['w', 's'],
      ['w', 'empty'],
      ['w2', 's2'],
    ]) {
      write(`ai/.opencode/skills/worlds/${world}/WORLD.md`, `# ${world}`);
      write(
        `ai/.opencode/skills/worlds/${world}/scopes/${scope}/SCOPE.md`,
        '# Scope',
      );
      write(
        `ai/.opencode/skills/worlds/${world}/scopes/${scope}/KNOWLEDGE.md`,
        '# K',
      );
    }
    write(
      'ai/.opencode/skills/worlds/w/scopes/s/EXEMPLARS.md',
      SCOPE_EXEMPLARS,
    );
    write(
      'ai/.opencode/skills/worlds/w2/scopes/s2/EXEMPLARS.md',
      OTHER_EXEMPLARS,
    );
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const config = () =>
    ({
      get: (key: string) =>
        key === 'ENGINE_AUTHORING_ROOT' ? root : undefined,
    }) as unknown as ConfigService;

  /** A real review service whose writes are captured, for one stored candidate. */
  const build = (
    stored: { prompt: string; findings?: unknown[] },
    job: { worldKey: string; scopeKey: string } = {
      worldKey: 'w',
      scopeKey: 's',
    },
  ) => {
    const current = {
      _id: 'candidate-db-id',
      candidateId: 'candidate-1',
      jobId: 'job-1',
      status: 'awaiting_review',
      contextHash: 'ctx',
      promptVersion: 'mc-v2',
      draft: draftFor(stored.prompt),
      factualClaims: ['claim'],
      findings: stored.findings ?? [],
      reviewRevision: 1,
      reviewStatus: 'pending',
      compatibilityEvaluation: { preDraft: { blockers: [] } },
      publishedContentItemId: null,
      reviewEvents: [],
    };
    type CandidateUpdate = {
      $set: Record<string, unknown> & { findings?: unknown[]; status?: string };
    };
    const writes: CandidateUpdate[] = [];
    const candidates = {
      findOne: jest.fn(() => chain(current)),
      findOneAndUpdate: jest.fn((_filter: unknown, update: CandidateUpdate) => {
        writes.push(update);
        return chain({ ...current, ...update.$set });
      }),
      updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
      // GET candidates serves back whatever the service last persisted.
      find: jest.fn(() => ({
        sort: () => ({
          limit: () => chain([{ ...current, ...(writes.at(-1)?.$set ?? {}) }]),
        }),
      })),
    };
    const jobDoc = {
      _id: 'job-1',
      mechanicKey: 'read-your-opponent',
      status: 'awaiting_review',
      ...job,
    };
    const jobs = {
      findById: jest.fn(() => chain(jobDoc)),
      find: jest.fn(() => chain([jobDoc])),
    };
    const canonical = {
      worlds: {
        findBySlug: jest.fn(async () => ({
          _id: 'world-id',
          status: 'active',
        })),
      },
      scopes: {
        findBySlugInWorld: jest.fn(async () => ({
          _id: 'scope-id',
          worldId: 'world-id',
          name: 'Scope',
          slug: job.scopeKey,
          status: 'active',
          excludedChallengeTypeIds: [],
        })),
      },
      challengeTypes: {
        findBySlug: jest.fn(async () => ({
          _id: 'challenge-id',
          name: 'Read Your Opponent',
          slug: 'read-your-opponent',
          family: 'RYO',
          itemStructure: 'discrete-triple',
          answerMode: 'ryo',
          defaultPresentation: { inputType: 'multiple-choice' },
          scoringRuleId: 'ryo-payoff-matrix',
          status: 'active',
        })),
      },
    };
    const compatibility = {
      evaluate: jest.fn(() => ({
        status: 'COMPATIBLE',
        preDraft: { readiness: 'ready', blockers: [], warnings: [] },
        usedCanonicalReferences: true,
        deferredChecks: [],
      })),
    };
    const service = new ContentEngineReviewService(
      candidates as never,
      jobs as never,
      {} as never,
      { findOne: jest.fn(() => chain(null)) } as never,
      {} as never,
      new DeterministicScreenService(config()),
      compatibility as never,
      { create: jest.fn() } as never,
      canonical.worlds as never,
      canonical.scopes as never,
      canonical.challengeTypes as never,
      new AuthoringContextService(config()),
    );
    const lastFindings = () =>
      (writes.at(-1)?.$set?.findings ?? []) as Array<{
        code: string;
        severity: string;
      }>;
    const codes = () => lastFindings().map((finding) => finding.code);
    return { service, candidates, writes, lastFindings, codes };
  };

  const edit = (service: ContentEngineReviewService, prompt: string) =>
    service.edit(
      'candidate-1',
      {
        expectedRevision: 1,
        draft: draftFor(prompt),
        factualClaims: ['claim'],
        explanation: 'reviewer edit',
      } as never,
      actor,
    );

  // 1 ---------------------------------------------------------------------
  it('the first screening corpus (as the orchestrator builds it) flags a rejected exemplar', () => {
    const context = new AuthoringContextService(config()).resolve(
      { mechanicKey: 'read-your-opponent', worldKey: 'w', scopeKey: 's' },
      { quiet: true },
    );
    const screen = new DeterministicScreenService(config());
    const session = screen.createSession({
      worldKey: 'w',
      scopeKey: 's',
      exemplars: context.historicalExemplars,
      mechanicProfile: context.mechanic,
    });
    const found = screen
      .screen(draftFor(REJECTED_Q), null, { session })
      .findings.map((f) => f.code);
    expect(found).toContain(RESEMBLES);
  });

  // 2-3, human edit ---------------------------------------------------------
  it('A: an unrelated edit to a still-similar candidate keeps the warning', async () => {
    const { service, codes } = build({ prompt: REJECTED_Q, findings: [] });
    await edit(service, `${REJECTED_Q} `.replace('الأولى', 'الأولى من القصة'));
    expect(codes()).toContain(RESEMBLES);
  });

  it('B: a meaningful rewrite after an edit drops the warning', async () => {
    const { service, codes } = build({
      prompt: REJECTED_Q,
      findings: [{ code: RESEMBLES, severity: 'warning', message: 'old' }],
    });
    await edit(service, UNRELATED_Q);
    expect(codes()).not.toContain(RESEMBLES);
  });

  it('C: an edit that newly resembles a rejected exemplar adds the warning', async () => {
    const { service, codes } = build({ prompt: UNRELATED_Q });
    await edit(service, REJECTED_Q);
    expect(codes()).toContain(RESEMBLES);
  });

  it('D: an unrelated candidate stays free of the warning after an edit', async () => {
    const { service, codes } = build({ prompt: UNRELATED_Q });
    await edit(service, UNRELATED_Q);
    expect(codes()).not.toContain(RESEMBLES);
  });

  // 4-5, explicit re-screen -------------------------------------------------
  it('an explicit re-screen keeps the warning while the candidate is similar', async () => {
    const { service, codes } = build({
      prompt: REJECTED_Q,
      findings: [{ code: RESEMBLES, severity: 'warning', message: 'old' }],
    });
    await service.rescreenCandidate('candidate-1', 1, actor);
    expect(codes()).toContain(RESEMBLES);
  });

  it('an explicit re-screen adds the warning when similarity is newly present', async () => {
    // Stored findings predate the rejection being recorded: none.
    const { service, codes } = build({ prompt: REJECTED_Q, findings: [] });
    await service.rescreenCandidate('candidate-1', 1, actor);
    expect(codes()).toContain(RESEMBLES);
  });

  it('an explicit re-screen of an unrelated candidate adds no warning', async () => {
    const { service, codes } = build({ prompt: UNRELATED_Q });
    await service.rescreenCandidate('candidate-1', 1, actor);
    expect(codes()).not.toContain(RESEMBLES);
  });

  // 7-9 ---------------------------------------------------------------------
  it('keeps REJECTED, WITHHELD and untargeted entries out of positive exemplars', () => {
    const context = new AuthoringContextService(config()).resolve(
      { mechanicKey: 'read-your-opponent', worldKey: 'w', scopeKey: 's' },
      { quiet: true },
    );
    expect(context.exemplars).toContain(APPROVED_Q);
    const prompt = composeGenerationPrompt(context, 2, 'multiple_choice');
    for (const excluded of [REJECTED_Q, WITHHELD_Q, UNTARGETED_Q, ITEM_Q]) {
      expect(context.exemplars).not.toContain(excluded);
      expect(prompt).not.toContain(excluded);
    }
  });

  it.each([
    ['REJECTED', REJECTED_Q],
    ['WITHHELD', WITHHELD_Q],
    ['targeted APPROVED', APPROVED_Q],
    ['untargeted APPROVED', UNTARGETED_Q],
    ['historical `- **Item**:` REJECTED', ITEM_Q],
  ])('re-screening still sees the %s entry', async (_label, question) => {
    const { service, codes } = build({ prompt: question });
    await service.rescreenCandidate('candidate-1', 1, actor);
    expect(codes()).toContain(RESEMBLES);
  });

  // 10 ----------------------------------------------------------------------
  it('uses only the candidate job Scope: no cross-World or cross-Scope corpus', async () => {
    const inS = build({ prompt: OTHER_SCOPE_Q });
    await inS.service.rescreenCandidate('candidate-1', 1, actor);
    expect(inS.codes()).not.toContain(RESEMBLES);

    const inS2 = build(
      { prompt: OTHER_SCOPE_Q },
      { worldKey: 'w2', scopeKey: 's2' },
    );
    await inS2.service.rescreenCandidate('candidate-1', 1, actor);
    expect(inS2.codes()).toContain(RESEMBLES);

    const s2OnS = build(
      { prompt: REJECTED_Q },
      { worldKey: 'w2', scopeKey: 's2' },
    );
    await s2OnS.service.rescreenCandidate('candidate-1', 1, actor);
    expect(s2OnS.codes()).not.toContain(RESEMBLES);
  });

  it('a Scope without EXEMPLARS.md re-screens normally with no exemplar warning', async () => {
    const { service, codes, writes } = build(
      { prompt: REJECTED_Q },
      { worldKey: 'w', scopeKey: 'empty' },
    );
    await service.rescreenCandidate('candidate-1', 1, actor);
    expect(writes).toHaveLength(1);
    expect(codes()).not.toContain(RESEMBLES);
  });

  it('fails the re-screen visibly, writing nothing, when the Scope corpus cannot be resolved', async () => {
    const { service, candidates } = build(
      { prompt: REJECTED_Q },
      { worldKey: 'w', scopeKey: 'missing' },
    );
    await expect(
      service.rescreenCandidate('candidate-1', 1, actor),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(edit(service, REJECTED_Q)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(candidates.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns the recomputed warning through the existing GET candidates presentation', async () => {
    const { service } = build({ prompt: UNRELATED_Q });
    await edit(service, REJECTED_Q);
    const [presented] = (await service.list({} as never)) as Array<{
      findings: Array<{ code: string; severity: string; message: string }>;
    }>;
    expect(presented.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: RESEMBLES, severity: 'warning' }),
      ]),
    );
  });

  // 11-12 -------------------------------------------------------------------
  it('recomputes every other finding, never copying stored ones', async () => {
    const leaking =
      'وش اسم السيارة الرياضية الحمراء الأول اللي يسوقها البطل في المرحلة الأولى؟';
    const { service, codes } = build({
      prompt: UNRELATED_Q,
      findings: [
        { code: 'STALE_SEEDED_FINDING', severity: 'warning', message: 'old' },
      ],
    });
    await edit(service, leaking);
    expect(codes()).toEqual(
      expect.arrayContaining(['ANSWER_LEAKAGE', RESEMBLES]),
    );
    expect(codes()).not.toContain('STALE_SEEDED_FINDING');
  });

  it('keeps the warning non-blocking: it never rejects a candidate by itself', async () => {
    const { service, lastFindings, writes } = build({ prompt: UNRELATED_Q });
    await edit(service, REJECTED_Q);
    const warning = lastFindings().find((f) => f.code === RESEMBLES);
    expect(warning?.severity).toBe('warning');
    const blocking = lastFindings().filter((f) => f.severity === 'blocking');
    expect(writes.at(-1)!.$set.status).toBe(
      blocking.length ? 'screened_reject' : 'awaiting_review',
    );
    expect(blocking.map((f) => f.code)).not.toContain(RESEMBLES);
  });
});
