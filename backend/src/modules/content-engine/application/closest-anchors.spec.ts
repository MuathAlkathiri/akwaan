import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import { Model } from 'mongoose';
import {
  anchorLabelLeaksTarget,
  closestAnchorIssues,
} from '../domain/closest-anchor.policy';
import {
  buildGenerationSpecification,
  specificationForSourcing,
} from '../domain/generation-specification';
import {
  isLibraryRowGenerationEligible,
  LIBRARY_ANCHOR_COLUMNS,
  LIBRARY_EXAMPLE_COLUMNS,
  LIBRARY_HOOK_COLUMNS,
  LIBRARY_REQUIRED_COLUMNS,
} from '../domain/library-row';
import {
  AnchorBankEntry,
  GenerationSourcing,
  LibrarySeed,
  renderSourcingPrompt,
} from '../domain/library-sourcing';
import { bindStructuredSeed } from '../domain/structured-seed-binding';
import { readLibraryWorkbook } from '../infrastructure/library-workbook.reader';
import { adaptSchemaForOpenAiStrict } from '../infrastructure/openrouter-ai.provider';
import { EngineLibraryAnchorDocument } from '../schemas/engine-library-anchor.schema';
import { EngineLibraryHookDocument } from '../schemas/engine-library-hook.schema';
import { EngineLibraryRowDocument } from '../schemas/engine-library-row.schema';
import {
  CandidateGeneratorService,
  CLOSEST_CANDIDATE_SCHEMA,
  schemaWithAnchorBank,
} from './candidate-generator.service';
import { DeterministicScreenService } from './deterministic-screen.service';
import { LibraryImportService } from './library-import.service';
import { LibrarySourcingService } from './library-sourcing.service';

type Sheet = Record<string, string | number>;

const ANCHORS: Sheet[] = [
  {
    id: 'A-1',
    label_ar: 'أول ألبوم',
    year: 1990,
    source_url: 'https://example.com/a',
  },
  {
    id: 'A-2',
    label_ar: 'آخر ألبوم',
    year: 2020,
    source_url: 'https://example.com/b',
  },
  { id: 'A-3', label_ar: 'بلا تاريخ' },
];

const example = (over: Sheet = {}): Sheet => ({
  id: 'CEL-1',
  scope: 'arab-music-stars',
  celebrity: 'مغن',
  fit: 'Closest (سنة)',
  question_example: 'في أي عام صدر الألبوم؟',
  answer: '2005',
  answer_numeric: 2005,
  source_url: 'https://example.com/row',
  confidence: 'high',
  review_status: 'APPROVED',
  interaction_mode: 'between-anchors',
  anchor_left: 'أول ألبوم',
  anchor_right: 'آخر ألبوم',
  anchor_years_internal: '1990-2020',
  range_min: 1990,
  range_max: 2020,
  ...over,
});

const celebrityWorkbook = async (
  rows: Sheet[],
  anchors: Sheet[] | null = ANCHORS,
  extra: string[] = [],
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const columns = [...LIBRARY_EXAMPLE_COLUMNS, ...extra];
  const sheet = workbook.addWorksheet('Examples');
  sheet.addRow(columns);
  for (const row of rows) {
    sheet.addRow(columns.map((column) => row[column] ?? null));
  }
  if (anchors) {
    const bank = workbook.addWorksheet('Anchors');
    bank.addRow([...LIBRARY_ANCHOR_COLUMNS]);
    for (const row of anchors) {
      bank.addRow(LIBRARY_ANCHOR_COLUMNS.map((column) => row[column] ?? null));
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const footballRow = (id: string) => ({
  id,
  question: 'س؟',
  world: 'football',
  scope: 'saudi-league',
  scope_status: 'MATCH',
  akwaan_fit: 'RYO',
  asof_needed: 'N',
  role: 'FACT_SEED',
  review_status: 'APPROVED',
  verified_answer: 'ج',
  source_url: 'https://example.com/f',
  verified_on: '2026-11-01',
});

const libraryWorkbook = async (ids: string[]): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Hooks').addRow([...LIBRARY_HOOK_COLUMNS]);
  const sheet = workbook.addWorksheet('Library');
  sheet.addRow([...LIBRARY_REQUIRED_COLUMNS]);
  for (const id of ids) {
    const row: Record<string, string> = footballRow(id);
    sheet.addRow(LIBRARY_REQUIRED_COLUMNS.map((column) => row[column] ?? null));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const collection = (idField: string) => {
  const docs = new Map<string, Record<string, any>>();
  const query = (rows: unknown[]) => ({
    sort: () => query(rows),
    lean: () => ({ exec: () => Promise.resolve(rows) }),
  });
  const model = {
    find: (filter: Record<string, unknown>) =>
      query(
        [...docs.values()].filter((doc) =>
          Object.entries(filter).every(([key, value]) => {
            const held = doc[key];
            return Array.isArray(held) ? held.includes(value) : held === value;
          }),
        ),
      ),
    bulkWrite: (ops: Array<{ updateOne: { update: { $set: any } } }>) => {
      for (const op of ops) {
        docs.set(op.updateOne.update.$set[idField], op.updateOne.update.$set);
      }
      return Promise.resolve();
    },
    updateMany: (filter: Record<string, { $in: string[] }>) => {
      for (const id of filter[idField].$in) docs.get(id)!.retired = true;
      return Promise.resolve();
    },
  };
  return { docs, model };
};

const library = () => {
  const rows = collection('libraryId');
  const hooks = collection('hookId');
  const anchors = collection('anchorId');
  return {
    rows,
    hooks,
    anchors,
    service: new LibraryImportService(
      rows.model as unknown as Model<EngineLibraryRowDocument>,
      hooks.model as unknown as Model<EngineLibraryHookDocument>,
      anchors.model as unknown as Model<EngineLibraryAnchorDocument>,
    ),
  };
};

describe('importing the Celebrities workbook', () => {
  it('maps the sheet names onto the code names', async () => {
    const { rows, anchors } = await readLibraryWorkbook(
      await celebrityWorkbook([example()]),
    );
    expect(rows[0]).toMatchObject({
      libraryId: 'CEL-1',
      sourceSheet: 'Examples',
      worldKey: 'celebrities',
      scopeKey: 'arab-music-stars',
      questionText: 'في أي عام صدر الألبوم؟',
      canonicalNumber: 2005,
      mechanicKeys: ['closest'],
      closest: {
        mode: 'between-anchors',
        min: 1990,
        max: 2020,
        step: null,
        leftAnchor: 'أول ألبوم',
        rightAnchor: 'آخر ألبوم',
      },
    });
    expect(anchors?.map((anchor) => anchor.anchorId)).toEqual([
      'A-1',
      'A-2',
      'A-3',
    ]);
  });

  it('reads an optional anchor_step', async () => {
    const { rows } = await readLibraryWorkbook(
      await celebrityWorkbook([example({ anchor_step: 5 })], ANCHORS, [
        'anchor_step',
      ]),
    );
    expect(rows[0].closest?.step).toBe(5);
  });

  it('keeps anchor_years_internal out of the scale', async () => {
    const { rows } = await readLibraryWorkbook(
      await celebrityWorkbook([example()]),
    );
    expect(JSON.stringify(rows[0].closest)).not.toContain('1990-2020');
    expect(rows[0].raw.anchor_years_internal).toBe('1990-2020');
  });

  it('accepts a numeric-range row with no anchors', async () => {
    const { rows } = await readLibraryWorkbook(
      await celebrityWorkbook(
        [
          example({
            interaction_mode: 'numeric-range',
            anchor_left: '',
            anchor_right: '',
          }),
        ],
        null,
      ),
    );
    expect(rows[0].closest).toMatchObject({
      mode: 'numeric-range',
      leftAnchor: null,
    });
  });

  it('stays gated until the sheet says MATCH and gives a date', async () => {
    const gated = await readLibraryWorkbook(
      await celebrityWorkbook([example()]),
    );
    expect(gated.rows[0].scopeStatus).toBe('NEW_SCOPE');
    expect(isLibraryRowGenerationEligible(gated.rows[0])).toBe(false);

    const undated = await readLibraryWorkbook(
      await celebrityWorkbook([example({ scope_status: 'MATCH' })], ANCHORS, [
        'scope_status',
      ]),
    );
    expect(isLibraryRowGenerationEligible(undated.rows[0])).toBe(false);

    const ready = await readLibraryWorkbook(
      await celebrityWorkbook(
        [example({ scope_status: 'MATCH', verified_on: '2026-11-01' })],
        ANCHORS,
        ['scope_status', 'verified_on'],
      ),
    );
    expect(isLibraryRowGenerationEligible(ready.rows[0])).toBe(true);
  });

  it.each([
    [
      'an anchor outside the bank',
      { anchor_left: 'مرجع مخترع' },
      'CLOSEST_ANCHOR_NOT_IN_BANK',
    ],
    [
      'a range that is not the anchors',
      { range_min: 1980 },
      'CLOSEST_ANCHOR_VALUE_MISMATCH',
    ],
    [
      'a target on an anchor',
      { answer_numeric: 1990 },
      'CLOSEST_TARGET_NOT_BRACKETED',
    ],
    [
      'a target outside the anchors',
      { answer_numeric: 2030 },
      'CLOSEST_TARGET_NOT_BRACKETED',
    ],
    [
      'the same anchor twice',
      { anchor_right: 'أول ألبوم' },
      'CLOSEST_ANCHOR_INVALID',
    ],
    ['a missing anchor', { anchor_right: '' }, 'CLOSEST_ANCHOR_REQUIRED'],
    [
      'an answer with no number',
      { answer_numeric: '', answer: 'اسم' },
      'needs a numeric answer',
    ],
    [
      'an inverted range',
      { range_min: 2020, range_max: 1990 },
      'range_min below range_max',
    ],
    ['an unknown mode', { interaction_mode: 'free' }, 'interaction_mode'],
  ])('refuses %s', async (_label, over, message) => {
    await expect(
      readLibraryWorkbook(await celebrityWorkbook([example(over)])),
    ).rejects.toThrow(message);
  });

  it('refuses an anchored row when the file has no bank', async () => {
    await expect(
      readLibraryWorkbook(await celebrityWorkbook([example()], null)),
    ).rejects.toThrow('CLOSEST_ANCHOR_NOT_IN_BANK');
  });

  it('refuses a numeric-range answer outside its range', async () => {
    await expect(
      readLibraryWorkbook(
        await celebrityWorkbook([
          example({ interaction_mode: 'numeric-range', answer_numeric: 2030 }),
        ]),
      ),
    ).rejects.toThrow('outside the range');
  });

  it('stores a parked sketch without judging it', async () => {
    const { rows } = await readLibraryWorkbook(
      await celebrityWorkbook([
        example({ review_status: 'PARK', anchor_left: 'مرجع مخترع' }),
      ]),
    );
    expect(rows[0].closest).toBeNull();
  });

  it('refuses a workbook with neither row sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Anchors').addRow([...LIBRARY_ANCHOR_COLUMNS]);
    await expect(
      readLibraryWorkbook(Buffer.from(await workbook.xlsx.writeBuffer())),
    ).rejects.toThrow('missing sheet "Library"');
  });
});

describe('re-importing across workbooks', () => {
  it('never retires football rows or hooks from a Celebrities file', async () => {
    const { service, rows } = library();
    await service.importWorkbook(
      await readLibraryWorkbook(await libraryWorkbook(['LIB-1', 'LIB-2'])),
    );
    const outcome = await service.importWorkbook(
      await readLibraryWorkbook(await celebrityWorkbook([example()])),
    );
    expect(outcome).toMatchObject({ created: 1, retired: 0 });
    expect(rows.docs.get('LIB-1')?.retired).toBe(false);
    expect(rows.docs.get('LIB-2')?.retired).toBe(false);
  });

  it('never retires Celebrities rows from a football file', async () => {
    const { service, rows, anchors } = library();
    await service.importWorkbook(
      await readLibraryWorkbook(await celebrityWorkbook([example()])),
    );
    await service.importWorkbook(
      await readLibraryWorkbook(await libraryWorkbook(['LIB-1'])),
    );
    expect(rows.docs.get('CEL-1')?.retired).toBe(false);
    expect(anchors.docs.get('A-1')?.retired).toBe(false);
  });

  it('still retires a row its own sheet dropped', async () => {
    const { service, rows } = library();
    await service.importWorkbook(
      await readLibraryWorkbook(
        await celebrityWorkbook([example(), example({ id: 'CEL-2' })]),
      ),
    );
    await service.importWorkbook(
      await readLibraryWorkbook(await celebrityWorkbook([example()])),
    );
    expect(rows.docs.get('CEL-2')?.retired).toBe(true);
    expect(rows.docs.get('CEL-1')?.retired).toBe(false);
  });

  it('retires a dropped anchor, and offers only valued ones', async () => {
    const { service } = library();
    await service.importWorkbook(
      await readLibraryWorkbook(await celebrityWorkbook([example()])),
    );
    const bank = async () =>
      (await service.findAnchorBank('celebrities')).map((a) => a.anchorId);
    expect(await bank()).toEqual(['A-1', 'A-2']);

    await service.importWorkbook(
      await readLibraryWorkbook(
        await celebrityWorkbook(
          [example({ review_status: 'PARK' })],
          ANCHORS.slice(0, 1),
        ),
      ),
    );
    expect(await bank()).toEqual(['A-1']);
  });

  it('serves a bank only to its own World', async () => {
    const { service } = library();
    await service.importWorkbook(
      await readLibraryWorkbook(await celebrityWorkbook([example()])),
    );
    expect(await service.findAnchorBank('football')).toEqual([]);
  });
});

const BANK: AnchorBankEntry[] = [
  { anchorId: 'A-1', labelAr: 'أول ألبوم', value: 1990 },
  { anchorId: 'A-2', labelAr: 'آخر ألبوم', value: 2020 },
];

describe('closestAnchorIssues', () => {
  const base = {
    leftAnchor: 'أول ألبوم',
    rightAnchor: 'آخر ألبوم',
    min: 1990,
    max: 2020,
    target: 2005,
    bank: BANK.map(({ labelAr, value }) => ({ labelAr, value })),
  };
  const codes = (over = {}) =>
    closestAnchorIssues({ ...base, ...over }).map((issue) => issue.code);

  it('passes a good scale', () => {
    expect(codes()).toEqual([]);
  });

  it('matches bank labels after normalization', () => {
    expect(codes({ leftAnchor: 'اول البوم' })).toEqual([]);
  });

  it.each([1990, 2020])('rejects a target equal to the anchor %s', (target) => {
    expect(codes({ target })).toContain('CLOSEST_TARGET_NOT_BRACKETED');
  });

  it('rejects a label that states the target', () => {
    const bank = [
      { labelAr: 'ألبوم 2005', value: 1990 },
      { labelAr: 'آخر ألبوم', value: 2020 },
    ];
    expect(codes({ leftAnchor: 'ألبوم 2005', bank })).toContain(
      'CLOSEST_ANCHOR_LEAKS_TARGET',
    );
  });

  it.each([
    ['ألبوم ٢٠٠٥', 2005],
    ['جائزة 1,024', 1024],
    ['جائزة ١٬٠٢٤', 1024],
  ])('reads %s as stating the target', (label, target) => {
    expect(anchorLabelLeaksTarget(label, target)).toBe(true);
  });

  it('does not read a different number as a leak', () => {
    expect(anchorLabelLeaksTarget('ألبوم 2004', 2005)).toBe(false);
  });

  it('skips only the bank rules when there is no bank', () => {
    expect(codes({ bank: undefined, leftAnchor: 'مرجع آخر' })).toEqual([]);
    expect(codes({ bank: undefined, target: 1990 })).toContain(
      'CLOSEST_TARGET_NOT_BRACKETED',
    );
  });
});

describe('the writer', () => {
  const generator = () =>
    new CandidateGeneratorService(
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
    );
  const item = (over: Record<string, unknown> = {}) => ({
    concept: 'c',
    answerBasis: 'knowledge-anchored',
    playerReasoningStrategy: 's',
    prompt: 'في أي عام صدر هذا الألبوم الشهير؟',
    domainDescription: 'd',
    min: 1,
    max: 2,
    step: 1,
    correctValue: 2005,
    stepsFromMin: 15,
    unit: null,
    displayFormat: null,
    factualClaims: ['claim'],
    ...over,
  });
  const parse = (candidate: unknown, anchorBank = BANK) =>
    generator().parse(
      JSON.stringify({ candidates: [candidate] }),
      1,
      'closest',
      { anchorBank },
    )[0].draft as any;

  it('limits anchors to the bank through the schema', () => {
    const schema = schemaWithAnchorBank(CLOSEST_CANDIDATE_SCHEMA, BANK) as any;
    const items = schema.properties.candidates.items;
    expect(items.properties.leftAnchorId.enum).toEqual(['A-1', 'A-2', null]);
    expect(items.properties.rightAnchorId.enum).toEqual(['A-1', 'A-2', null]);
    expect(items.required).toEqual(
      expect.arrayContaining([
        'interactionMode',
        'leftAnchorId',
        'rightAnchorId',
      ]),
    );
  });

  it('survives the strict OpenAI schema adapter', () => {
    const adapted = JSON.stringify(
      adaptSchemaForOpenAiStrict(
        schemaWithAnchorBank(CLOSEST_CANDIDATE_SCHEMA, BANK),
      ),
    );
    expect(adapted).toContain('"leftAnchorId"');
    expect(adapted).toContain('"A-2"');
  });

  it('leaves the base schema untouched', () => {
    const before = JSON.stringify(CLOSEST_CANDIDATE_SCHEMA);
    schemaWithAnchorBank(CLOSEST_CANDIDATE_SCHEMA, BANK);
    expect(JSON.stringify(CLOSEST_CANDIDATE_SCHEMA)).toBe(before);
    expect(before).not.toContain('interactionMode');
  });

  it('takes labels and range from the bank, never from the model', () => {
    const { mechanicPayload } = parse(
      item({
        interactionMode: 'between-anchors',
        leftAnchorId: 'A-1',
        rightAnchorId: 'A-2',
      }),
    );
    expect(mechanicPayload.closestSlider).toEqual({
      mode: 'between-anchors',
      min: 1990,
      max: 2020,
      step: 1,
      leftAnchor: 'أول ألبوم',
      rightAnchor: 'آخر ألبوم',
    });
  });

  it('does not lose a paid batch to an unknown anchor id', () => {
    const { mechanicPayload } = parse(
      item({
        interactionMode: 'between-anchors',
        leftAnchorId: 'A-9',
        rightAnchorId: 'A-2',
      }),
    );
    expect(mechanicPayload.closestSlider.leftAnchor).toBe('A-9');
  });

  it('keeps numeric-range output identical with or without a bank', () => {
    const numeric = item({ min: 1990, max: 2020, unit: 'عام' });
    const withBank = parse({
      ...numeric,
      interactionMode: 'numeric-range',
      leftAnchorId: null,
      rightAnchorId: null,
    });
    expect(withBank).toEqual(parse(numeric, []));
    expect(withBank.mechanicPayload.closestSlider).toEqual({
      mode: 'numeric-range',
      min: 1990,
      max: 2020,
      step: 1,
      unit: 'عام',
    });
  });
});

describe('the screen', () => {
  const screen = new DeterministicScreenService({
    get: () => undefined,
  } as never);
  const draft = (slider: Record<string, unknown>, correctValue = 2005) => ({
    prompt: { ar: 'في أي عام صدر هذا الألبوم الشهير؟' },
    answerPayload: { mode: 'closest', correctValue },
    mechanicPayload: { closestSlider: { step: 1, ...slider } },
  });
  const anchored = {
    mode: 'between-anchors',
    min: 1990,
    max: 2020,
    leftAnchor: 'أول ألبوم',
    rightAnchor: 'آخر ألبوم',
  };
  const codes = (
    item: ReturnType<typeof draft>,
    anchorBank?: AnchorBankEntry[],
  ) =>
    screen
      .screen(item, null, {
        session: screen.createSession({ anchorBank }),
      })
      .findings.filter((finding) => finding.severity === 'blocking')
      .map((finding) => finding.code);

  it('passes a good anchored candidate', () => {
    expect(codes(draft(anchored), BANK)).toEqual([]);
  });

  it('blocks an anchor outside the pinned bank', () => {
    expect(codes(draft({ ...anchored, leftAnchor: 'A-9' }), BANK)).toContain(
      'CLOSEST_ANCHOR_NOT_IN_BANK',
    );
  });

  it('blocks any anchor on a sourced job whose World has no bank', () => {
    expect(codes(draft(anchored), [])).toContain('CLOSEST_ANCHOR_NOT_IN_BANK');
  });

  it('blocks a target on an anchor', () => {
    expect(codes(draft(anchored, 1990), BANK)).toContain(
      'CLOSEST_TARGET_NOT_BRACKETED',
    );
  });

  it('blocks a range edited away from the anchors', () => {
    expect(codes(draft({ ...anchored, min: 1980 }), BANK)).toContain(
      'CLOSEST_ANCHOR_VALUE_MISMATCH',
    );
  });

  it('does not touch a numeric-range candidate', () => {
    expect(
      codes(draft({ mode: 'numeric-range', min: 1990, max: 2020 }), []),
    ).toEqual([]);
  });
});

describe('binding by value on the same scale', () => {
  const seed = (over: Partial<LibrarySeed> = {}): LibrarySeed => ({
    libraryId: 'CEL-1',
    role: 'FACT_SEED',
    questionText: 'في أي عام صدر الألبوم؟',
    verifiedAnswer: '2005',
    canonicalAnswer: '2005',
    canonicalNumber: 2005,
    sourceUrl: 'https://example.com',
    verifiedOn: '2026-11-01',
    revalidateAfter: null,
    sourceWarning: null,
    closest: {
      mode: 'between-anchors',
      min: 1990,
      max: 2020,
      step: null,
      leftAnchor: 'أول ألبوم',
      rightAnchor: 'آخر ألبوم',
    },
    ...over,
  });
  const draft = (slider: Record<string, unknown>, correctValue = 2005) => ({
    prompt: { ar: 'متى صدر الألبوم؟' },
    answerPayload: { mode: 'closest', correctValue },
    mechanicPayload: { closestSlider: slider },
  });
  const same = {
    mode: 'between-anchors',
    min: 1990,
    max: 2020,
    leftAnchor: 'أول ألبوم',
    rightAnchor: 'آخر ألبوم',
  };
  const bind = (item: ReturnType<typeof draft>, row = seed()) =>
    bindStructuredSeed({ draft: item, seeds: [row], today: '2026-11-02' });

  it('covers the same value on the same scale', () => {
    expect(bind(draft(same))).toMatchObject({ covered: true });
  });

  it.each([
    ['another left anchor', { ...same, leftAnchor: 'مرجع آخر' }],
    ['another range', { ...same, max: 2025 }],
    ['a numeric slider', { mode: 'numeric-range', min: 1990, max: 2020 }],
  ])('does not cover %s', (_label, slider) => {
    expect(bind(draft(slider))).toEqual({
      covered: false,
      reason: 'SCALE_CHANGED',
      libraryId: 'CEL-1',
    });
  });

  it('does not cover a changed value', () => {
    expect(bind(draft(same, 2006))).toMatchObject({
      covered: false,
      reason: 'ANSWER_CHANGED',
    });
  });

  it('leaves a numeric library row on value alone', () => {
    expect(
      bind(
        draft({ mode: 'numeric-range', min: 0, max: 3000 }),
        seed({ closest: undefined }),
      ),
    ).toMatchObject({ covered: true });
  });
});

describe('pinning the bank to a job', () => {
  const spec = (mechanicKey: string) =>
    buildGenerationSpecification({
      context: {
        worldKey: 'celebrities',
        scopeKey: 'arab-music-stars',
        mechanicKey,
        contextHash: 'c'.repeat(64),
        effectiveRules: { digest: 'd'.repeat(64) } as never,
      },
      targetCount: 10,
      difficulty: mechanicKey === 'closest' ? undefined : 'mixed',
    });

  const planned = async (mechanicKey: string) => {
    const { service } = library();
    await service.importWorkbook(
      await readLibraryWorkbook(await celebrityWorkbook([example()])),
    );
    return new LibrarySourcingService(service, {
      get: () => undefined,
    } as unknown as ConfigService).plan(spec(mechanicKey));
  };

  it('pins the bank to every Closest job', async () => {
    const plan = await planned('closest');
    expect(
      plan.specifications[0].sourcing?.anchorBank?.map((a) => a.anchorId),
    ).toEqual(['A-1', 'A-2']);
  });

  it('gives RYO no bank', async () => {
    const plan = await planned('read-your-opponent');
    expect(plan.specifications[0].sourcing?.anchorBank).toBeUndefined();
  });

  it('shows the writer the bank with no answer in it', async () => {
    const plan = await planned('closest');
    const prompt = renderSourcingPrompt(plan.specifications[0].sourcing)!;
    expect(prompt).toContain('## ANCHOR BANK');
    expect(prompt).toContain('<anchor id="A-1" value="1990">');
    expect(prompt).not.toContain('2005');
    expect(prompt).not.toContain('CEL-1');
  });

  it('adds nothing to a prompt in a World with no bank', () => {
    const sourcing: GenerationSourcing = {
      version: 1,
      mode: 'exploratory',
      batchKey: 'b',
      anchoredPercent: 70,
      batchTargetCount: 3,
      fallbackReason: null,
      slots: [],
      seeds: [],
      hooks: [],
    };
    expect(renderSourcingPrompt(sourcing)).toBeNull();
  });

  it('keeps a pinned spec valid', async () => {
    const plan = await planned('closest');
    const pinned = specificationForSourcing(
      spec('closest'),
      plan.specifications[0].sourcing!,
      10,
    );
    expect(pinned.sourcing?.anchorBank).toHaveLength(2);
  });
});
