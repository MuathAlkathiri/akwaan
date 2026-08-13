import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ENTITY_RESEARCH_PROVIDER,
  type EntityResearchProvider,
} from '../contracts/entity-research-provider.interface';
import { WigoloCacheRepository } from '../infrastructure/wigolo/wigolo-cache.repository';
import { entityVerificationPolicy } from './entity-verification.policy';
import type {
  EntityVerificationRequest,
  VerificationDiagnostics,
  VerifiedEntity,
} from './entity-verification.types';

@Injectable()
export class EntityVerificationService {
  private readonly inFlight = new Map<string, Promise<VerifiedEntity>>();
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    @Inject(ENTITY_RESEARCH_PROVIDER)
    private readonly provider: EntityResearchProvider,
    private readonly cache: WigoloCacheRepository,
    private readonly config: ConfigService,
  ) {}

  async verify(request: EntityVerificationRequest): Promise<VerifiedEntity> {
    if (!entityVerificationPolicy.requiresExternalVerification(request))
      return this.localResult(request);
    const cached = await this.cache.get(request);
    if (cached)
      return {
        ...cached,
        issues: Array.from(
          new Set([...cached.issues, 'ENTITY_VERIFICATION_CACHE_HIT']),
        ),
      };
    const key = this.cache.key(request);
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const promise = this.run(request).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  async verifyBatch(
    requests: EntityVerificationRequest[],
  ): Promise<VerifiedEntity[]> {
    const unique = new Map<string, Promise<VerifiedEntity>>();
    return Promise.all(
      requests.map((request) => {
        const key = this.cache.key(request);
        const pending = unique.get(key) ?? this.verify(request);
        unique.set(key, pending);
        return pending;
      }),
    );
  }

  diagnostics(
    entity: VerifiedEntity,
    required = true,
  ): VerificationDiagnostics {
    const counts: VerificationDiagnostics['evidenceTierCounts'] = {};
    for (const item of entity.evidence)
      counts[item.sourceTier] = (counts[item.sourceTier] ?? 0) + 1;
    return {
      verificationRequired: required,
      verificationProvider: required ? 'wigolo' : 'local-knowledge',
      verificationStatus: entity.verificationStatus,
      verificationCacheHit: Boolean(entity.cacheHit),
      canonicalEntity: entity.canonicalEntity,
      canonicalAnswer: entity.canonicalAnswer,
      verifiedAliasesCount: entity.aliases.length,
      evidenceSourceCount: entity.evidence.length,
      evidenceTierCounts: counts,
      overallConfidence: entity.confidence.overall,
      identityConfidence: entity.confidence.identity,
      answerConfidence: entity.confidence.answer,
      associationConfidence: entity.confidence.association,
      verificationDurationMs: entity.durationMs ?? 0,
      verificationIssueCodes: entity.issues,
      ...(entity.song
        ? {
            canonicalSongTitle: entity.song.title,
            canonicalArtist: entity.song.artist,
            titleAliasCount: entity.song.titleAliases.length,
            artistAliasCount: entity.song.artistAliases.length,
            gulfAssociationVerified: entity.confidence.association >= 0.8,
          }
        : {}),
      ...(entity.franchise ? { verifiedFranchise: entity.franchise } : {}),
    };
  }

  private async run(
    request: EntityVerificationRequest,
  ): Promise<VerifiedEntity> {
    await this.acquire();
    const started = Date.now();
    try {
      const result = await this.provider.verifyEntity(request);
      const ttl =
        result.verificationStatus === 'REJECTED'
          ? this.number('WIGOLO_NEGATIVE_CACHE_TTL_SECONDS', 900)
          : this.number('WIGOLO_CACHE_TTL_SECONDS', 2_592_000);
      const value = {
        ...result,
        durationMs: result.durationMs || Date.now() - started,
      };
      await this.cache.set(request, value, ttl);
      return value;
    } catch (error) {
      const timeout =
        error instanceof Error && error.message.includes('TIMEOUT');
      return this.unavailable(request, timeout);
    } finally {
      this.release();
    }
  }

  private unavailable(
    request: EntityVerificationRequest,
    timeout: boolean,
  ): VerifiedEntity {
    return {
      verificationStatus: 'UNAVAILABLE',
      canonicalEntity: request.proposedEntity,
      canonicalAnswer: request.proposedAnswer,
      entityType: request.entityType,
      aliases: [],
      originalLanguageAliases: [],
      transliterations: [],
      confidence: { overall: 0, identity: 0, answer: 0, association: 0 },
      evidence: [],
      searchHints: {
        requiredTerms: [],
        trustedAliases: [],
        franchiseTerms: [],
        providerHints: [],
        prohibitedGenericTerms: [],
      },
      issues: [
        'ENTITY_VERIFICATION_UNAVAILABLE',
        timeout ? 'ENTITY_VERIFICATION_TIMEOUT' : 'WIGOLO_OPERATION_FAILED',
      ],
      cacheHit: false,
    };
  }

  private localResult(request: EntityVerificationRequest): VerifiedEntity {
    return {
      verificationStatus: 'VERIFIED',
      canonicalEntity: request.proposedEntity,
      canonicalAnswer: request.proposedAnswer,
      entityType: request.entityType,
      aliases: [request.proposedEntity],
      originalLanguageAliases: [],
      transliterations: [],
      franchise: request.franchise,
      ...(request.entityType === 'song'
        ? {
            song: {
              title: request.proposedEntity,
              artist: request.artist ?? '',
              titleAliases: [request.proposedEntity],
              artistAliases: request.artist ? [request.artist] : [],
              country: request.country,
            },
          }
        : {}),
      confidence: { overall: 1, identity: 1, answer: 1, association: 1 },
      evidence: [],
      searchHints: {
        requiredTerms: [request.proposedEntity],
        trustedAliases: [request.proposedEntity],
        franchiseTerms: request.franchise ? [request.franchise] : [],
        providerHints: [],
        prohibitedGenericTerms: [],
      },
      issues: ['ENTITY_VERIFICATION_SUCCEEDED'],
      cacheHit: true,
    };
  }

  private async acquire(): Promise<void> {
    const max = this.number('WIGOLO_MAX_CONCURRENCY', 2);
    if (this.active >= max)
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }
  private release(): void {
    this.active -= 1;
    this.waiters.shift()?.();
  }
  private number(key: string, fallback: number): number {
    const n = Number(this.config.get<string>(key));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }
}
