import { ConfigService } from '@nestjs/config';
import type { EntityResearchProvider } from '../contracts/entity-research-provider.interface';
import { WigoloCacheRepository } from '../infrastructure/wigolo/wigolo-cache.repository';
import { EntityVerificationService } from './entity-verification.service';
import type {
  EntityVerificationRequest,
  VerifiedEntity,
} from './entity-verification.types';

const request: EntityVerificationRequest = {
  proposedEntity: 'الاماكن',
  proposedAnswer: 'الاماكن',
  entityType: 'song',
  artist: 'Mohammed Abdo',
  language: 'ar',
  gameMode: 'identifySong',
  intendedAsset: 'song',
};
const verified: VerifiedEntity = {
  verificationStatus: 'VERIFIED',
  canonicalEntity: 'الأماكن',
  canonicalAnswer: 'الأماكن',
  entityType: 'song',
  aliases: ['الأماكن', 'Al Amaken'],
  originalLanguageAliases: ['الأماكن'],
  transliterations: ['Al Amaken'],
  song: {
    title: 'الأماكن',
    artist: 'محمد عبده',
    titleAliases: ['Al Amaken'],
    artistAliases: ['Mohammed Abdo'],
  },
  confidence: { overall: 0.9, identity: 0.95, answer: 0.95, association: 0.9 },
  evidence: [
    {
      sourceTitle: 'one',
      sourceDomain: 'music.apple.com',
      sourceTier: 'structured-platform',
      supportsIdentity: true,
      supportsAnswer: true,
      supportsAssociation: true,
    },
  ],
  searchHints: {
    requiredTerms: ['الأماكن', 'محمد عبده'],
    trustedAliases: ['Al Amaken'],
    franchiseTerms: [],
    providerHints: ['official audio'],
    prohibitedGenericTerms: [],
  },
  issues: ['ENTITY_VERIFICATION_SUCCEEDED'],
};

describe('EntityVerificationService', () => {
  it('returns canonical verified identity and caches it', async () => {
    let calls = 0;
    const provider: EntityResearchProvider = {
      verifyEntity: async () => {
        calls += 1;
        return verified;
      },
    };
    const config = new ConfigService({
      WIGOLO_CACHE_FILE: `/tmp/lammah-wigolo-${Date.now()}.json`,
    });
    const service = new EntityVerificationService(
      provider,
      new WigoloCacheRepository(config),
      config,
    );
    expect((await service.verify(request)).canonicalEntity).toBe('الأماكن');
    expect((await service.verify(request)).cacheHit).toBe(true);
    expect(calls).toBe(1);
  });

  it('deduplicates identical batch verification', async () => {
    let calls = 0;
    const provider: EntityResearchProvider = {
      verifyEntity: async () => {
        calls += 1;
        return verified;
      },
    };
    const config = new ConfigService({
      WIGOLO_CACHE_FILE: `/tmp/lammah-wigolo-batch-${Date.now()}.json`,
    });
    const service = new EntityVerificationService(
      provider,
      new WigoloCacheRepository(config),
      config,
    );
    const results = await service.verifyBatch([request, request]);
    expect(results).toHaveLength(2);
    expect(calls).toBe(1);
  });

  it('maps provider timeout to an unavailable safe result', async () => {
    const provider: EntityResearchProvider = {
      verifyEntity: async () => {
        throw new Error('ENTITY_VERIFICATION_TIMEOUT');
      },
    };
    const config = new ConfigService({
      WIGOLO_CACHE_FILE: `/tmp/lammah-wigolo-timeout-${Date.now()}.json`,
    });
    const result = await new EntityVerificationService(
      provider,
      new WigoloCacheRepository(config),
      config,
    ).verify(request);
    expect(result.verificationStatus).toBe('UNAVAILABLE');
    expect(result.issues).toContain('ENTITY_VERIFICATION_TIMEOUT');
  });
});
