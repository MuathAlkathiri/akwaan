import { candidateIdentityMetadata } from './candidate-identity-metadata';

describe('candidate identity metadata', () => {
  it('preserves draft fields and uses matching legacy authoring values when absent', () => {
    expect(
      candidateIdentityMetadata(
        { metadata: { subject: 'hero', notes: 'note' } },
        { subject: 'hero', entityId: 'hero-id' },
      ),
    ).toEqual({ subject: 'hero', notes: 'note', entityId: 'hero-id' });
  });
  it('fails closed when legacy authoring conflicts with draft identity', () => {
    expect(() =>
      candidateIdentityMetadata(
        { metadata: { entityId: 'one' } },
        { entityId: 'two' },
      ),
    ).toThrow('Conflicting candidate identity metadata');
  });
  it('does not invent optional identity fields', () => {
    expect(candidateIdentityMetadata({}, null)).toEqual({});
  });
  it('trims identity strings consistently with persisted ContentItem metadata', () => {
    expect(
      candidateIdentityMetadata(
        {
          metadata: {
            familyKey: ' family ',
            subject: ' hero ',
            entityId: ' id ',
            source: ' source ',
            tags: [' tag '],
          },
        },
        {
          familyKey: 'family',
          subject: 'hero',
          entityId: 'id',
          source: 'source',
          tags: [' tag '],
        },
      ),
    ).toEqual({
      familyKey: 'family',
      subject: 'hero',
      entityId: 'id',
      source: 'source',
      tags: [' tag '],
    });
    expect(() =>
      candidateIdentityMetadata(
        { metadata: { subject: ' hero ' } },
        { subject: 'other' },
      ),
    ).toThrow('Conflicting candidate identity metadata');
  });

  it('propagates assignedSlot.familyKey when candidate is compliant and no explicit override exists', () => {
    expect(
      candidateIdentityMetadata(
        { metadata: { notes: 'concept | solve' } },
        {
          concept: 'concept',
          assignedSlot: {
            slotIndex: 0,
            familyKey: ' anagram-rearrange ',
            familyNameAr: 'ترتيب الحروف المبعثرة',
          },
          familyCompliance: {
            assignedFamilyKey: 'anagram-rearrange',
            isCompliant: true,
            verificationMethod: 'rule_evaluated',
          },
        },
      ),
    ).toEqual({
      notes: 'concept | solve',
      familyKey: 'anagram-rearrange',
    });
  });

  it('respects approved family reassignment without mutating assignedSlot.familyKey', () => {
    const authoring = {
      assignedSlot: {
        slotIndex: 0,
        familyKey: 'anagram-rearrange',
      },
      familyCompliance: {
        assignedFamilyKey: 'anagram-rearrange',
        reassignedFamilyKey: 'plural-form',
        effectiveFamilyKey: 'plural-form',
        isCompliant: true,
        verificationMethod: 'manual_review',
        resolvedByReviewerId: 'reviewer-1',
      },
    };
    expect(candidateIdentityMetadata({ metadata: {} }, authoring)).toEqual({
      familyKey: 'plural-form',
    });
    expect(authoring.assignedSlot.familyKey).toBe('anagram-rearrange');
  });

  it('allows draft.metadata.familyKey to override assignedSlot.familyKey without throwing conflict', () => {
    const authoring = {
      assignedSlot: {
        slotIndex: 0,
        familyKey: 'anagram-rearrange',
      },
    };
    expect(
      candidateIdentityMetadata(
        { metadata: { familyKey: 'plural-form' } },
        authoring,
      ),
    ).toEqual({
      familyKey: 'plural-form',
    });
    expect(authoring.assignedSlot.familyKey).toBe('anagram-rearrange');
  });

  it('does not confuse assignedSlot.familyKey with effective family when familyCompliance is an unresolved mismatch', () => {
    expect(
      candidateIdentityMetadata(
        { metadata: { notes: 'mismatch' } },
        {
          assignedSlot: {
            slotIndex: 0,
            familyKey: 'anagram-rearrange',
          },
          familyCompliance: {
            assignedFamilyKey: 'anagram-rearrange',
            detectedFamilyKey: 'plural-form',
            isCompliant: false,
            verificationMethod: 'rule_evaluated',
            mismatchReason: 'Mismatch',
          },
        },
      ),
    ).toEqual({
      notes: 'mismatch',
    });
  });
});
