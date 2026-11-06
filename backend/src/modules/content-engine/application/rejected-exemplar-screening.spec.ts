import { ConfigService } from '@nestjs/config';
import { spawnSync } from 'child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { AuthoringContextService } from './authoring-context.service';
import { composeGenerationPrompt } from './candidate-generator.service';
import { DeterministicScreenService } from './deterministic-screen.service';
import {
  parseExemplarMetadata,
  resolveExemplarDocument,
} from './exemplar-metadata';

/**
 * Human Product rejections, end to end.
 *
 * Historical rejections keep their question on a `- **Item**:` line inside a
 * canonical REJECTED block; new ones are written by the Python recorder as a
 * quoted line. Both must reach duplicate screening, and neither may ever reach
 * a generation prompt. The recorder runs for real, into a throwaway root.
 */
const REPO = resolve(__dirname, '../../../../../');
const RECORDER = join(REPO, 'ai/scripts/record_human_product_decision.py');
const GTA = 'ai/.opencode/skills/worlds/video-games/scopes/gta/EXEMPLARS.md';
const OVERWATCH =
  'ai/.opencode/skills/worlds/video-games/scopes/overwatch/EXEMPLARS.md';
const FIFA = 'ai/.opencode/skills/worlds/video-games/scopes/fifa/EXEMPLARS.md';
const COD =
  'ai/.opencode/skills/worlds/video-games/scopes/call-of-duty/EXEMPLARS.md';
const MANIFEST = JSON.parse(
  readFileSync(join(REPO, 'ai/.opencode/authoring-manifest.json'), 'utf8'),
) as { mechanics: Record<string, unknown> };

const PROMPT =
  'وش اسم هذي السيارة الرياضية اللي يسوقها فرانكلين في بداية القصة؟';

const config = { get: () => undefined } as unknown as ConfigService;

const ryo = (ar: string) => ({
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

const screenCodes = (exemplars: string, ar: string) => {
  const service = new DeterministicScreenService(config);
  service.beginBatch(exemplars);
  return service.screen(ryo(ar)).findings.map((finding) => finding.code);
};

const real = (relative: string) => readFileSync(join(REPO, relative), 'utf8');

describe('rejected exemplars — historical records reach duplicate screening', () => {
  it('extracts the question of a recorded rejection, without its answer note', () => {
    const service = new DeterministicScreenService(config);
    service.beginBatch(real(GTA));
    const phrases = service.exemplarPhrases.map((phrase) => phrase.join(' '));
    expect(phrases).toContain('اسم هذا الحي الأيقوني اللي يسكن فيه');
    // `(Answers: Grove Street, Ganton)` is the answer, not the question.
    expect(phrases.join(' ')).not.toMatch(/grove|ganton|answers/);
    // Lesson prose is never a similarity target.
    expect(phrases.join(' ')).not.toMatch(/aliases|semantically/);
  });

  it('drops a `-> answer` note from a recorded question', () => {
    const service = new DeterministicScreenService(config);
    service.beginBatch(real(FIFA));
    const joined = service.exemplarPhrases.map((p) => p.join(' ')).join(' | ');
    expect(joined).toContain('الألتميت تيم');
    expect(joined).not.toContain('تدخلك');
  });

  /**
   * The seven real historical rejections. For each: its status, its exclusion
   * from every positive view, the phrase the screen extracts, and what the
   * unchanged 70% policy can and cannot catch. `near` is null where the
   * record cannot catch a realistic Arabic variant (see the limitation).
   */
  const SEVEN: {
    file: string;
    id: string;
    phrase: string;
    near: string | null;
    limitation?: string;
  }[] = [
    {
      file: COD,
      id: 'call-of-duty-ray-gun-reuse',
      phrase: 'اسم هذا السلاح الأسطوري طور الزومبي',
      near: 'وش اسم هذا السلاح الأسطوري في طور الزومبي اللي يطلق أشعة خضراء؟',
    },
    {
      file: FIFA,
      id: 'fifa-fut-draft-token',
      phrase: 'الألتميت تيم فايدة هذي التوكن',
      near: 'في الألتميت تيم، وش فايدة هذي التوكن بالضبط؟',
    },
    {
      file: FIFA,
      id: 'fifa-reference-sheet-media',
      phrase: 'identifying the shadow chemistry style via wiki style diagram',
      near: null,
      limitation:
        'the record holds an English description, not the player-facing question',
    },
    {
      file: FIFA,
      id: 'fifa-timed-finishing-reuse',
      phrase: 'يعني المؤشر الأخضر فوق اللاعب وقت التسديد',
      near: 'وش يعني المؤشر الأخضر اللي يطلع فوق اللاعب وقت التسديد؟',
    },
    {
      file: FIFA,
      id: 'fifa-chemistry-style-hunter',
      phrase:
        'طور الألتيميت تيم اسم هذا الكيمستري ستايل اللي يزود السرعة والتسديد',
      near: 'في طور الألتيميت تيم، وش اسم الكيمستري ستايل اللي يزود السرعة والتسديد للمهاجم؟',
    },
    {
      file: GTA,
      id: 'gta-grove-street-ambiguity',
      phrase: 'اسم هذا الحي الأيقوني اللي يسكن فيه',
      near: 'وش اسم هذا الحي الأيقوني اللي يسكن فيه سي جي في سان أندرياس؟',
    },
    {
      file: OVERWATCH,
      id: 'overwatch-cassidy-high-noon-reuse',
      phrase: 'إذا سمعت هذه الجملة مين الشخصية اللي قاعدة تستخدم الألتميت',
      near: 'لو سمعت هذه الجملة، مين الشخصية اللي قاعدة تستخدم الألتميت حقها؟',
    },
  ];
  const UNRELATED = 'كم عدد اللاعبين الأساسيين في فريق كرة القدم داخل الملعب؟';

  const resembles = (exemplars: string, ar: string) => {
    const service = new DeterministicScreenService(config);
    service.beginBatch(exemplars);
    return service
      .screen(ryo(ar))
      .findings.filter((f) => f.code === 'CANDIDATE_RESEMBLES_EXEMPLAR');
  };

  it.each(SEVEN)('$id: REJECTED, never positive, screened', (record) => {
    const text = real(record.file);
    const entry = parseExemplarMetadata(text).find(
      (e) => e.metadata.id === record.id,
    );
    // A. the canonical parser reads it as REJECTED.
    expect(entry?.metadata.status).toBe('REJECTED');
    // B. no mechanic ever receives it as a positive exemplar.
    for (const mechanicKey of Object.keys(MANIFEST.mechanics)) {
      const view = resolveExemplarDocument(text, { mechanicKey });
      expect(view.approvedText).not.toContain(record.id);
      expect(view.approvedText).not.toContain(entry!.content);
    }
    // C. the screen extracts the intended phrase from this record alone.
    const service = new DeterministicScreenService(config);
    service.beginBatch(entry!.sourceBlock);
    expect(service.exemplarPhrases.map((p) => p.join(' '))).toEqual([
      record.phrase,
    ]);
    // D. exact reuse of the recorded question warns (G: as a warning).
    const exact = /^\s*-\s*\*\*Item\*\*:\s*(.*)$/m.exec(entry!.content)![1];
    expect(resembles(text, exact)).toEqual([
      expect.objectContaining({ severity: 'warning' }),
    ]);
    // E. a close variation.
    if (record.near) {
      expect(resembles(text, record.near)).toHaveLength(1);
    }
    // F. an unrelated question stays clean.
    expect(resembles(text, UNRELATED)).toEqual([]);
  });

  it('fifa-reference-sheet-media cannot catch an Arabic question about its subject', () => {
    // Recorded limitation, not a fix: the record is left untouched.
    expect(
      resembles(real(FIFA), 'وش اسم هذا الكيمستري ستايل اللي في الصورة؟'),
    ).toEqual([]);
  });
});

const python = spawnSync('python3', ['--version']);
const describeIfPython =
  python.status === 0 && existsSync(RECORDER) ? describe : describe.skip;

describeIfPython(
  'rejected exemplars — recorder output through the engine',
  () => {
    let root: string;
    let recorded: string;

    beforeAll(() => {
      root = mkdtempSync(join(tmpdir(), 'akwaan-rejection-'));
      // The real canonical authoring files the resolver needs for video-games.
      for (const relative of [
        'ai/.opencode/authoring-manifest.json',
        'ai/.opencode/authoring-concept-history.json',
        'ai/.opencode/knowledge/architecture/QUESTION-CRAFT.md',
        'ai/.opencode/skills/challenge-types',
        'ai/.opencode/skills/worlds/video-games',
      ]) {
        mkdirSync(dirname(join(root, relative)), { recursive: true });
        cpSync(join(REPO, relative), join(root, relative), { recursive: true });
      }
      const source = join(root, 'pack.source.json');
      writeFileSync(
        source,
        JSON.stringify({
          items: [
            {
              id: 'gta-r1-07',
              metadata: { conceptKey: { subject: 'franklin-first-car' } },
              presentation: { prompt: PROMPT },
            },
          ],
        }),
      );
      const run = spawnSync(
        'python3',
        [
          RECORDER,
          '--source',
          source,
          '--status',
          'REJECTED',
          '--reuse-policy',
          'DO_NOT_REGENERATE',
          '--world',
          'video-games',
          '--scope',
          'gta',
          '--root',
          root,
        ],
        { encoding: 'utf8' },
      );
      expect(run.status).toBe(0);
      recorded = readFileSync(join(root, GTA), 'utf8');
    });

    afterAll(() => rmSync(root, { recursive: true, force: true }));

    it('parses the recorded entry exactly as the Python parser does', () => {
      const fromTs = parseExemplarMetadata(recorded).map(({ metadata }) => ({
        id: metadata.id,
        status: metadata.status,
        reusePolicy: metadata.reusePolicy,
        mechanics: metadata.mechanics ?? null,
        sourceRef: metadata.sourceRef ?? null,
      }));
      const py = spawnSync(
        'python3',
        [
          '-c',
          [
            'import json,sys',
            `sys.path.insert(0, ${JSON.stringify(join(REPO, 'ai/scripts'))})`,
            'from exemplar_metadata import parse_exemplar_metadata',
            'text = open(sys.argv[1], encoding="utf-8").read()',
            'print(json.dumps([{"id": e.metadata.exemplar_id, "status": e.metadata.status,',
            ' "reusePolicy": e.metadata.reuse_policy,',
            ' "mechanics": list(e.metadata.mechanics) if e.metadata.mechanics else None,',
            ' "sourceRef": e.metadata.source_ref} for e in parse_exemplar_metadata(text)]))',
          ].join('\n'),
          join(root, GTA),
        ],
        { encoding: 'utf8' },
      );
      expect(py.status).toBe(0);
      expect(fromTs).toEqual(JSON.parse(py.stdout));
      const entry = fromTs.find((e) => e.id === 'gta-rejected-gta-r1-07');
      expect(entry).toMatchObject({ status: 'REJECTED', mechanics: null });
    });

    it('is never a positive exemplar for any mechanic', () => {
      for (const mechanicKey of Object.keys(MANIFEST.mechanics)) {
        const document = resolveExemplarDocument(recorded, {
          mechanicKey,
          knownMechanics: Object.keys(MANIFEST.mechanics),
        });
        expect(document.approvedText).not.toContain(PROMPT);
        expect(document.historicalText).toContain(PROMPT);
      }
    });

    it('never reaches a resolved context or a generation prompt', () => {
      const service = new AuthoringContextService({
        get: (key: string) =>
          key === 'ENGINE_AUTHORING_ROOT' ? root : undefined,
      } as unknown as ConfigService);
      const resolved: string[] = [];
      for (const mechanicKey of Object.keys(MANIFEST.mechanics)) {
        let context;
        try {
          context = service.resolve(
            { mechanicKey, worldKey: 'video-games', scopeKey: 'gta' },
            { quiet: true },
          );
        } catch {
          continue; // not authorable here; nothing to inject into
        }
        resolved.push(mechanicKey);
        expect(context.exemplars).not.toContain(PROMPT);
        expect(context.historicalExemplars).toContain(PROMPT);
        if (mechanicKey === 'read-your-opponent' || mechanicKey === 'closest') {
          const prompt = composeGenerationPrompt(
            context,
            2,
            mechanicKey === 'closest' ? 'closest' : 'multiple_choice',
          );
          expect(prompt).not.toContain(PROMPT);
          expect(prompt).not.toContain('gta-rejected-gta-r1-07');
        }
      }
      expect(resolved).toEqual(
        expect.arrayContaining(['read-your-opponent', 'closest', 'bomb']),
      );
    });

    it('screens a near-duplicate of the recorded rejection, and not an unrelated item', () => {
      expect(
        screenCodes(
          recorded,
          'وش اسم السيارة الرياضية اللي يسوقها فرانكلين في بداية القصة؟',
        ),
      ).toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
      expect(
        screenCodes(
          recorded,
          'كم عدد المهمات الرئيسية في قصة اللعبة الأساسية؟',
        ),
      ).not.toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });
  },
);
