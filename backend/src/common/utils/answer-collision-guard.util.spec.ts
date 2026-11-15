import {
  buildAnswerGuard,
  fingerprintCatalog,
  type GuardCatalogEntry,
} from './answer-collision-guard.util';
import {
  C4_GUARDED_V1,
  fingerprintAnswers,
  isAnswerGuardCurrent,
  matchAcceptedAnswer,
  type AnswerGuard,
} from './answer-matching.util';

const VEGETA = { id: 'vegeta', acceptedAnswers: ['فيجيتا', 'Vegeta'] };
const VEGETTO = { id: 'vegetto', acceptedAnswers: ['فيجيتو', 'Vegito'] };
const YUJI = { id: 'yuji', acceptedAnswers: ['يوجي', 'Yuji'] };
const TOJI = { id: 'toji', acceptedAnswers: ['توجي', 'Toji'] };
const GOKU = { id: 'goku', acceptedAnswers: ['غوكو', 'Goku'] };

const build = (
  item: GuardCatalogEntry,
  domain: GuardCatalogEntry[],
  extra: Partial<Parameters<typeof buildAnswerGuard>[0]> = {},
) =>
  buildAnswerGuard({
    itemId: item.id,
    acceptedAnswers: item.acceptedAnswers,
    domain,
    config: C4_GUARDED_V1,
    ...extra,
  });

const guardOf = (result: ReturnType<typeof buildAnswerGuard>): AnswerGuard => {
  if (result.status !== 'ready') throw new Error(`no guard: ${result.reason}`);
  return result.guard;
};

const judge = (typed: string, item: GuardCatalogEntry, guard?: AnswerGuard) =>
  matchAcceptedAnswer(typed, item.acceptedAnswers, {
    kind: 'guarded-tolerant',
    config: C4_GUARDED_V1,
    ...(guard ? { guard } : {}),
  });

describe('buildAnswerGuard', () => {
  it('guards against a different entity one edit away', () => {
    const guard = guardOf(build(VEGETA, [VEGETA, VEGETTO, GOKU]));
    expect(guard.blockedAnswers).toEqual(['vegito', 'فيجيتو']);
    expect(judge('فيجيتو', VEGETA, guard)).toMatchObject({
      matched: false,
      tolerance: 'guard-blocked',
    });
    // A typo one edit from both names could be either: refused.
    expect(judge('فيجيته', VEGETA, guard)).toMatchObject({
      tolerance: 'guard-blocked',
    });
    // A typo that only Vegeta explains is still Vegeta's.
    expect(judge('فجيتا', VEGETA, guard)).toMatchObject({
      matched: true,
      kind: 'tolerant',
    });
  });

  it('reaches answers two edits away, which a single typo could also be', () => {
    const roman = { id: 'roman', acceptedAnswers: ['الإمبراطورية الرومانية'] };
    const ottoman = {
      id: 'ottoman',
      acceptedAnswers: ['الإمبراطورية العثمانية'],
    };
    const guard = guardOf(build(roman, [roman, ottoman]));
    expect(guard.blockedAnswers).toEqual(['امبراطوريه العثمانيه']);
    expect(judge('الإمبراطورية الرثمانية', roman, guard)).toMatchObject({
      tolerance: 'guard-blocked',
    });
  });

  it('guards a pair a single typo bridges, even where restricted distance says three', () => {
    // Found by the Phase B catalog run: تلفيون is one swap from تليفون and one
    // missing letter from تلفزيون. Restricted Damerau-Levenshtein puts the two
    // answers three apart and missed it; the guard measures with the metric.
    const phone = { id: 'phone', acceptedAnswers: ['هاتف', 'تليفون'] };
    const tv = { id: 'tv', acceptedAnswers: ['تلفاز', 'تلفزيون'] };
    const guard = guardOf(build(phone, [phone, tv]));
    expect(guard.blockedAnswers).toContain('تلفزيون');
    expect(judge('تلفيون', phone, guard)).toMatchObject({
      matched: false,
      tolerance: 'guard-blocked',
    });
    // A typo only the telephone explains is still the telephone's.
    expect(judge('تليفوت', phone, guard)).toMatchObject({
      matched: true,
      kind: 'tolerant',
    });
  });

  it('never decides two similar names are one entity by itself', () => {
    // Shared Latin form, near Arabic spellings: still guarded until a human
    // says otherwise.
    const a = { id: 'a', acceptedAnswers: ['شيجانشينا', 'Shiganshina'] };
    const b = { id: 'b', acceptedAnswers: ['شيغانشينا', 'Shiganshina'] };
    const result = build(a, [a, b]);
    expect(guardOf(result).blockedAnswers).toEqual(['شيغانشينا']);
    expect(result.reviewPairs).toEqual([
      { otherItemId: 'b', answer: 'شيجانشينا', otherAnswer: 'شيغانشينا' },
    ]);
  });

  it('does not guard against the very same answer string', () => {
    const otherQuestionAboutGoku = { id: 'goku-2', acceptedAnswers: ['غوكو'] };
    expect(
      guardOf(build(GOKU, [GOKU, otherQuestionAboutGoku])).blockedAnswers,
    ).toEqual([]);
  });

  it('adds answers a human marked as conflicting, from outside the domain', () => {
    expect(
      guardOf(build(YUJI, [YUJI], { knownConflicts: ['يوكي'] })).blockedAnswers,
    ).toEqual(['يوكي']);
  });

  it('is deterministic', () => {
    const domain = [VEGETA, VEGETTO, YUJI, TOJI, GOKU];
    expect(build(YUJI, domain)).toEqual(build(YUJI, [...domain].reverse()));
  });

  it('leaves an item without answers exact-only', () => {
    expect(build({ id: 'x', acceptedAnswers: ['؟'] }, [])).toMatchObject({
      status: 'exact-only',
      reason: 'no-answers',
    });
  });

  it('leaves an item exact-only when its guard would be too large', () => {
    const target = { id: 'target', acceptedAnswers: ['سلامه'] };
    const siblings = ['سلامي', 'سلامو', 'سلامك', 'سلامن'].map(
      (answer, index) => ({
        id: `s${index}`,
        acceptedAnswers: [answer],
      }),
    );
    const result = build(target, [target, ...siblings], {
      config: { ...C4_GUARDED_V1, maxGuardEntries: 3 },
    });
    expect(result).toMatchObject({
      status: 'exact-only',
      reason: 'guard-too-large',
    });
    expect(result.reviewPairs).toHaveLength(4);
  });

  it('refuses a malformed policy', () => {
    expect(() =>
      build(YUJI, [YUJI], {
        config: { ...C4_GUARDED_V1, maxEditsPerWord: 2 },
      }),
    ).toThrow('Malformed answer match policy');
  });
});

describe('guard lifecycle', () => {
  it('a missing guard keeps the item exact-only', () => {
    expect(judge('فيجيته', VEGETA)).toEqual({
      matched: false,
      tolerance: 'guard-missing',
    });
    expect(judge('فيجيتا', VEGETA).matched).toBe(true);
  });

  it('a guard from an older policy version is stale', () => {
    const guard = guardOf(build(VEGETA, [VEGETA, VEGETTO]));
    expect(
      judge('فيجيته', VEGETA, { ...guard, policyId: 'c4-guarded-v0' }),
    ).toMatchObject({ tolerance: 'guard-stale' });
  });

  it('new colliding READY content changes the catalog and is guarded on the next build', () => {
    const before = [YUJI, GOKU];
    const old = guardOf(build(YUJI, before));
    expect(old.blockedAnswers).toEqual([]);

    // Toji arrives, one letter from Yuji.
    const after = [YUJI, GOKU, TOJI];
    const current = fingerprintCatalog(after, C4_GUARDED_V1);
    // A stored guard from before is detectably stale against the new catalog…
    expect(
      isAnswerGuardCurrent(old, {
        config: C4_GUARDED_V1,
        acceptedAnswers: YUJI.acceptedAnswers,
        catalogFingerprint: current,
      }),
    ).toBe(false);
    // …and the rebuilt one guards against the newcomer.
    const rebuilt = guardOf(build(YUJI, after));
    expect(rebuilt.catalogFingerprint).toBe(current);
    expect(rebuilt.blockedAnswers).toEqual(['toji', 'توجي']);
    expect(judge('توجي', YUJI, rebuilt)).toMatchObject({
      tolerance: 'guard-blocked',
    });
  });

  it('a removed or retired item stops being guarded against once rebuilt', () => {
    expect(guardOf(build(YUJI, [YUJI, TOJI])).blockedAnswers).toEqual([
      'toji',
      'توجي',
    ]);
    expect(guardOf(build(YUJI, [YUJI])).blockedAnswers).toEqual([]);
  });

  it('edited accepted answers make the guard stale', () => {
    const guard = guardOf(build(VEGETA, [VEGETA, VEGETTO]));
    const edited = {
      ...VEGETA,
      acceptedAnswers: [...VEGETA.acceptedAnswers, 'بيجيتا'],
    };
    expect(judge('فيجيته', edited, guard)).toMatchObject({
      tolerance: 'guard-stale',
    });
  });

  it('a reviewed equivalence removes the pair, until either item changes', () => {
    const a = { id: 'a', acceptedAnswers: ['شيجانشينا', 'Shiganshina'] };
    const b = { id: 'b', acceptedAnswers: ['شيغانشينا', 'Shiganshina'] };
    const decision = {
      itemIds: ['a', 'b'] as const,
      answersFingerprints: [
        fingerprintAnswers(a.acceptedAnswers),
        fingerprintAnswers(b.acceptedAnswers),
      ] as const,
    };
    expect(
      guardOf(build(a, [a, b], { reviewedEquivalences: [decision] }))
        .blockedAnswers,
    ).toEqual([]);
    // Same decision, seen from the other item.
    expect(
      guardOf(build(b, [a, b], { reviewedEquivalences: [decision] }))
        .blockedAnswers,
    ).toEqual([]);

    // Item b is edited after the review: the decision no longer applies.
    const editedB = {
      ...b,
      acceptedAnswers: [...b.acceptedAnswers, 'شيغانشينا الجديدة'],
    };
    expect(
      guardOf(build(a, [a, editedB], { reviewedEquivalences: [decision] }))
        .blockedAnswers,
    ).toEqual(['شيغانشينا']);
  });

  it('exact answers stay accepted whatever the guard says', () => {
    const guard = guardOf(build(VEGETA, [VEGETA, VEGETTO]));
    expect(judge('Vegeta', VEGETA, guard)).toMatchObject({
      matched: true,
      kind: 'exact',
    });
  });
});
