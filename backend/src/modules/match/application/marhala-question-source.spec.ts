import { TOLERANT_MATCHING_ENV } from '../../../common/utils/answer-matching-activation';
import {
  C4_GUARDED_V1,
  fingerprintAnswers,
  matchAcceptedAnswer,
} from '../../../common/utils/answer-matching.util';
import type { GuardCatalogEntry } from '../../../common/utils/answer-collision-guard.util';
import type { MarhalaRuntimeQuestion } from '../../live-game-sessions/domain/marhala-gameplay.plugin';
import {
  ANSWER_GUARD_BUILD_BUDGET_MS,
  MarhalaQuestionSourceProvider,
} from './marhala-question-source';

/**
 * The guard a drawn question carries: built at draw time from the World's
 * READY catalog, a snapshot for that question, and absent — exact-only —
 * whenever it cannot be built safely and promptly.
 */
describe('MarhalaQuestionSourceProvider — answer guard at draw time', () => {
  const YUJI: MarhalaRuntimeQuestion = {
    contentItemId: 'yuji',
    scopeId: 'jjk',
    difficulty: 'easy',
    prompt: { ar: 'من هذا؟' },
    acceptedAnswers: ['يوجي', 'Yuji'],
  };
  const GOKU: GuardCatalogEntry = { id: 'goku', acceptedAnswers: ['غوكو'] };
  const TOJI: GuardCatalogEntry = { id: 'toji', acceptedAnswers: ['توجي'] };
  const self = (q: MarhalaRuntimeQuestion): GuardCatalogEntry => ({
    id: q.contentItemId,
    acceptedAnswers: q.acceptedAnswers,
  });

  const providerWith = (
    readyMatchAnswers: (worldId: string) => Promise<unknown>,
  ) => {
    const reader = { readyMatchAnswers: jest.fn(readyMatchAnswers) };
    const provider = new (
      MarhalaQuestionSourceProvider as unknown as new (
        ...args: unknown[]
      ) => MarhalaQuestionSourceProvider
    )(...new Array<unknown>(8).fill({}), reader);
    const attach = (q: MarhalaRuntimeQuestion) =>
      (
        provider as unknown as {
          withAnswerGuard: (
            question: MarhalaRuntimeQuestion,
            worldId: string,
          ) => Promise<MarhalaRuntimeQuestion>;
        }
      ).withAnswerGuard(q, 'world-anime');
    return { attach, reader };
  };

  let previous: string | undefined;
  const switchOn = () => {
    process.env[TOLERANT_MATCHING_ENV] = 'marhala';
  };
  beforeEach(() => {
    previous = process.env[TOLERANT_MATCHING_ENV];
    delete process.env[TOLERANT_MATCHING_ENV];
  });
  afterEach(() => {
    jest.useRealTimers();
    if (previous === undefined) delete process.env[TOLERANT_MATCHING_ENV];
    else process.env[TOLERANT_MATCHING_ENV] = previous;
  });

  it('reads nothing and attaches nothing while tolerance is off', async () => {
    const { attach, reader } = providerWith(() =>
      Promise.resolve([self(YUJI), TOJI]),
    );
    expect(await attach(YUJI)).toEqual(YUJI);
    expect(reader.readyMatchAnswers).not.toHaveBeenCalled();
  });

  it('attaches a current guard built from the World catalog', async () => {
    switchOn();
    const { attach, reader } = providerWith(() =>
      Promise.resolve([self(YUJI), GOKU, TOJI]),
    );
    const drawn = await attach(YUJI);
    expect(reader.readyMatchAnswers).toHaveBeenCalledWith('world-anime');
    expect(drawn.answerGuard).toMatchObject({
      policyId: C4_GUARDED_V1.id,
      answersFingerprint: fingerprintAnswers(YUJI.acceptedAnswers),
      blockedAnswers: ['توجي'],
    });
  });

  it('keeps a drawn question on its snapshot; the next draw sees new content', async () => {
    switchOn();
    let catalog: GuardCatalogEntry[] = [self(YUJI), GOKU];
    const { attach } = providerWith(() => Promise.resolve(catalog));

    const first = await attach(YUJI);
    expect(first.answerGuard!.blockedAnswers).toEqual([]);

    // Toji goes READY between two draws.
    catalog = [self(YUJI), GOKU, TOJI];
    const second = await attach(YUJI);

    // The open question is judged against what it was drawn with…
    expect(first.answerGuard!.blockedAnswers).toEqual([]);
    expect(first.answerGuard!.catalogFingerprint).not.toBe(
      second.answerGuard!.catalogFingerprint,
    );
    // …and the next one against the catalog as it stands now.
    expect(second.answerGuard!.blockedAnswers).toEqual(['توجي']);
    expect(
      matchAcceptedAnswer('توجي', second.acceptedAnswers, {
        kind: 'guarded-tolerant',
        config: C4_GUARDED_V1,
        guard: second.answerGuard!,
      }),
    ).toMatchObject({ matched: false, tolerance: 'guard-blocked' });
  });

  it('builds the next guard for edited answers, and drops a retired or moved item', async () => {
    switchOn();
    let catalog: GuardCatalogEntry[] = [self(YUJI), TOJI];
    const { attach } = providerWith(() => Promise.resolve(catalog));
    expect((await attach(YUJI)).answerGuard!.blockedAnswers).toContain('توجي');

    // Toji retired, or moved to another World: gone from this World's catalog.
    const edited = { ...YUJI, acceptedAnswers: ['يوجي إيتادوري'] };
    catalog = [self(edited)];
    const next = await attach(edited);
    expect(next.answerGuard).toMatchObject({
      answersFingerprint: fingerprintAnswers(edited.acceptedAnswers),
      blockedAnswers: [],
    });
  });

  it('opens the question exact-only when the World is beyond the read ceiling', async () => {
    switchOn();
    const { attach } = providerWith(() => Promise.resolve(undefined));
    expect((await attach(YUJI)).answerGuard).toBeUndefined();
  });

  it('opens the question exact-only when the read fails', async () => {
    switchOn();
    const { attach } = providerWith(() =>
      Promise.reject(new Error('connection reset')),
    );
    const drawn = await attach(YUJI);
    expect(drawn).toEqual(YUJI);
    expect(drawn.answerGuard).toBeUndefined();
  });

  it('never holds the draw past its budget for a read that does not answer', async () => {
    switchOn();
    jest.useFakeTimers();
    const { attach } = providerWith(() => new Promise(() => undefined));
    const drawing = attach(YUJI);
    await jest.advanceTimersByTimeAsync(ANSWER_GUARD_BUILD_BUDGET_MS);
    const drawn = await drawing;
    expect(drawn).toEqual(YUJI);
  });

  it('opens the question exact-only when its guard would be too large', async () => {
    switchOn();
    const crowd = Array.from(
      { length: C4_GUARDED_V1.maxGuardEntries + 1 },
      (_, i) => ({
        id: `sibling-${i}`,
        // Every one of them two edits or fewer from يوجي, and all different.
        acceptedAnswers: [
          `يو${String.fromCharCode(0x0628 + (i % 20))}${String.fromCharCode(0x0628 + Math.floor(i / 20))}`,
        ],
      }),
    );
    const { attach } = providerWith(() =>
      Promise.resolve([self(YUJI), ...crowd]),
    );
    expect((await attach(YUJI)).answerGuard).toBeUndefined();
  });
});
