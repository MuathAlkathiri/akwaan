import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import {
  isLibraryRowGenerationEligible,
  LibraryRow,
} from '../domain/library-row';
import {
  GenerationSourcing,
  LibrarySeed,
  renderSourcingPrompt,
} from '../domain/library-sourcing';
import { top5CandidateFromRow } from '../domain/top5-library.policy';
import { readLibraryWorkbook } from '../infrastructure/library-workbook.reader';
import { CandidateGeneratorService } from './candidate-generator.service';
import { DeterministicScreenService } from './deterministic-screen.service';

/**
 * Roadmap §5.6 (zero answer leakage) and §23.2 (real media only), checked
 * against what Parts 1-4 added. Library rows put the answer in front of the
 * writer, so these hold down the rules that must still bite afterwards.
 */

const FIXTURE = join(__dirname, '../testing/fixtures/akwaan_library_v1.xlsx');

const config = { get: () => undefined } as unknown as ConfigService;

const rows = async (): Promise<LibraryRow[]> =>
  (await readLibraryWorkbook(readFileSync(FIXTURE))).rows;

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

const ryoDraft = (prompt: string, correct: string) => ({
  prompt: { ar: prompt },
  answerPayload: {
    mode: 'multiple_choice',
    correctOptionId: 'a',
    options: [
      { id: 'a', label: { ar: correct } },
      { id: 'b', label: { ar: 'نادي الوحدة' } },
      { id: 'c', label: { ar: 'نادي الفيحاء' } },
    ],
  },
});

const screenFor = (seeds: LibrarySeed[] = []) => {
  const screen = new DeterministicScreenService(config);
  const session = screen.createSession({ librarySeeds: seeds });
  return (draft: Record<string, unknown>) =>
    screen.screen(draft, null, { session });
};

const usable = (row: LibraryRow) =>
  isLibraryRowGenerationEligible(row) &&
  row.mechanicKeys.includes('read-your-opponent');

describe('§5.6 zero answer leakage', () => {
  it('still blocks an anchored candidate whose question holds the answer', async () => {
    const row = (await rows()).find((r) => r.libraryId === 'LIB-057')!;
    const screened = screenFor([seedOf(row)])(
      ryoDraft('هل تتذكر مباراة هجر والأهلي في أغسطس 2014؟', 'هجر'),
    );
    expect(screened.passed).toBe(false);
    expect(screened.findings.map((f) => f.code)).toContain('ANSWER_LEAKAGE');
  });

  it('finds no approved RYO row that leaks its own answer', async () => {
    const leaking = (await rows())
      .filter(usable)
      .filter((row) =>
        screenFor()(
          ryoDraft(row.questionText, row.canonicalAnswer!),
        ).findings.some((f) => f.code === 'ANSWER_LEAKAGE'),
      )
      .map((row) => row.libraryId);
    expect(leaking).toEqual([]);
  });

  it('keeps Top-5 card labels free of the data that decides them', async () => {
    const top5 = (await rows()).filter(
      (row) => row.reviewStatus === 'APPROVED' && row.top5,
    );
    for (const row of top5) {
      for (const entry of top5CandidateFromRow(row)!.entries) {
        expect(entry.label).not.toMatch(/\d{4}|[()]/);
      }
    }
  });

  it('blocks a copy through the same screen, as a blocking finding', async () => {
    const row = (await rows()).find((r) => r.libraryId === 'LIB-058')!;
    const screened = screenFor([seedOf(row)])(
      ryoDraft(
        'في نهائي كأس الملك 2013، من أحرز هدف الاتحاد الرابع؟',
        'جيورجي ساندور',
      ),
    );
    expect(screened.passed).toBe(false);
    expect(screened.findings).toContainEqual(
      expect.objectContaining({
        code: 'LIBRARY_ROW_COPY',
        severity: 'blocking',
      }),
    );
  });

  it('passes a different question on the same fact', async () => {
    const row = (await rows()).find((r) => r.libraryId === 'LIB-058')!;
    const screened = screenFor([seedOf(row)])(
      ryoDraft(
        'من اللاعب المجري الذي ختم فوز الاتحاد على الشباب في نهائي 2013؟',
        'جيورجي ساندور',
      ),
    );
    expect(screened.findings.map((f) => f.code)).not.toContain(
      'LIBRARY_ROW_COPY',
    );
  });

  it('leaves jobs without pinned rows alone', async () => {
    const row = (await rows()).find((r) => r.libraryId === 'LIB-058')!;
    expect(
      screenFor()(ryoDraft(row.questionText, 'جيورجي ساندور')).findings.map(
        (f) => f.code,
      ),
    ).not.toContain('LIBRARY_ROW_COPY');
  });
});

describe('§23.2 real media only', () => {
  const sourcing = (seeds: LibrarySeed[]): GenerationSourcing => ({
    version: 1,
    mode: 'library_anchored',
    batchKey: 'b',
    anchoredPercent: 70,
    batchTargetCount: seeds.length,
    fallbackReason: null,
    slots: seeds.map((seed, slotIndex) => ({
      slotIndex,
      libraryIds: [seed.libraryId],
    })),
    seeds,
    hooks: [],
  });

  it('gives a pinned seed no media field to carry', async () => {
    const withImages = (await rows()).find((r) => r.libraryId === 'LIB-021')!;
    expect(withImages.raw.images).toBe('2');
    expect(Object.keys(seedOf(withImages))).not.toEqual(
      expect.arrayContaining(['images', 'media']),
    );
  });

  it('sends the writer no image, media or source reference', async () => {
    const seeds = (await rows()).filter(usable).map(seedOf);
    const prompt = renderSourcingPrompt(sourcing(seeds))!;
    expect(prompt).not.toMatch(/https?:|images|media|صورة/i);
  });

  it('still emits no media from the generator', () => {
    const generator = new CandidateGeneratorService(
      {} as never,
      {} as never,
      {} as never,
      config,
    );
    const [parsed] = generator.parse(
      JSON.stringify({
        candidates: [
          {
            concept: 'c',
            prompt: 'سؤال؟',
            options: [
              { id: 'a', label: 'أ' },
              { id: 'b', label: 'ب' },
            ],
            correctOptionId: 'a',
            distractorRationale: [{ optionId: 'b', why: 'w' }],
            estimatedConfidence: { band: 'even', why: 'w' },
            factualClaims: ['claim'],
            media: { type: 'image', url: 'https://ai.example/fake.png' },
          },
        ],
      }),
      1,
    );
    expect(parsed.draft).not.toHaveProperty('media');
  });
});
