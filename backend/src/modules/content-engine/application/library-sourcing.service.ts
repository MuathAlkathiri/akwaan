import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  computeGenerationRequestHash,
  GenerationSpecification,
  specificationForSourcing,
} from '../domain/generation-specification';
import {
  allocateLibrarySourcing,
  GenerationSourcing,
  LIBRARY_SOURCING_VERSION,
  LibraryHookSeed,
  LibrarySeed,
  resolveLibraryAnchoredPercent,
  resolveLibraryMaxUsesPerRow,
  SourcingFallbackReason,
  SourcingMode,
} from '../domain/library-sourcing';
import { LibraryImportService } from './library-import.service';

export interface LibrarySourcingPlan {
  /** One job per mode that has candidates, anchored first. */
  specifications: GenerationSpecification[];
  anchoredCount: number;
  exploratoryCount: number;
  overflowCount: number;
  fallbackReason: SourcingFallbackReason | null;
  libraryIds: string[];
}

/**
 * Turns one requested batch into the jobs that will run it, reading the library
 * once and pinning what it read. Preflight and submission both come through
 * here, so a row changed between them shows up as plan drift.
 */
@Injectable()
export class LibrarySourcingService {
  private readonly logger = new Logger(LibrarySourcingService.name);

  constructor(
    private readonly library: LibraryImportService,
    private readonly config: ConfigService,
  ) {}

  async plan(spec: GenerationSpecification): Promise<LibrarySourcingPlan> {
    const target = {
      worldKey: spec.worldKey,
      scopeKey: spec.scopeKey,
      mechanicKey: spec.mechanicKey,
    };
    const [rows, hooks] = await Promise.all([
      this.library.findEligible(target),
      this.library.findWriterHooks(spec.mechanicKey),
    ]);
    const anchoredPercent = resolveLibraryAnchoredPercent(this.config);

    const seedKey = computeGenerationRequestHash(spec);
    const allocation = allocateLibrarySourcing({
      seedKey,
      targetCount: spec.targetCount,
      anchoredPercent,
      maxUsesPerRow: resolveLibraryMaxUsesPerRow(this.config),
      libraryIds: rows.map((row) => row.libraryId),
    });

    const fallbackReason: SourcingFallbackReason | null = !rows.length
      ? 'NO_ELIGIBLE_LIBRARY_ROWS'
      : anchoredPercent === 0
        ? 'LIBRARY_ANCHORING_DISABLED'
        : null;
    if (fallbackReason === 'NO_ELIGIBLE_LIBRARY_ROWS') {
      this.logger.warn({
        event: 'engine_library_exploratory_fallback',
        reason: fallbackReason,
        ...target,
        targetCount: spec.targetCount,
      });
    }
    if (allocation.overflowCount > 0) {
      this.logger.warn({
        event: 'engine_library_pool_exhausted',
        ...target,
        eligibleRows: rows.length,
        movedToExploratory: allocation.overflowCount,
      });
    }

    const usedIds = new Set(allocation.slots.flatMap((s) => s.libraryIds));
    const seeds = rows
      .filter((row) => usedIds.has(row.libraryId))
      .map((row): LibrarySeed => ({
        libraryId: row.libraryId,
        role: row.role,
        questionText: row.questionText,
        verifiedAnswer: row.verifiedAnswer!,
        canonicalAnswer: row.canonicalAnswer,
        canonicalNumber: row.canonicalNumber,
        sourceUrl: row.sourceUrl!,
        ...(row.sourceUrls.length > 1
          ? { additionalSourceUrls: row.sourceUrls.slice(1) }
          : {}),
        verifiedOn: row.verifiedOn!,
        revalidateAfter: row.revalidateAfter,
        sourceWarning: row.sourceWarning,
      }));
    const hookSeeds = hooks.map((hook): LibraryHookSeed => ({
      hookId: hook.hookId,
      nameAr: hook.nameAr,
      description: hook.description,
      caution: hook.caution,
    }));

    const batchKey = createHash('sha256')
      .update(JSON.stringify([seedKey, allocation.slots, seeds, hookSeeds]))
      .digest('hex');
    const sourcingFor = (mode: SourcingMode): GenerationSourcing => ({
      version: LIBRARY_SOURCING_VERSION,
      mode,
      batchKey,
      anchoredPercent,
      batchTargetCount: spec.targetCount,
      fallbackReason,
      slots: mode === 'library_anchored' ? allocation.slots : [],
      seeds: mode === 'library_anchored' ? seeds : [],
      hooks: mode === 'exploratory' ? hookSeeds : [],
    });

    return {
      specifications: [
        ...(allocation.anchoredCount
          ? [
              specificationForSourcing(
                spec,
                sourcingFor('library_anchored'),
                allocation.anchoredCount,
              ),
            ]
          : []),
        ...(allocation.exploratoryCount
          ? [
              specificationForSourcing(
                spec,
                sourcingFor('exploratory'),
                allocation.exploratoryCount,
              ),
            ]
          : []),
      ],
      anchoredCount: allocation.anchoredCount,
      exploratoryCount: allocation.exploratoryCount,
      overflowCount: allocation.overflowCount,
      fallbackReason,
      libraryIds: [...usedIds].sort(),
    };
  }
}
