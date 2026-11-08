import { Types } from 'mongoose';
import {
  buildOverlapEvidence,
  compareBatchCandidates,
  contentVersionHash,
  OVERLAP_FINGERPRINT_PATTERN,
  overlapFingerprint,
} from './overlap-acknowledgment';
import { ConfigService } from '@nestjs/config';
import { DeterministicScreenService } from '../application/deterministic-screen.service';

const config = new ConfigService({});

const telephone = {
  prompt: { ar: 'من مخترع الهاتف؟' },
  answerPayload: {
    mode: 'multiple_choice',
    options: [
      { id: '1', label: { ar: 'ألكسندر غراهام بيل' } },
      { id: '2', label: { ar: 'توماس إديسون' } },
    ],
    correctOptionId: '1',
  },
};
const telephoneVariant = {
  prompt: { ar: 'من مخترع التليفون؟' },
  answerPayload: {
    mode: 'multiple_choice',
    options: [
      { id: 'a', label: { ar: 'ألكسندر غراهام بيل' } },
      { id: 'b', label: { ar: 'نيكولا تيسلا' } },
    ],
    correctOptionId: 'a',
  },
};

const reference = {
  kind: 'CANONICAL_READY' as const,
  id: 'item-1',
  contentHash: 'a'.repeat(64),
};
const base = {
  code: 'POTENTIAL_OVERLAP_HISTORICAL_CONTENT',
  candidateContentHash: 'b'.repeat(64),
  reasonCode: 'SIMILAR_TARGET',
  reference,
};

describe('overlap acknowledgment fingerprints (R4-A)', () => {
  it('is deterministic and versioned', () => {
    const first = overlapFingerprint(base);
    expect(first).toMatch(OVERLAP_FINGERPRINT_PATTERN);
    expect(overlapFingerprint({ ...base, reference: { ...reference } })).toBe(
      first,
    );
  });

  it.each([
    ['finding code', { code: 'POTENTIAL_OVERLAP_HISTORICAL_DRAFT' }],
    ['candidate content version', { candidateContentHash: 'c'.repeat(64) }],
    ['comparison reason', { reasonCode: 'OTHER' }],
    ['reference id', { reference: { ...reference, id: 'item-2' } }],
    [
      'reference kind',
      { reference: { ...reference, kind: 'CANONICAL_DRAFT' as const } },
    ],
    [
      'reference content version',
      { reference: { ...reference, contentHash: 'd'.repeat(64) } },
    ],
  ])('changes when the %s changes', (_label, change) => {
    expect(overlapFingerprint({ ...base, ...change })).not.toBe(
      overlapFingerprint(base),
    );
  });

  it('hashes only identity-bearing content, independent of key order and target fields', () => {
    const metadata = { source: 'content-engine', familyKey: 'f' };
    const hash = contentVersionHash(telephone, metadata);
    expect(
      contentVersionHash(
        {
          answerPayload: telephone.answerPayload,
          prompt: telephone.prompt,
          scopeId: new Types.ObjectId(),
          status: 'draft',
        },
        { familyKey: 'f', source: 'content-engine' },
      ),
    ).toBe(hash);
    expect(
      contentVersionHash(
        { ...telephone, prompt: { ar: 'من اخترع الهاتف؟' } },
        metadata,
      ),
    ).not.toBe(hash);
    expect(
      contentVersionHash(telephone, { ...metadata, entityId: 'x' }),
    ).not.toBe(hash);
  });

  it('recomputes an in-batch overlap against the actual referenced candidate', () => {
    const { comparison, evidence } = compareBatchCandidates({
      candidateDraft: telephoneVariant,
      referenceId: 'sibling-1',
      referenceDraft: telephone,
      scopeKey: 'inventions',
      worldKey: 'science',
    });
    expect(comparison.result).toBe('POTENTIAL_OVERLAP');
    expect(evidence.reference).toMatchObject({
      kind: 'BATCH_CANDIDATE',
      id: 'sibling-1',
    });
    expect(evidence.fingerprint).toMatch(OVERLAP_FINGERPRINT_PATTERN);
    expect(
      compareBatchCandidates({
        candidateDraft: telephoneVariant,
        referenceId: 'sibling-1',
        referenceDraft: {
          ...telephone,
          prompt: { ar: 'من مخترع جهاز الهاتف؟' },
        },
        scopeKey: 'inventions',
        worldKey: 'science',
      }).evidence.fingerprint,
    ).not.toBe(evidence.fingerprint);
  });

  it('matches the evidence the deterministic screen stamps on findings', () => {
    const screen = new DeterministicScreenService(config);
    const session = screen.createSession({
      scopeKey: 'inventions',
      worldKey: 'science',
    });
    screen.screen(telephone, null, {
      candidateId: 'sibling-1',
      scopeKey: 'inventions',
      worldKey: 'science',
      session,
    });
    const result = screen.screen(telephoneVariant, null, {
      candidateId: 'candidate-2',
      scopeKey: 'inventions',
      worldKey: 'science',
      session,
    });
    const overlap = result.findings.find(
      (f) => f.code === 'POTENTIAL_OVERLAP_IN_BATCH',
    );
    expect(overlap?.evidence?.reference).toMatchObject({
      kind: 'BATCH_CANDIDATE',
      id: 'sibling-1',
    });
    const recomputed = compareBatchCandidates({
      candidateDraft: telephoneVariant,
      referenceId: 'sibling-1',
      referenceDraft: telephone,
      scopeKey: 'inventions',
      worldKey: 'science',
    });
    expect(overlap?.fingerprint).toBe(recomputed.evidence.fingerprint);
  });

  it('stamps historical overlap evidence with the stable record identity', () => {
    const screen = new DeterministicScreenService(config);
    screen.registerHistoricalRecords([
      {
        id: 'item-7',
        sourceType: 'CANONICAL_READY',
        scopeKey: 'inventions',
        worldKey: 'science',
        draft: telephone,
      },
    ]);
    const result = screen.screen(telephoneVariant, null, {
      candidateId: 'candidate-2',
      scopeKey: 'inventions',
      worldKey: 'science',
    });
    const overlap = result.findings.find(
      (f) => f.code === 'POTENTIAL_OVERLAP_HISTORICAL_CONTENT',
    );
    expect(overlap?.evidence?.reference).toEqual({
      kind: 'CANONICAL_READY',
      id: 'item-7',
      contentHash: contentVersionHash(telephone, {}),
    });
    expect(overlap?.fingerprint).toBe(
      buildOverlapEvidence({
        code: 'POTENTIAL_OVERLAP_HISTORICAL_CONTENT',
        candidateContentHash: contentVersionHash(telephoneVariant, {}),
        reasonCode: overlap!.evidence!.reasonCode,
        reference: overlap!.evidence!.reference as never,
      }).fingerprint,
    );
  });

  it('does not attach acknowledgeable evidence to an in-batch overlap with no sibling identity', () => {
    const screen = new DeterministicScreenService(config);
    const session = screen.createSession({ scopeKey: 'inventions' });
    screen.screen(telephone, null, { scopeKey: 'inventions', session });
    const result = screen.screen(telephoneVariant, null, {
      candidateId: 'candidate-2',
      scopeKey: 'inventions',
      session,
    });
    const overlap = result.findings.find(
      (f) => f.code === 'POTENTIAL_OVERLAP_IN_BATCH',
    );
    expect(overlap).toBeDefined();
    expect(overlap?.fingerprint).toBeUndefined();
  });
});
