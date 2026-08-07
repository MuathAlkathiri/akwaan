import { readFileSync } from 'fs';
import { join } from 'path';
import { SCORING_RULE_IDS } from '../modules/scoring/domain/scoring-rule';
import {
  buildTop5Payload,
  LegacyTop10Payload,
  planContentConversion,
  planSlugMigration,
  rewriteTitle,
} from './migrate-top10-to-top5';

/**
 * The two decisions this migration is allowed to make on its own: renaming one
 * unambiguous ChallengeType, and reshaping content whose authored ranking
 * *proves* which five entries are the real Top 5 and which five are not.
 *
 * Everything else is reported for a human. These tests exist to keep it that way.
 */
describe('top-10 to top-5 migration', () => {
  const candidates = Array.from({ length: 14 }, (_, index) => ({
    id: `card-${index + 1}`,
    label: `مرشّح ${index + 1}`,
  }));
  const legacy = (
    overrides: Partial<LegacyTop10Payload> = {},
  ): LegacyTop10Payload => ({
    variant: 'poison-deck',
    title: 'أفضل 10 أندية',
    instruction: 'احتفظ بالبطاقة أو أرسلها لخصمك',
    rankingBasis: 'مجموع النقاط',
    sourceLabel: 'الاتحاد',
    sourceUrl: 'https://example.com',
    asOfDate: '2026-08-01',
    candidates,
    rankedAnswer: candidates.slice(0, 10).map((candidate, index) => ({
      candidateId: candidate.id,
      rank: index + 1,
    })),
    decoyCandidateIds: candidates.slice(10).map((candidate) => candidate.id),
    ...overrides,
  });

  describe('content conversion', () => {
    it('keeps ranks 1..5 and turns the proven next five into traps', () => {
      const decision = planContentConversion(legacy());
      expect(decision.kind).toBe('convert');
      if (decision.kind !== 'convert') return;
      expect(decision.entries).toHaveLength(10);
      expect(
        decision.entries
          .filter((entry) => entry.rank !== null)
          .map((e) => e.rank),
      ).toEqual([1, 2, 3, 4, 5]);
      // The five traps are the authored ranks 6..10 — entries the data proves are
      // not in the top five — and never the four author-chosen decoys, which
      // would have made "which five" an arbitrary pick.
      expect(
        decision.entries
          .filter((entry) => entry.rank === null)
          .map((e) => e.id),
      ).toEqual(['card-6', 'card-7', 'card-8', 'card-9', 'card-10']);
      expect(decision.entries.map((entry) => entry.id)).not.toContain(
        'card-11',
      );
    });

    it('refuses an incomplete or repeated ranking rather than guessing', () => {
      expect(
        planContentConversion(
          legacy({
            rankedAnswer: candidates.slice(0, 9).map((c, i) => ({
              candidateId: c.id,
              rank: i + 1,
            })),
          }),
        ),
      ).toMatchObject({ kind: 'needs-reauthoring' });
      expect(
        planContentConversion(
          legacy({
            rankedAnswer: candidates.slice(0, 10).map((c, i) => ({
              candidateId: c.id,
              rank: i === 9 ? 9 : i + 1,
            })),
          }),
        ),
      ).toMatchObject({ kind: 'needs-reauthoring' });
    });

    it('refuses a ranking that points at a candidate that is not there', () => {
      expect(
        planContentConversion(
          legacy({
            rankedAnswer: [
              { candidateId: 'ghost', rank: 1 },
              ...candidates.slice(1, 10).map((c, i) => ({
                candidateId: c.id,
                rank: i + 2,
              })),
            ],
          }),
        ),
      ).toMatchObject({ kind: 'needs-reauthoring' });
    });

    it('refuses a payload that is not the poison deck at all', () => {
      expect(
        planContentConversion(legacy({ variant: 'classic' })),
      ).toMatchObject({ kind: 'needs-reauthoring' });
      expect(planContentConversion(undefined)).toMatchObject({
        kind: 'needs-reauthoring',
      });
    });

    it('is idempotent: an already-converted item is left alone', () => {
      expect(
        planContentConversion({
          variant: 'keep-or-give',
        } as LegacyTop10Payload),
      ).toEqual({ kind: 'already-migrated' });
    });

    it('flags a title that still says ten instead of silently rewriting it', () => {
      const flagged = planContentConversion(legacy());
      expect(flagged).toMatchObject({ titleNeedsReauthoring: true });
      const clean = planContentConversion(
        legacy({ title: 'الترتيب التاريخي بالنقاط' }),
      );
      expect(clean).toMatchObject({ titleNeedsReauthoring: false });
      // The rewrite exists, but only behind an explicit flag.
      expect(rewriteTitle('أفضل 10 أندية')).toBe('أفضل 5 أندية');
    });

    it('carries the authored provenance into the new payload unchanged', () => {
      const payload = legacy();
      const decision = planContentConversion(payload);
      if (decision.kind !== 'convert') throw new Error('expected a conversion');
      expect(
        buildTop5Payload(payload, decision.entries, payload.title!),
      ).toMatchObject({
        variant: 'keep-or-give',
        rankingBasis: 'مجموع النقاط',
        sourceLabel: 'الاتحاد',
        sourceUrl: 'https://example.com',
        asOfDate: '2026-08-01',
      });
    });
  });

  describe('challenge type rename', () => {
    it('renames the one legacy document, preserving its id', () => {
      expect(
        planSlugMigration({
          legacy: [{ _id: 'abc', slug: 'top-10' }],
          canonical: [],
        }),
      ).toEqual({ kind: 'rename', id: 'abc', from: 'top-10' });
    });

    it('does nothing when the canonical slug is already worn', () => {
      expect(
        planSlugMigration({
          legacy: [],
          canonical: [{ _id: 'abc', slug: 'top-5' }],
        }),
      ).toEqual({ kind: 'already-canonical', id: 'abc' });
    });

    it('refuses to run when another document already owns top-5', () => {
      // Merging would silently move every board configuration; a human decides.
      expect(
        planSlugMigration({
          legacy: [{ _id: 'abc', slug: 'top-10' }],
          canonical: [{ _id: 'xyz', slug: 'top-5' }],
        }),
      ).toEqual({ kind: 'slug-conflict', holderId: 'xyz' });
    });

    it('refuses an ambiguous set rather than picking one', () => {
      expect(
        planSlugMigration({
          legacy: [
            { _id: 'a', slug: 'top-10' },
            { _id: 'b', slug: 'top-10' },
          ],
          canonical: [],
        }),
      ).toEqual({ kind: 'ambiguous', count: 2 });
    });

    it('reports absence rather than creating a ChallengeType', () => {
      expect(planSlugMigration({ legacy: [], canonical: [] })).toEqual({
        kind: 'absent',
      });
    });

    it('moves the scoring rule with the slug, on rename and on repair', () => {
      // A ChallengeType pointing at a rule the registry no longer knows makes
      // its whole World board invalid, so no Match on that World can be
      // created. Renaming the slug without the rule shipped exactly that bug.
      const source = readFileSync(
        join(__dirname, 'migrate-top10-to-top5.ts'),
        'utf8',
      );
      const writes = source.match(
        /scoringRuleId: SCORING_RULE_IDS\.TOP5_RESULT/g,
      );
      expect(writes).toHaveLength(2);
      expect(source).not.toContain("'top10.poison-deck.result'");
      expect(SCORING_RULE_IDS.TOP5_RESULT).toBe('top-5.result');
    });
  });
});
