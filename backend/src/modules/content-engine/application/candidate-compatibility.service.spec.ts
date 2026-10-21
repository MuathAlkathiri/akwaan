import { ContentItemCompatibilityPolicy } from '../../world-content/domain/content-item-compatibility.policy';
import { CandidateCompatibilityService } from './candidate-compatibility.service';

describe('CandidateCompatibilityService', () => {
  const service = new CandidateCompatibilityService(
    new ContentItemCompatibilityPolicy(),
  );
  const validDraft = {
    prompt: { ar: 'أي خيار تختار؟' },
    answerPayload: {
      mode: 'multiple_choice',
      options: [
        { id: 'a', label: { ar: 'الأول' } },
        { id: 'b', label: { ar: 'الثاني' } },
      ],
      correctOptionId: 'a',
    },
  };

  it('runs the canonical policy without creating a ContentItem', () => {
    const result = service.evaluate({
      mechanicKey: 'read-your-opponent',
      draft: validDraft,
    });
    expect(result.preDraft.blockers).toEqual([]);
    expect(result.deferredChecks.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'CANONICAL_SCOPE_ID_REQUIRED',
        'CANONICAL_CHALLENGE_TYPE_ID_REQUIRED',
        'READY_VALIDATION_PENDING',
      ]),
    );
    expect(result.status).toBe('DEFERRED');
  });

  it('surfaces canonical structural blockers before draft creation', () => {
    const result = service.evaluate({
      mechanicKey: 'read-your-opponent',
      draft: {
        ...validDraft,
        answerPayload: {
          ...validDraft.answerPayload,
          correctOptionId: 'missing',
        },
      },
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.preDraft.blockers.map((item) => item.code)).toContain(
      'CORRECT_OPTION_NOT_IN_OPTIONS',
    );
  });

  it('does not claim compatibility for an unprofiled mechanic', () => {
    const result = service.evaluate({
      mechanicKey: 'unknown-mechanic',
      draft: validDraft,
    });
    expect(result.status).toBe('DEFERRED');
    expect(result.deferredChecks[0].code).toBe(
      'CANONICAL_CHALLENGE_TYPE_REQUIRED',
    );
  });
});
