import { planCandidateMedia } from './candidate-media-planning';
import { evaluateCandidateMedia } from './candidate-media-plan';
import type { CandidateMediaSlot } from './candidate-media-plan';
import type { EngineMediaFlags } from './engine-media-flags';
import type { MediaRequirementEntry } from './media-requirements';

/**
 * The media planning stage (roadmap §30.22 decision 2, step 6).
 *
 * These tests hold the two invariants the stage exists to protect — an
 * ungoverned candidate is never given a plan, and a human's slot is never
 * overwritten — and the one thing it is for: a reviewer learns *why* a required
 * asset is not there.
 */
describe('candidate media planning', () => {
  const off: EngineMediaFlags = {
    enrichment: false,
    imageGeneration: false,
    wigoloDiscovery: false,
  };
  const on: EngineMediaFlags = { ...off, enrichment: true };

  describe('a candidate outside the media contract', () => {
    it('is left with no plan at all', () => {
      const outcome = planCandidateMedia({
        mechanicKey: 'read-your-opponent',
        scopeKey: 'any-scope',
        flags: off,
      });
      expect(outcome.governed).toBe(false);
      expect(outcome.mediaPlan).toBeNull();
    });

    it('stays approvable, which an empty courtesy plan would have ended', () => {
      // `evaluateCandidateMedia` reads any plan entry as proof that a candidate
      // is media-governed. This is the whole reason the stage writes nothing.
      const governedByAnEmptyPlan = evaluateCandidateMedia({
        mechanicKey: 'read-your-opponent',
        mediaPlan: [
          {
            slotKey: 'subject-image',
            purpose: 'gameplay',
            required: true,
            status: 'planned',
          },
        ],
      });
      expect(governedByAnEmptyPlan.governed).toBe(true);
      expect(governedByAnEmptyPlan.warnings.map((f) => f.code)).toContain(
        'MEDIA_SLOT_UNREGISTERED',
      );

      const asThePlannerLeavesIt = evaluateCandidateMedia({
        mechanicKey: 'read-your-opponent',
        mediaPlan: null,
      });
      expect(asThePlannerLeavesIt.governed).toBe(false);
      expect(asThePlannerLeavesIt.ready).toBe(true);
    });

    it('is left alone for every mechanic the engine can author today', () => {
      for (const mechanicKey of ['read-your-opponent', 'closest', 'combo']) {
        expect(
          planCandidateMedia({ mechanicKey, scopeKey: 'naruto', flags: on })
            .mediaPlan,
        ).toBeNull();
      }
    });
  });

  describe('a governed candidate', () => {
    it('records a required gameplay slot as awaited, with the reason', () => {
      const outcome = planCandidateMedia({
        mechanicKey: 'ekshifni',
        scopeKey: 'arab-media-stars',
        flags: off,
      });
      expect(outcome.governed).toBe(true);
      expect(outcome.planned).toEqual(['subject-image']);
      expect(outcome.mediaPlan).toEqual([
        {
          slotKey: 'subject-image',
          purpose: 'gameplay',
          required: true,
          status: 'planned',
          failureReason: 'MEDIA_ENRICHMENT_DISABLED',
        },
      ]);
    });

    it('turns the gate’s silence into an actionable sentence', () => {
      const withoutTheStage = evaluateCandidateMedia({
        mechanicKey: 'ekshifni',
        mediaPlan: null,
      });
      const withTheStage = evaluateCandidateMedia({
        mechanicKey: 'ekshifni',
        mediaPlan: planCandidateMedia({ mechanicKey: 'ekshifni', flags: off })
          .mediaPlan,
      });
      // Both refuse approval — the stage never loosens the gate.
      expect(withoutTheStage.ready).toBe(false);
      expect(withTheStage.ready).toBe(false);
      expect(withoutTheStage.blockers[0].code).toBe(
        'MEDIA_REQUIRED_SLOT_MISSING',
      );
      expect(withTheStage.blockers[0].code).toBe(
        'MEDIA_REQUIRED_SLOT_UNRESOLVED',
      );
      expect(withTheStage.blockers[0].message).toContain(
        'MEDIA_ENRICHMENT_DISABLED',
      );
    });

    it('names retrieval, generation and dead ends apart', () => {
      const registry: readonly MediaRequirementEntry[] = [
        {
          mechanicKey: 'm',
          slots: [
            {
              slotKey: 'retrievable',
              purpose: 'gameplay',
              required: true,
              mediaType: 'image',
              targetPath: 'media',
              acquisition: ['retrieve', 'upload'],
              aspectPolicy: 'native',
            },
            {
              slotKey: 'generatable',
              purpose: 'gameplay',
              required: true,
              mediaType: 'image',
              targetPath: 'mechanicPayload.a.media',
              acquisition: ['generate'],
              aspectPolicy: 'native',
            },
            {
              slotKey: 'by-hand-only',
              purpose: 'gameplay',
              required: true,
              mediaType: 'image',
              targetPath: 'mechanicPayload.b.media',
              acquisition: ['upload', 'edit'],
              aspectPolicy: 'native',
            },
          ],
        },
      ];
      const reasons = (flags: EngineMediaFlags) =>
        Object.fromEntries(
          (
            planCandidateMedia({ mechanicKey: 'm', flags }, registry)
              .mediaPlan ?? []
          ).map((slot) => [slot.slotKey, slot.failureReason]),
        );

      // Switch down: nothing was attempted, so nothing is said about providers.
      expect(reasons(off)).toEqual({
        retrievable: 'MEDIA_ENRICHMENT_DISABLED',
        generatable: 'MEDIA_ENRICHMENT_DISABLED',
        'by-hand-only': 'MEDIA_ENRICHMENT_DISABLED',
      });
      expect(reasons({ ...on, imageGeneration: true })).toEqual({
        retrievable: 'MEDIA_RETRIEVAL_NOT_CONFIGURED',
        generatable: 'MEDIA_GENERATION_NOT_CONFIGURED',
        'by-hand-only': 'MEDIA_ACQUISITION_UNSUPPORTED',
      });
      // Generation off is not a missing generator; it is a route not taken.
      expect(reasons(on).generatable).toBe('MEDIA_ACQUISITION_UNSUPPORTED');
    });

    it('marks decorative media skipped, and it still never blocks', () => {
      const registry: readonly MediaRequirementEntry[] = [
        {
          mechanicKey: 'm',
          slots: [
            {
              slotKey: 'illustration',
              purpose: 'decorative',
              required: false,
              mediaType: 'image',
              targetPath: 'media',
              acquisition: ['retrieve'],
              aspectPolicy: 'native',
            },
          ],
        },
      ];
      const outcome = planCandidateMedia(
        { mechanicKey: 'm', flags: off },
        registry,
      );
      expect(outcome.skipped).toEqual(['illustration']);
      expect(outcome.mediaPlan?.[0].status).toBe('skipped');
      // The World Question Fallback covers the question, so this is a warning.
      const readiness = evaluateCandidateMedia(
        { mechanicKey: 'm', mediaPlan: outcome.mediaPlan },
        registry,
      );
      expect(readiness.ready).toBe(true);
      expect(readiness.warnings.map((f) => f.code)).toContain(
        'MEDIA_DECORATIVE_UNAVAILABLE',
      );
    });

    it('plans both Odd Piece twins, and the derived one has no route of its own', () => {
      const outcome = planCandidateMedia({
        mechanicKey: 'odd-piece',
        flags: { ...on, imageGeneration: true },
      });
      expect(outcome.planned).toEqual(['original-image', 'modified-image']);
      expect(outcome.mediaPlan?.map((slot) => slot.failureReason)).toEqual([
        'MEDIA_RETRIEVAL_NOT_CONFIGURED',
        'MEDIA_ACQUISITION_UNSUPPORTED',
      ]);
    });

    it('applies a scope-restricted contract only inside its scopes', () => {
      expect(
        planCandidateMedia({
          mechanicKey: 'moving-xo',
          scopeKey: 'observation-illusions',
          flags: off,
        }).planned,
      ).toEqual(['puzzle-image']);
      expect(
        planCandidateMedia({
          mechanicKey: 'moving-xo',
          scopeKey: 'wordplay-letters',
          flags: off,
        }).mediaPlan,
      ).toBeNull();
    });
  });

  describe('what it refuses to touch', () => {
    const uploaded: CandidateMediaSlot = {
      slotKey: 'subject-image',
      purpose: 'gameplay',
      required: true,
      status: 'resolved',
      asset: { url: 'https://cdn.example/engine-abc.jpg' },
      review: {
        status: 'approved',
        assetUrl: 'https://cdn.example/engine-abc.jpg',
        mediaReviewRevision: 2,
        actorId: 'admin-1',
        actorEmail: 'admin@example.com',
        at: '2026-11-12T20:00:00.000Z',
      },
    };

    it('leaves a resolved and approved slot exactly as it is', () => {
      const outcome = planCandidateMedia({
        mechanicKey: 'ekshifni',
        mediaPlan: [uploaded],
        flags: off,
      });
      expect(outcome.settled).toEqual(['subject-image']);
      // Nothing to write: a retried job must not rewrite an Admin's decision.
      expect(outcome.mediaPlan).toBeNull();
    });

    it('leaves a slot holding only an asset, before anyone reviewed it', () => {
      const attached: CandidateMediaSlot = {
        slotKey: 'subject-image',
        purpose: 'gameplay',
        required: true,
        status: 'planned',
        asset: { url: 'https://cdn.example/engine-def.jpg' },
      };
      expect(
        planCandidateMedia({
          mechanicKey: 'ekshifni',
          mediaPlan: [attached],
          flags: off,
        }).mediaPlan,
      ).toBeNull();
    });

    it('leaves a rights acknowledgment standing', () => {
      const acknowledged: CandidateMediaSlot = {
        slotKey: 'subject-image',
        purpose: 'gameplay',
        required: true,
        status: 'failed',
        failureReason: 'SOMETHING_EARLIER',
        rightsAcknowledgement: {
          assetUrl: 'https://cdn.example/engine-ghi.jpg',
          rightsStatus: 'UNKNOWN',
          actorId: 'admin-1',
          actorEmail: 'admin@example.com',
          at: '2026-11-12T20:00:00.000Z',
          mediaReviewRevision: 1,
          note: 'checked by hand',
        },
      };
      expect(
        planCandidateMedia({
          mechanicKey: 'ekshifni',
          mediaPlan: [acknowledged],
          flags: off,
        }).mediaPlan,
      ).toBeNull();
    });

    it('preserves a plan entry the contract never declared', () => {
      const stray: CandidateMediaSlot = {
        slotKey: 'from-another-contract',
        purpose: 'decorative',
        required: false,
        status: 'resolved',
        asset: { url: 'https://cdn.example/old.jpg' },
      };
      const outcome = planCandidateMedia({
        mechanicKey: 'ekshifni',
        mediaPlan: [stray],
        flags: off,
      });
      expect(outcome.mediaPlan?.map((slot) => slot.slotKey)).toEqual([
        'subject-image',
        'from-another-contract',
      ]);
    });

    it('is idempotent: a second pass writes nothing', () => {
      const first = planCandidateMedia({ mechanicKey: 'ekshifni', flags: off });
      const second = planCandidateMedia({
        mechanicKey: 'ekshifni',
        mediaPlan: first.mediaPlan,
        flags: off,
      });
      expect(second.mediaPlan).toBeNull();
    });

    it('does rewrite the reason when the flags changed', () => {
      const first = planCandidateMedia({ mechanicKey: 'ekshifni', flags: off });
      const second = planCandidateMedia({
        mechanicKey: 'ekshifni',
        mediaPlan: first.mediaPlan,
        flags: on,
      });
      expect(second.mediaPlan?.[0].failureReason).toBe(
        'MEDIA_RETRIEVAL_NOT_CONFIGURED',
      );
    });
  });
});
