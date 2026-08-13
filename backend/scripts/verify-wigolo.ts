import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { EntityVerificationService } from '../src/modules/ai-agent/application/entity-verification.service';
import type { VerificationEntityType } from '../src/modules/ai-agent/application/entity-verification.types';
import { WigoloCacheRepository } from '../src/modules/ai-agent/infrastructure/wigolo/wigolo-cache.repository';
import { WigoloClient } from '../src/modules/ai-agent/infrastructure/wigolo/wigolo-client';
import { WigoloResearchProvider } from '../src/modules/ai-agent/infrastructure/wigolo/wigolo-research.provider';

const value = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const has = (name: string): boolean => process.argv.includes(name);

async function main() {
  const entity = value('--entity');
  if (!entity) throw new Error('--entity is required');
  const config = new ConfigService(process.env);
  const client = new WigoloClient(config);
  const provider = new WigoloResearchProvider(client, config);
  const cache = new WigoloCacheRepository(config);
  const service = new EntityVerificationService(provider, cache, config);
  const started = Date.now();
  const diagnostic = has('--diagnostic');
  const request = {
    proposedEntity: entity,
    proposedAnswer: entity,
    entityType: (value('--type') ?? 'unknown') as VerificationEntityType,
    artist: value('--artist'),
    franchise: value('--franchise'),
    language: 'ar',
    gameMode: value('--type') === 'song' ? 'identifySong' : 'identifyImage',
    intendedAsset: value('--type') === 'song' ? 'song' : 'image',
  } as const;
  if (has('--refresh')) await cache.invalidate(request);
  const runtime = diagnostic ? await client.runtimeInfo() : undefined;
  const toolDiagnostics = diagnostic
    ? await collectToolDiagnostics(client, request)
    : undefined;
  const result = await service.verify(request);
  process.stdout.write(
    `${JSON.stringify(
      diagnostic
        ? {
            wigoloVersion: runtime?.version,
            installationType: runtime?.installationType,
            transport: runtime?.transport,
            capabilities: runtime?.tools.map((tool) => ({
              name: tool.name,
              required: tool.required,
              inputKeys: tool.inputKeys,
            })),
            envNames: runtime?.envNames,
            searchSucceeded: toolDiagnostics?.searchSucceeded,
            searchResultCount: toolDiagnostics?.searchResultCount,
            researchSucceeded: toolDiagnostics?.researchSucceeded,
            researchSourceCount: toolDiagnostics?.researchSourceCount,
            contentBlockTypes: toolDiagnostics?.contentBlockTypes,
            structuredContentPresent: toolDiagnostics?.structuredContentPresent,
            mappedEvidenceCount: result.evidence.length,
            verificationStatus: result.verificationStatus,
            canonicalEntity: result.canonicalEntity,
            canonicalArtist: result.song?.artist,
            evidenceDomains: result.evidence.map((item) => item.sourceDomain),
            cacheHit: Boolean(result.cacheHit),
            issueCodes: result.issues,
            durationMs: Date.now() - started,
          }
        : {
            status: result.verificationStatus,
            canonicalEntity: result.canonicalEntity,
            canonicalArtist: result.song?.artist,
            aliases: result.aliases,
            confidence: result.confidence,
            evidenceCount: result.evidence.length,
            evidenceDomains: result.evidence.map((item) => item.sourceDomain),
            cacheHit: Boolean(result.cacheHit),
            durationMs: Date.now() - started,
            issueCodes: result.issues,
          },
      null,
      2,
    )}\n`,
  );
  await client.onModuleDestroy();
}

async function collectToolDiagnostics(
  client: WigoloClient,
  request: {
    proposedEntity: string;
    entityType: VerificationEntityType;
    artist?: string;
    franchise?: string;
  },
) {
  const searchQueries =
    request.entityType === 'song'
      ? [
          [request.artist, request.proposedEntity].filter(Boolean).join(' '),
          [request.proposedEntity, request.artist, 'song']
            .filter(Boolean)
            .join(' '),
        ]
      : [
          [request.proposedEntity, request.franchise].filter(Boolean).join(' '),
          [request.proposedEntity, request.franchise, 'character']
            .filter(Boolean)
            .join(' '),
        ];
  const researchQuestion =
    request.entityType === 'song'
      ? [request.proposedEntity, request.artist, 'song artist release year']
          .filter(Boolean)
          .join(' ')
      : [
          request.proposedEntity,
          request.franchise,
          request.entityType,
          'identity aliases association',
        ]
          .filter(Boolean)
          .join(' ');
  const search = await client.callToolDetailed('search', {
    query: searchQueries,
    max_results: 8,
    max_fetches: 4,
    search_depth: 'balanced',
    include_full_markdown: false,
    citation_format: 'json',
  });
  const research = await client.callToolDetailed('research', {
    question: researchQuestion,
    depth: 'quick',
    max_sources: 8,
    max_tokens_out: 3500,
    include_full_markdown: false,
    citation_format: 'json',
  });
  return {
    searchSucceeded: true,
    searchResultCount: countRows(search.data),
    researchSucceeded: true,
    researchSourceCount: countRows(research.data),
    contentBlockTypes: Array.from(
      new Set([
        ...search.diagnostics.contentBlockTypes,
        ...research.diagnostics.contentBlockTypes,
      ]),
    ),
    structuredContentPresent:
      search.diagnostics.structuredContentPresent ||
      research.diagnostics.structuredContentPresent,
  };
}

function countRows(data: Record<string, unknown>): number {
  const arrays = ['results', 'sources', 'citations', 'evidence'];
  return Math.max(
    0,
    ...arrays.map((key) =>
      Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0,
    ),
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ status: 'UNAVAILABLE', issueCodes: ['WIGOLO_OPERATION_FAILED'], message: error instanceof Error ? error.message : 'Unknown failure' })}\n`,
  );
  process.exitCode = 1;
});
