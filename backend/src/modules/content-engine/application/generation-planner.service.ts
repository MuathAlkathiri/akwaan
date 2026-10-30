import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { CanonicalFamilyCatalog } from '../domain/canonical-family.types';
import {
  GenerationSlot,
  PlannerDiversityConfig,
  ScopeDiversityConstraint,
} from '../domain/creative-plan.types';
import { allocateCreativeSlots } from '../domain/creative-slot-allocator';
import { ScopeHistoricalCoverageReport } from '../domain/historical-coverage.types';
import { AuthoringContextService } from './authoring-context.service';
import { HistoricalCoverageService } from './historical-coverage.service';

export interface GenerationPlanInput {
  worldKey: string;
  scopeKey: string;
  mechanicKey: string;
  count: number;
  difficulty?: string | null;
  batchGuidance?: string | null;
  catalog?: CanonicalFamilyCatalog | null;
  coverage?: ScopeHistoricalCoverageReport | null;
  diversityConfig?: Partial<PlannerDiversityConfig> | null;
  scopeDiversityConstraints?: ScopeDiversityConstraint | null;
  seed?: string | null;
}

export interface GenerationPlanMediaIntent {
  gameplayMediaRequired: boolean;
  displayArtworkPolicy: string;
  allowedAspectRatios: string[];
}

export interface GenerationPlan {
  worldKey: string;
  scopeKey: string;
  mechanicKey: string;
  count: number;
  difficulty: string;
  difficultyQuotas: Record<string, number>;
  archetypes: string[];
  decisionLoopGuidelines: string[];
  antiPatterns: string[];
  correctnessRequirements: string[];
  mediaIntent: GenerationPlanMediaIntent;
  digest: string;
  catalogDigest?: string;
  coverageDigest?: string;
  slots?: GenerationSlot[];
  diversityMetrics?: {
    exploitationCount: number;
    explorationCount: number;
    distinctFamiliesCount: number;
    diagnostics: string[];
  };
}

/**
 * Canonical digest algorithm for GenerationPlan.
 * Cryptographically hashes the plan's execution specification, target parameters,
 * canonical family slots, and provenance digests with SHA-256.
 */
export function computeGenerationPlanDigest(
  plan: Pick<
    GenerationPlan,
    | 'worldKey'
    | 'scopeKey'
    | 'mechanicKey'
    | 'count'
    | 'difficulty'
    | 'difficultyQuotas'
    | 'archetypes'
    | 'decisionLoopGuidelines'
    | 'antiPatterns'
    | 'correctnessRequirements'
    | 'mediaIntent'
  > & {
    catalogDigest?: string;
    coverageDigest?: string;
    slots?: GenerationSlot[];
  },
): string {
  const canonicalSummary: Record<string, unknown> = {
    worldKey: plan.worldKey,
    scopeKey: plan.scopeKey,
    mechanicKey: plan.mechanicKey,
    count: plan.count,
    difficulty: plan.difficulty,
    difficultyQuotas: plan.difficultyQuotas,
    archetypes: plan.archetypes,
    decisionLoopGuidelines: plan.decisionLoopGuidelines,
    antiPatterns: plan.antiPatterns,
    correctnessRequirements: plan.correctnessRequirements,
    mediaIntent: plan.mediaIntent,
  };

  if (plan.catalogDigest) {
    canonicalSummary.catalogDigest = plan.catalogDigest;
  }
  if (plan.coverageDigest) {
    canonicalSummary.coverageDigest = plan.coverageDigest;
  }
  if (plan.slots && plan.slots.length > 0) {
    canonicalSummary.slots = plan.slots;
  }

  return createHash('sha256')
    .update(JSON.stringify(canonicalSummary))
    .digest('hex');
}

@Injectable()
export class GenerationPlannerService {
  constructor(
    @Optional()
    private readonly authoringContext?: AuthoringContextService,
    @Optional()
    private readonly historicalCoverage?: HistoricalCoverageService,
  ) {}

  /**
   * High-level entry point (Slice 3B): Resolves authoritative canonical family catalog
   * and live historical coverage for the requested Scope and executes deterministic creative
   * slot allocation.
   *
   * Distinguishes:
   * 1. Catalog genuinely absent -> preserves V1 behavior with diagnostic.
   * 2. Catalog present but malformed -> fails closed with typed error.
   * 3. Catalog present but zero compatible families -> fails closed with typed error.
   * 4. Incomplete historical coverage -> fails closed with typed error.
   */
  async planWithResolvedContext(
    input: Omit<GenerationPlanInput, 'catalog' | 'coverage'> & {
      catalogOverride?: CanonicalFamilyCatalog | null;
      coverageOverride?: ScopeHistoricalCoverageReport | null;
    },
  ): Promise<GenerationPlan> {
    const worldKey = (input.worldKey ?? '').trim();
    const scopeKey = (input.scopeKey ?? '').trim();

    let catalog: CanonicalFamilyCatalog | null | undefined =
      input.catalogOverride;

    if (catalog === undefined) {
      if (!this.authoringContext) {
        throw new Error(
          'AuthoringContextService is required to resolve canonical family catalog for scope',
        );
      }
      try {
        catalog = this.authoringContext.resolveCanonicalFamiliesForScope({
          worldKey,
          scopeKey,
        });
      } catch (err: unknown) {
        // If the error indicates scope/world is missing from authoring manifest or catalog file is missing,
        // treat genuinely absent as undefined/null to preserve V1 behavior.
        // If it is a FamilyResolutionError or syntax error, rethrow to fail closed!
        const errMsg = err instanceof Error ? err.message : String(err);
        if (
          errMsg.includes('UNKNOWN_WORLD') ||
          errMsg.includes('UNKNOWN_SCOPE') ||
          errMsg.includes('SCOPE_WORLD_MISMATCH') ||
          errMsg.includes('REQUIRED_SCOPE_PROFILE_MISSING') ||
          errMsg.includes('REQUIRED_SCOPE_KNOWLEDGE_MISSING')
        ) {
          catalog = null;
        } else {
          // Re-throw genuine malformed / syntax / parity errors
          throw err;
        }
      }
    }

    let coverage: ScopeHistoricalCoverageReport | null | undefined =
      input.coverageOverride;

    if (coverage === undefined && catalog && catalog.families.length > 0) {
      if (!this.historicalCoverage) {
        throw new Error(
          'HistoricalCoverageService is required to resolve historical coverage for scope',
        );
      }
      coverage = await this.historicalCoverage.getCoverage({
        worldKey,
        scopeKey,
      });
    }

    return this.plan({
      ...input,
      catalog,
      coverage,
    });
  }
  /**
   * Builds a deterministic generation plan tailored to the requested World,
   * Scope, Mechanic, candidate count, and difficulty distribution.
   */
  plan(input: GenerationPlanInput): GenerationPlan {
    const worldKey = (input.worldKey ?? '').trim();
    const scopeKey = (input.scopeKey ?? '').trim();
    const mechanicKey = (input.mechanicKey ?? '').trim();
    const count = Math.max(1, Math.floor(input.count || 1));
    const rawDifficulty = (input.difficulty ?? '').trim().toLowerCase();
    const difficulty = rawDifficulty || 'mixed';

    const difficultyQuotas = this.computeDifficultyQuotas(count, difficulty);
    const archetypes = this.resolveArchetypes(mechanicKey, scopeKey);
    const decisionLoopGuidelines = this.resolveDecisionLoop(mechanicKey);
    const antiPatterns = this.resolveAntiPatterns(mechanicKey, scopeKey);
    const correctnessRequirements =
      this.resolveCorrectnessRequirements(mechanicKey);
    const mediaIntent = this.resolveMediaIntent(mechanicKey, worldKey);

    let slotAllocationResult:
      ReturnType<typeof allocateCreativeSlots> | undefined;

    if (input.catalog !== undefined && input.catalog !== null) {
      slotAllocationResult = allocateCreativeSlots({
        worldKey,
        scopeKey,
        mechanicKey,
        count,
        difficulty,
        difficultyQuotas,
        catalog: input.catalog,
        coverage: input.coverage,
        config: input.diversityConfig ?? undefined,
        scopeConstraints: input.scopeDiversityConstraints ?? undefined,
        seed: input.seed ?? undefined,
      });
    }

    const digest = computeGenerationPlanDigest({
      worldKey,
      scopeKey,
      mechanicKey,
      count,
      difficulty,
      difficultyQuotas,
      archetypes,
      decisionLoopGuidelines,
      antiPatterns,
      correctnessRequirements,
      mediaIntent,
      catalogDigest: slotAllocationResult?.catalogDigest,
      coverageDigest: slotAllocationResult?.coverageDigest,
      slots: slotAllocationResult?.slots,
    });

    return {
      worldKey,
      scopeKey,
      mechanicKey,
      count,
      difficulty,
      difficultyQuotas,
      archetypes,
      decisionLoopGuidelines,
      antiPatterns,
      correctnessRequirements,
      mediaIntent,
      digest,
      ...(slotAllocationResult
        ? {
            catalogDigest: slotAllocationResult.catalogDigest,
            coverageDigest: slotAllocationResult.coverageDigest,
            slots: slotAllocationResult.slots,
            diversityMetrics: {
              exploitationCount: slotAllocationResult.exploitationCount,
              explorationCount: slotAllocationResult.explorationCount,
              distinctFamiliesCount: slotAllocationResult.distinctFamiliesCount,
              diagnostics: slotAllocationResult.diagnostics,
            },
          }
        : {}),
    };
  }

  /**
   * Formats a GenerationPlan into clear, actionable markdown instructions
   * ready to be embedded directly into LLM generation prompts.
   */
  formatPlanForPrompt(plan: GenerationPlan): string {
    const quotaLines = Object.entries(plan.difficultyQuotas)
      .map(([tier, qty]) => `  - ${tier}: exactly ${qty} item(s)`)
      .join('\n');

    const archetypeLines = plan.archetypes
      .map((arch) => `  * ${arch}`)
      .join('\n');

    const loopLines = plan.decisionLoopGuidelines
      .map((step) => `  - ${step}`)
      .join('\n');

    const antiPatternLines = plan.antiPatterns
      .map((ap) => `  [!] ${ap}`)
      .join('\n');

    const correctnessLines = plan.correctnessRequirements
      .map((req) => `  [v] ${req}`)
      .join('\n');

    const slotLines = (plan.slots ?? []).map(
      (s) =>
        `  - [Slot #${s.slotIndex + 1}] (${s.mode.toUpperCase()}) ${s.familyNameAr} [${s.familyKey}] | Tier: ${s.difficulty} | Task: ${s.cognitiveTask} | Direction: ${s.creativeAngle}`,
    );

    const sections = [
      '## TACTICAL GENERATION PLAN (MANDATORY EXECUTION SPECIFICATION)',
      `Target: ${plan.count} candidate item(s) for [${plan.mechanicKey}] in Scope [${plan.scopeKey}] (World: ${plan.worldKey}).`,
      `Plan Digest: ${plan.digest}`,
      '',
      '### 1. DIFFICULTY TARGET QUOTAS',
      `Requested Mode: ${plan.difficulty}`,
      quotaLines,
      '',
      '### 2. MECHANIC ARCHETYPES & COMPOSITION',
      'Distribute the generated batch across these approved challenge archetypes:',
      archetypeLines,
      '',
      '### 3. GAMEPLAY DECISION LOOP & BLUFF SWEET SPOT',
      loopLines,
      '',
      '### 4. CRITICAL NEGATIVE ANTI-PATTERNS (INSTANT REJECTION TRIGGERS)',
      'Any candidate exhibiting any of these anti-patterns fails automated screening:',
      antiPatternLines,
      '',
      '### 5. CORRECTNESS & SOLVABILITY VERIFICATION',
      correctnessLines,
      '',
      '### 6. MEDIA ENRICHMENT METADATA',
      `  - Gameplay Media Required: ${plan.mediaIntent.gameplayMediaRequired ? 'YES' : 'NO (pure text/mechanic)'}`,
      `  - Display Artwork Policy: ${plan.mediaIntent.displayArtworkPolicy}`,
      `  - Approved Aspect Ratios: ${plan.mediaIntent.allowedAspectRatios.join(', ')}`,
    ];

    if (slotLines.length > 0) {
      sections.push(
        '',
        '### 7. PER-QUESTION CREATIVE SLOTS (SLOT ALLOCATOR SPECIFICATION)',
        'Each candidate in the batch MUST correspond strictly to its assigned slot index and canonical family directive:',
        ...slotLines,
      );
    }

    return sections.join('\n');
  }

  private computeDifficultyQuotas(
    count: number,
    difficulty: string,
  ): Record<string, number> {
    if (
      difficulty === 'easy' ||
      difficulty === 'medium' ||
      difficulty === 'hard'
    ) {
      return { [difficulty]: count };
    }

    // Mixed distribution: ~60% medium, ~20% easy, ~20% hard
    if (count === 1) return { medium: 1 };
    if (count === 2) return { medium: 1, easy: 1 };
    if (count === 3) return { medium: 1, easy: 1, hard: 1 };
    if (count === 4) return { medium: 2, easy: 1, hard: 1 };
    if (count === 5) return { medium: 3, easy: 1, hard: 1 };

    const easy = Math.max(1, Math.floor(count * 0.2));
    const hard = Math.max(1, Math.floor(count * 0.2));
    const medium = count - (easy + hard);
    return { medium, easy, hard };
  }

  private resolveArchetypes(mechanicKey: string, scopeKey: string): string[] {
    if (mechanicKey === 'read-your-opponent') {
      const archetypes = [
        'Misconception Trap: The obvious intuitive answer is a widespread popular myth; the correct answer is counter-intuitive but solid fact.',
        'Believable Anchor: Multiple plausible competitors; requires distinguishing nuances rather than guessing blindly.',
        'Balanced Split: Two strong choices where general crowd confidence naturally divides ~50/50, generating optimal Steal vs Trust bluff tension.',
      ];
      if (
        scopeKey.includes('letters') ||
        scopeKey.includes('wordplay') ||
        scopeKey.includes('puzzles')
      ) {
        archetypes.push(
          'Wordplay & Lexical Association: Tests semantic connections, subtle synonyms, or letter patterns.',
        );
      }
      return archetypes;
    }
    if (mechanicKey === 'closest') {
      return [
        'Knowledge-Anchored Estimation: Exact quantity known by specialists; broad population can reason to the correct order of magnitude.',
        'Deductive Constraint Range: Clue supplies domain anchors; careful deduction narrows down the plausible span.',
      ];
    }
    return [
      'Core Knowledge Challenge: Testing domain-native recall and associative thinking.',
      'Comparative Discrimination: Distinguishing between closely related domain entities.',
    ];
  }

  private resolveDecisionLoop(mechanicKey: string): string[] {
    if (mechanicKey === 'read-your-opponent') {
      return [
        'THE 40-80% CONFIDENCE SWEET SPOT: The answering team must feel neither 100% certainty (which triggers automatic opponent Steal) nor 0% clue (which triggers automatic opponent Trust).',
        'EVERY DISTRACTOR MUST HAVE A RATIONALE: Each incorrect option must lure real players for an articulate, defensible psychological reason.',
        'UNAMBIGUOUS ARABIC PHRASING: Questions must be sharp and precise, avoiding linguistic ambiguity or debatable definitions.',
      ];
    }
    if (mechanicKey === 'closest') {
      return [
        'ANCHORED SLIDER RANGE: Span must divide cleanly into at least 10 slider positions without centering or squeezing the target.',
        'FAIR ESTIMATION GROUND: Teams with no exact recall must still have intuitive anchors to reason toward the neighborhood.',
      ];
    }
    return [
      'Strict compliance with canonical mechanic rules and validation gates.',
    ];
  }

  private resolveAntiPatterns(mechanicKey: string, scopeKey: string): string[] {
    const list: string[] = [
      'NO 100% ELEMENTARY TRIVIA: Never generate questions with universally obvious answers (e.g. elementary plurals like "جمع كتاب = كتب" or "جمع طفل = أطفال"). Zero bluff tension.',
      'NO ANSWER LEAKAGE: The correct answer (or key target word) must NEVER appear inside the prompt, context sentence, or clue text.',
      'NO MOVING OR UNDATED TARGETS: Never ask for drifting metrics, active records, or undefined comparison sets without explicitly pinning the date or scope.',
      'NO OBVIOUS THROWAWAY DISTRACTORS: Options that are ludicrous, misspelled, or out of context destroy challenge integrity.',
    ];

    if (mechanicKey === 'read-your-opponent') {
      list.push(
        'NO TRIVIAL BINARY CHOICES: Avoid polar yes/no trivia disguised as multi-choice.',
      );
    }

    if (
      scopeKey.includes('letters') ||
      scopeKey.includes('wordplay') ||
      scopeKey.includes('puzzles')
    ) {
      list.push(
        'NO UNSOLVABLE ANAGRAMS: For letter-rearrangement or word-construction challenges, the letters provided in the clue MUST match the correct answer letters with 100% multiset equality (identical letter count, identical character identities, no missing or hallucinated letters).',
      );
    }

    return list;
  }

  private resolveCorrectnessRequirements(mechanicKey: string): string[] {
    const requirements = [
      'Factually & Logically Defensible: Every statement, answer, and distractor must be verifiable against authoritative sources (for knowledge) or provable by sound mathematical/spatial/lexical rules (for puzzles). Every candidate must state its answer-critical claim in factualClaims.',
      'Modern Standard Arabic: Strict adherence to standard Arabic grammar, correct hamzat (أ, إ, آ), proper taa marbuta (ة vs ه), and no typos.',
      'Mutually Exclusive Options: Options must be distinct; no overlapping or duplicate meanings.',
    ];
    if (mechanicKey === 'closest') {
      requirements.push(
        'Grid Divisibility: correctValue must strictly equal min + stepsFromMin * step.',
      );
    }
    return requirements;
  }

  private resolveMediaIntent(
    mechanicKey: string,
    worldKey: string,
  ): GenerationPlanMediaIntent {
    const isMediaNative = ['marhala', 'bomb', 'odd-piece'].includes(
      mechanicKey,
    );
    return {
      gameplayMediaRequired: isMediaNative,
      displayArtworkPolicy: `World Question Fallback for ${worldKey} only when gameplay media is absent. Display artwork must never reveal answers or distract from gameplay.`,
      allowedAspectRatios: ['16:9'],
    };
  }
}
