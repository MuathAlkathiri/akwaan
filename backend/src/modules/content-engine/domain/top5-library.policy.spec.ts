import { readFileSync } from 'fs';
import { join } from 'path';
import { readLibraryWorkbook } from '../infrastructure/library-workbook.reader';
import { LibraryRow } from './library-row';
import {
  LibraryTop5Candidate,
  LibraryTop5IssueCode,
  rankLibraryTop5,
  top5CandidateFromRow,
  validateLibraryTop5,
  validateLibraryTop5Row,
} from './top5-library.policy';

const FIXTURE = join(__dirname, '../testing/fixtures/akwaan_library_v1.xlsx');

const rows = async (): Promise<LibraryRow[]> =>
  (await readLibraryWorkbook(readFileSync(FIXTURE))).rows;

const bySource = async (sourceRef: string): Promise<LibraryRow> =>
  (await rows()).find((row) => row.sourceRef === sourceRef)!;

const byId = async (libraryId: string): Promise<LibraryRow> =>
  (await rows()).find((row) => row.libraryId === libraryId)!;

const codes = (
  candidate: LibraryTop5Candidate,
  row: LibraryRow,
): LibraryTop5IssueCode[] =>
  validateLibraryTop5(candidate, row).map((found) => found.code);

const replaceEntry = (
  candidate: LibraryTop5Candidate,
  index: number,
  label: string,
): LibraryTop5Candidate => ({
  ...candidate,
  entries: candidate.entries.map((entry, i) =>
    i === index ? { ...entry, label } : entry,
  ),
});

describe('valid library Top-5 content', () => {
  it.each([
    ['B·s40', 'runners-up'],
    ['B·s41', 'Super Cup winners'],
  ])('accepts %s (%s)', async (sourceRef) => {
    const row = await bySource(sourceRef);
    const candidate = top5CandidateFromRow(row)!;
    expect(candidate.entries).toHaveLength(10);
    expect(validateLibraryTop5(candidate, row)).toEqual([]);
  });

  it('accepts LIB-074, whose open window reads "since 2020-21"', async () => {
    const row = await byId('LIB-074');
    expect(validateLibraryTop5(top5CandidateFromRow(row)!, row)).toEqual([]);
  });

  it('holds for every approved Top-5 row in the library', async () => {
    const approved = (await rows()).filter(
      (row) =>
        row.reviewStatus === 'APPROVED' && row.mechanicKeys.includes('top-5'),
    );
    expect(approved.map((row) => row.libraryId)).toEqual([
      'LIB-035',
      'LIB-074',
      'LIB-076',
      'LIB-077',
      'LIB-078',
    ]);
    for (const row of approved) {
      expect(validateLibraryTop5Row(row)).toEqual([]);
    }
  });
});

describe('invalid library Top-5 content', () => {
  it('rejects four correct answers and six traps', async () => {
    const row = await bySource('B·s40');
    const candidate = top5CandidateFromRow(row)!;
    const entries = candidate.entries.map((entry, index) =>
      index === 4 ? { ...entry, rank: null } : entry,
    );
    expect(codes({ ...candidate, entries }, row)).toEqual(
      expect.arrayContaining([
        'TOP5_CORRECT_COUNT_INVALID',
        'TOP5_TRAP_COUNT_INVALID',
      ]),
    );
  });

  it('rejects a list of nine', async () => {
    const row = await bySource('B·s40');
    const candidate = top5CandidateFromRow(row)!;
    expect(
      codes({ ...candidate, entries: candidate.entries.slice(0, 9) }, row),
    ).toEqual(
      expect.arrayContaining([
        'TOP5_ENTRY_COUNT_INVALID',
        'TOP5_TRAP_COUNT_INVALID',
      ]),
    );
  });

  it('rejects a trap outside the approved list, however plausible', async () => {
    const row = await bySource('B·s41');
    expect(
      codes(replaceEntry(top5CandidateFromRow(row)!, 9, 'برشلونة'), row),
    ).toContain('TOP5_TRAP_NOT_APPROVED');
  });

  it('rejects a trap that is really a correct answer', async () => {
    const row = await bySource('B·s41');
    const candidate = top5CandidateFromRow(row)!;
    const winner = candidate.entries[0].label;
    expect(codes(replaceEntry(candidate, 9, winner), row)).toEqual(
      expect.arrayContaining([
        'TOP5_TRAP_COULD_BE_CORRECT',
        'TOP5_DUPLICATE_ENTRY',
      ]),
    );
  });

  it('rejects a row listing the same name as answer and trap', async () => {
    const row = await bySource('B·s41');
    const broken: LibraryRow = {
      ...row,
      top5: {
        ...row.top5!,
        traps: [row.top5!.correct[0].label, ...row.top5!.traps.slice(1)],
      },
    };
    expect(validateLibraryTop5Row(broken).map((f) => f.code)).toContain(
      'TOP5_TRAP_COULD_BE_CORRECT',
    );
  });

  it('rejects a correct answer the row does not verify', async () => {
    const row = await bySource('B·s40');
    expect(
      codes(replaceEntry(top5CandidateFromRow(row)!, 0, 'البرازيل'), row),
    ).toContain('TOP5_CORRECT_NOT_IN_ROW');
  });

  it.each([
    ['no window at all', 'أي المنتخبات وصلت وصيفة كأس العالم؟'],
    ['only the start', 'أي المنتخبات وصلت وصيفة كأس العالم في 2002؟'],
    ['the wrong window', 'أي المنتخبات وصلت وصيفة كأس العالم بين 2010 و2026؟'],
  ])('rejects a question stating %s', async (_label, prompt) => {
    const row = await bySource('B·s40');
    expect(codes({ ...top5CandidateFromRow(row)!, prompt }, row)).toContain(
      'TOP5_WINDOW_MISSING',
    );
  });

  it('accepts a window stated in Arabic digits', async () => {
    const row = await bySource('B·s40');
    expect(
      codes(
        {
          ...top5CandidateFromRow(row)!,
          prompt: 'أي المنتخبات وصلت وصيفة كأس العالم بين ٢٠٠٢ و٢٠٢٦؟',
        },
        row,
      ),
    ).toEqual([]);
  });

  it.each([
    ['اختر المنتخبات بين 2002 و2026'],
    ['المنتخبات الوصيفة بين 2002 و2026 (5 من 10)'],
    ['المنتخبات الوصيفة بين 2002 و2026 (٥ من ١٠)'],
    ['رتب المنتخبات الوصيفة بين 2002 و2026'],
    ['تجنب الفخاخ: المنتخبات الوصيفة بين 2002 و2026'],
  ])('rejects mechanic wording in "%s"', async (prompt) => {
    const row = await bySource('B·s40');
    expect(codes({ ...top5CandidateFromRow(row)!, prompt }, row)).toContain(
      'TOP5_FORBIDDEN_WORDING',
    );
  });

  it.each([
    'أصحاب المرتبة الثانية في كأس العالم بين 2002 و2026',
    'اختراع جديد؟ وصيف كأس العالم بين 2002 و2026',
  ])('does not mistake ordinary words in "%s"', async (prompt) => {
    const row = await bySource('B·s40');
    expect(codes({ ...top5CandidateFromRow(row)!, prompt }, row)).toEqual([]);
  });

  it.each(['فرنسا (2022)', 'فرنسا 2022', 'فرنسا ٢٠٢٢'])(
    'rejects the card label "%s"',
    async (label) => {
      const row = await bySource('B·s40');
      expect(
        codes(replaceEntry(top5CandidateFromRow(row)!, 1, label), row),
      ).toContain('TOP5_LABEL_NOT_CARD_SAFE');
    },
  );

  it('keeps a game title number on its card', async () => {
    const row = await byId('LIB-035');
    expect(validateLibraryTop5(top5CandidateFromRow(row)!, row)).toEqual([]);
    expect(
      top5CandidateFromRow(row)!.entries.map((entry) => entry.label),
    ).toContain("Baldur's Gate 3");
  });

  it('rejects correct answers ranked out of order', async () => {
    const row = await bySource('B·s40');
    const candidate = top5CandidateFromRow(row)!;
    const entries = candidate.entries.map((entry) =>
      entry.rank === 1
        ? { ...entry, rank: 2 }
        : entry.rank === 2
          ? { ...entry, rank: 1 }
          : entry,
    );
    expect(codes({ ...candidate, entries }, row)).toContain(
      'TOP5_RANK_ORDER_INVALID',
    );
  });

  it('refuses a row with no Top-5 facts', async () => {
    const row = await byId('LIB-069');
    expect(validateLibraryTop5Row(row).map((f) => f.code)).toEqual([
      'TOP5_NOT_APPLICABLE',
    ]);
  });
});

describe('rankLibraryTop5', () => {
  const labels = async (libraryId: string) => {
    const ranked = rankLibraryTop5(await byId(libraryId));
    return 'labels' in ranked ? ranked.labels : ranked;
  };

  it('ranks most recent win first', async () => {
    expect(await labels('LIB-076')).toEqual([
      'الأرجنتين',
      'فرنسا',
      'كرواتيا',
      'هولندا',
      'ألمانيا',
    ]);
  });

  it('uses the latest win of an entry with several', async () => {
    expect(await labels('LIB-078')).toEqual([
      'لاوتارو مارتينيز',
      'ريتيغوي',
      'أوسيمين',
      'إيموبيلي',
      'كريستيانو رونالدو',
    ]);
  });

  it('refuses to invent an order for a tie', () => {
    expect(
      rankLibraryTop5({
        top5: {
          window: null,
          traps: [],
          trapAttestation: null,
          correct: [
            { label: 'ألف', annotation: '2020' },
            { label: 'باء', annotation: '2020' },
          ],
        },
      }),
    ).toEqual({ unresolved: '"باء" ties on 2020' });
  });

  it('refuses an entry with no win year', () => {
    expect(
      rankLibraryTop5({
        top5: {
          window: null,
          traps: [],
          trapAttestation: null,
          correct: [{ label: 'ألف', annotation: null }],
        },
      }),
    ).toEqual({ unresolved: '"ألف" has no win year' });
  });
});
