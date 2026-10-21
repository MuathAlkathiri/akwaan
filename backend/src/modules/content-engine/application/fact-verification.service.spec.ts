import { FactEvidenceRetriever } from '../domain/fact-verification.types';
import { FactVerificationService } from './fact-verification.service';

describe('FactVerificationService', () => {
  const config = {
    get: (key: string) =>
      ({
        ENGINE_VERIFICATION_MAX_ATTEMPTS: '2',
        ENGINE_VERIFICATION_MAX_RESULTS: '5',
        ENGINE_VERIFICATION_MAX_CLAIMS: '8',
      })[key],
  } as never;
  const evidence = (
    relation: 'supports' | 'contradicts' | 'mentions',
    overrides: Record<string, unknown> = {},
  ) => ({
    sourceId: 'official:1',
    sourceName: 'Official source',
    url: 'https://example.test/source',
    excerpt: 'The retrieved source text.',
    retrievedAt: '2026-10-15T00:00:00.000Z',
    relation,
    ...overrides,
  });
  const service = (retrieve: FactEvidenceRetriever['retrieve']) =>
    new FactVerificationService(config, { retrieve });

  it.each([
    ['supports', 'SUPPORTED'],
    ['contradicts', 'CONTRADICTED'],
    ['mentions', 'UNSUPPORTED'],
  ] as const)('maps retrieved %s evidence to %s', async (relation, state) => {
    const result = await service(async () => [evidence(relation)]).verify([
      'answer-critical claim',
    ]);
    expect(result.state).toBe(state);
    expect(result.claims[0].evidence[0].url).toBe(
      'https://example.test/source',
    );
  });

  it('returns UNRESOLVED after bounded retrieval failures', async () => {
    const retrieve = jest.fn(async () => {
      throw new Error('network unavailable');
    });
    const result = await service(retrieve).verify(['claim']);
    expect(result.state).toBe('UNRESOLVED');
    expect(result.claims[0].attempts).toBe(2);
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('rejects fabricated or malformed citations instead of trusting them', async () => {
    const result = await service(async () => [
      evidence('supports', { sourceId: '', url: 'not-a-retrieved-url' }),
    ]).verify(['claim with https://invented.example citation']);
    expect(result.state).toBe('UNSUPPORTED');
    expect(result.claims[0].evidence).toEqual([]);
  });

  it('fails closed when no retrieval adapter is bound', async () => {
    const result = await new FactVerificationService(config).verify(['claim']);
    expect(result.state).toBe('UNRESOLVED');
    expect(result.automaticAdvance).toBe(false);
  });

  it('does not treat an omitted answer-critical claim as verified', async () => {
    const result = await service(async () => [evidence('supports')]).verify([]);
    expect(result.state).toBe('UNRESOLVED');
    expect(result.automaticAdvance).toBe(false);
  });
});
