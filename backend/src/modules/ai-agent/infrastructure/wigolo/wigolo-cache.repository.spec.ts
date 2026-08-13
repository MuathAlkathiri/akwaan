import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WigoloCacheRepository } from './wigolo-cache.repository';
import type {
  EntityVerificationRequest,
  VerifiedEntity,
} from '../../application/entity-verification.types';

const request = (
  overrides: Partial<EntityVerificationRequest> = {},
): EntityVerificationRequest => ({
  proposedEntity: 'الأماكن',
  proposedAnswer: 'الأماكن',
  entityType: 'song',
  artist: 'محمد عبده',
  language: 'ar',
  gameMode: 'identifySong',
  intendedAsset: 'song',
  ...overrides,
});

const entity = (overrides: Partial<VerifiedEntity> = {}): VerifiedEntity => ({
  verificationStatus: 'VERIFIED',
  canonicalEntity: 'الأماكن',
  canonicalAnswer: 'الأماكن',
  entityType: 'song',
  aliases: ['الأماكن'],
  originalLanguageAliases: [],
  transliterations: [],
  confidence: { overall: 0.9, identity: 0.9, answer: 0.9, association: 0.9 },
  evidence: [
    {
      sourceTitle: 'source',
      sourceDomain: 'music.apple.com',
      sourceTier: 'structured-platform',
      supportsIdentity: true,
      supportsAnswer: true,
      supportsAssociation: true,
    },
  ],
  searchHints: {
    requiredTerms: ['الأماكن'],
    trustedAliases: ['الأماكن'],
    franchiseTerms: [],
    providerHints: [],
    prohibitedGenericTerms: [],
  },
  issues: ['ENTITY_VERIFICATION_SUCCEEDED'],
  ...overrides,
});

const create = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lammah-wigolo-cache-'));
  const file = join(dir, 'cache.json');
  const config = new ConfigService({ WIGOLO_CACHE_FILE: file });
  return { file, repo: new WigoloCacheRepository(config) };
};

describe('WigoloCacheRepository', () => {
  it('stores stable entities with a long-lived TTL and no raw fetched content', async () => {
    const { file, repo } = await create();
    await repo.set(request(), entity(), 2_592_000);

    const hit = await repo.get(request());
    const raw = await readFile(file, 'utf8');

    expect(hit?.cacheHit).toBe(true);
    expect(raw).not.toContain('full_markdown');
    expect(raw).not.toContain('raw page body');
  });

  it('expires short negative-cache rows', async () => {
    const { repo } = await create();
    await repo.set(
      request(),
      entity({
        verificationStatus: 'REJECTED',
        evidence: [],
        issues: ['ENTITY_VERIFICATION_REJECTED'],
      }),
      0.001,
    );

    await new Promise((resolve) => setTimeout(resolve, 5));

    await expect(repo.get(request())).resolves.toBeUndefined();
  });

  it('skips schema mismatch and corrupt cache entries', async () => {
    const { file, repo } = await create();
    await writeFile(
      file,
      JSON.stringify({
        mismatch: {
          schemaVersion: 999,
          value: entity(),
          expiresAt: Date.now(),
        },
        corrupt: { schemaVersion: 1, value: null, expiresAt: Date.now() },
      }),
    );

    await expect(repo.get(request())).resolves.toBeUndefined();
  });

  it.each([
    ['الأماكن', 'الاماكن', 'محمد عبده', 'محمد عبده'],
    ['الأماكن', 'Al Amaken', 'محمد عبده', 'Mohammed Abdo'],
    ['ديدارا', 'Deidara', undefined, undefined],
  ])(
    'normalizes cache keys for %s / %s',
    async (stored, lookup, storedArtist, lookupArtist) => {
      const { repo } = await create();
      await repo.set(
        request({
          proposedEntity: stored,
          artist: storedArtist,
          entityType: stored === 'ديدارا' ? 'anime-character' : 'song',
          franchise: stored === 'ديدارا' ? 'Naruto' : undefined,
        }),
        entity({
          canonicalEntity: stored,
          entityType: stored === 'ديدارا' ? 'anime-character' : 'song',
        }),
        60,
      );

      const hit = await repo.get(
        request({
          proposedEntity: lookup,
          artist: lookupArtist,
          entityType: stored === 'ديدارا' ? 'anime-character' : 'song',
          franchise: stored === 'ديدارا' ? 'Naruto' : undefined,
        }),
      );

      expect(hit?.cacheHit).toBe(true);
    },
  );

  it('keeps artist-sensitive song keys and franchise-sensitive character keys', async () => {
    const { repo } = await create();
    await repo.set(request({ artist: 'محمد عبده' }), entity(), 60);
    await repo.set(
      request({
        proposedEntity: 'Deidara',
        entityType: 'anime-character',
        artist: undefined,
        franchise: 'Naruto',
      }),
      entity({ canonicalEntity: 'Deidara', entityType: 'anime-character' }),
      60,
    );

    await expect(
      repo.get(request({ artist: 'Artist Two' })),
    ).resolves.toBeUndefined();
    await expect(
      repo.get(
        request({
          proposedEntity: 'Deidara',
          entityType: 'anime-character',
          artist: undefined,
          franchise: 'Bleach',
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('supports manual development invalidation', async () => {
    const { repo } = await create();
    await repo.set(request(), entity(), 60);

    await repo.invalidate(request());

    await expect(repo.get(request())).resolves.toBeUndefined();
  });
});
