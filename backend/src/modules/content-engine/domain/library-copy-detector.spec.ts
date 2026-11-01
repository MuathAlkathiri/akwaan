import { readFileSync } from 'fs';
import { join } from 'path';
import { readLibraryWorkbook } from '../infrastructure/library-workbook.reader';
import {
  LIBRARY_COPY_CASES,
  LibraryCopyCase,
} from '../testing/library-copy-cases';
import { LIBRARY_COPY_HOLDOUT } from '../testing/library-copy-holdout';
import { LibraryRow } from './library-row';
import {
  charSimilarity,
  contentTokens,
  DEFAULT_LIBRARY_COPY_THRESHOLD,
  entityTokens,
  findLibraryCopy,
  resolveLibraryCopyThreshold,
  sharesEntity,
  textSimilarity,
  wordSimilarity,
} from './library-copy-detector';
import { LibrarySeed } from './library-sourcing';

const FIXTURE = join(__dirname, '../testing/fixtures/akwaan_library_v1.xlsx');
const THRESHOLD = DEFAULT_LIBRARY_COPY_THRESHOLD;

const seedOf = (row: LibraryRow): LibrarySeed => ({
  libraryId: row.libraryId,
  role: row.role,
  questionText: row.questionText,
  verifiedAnswer: row.verifiedAnswer!,
  canonicalAnswer: row.canonicalAnswer,
  canonicalNumber: row.canonicalNumber,
  sourceUrl: row.sourceUrl!,
  verifiedOn: row.verifiedOn!,
  revalidateAfter: row.revalidateAfter,
  sourceWarning: row.sourceWarning,
});

const draftFor = (answer: string | number, prompt: string) =>
  typeof answer === 'number'
    ? {
        prompt: { ar: prompt },
        answerPayload: { mode: 'closest', correctValue: answer },
      }
    : {
        prompt: { ar: prompt },
        answerPayload: {
          mode: 'multiple_choice',
          correctOptionId: 'a',
          options: [
            { id: 'a', label: { ar: answer } },
            { id: 'b', label: { ar: 'خيار آخر' } },
          ],
        },
      };

describe('contentTokens', () => {
  it('folds spelling, diacritics, digits and clitics', () => {
    expect(contentTokens('بالدوريّ السعودي')).toEqual(
      contentTokens('الدوري السعودي'),
    );
    expect(contentTokens('والهلال')).toEqual(contentTokens('هلال'));
    expect(contentTokens('موسم ٢٠٢٣')).toEqual(contentTokens('موسم 2023'));
    expect(contentTokens('إبراهيموفيتش')).toEqual(
      contentTokens('ابراهيموفيتش'),
    );
  });

  it('does not mangle names that merely start like a clitic', () => {
    expect(contentTokens('فيفي')).toEqual(['فيفي']);
    expect(contentTokens('فريق')).toEqual(['فريق']);
  });

  it('drops question scaffolding, including dialect', () => {
    expect(contentTokens('ما هو اسم سفينة شانكس؟')).toEqual(
      contentTokens('وش اسم سفينة شانكس؟'),
    );
  });
});

describe('similarity', () => {
  const tokens = contentTokens('من سجل هدف الاتحاد الرابع');

  it('is 1 for identical text and 0 for nothing shared', () => {
    expect(wordSimilarity(tokens, tokens)).toBe(1);
    expect(charSimilarity(tokens, tokens)).toBe(1);
    expect(textSimilarity('شانكس', 'كاتاكوري')).toBe(0);
  });

  it('survives reordering through the character signal', () => {
    expect(
      textSimilarity('ريد فورس سفينة شانكس', 'شانكس سفينة ريد فورس'),
    ).toBeGreaterThan(0.5);
  });

  it('handles empty text', () => {
    expect(textSimilarity('', 'شانكس')).toBe(0);
    expect(entityTokens('من هو؟')).toEqual([]);
    expect(sharesEntity('من هو؟', 'من هو؟')).toBe(false);
  });
});

describe('findLibraryCopy on the real rows', () => {
  let rows: Map<string, LibrarySeed>;

  beforeAll(async () => {
    const workbook = await readLibraryWorkbook(readFileSync(FIXTURE));
    rows = new Map(
      workbook.rows
        .filter((row) => row.reviewStatus === 'APPROVED')
        .map((row) => [row.libraryId, seedOf(row)]),
    );
  });

  const verdicts = (cases: LibraryCopyCase[], key: 'copies' | 'angles') =>
    cases.flatMap((entry) =>
      entry[key].map((prompt) => ({
        libraryId: entry.libraryId,
        prompt,
        rejected:
          findLibraryCopy(
            draftFor(entry.answer, prompt),
            [rows.get(entry.libraryId)!],
            THRESHOLD,
          ) !== null,
      })),
    );

  it('covers every row that can anchor RYO or Closest today', () => {
    expect(LIBRARY_COPY_CASES.map((entry) => entry.libraryId)).toEqual([
      'LIB-009',
      'LIB-017',
      'LIB-018',
      'LIB-019',
      'LIB-020',
      'LIB-021',
      'LIB-027',
      'LIB-029',
      'LIB-057',
      'LIB-058',
      'LIB-059',
      'LIB-061',
      'LIB-069',
    ]);
  });

  it('rejects every light paraphrase', () => {
    expect(
      verdicts(LIBRARY_COPY_CASES, 'copies').filter((v) => !v.rejected),
    ).toEqual([]);
  });

  it('passes every different question about the same fact', () => {
    expect(
      verdicts(LIBRARY_COPY_CASES, 'angles').filter((v) => v.rejected),
    ).toEqual([]);
  });

  /**
   * Known limits, pinned so a threshold or vocabulary change shows up here.
   * This batch was never tuned against.
   */
  it('misses these heavier rewrites', () => {
    expect(
      verdicts(LIBRARY_COPY_HOLDOUT, 'copies')
        .filter((v) => !v.rejected)
        .map((v) => v.libraryId),
    ).toEqual(['LIB-057', 'LIB-057', 'LIB-059', 'LIB-059', 'LIB-061']);
  });

  it('wrongly rejects these close variants', () => {
    expect(
      verdicts(LIBRARY_COPY_HOLDOUT, 'angles')
        .filter((v) => v.rejected)
        .map((v) => v.libraryId),
    ).toEqual(['LIB-009', 'LIB-057']);
  });

  it('needs all three signals', () => {
    const seed = rows.get('LIB-069')!;
    expect(
      findLibraryCopy(draftFor(96, seed.questionText), [seed], THRESHOLD),
    ).toMatchObject({ libraryId: 'LIB-069', similarity: 1 });
    // Same text, different answer: a changed fact, for fact verification.
    expect(
      findLibraryCopy(draftFor(95, seed.questionText), [seed], THRESHOLD),
    ).toBeNull();
  });

  it('honours a stricter threshold', () => {
    const seed = rows.get('LIB-061')!;
    const prompt = 'اجتماع الريفيري يحضره كم ملك؟';
    expect(findLibraryCopy(draftFor(50, prompt), [seed], 0.5)).not.toBeNull();
    expect(findLibraryCopy(draftFor(50, prompt), [seed], 0.95)).toBeNull();
  });
});

describe('resolveLibraryCopyThreshold', () => {
  const config = (value?: string) => ({ get: () => value }) as never;

  it('defaults to the chosen threshold', () => {
    expect(resolveLibraryCopyThreshold(config())).toBe(0.5);
  });

  it('reads the configured value', () => {
    expect(resolveLibraryCopyThreshold(config('0.6'))).toBe(0.6);
  });

  it.each(['0', '-1', '1.5', 'high'])('refuses %s', (value) => {
    expect(() => resolveLibraryCopyThreshold(config(value))).toThrow(
      'ENGINE_LIBRARY_COPY_THRESHOLD',
    );
  });
});
