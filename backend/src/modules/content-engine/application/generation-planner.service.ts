import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { CanonicalFamilyCatalog } from '../domain/canonical-family.types';
import {
  GenerationSlot,
  PlannerDiversityConfig,
  ScopeDiversityConstraint,
  RecentSlotUsage,
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
  /** What the previous batch for this target drew; see `RecentSlotUsage`. */
  recent?: RecentSlotUsage | null;
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
  /**
   * The seed the creative slots were allocated from. Present only when slots
   * were allocated (a V1 plan has nothing seeded). Digest-covered, so a stored
   * plan cannot be re-attributed to another batch's seed.
   */
  seed?: string;
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
    seed?: string;
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
  // Conditional, like the provenance digests above: plans pinned before the
  // seed was recorded keep verifying against their original digest.
  if (plan.seed) {
    canonicalSummary.seed = plan.seed;
  }

  return createHash('sha256')
    .update(JSON.stringify(canonicalSummary))
    .digest('hex');
}

const PUZZLES_WORLD_KEY = 'puzzles';

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
      // A Scope whose profiles declare no family blocks resolves to a valid
      // empty catalog (see resolveCanonicalFamilies). That is the legacy,
      // catalog-absent case, not a malformed one: the slot allocator rejects
      // an empty family list, so handing it over would fail every job for
      // every legacy Scope closed. Plan it as V1.
      if (catalog && catalog.families.length === 0) {
        catalog = null;
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

    // What the previous batch for this target drew, so this one differs.
    // Best effort: without it the batch is planned as before, never refused.
    let recent: RecentSlotUsage | null | undefined = input.recent;
    if (recent === undefined && catalog && this.historicalCoverage) {
      try {
        recent = await this.historicalCoverage.getRecentSlotUsage?.({
          worldKey,
          scopeKey,
          mechanicKey: (input.mechanicKey ?? '').trim(),
        });
      } catch {
        recent = undefined;
      }
    }

    return this.plan({
      ...input,
      catalog,
      coverage,
      recent,
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

    // اقرأ خصمك in عالم الألغاز is its own contract (owner decision
    // 2026-11-25): direct know-it-or-not questions at one easy-leaning level,
    // because the difficulty is in reading the other team, not in the item.
    const puzzlesRyo =
      worldKey === PUZZLES_WORLD_KEY && mechanicKey === 'read-your-opponent';
    const difficultyQuotas = this.computeDifficultyQuotas(
      count,
      difficulty,
      // Only an unstated difficulty takes the World's own default; an
      // operator who asks for a mix by name still gets one — except for
      // اقرأ خصمك here, whose "mixed" is the form's default, not a request.
      rawDifficulty && !puzzlesRyo ? '' : worldKey,
    );
    const archetypes = puzzlesRyo
      ? [
          'Know It Or Not: one direct question with one plain answer; a team either has it at once or is guessing, and knows which.',
          'Easy Enough To Doubt: so reachable that the other team must ask whether anyone could really miss it.',
          'Just Out Of Reach: answerable by some people and not others, which is the room a team needs to act sure.',
        ]
      : this.resolveArchetypes(mechanicKey, scopeKey);
    const decisionLoopGuidelines = puzzlesRyo
      ? [
          'THE DIFFICULTY IS THE READ, NOT THE ITEM: the question is direct and medium leaning easy. The doubt belongs to the other team — did they really know it, or are they acting?',
          'THE TEAM KNOWS WHETHER IT KNEW: never a trap that makes a team confidently wrong. A team fooled by the item has nothing to hide and nothing to bluff.',
          'ONE PLAIN ANSWER: four options, exactly one right, and nothing a reasonable player could argue about afterwards.',
        ]
      : [
          ...this.resolveDecisionLoop(mechanicKey),
          ...this.resolveWorldDecisionLoop(mechanicKey, worldKey),
        ];
    const antiPatterns = puzzlesRyo
      ? [
          'NO TRAPS: no trick wording, no counter-intuitive catch, no "obvious answer is wrong". That is the opposite of this mechanic here.',
          'NO MULTI-STEP PUZZLES: nothing that needs working through. One look, one recall, or one short sum.',
          'NO ANSWER LEAKAGE: the correct answer must never appear inside the prompt.',
          'NO OBSCURE KNOWLEDGE: a riddle or proverb only the well-read know is a lottery. Use the ones people actually say.',
          'NO DISPUTABLE ANSWERS: a riddle with two accepted answers, or a proverb with two common endings, is discarded.',
          'NO PICTURE YET: never write "shown", "drawn", "in the picture" or "الصورة".',
        ]
      : [
          ...this.resolveAntiPatterns(mechanicKey, scopeKey),
          ...this.resolveWorldAntiPatterns(worldKey),
        ];
    const correctnessRequirements =
      this.resolveCorrectnessRequirements(mechanicKey);
    const mediaIntent = this.resolveMediaIntent(mechanicKey, worldKey);

    let slotAllocationResult:
      ReturnType<typeof allocateCreativeSlots> | undefined;

    // `resolveCanonicalFamilies` answers a Scope with no family block with an
    // empty catalog, not null. planWithResolvedContext already maps that to V1;
    // this guard covers direct `plan()` callers too. A malformed `families`
    // value still reaches the allocator and fails closed.
    const declaresNoFamilies =
      Array.isArray(input.catalog?.families) &&
      input.catalog.families.length === 0;

    if (
      input.catalog !== undefined &&
      input.catalog !== null &&
      !declaresNoFamilies
    ) {
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
        recent: input.recent ?? undefined,
      });
    }

    const planSeed =
      slotAllocationResult && input.seed ? input.seed : undefined;

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
      ...(planSeed ? { seed: planSeed } : {}),
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
            ...(planSeed ? { seed: planSeed } : {}),
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
        ...((plan.slots ?? []).some((slot) => slot.variantKey)
          ? [
              "A Direction that begins with TEMPLATE names the scenario that slot MUST be written in. It is not a suggestion: do not swap it for the family's usual example, and do not write two slots of one family in the same scenario. Two items of one family must differ in KIND, not only in their numbers or words.",
            ]
          : []),
      );
    }

    return sections.join('\n');
  }

  /**
   * عالم الألغاز, owner decision 2026-11-24. Stated here rather than only in
   * the World's profile because the plan is printed inside the TASK, which is
   * the part of a prompt a generator reads last and acts on most; the same
   * rules sit thousands of characters earlier in the Scope knowledge.
   */
  private resolveWorldAntiPatterns(worldKey: string): string[] {
    if (worldKey !== PUZZLES_WORLD_KEY) return [];
    return [
      'PUZZLES — SOLVED, NOT RECALLED: Everything the player needs is in the prompt, or is something every player knows (the alphabet, the days of the week, minutes in an hour). Never a fact to look up. Local colour (cities, dishes, clubs) is decoration only.',
      'PUZZLES — NOT A MATHS TEST: No visible worksheet, no formula to recall, no long multiplication on show. The player sizes something up; they do not sit an exam.',
      'PUZZLES — NO PICTURE YET: No item has an image. Never write "shown", "drawn", "in the picture" or "الصورة". Emoji inside the prompt text are allowed.',
    ];
  }

  private resolveWorldDecisionLoop(
    mechanicKey: string,
    worldKey: string,
  ): string[] {
    if (worldKey !== PUZZLES_WORLD_KEY || mechanicKey !== 'closest') return [];
    return [
      'PUZZLES — EXACT FOR US, OUT OF REACH FOR THEM: The answer is a number we can compute exactly and a player cannot reach exactly in the time. If a player who spots a trick can state it precisely in a few seconds, both teams will, the question ties and nobody scores — discard it.',
      'PUZZLES — PITCHED A LITTLE HARD: Prefer larger sets and answers that are not round. A careless guess must land clearly further away than a thoughtful one.',
      'PUZZLES — THE ANSWER IS A COUNT, SO THE STEP FOLLOWS IT: answerBasis is "reasoning". Use step 1 unless the answer and both ends of the range are all multiples of a rounder step. stepsFromMin is simply (correctValue − min) ÷ step.',
    ];
  }

  private computeDifficultyQuotas(
    count: number,
    difficulty: string,
    defaultForWorld = '',
  ): Record<string, number> {
    // عالم الألغاز has one level, by owner decision 2026-11-24: a batch that
    // names no difficulty is all medium there, not a spread of easy, medium
    // and hard. `defaultForWorld` is passed only when none was named.
    if (defaultForWorld === PUZZLES_WORLD_KEY && difficulty === 'mixed') {
      return { medium: count };
    }
    if (difficulty === 'easy' || difficulty === 'medium') {
      return { [difficulty]: count };
    }
    if (difficulty === 'hard' || difficulty === 'relatively_difficult') {
      return { hard: count };
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
    if (mechanicKey === 'moving-xo') {
      return [
        'Quick Insight: one idea unlocks it; a team that sees it answers at once.',
        'Set Trap: the obvious reading gives a wrong option, a second look gives the right one.',
        'Short Deduction: two small steps from what the prompt states, done in the head.',
      ];
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
    if (mechanicKey === 'moving-xo') {
      return [
        'FIFTEEN SECONDS, NO PEN: read once, solved in the head by a team talking it over.',
        'EXACTLY ONE CORRECT OPTION: the other two are each the product of a specific, natural mistake.',
        'RIGHT EARNS A MOVE, WRONG PASSES THE TURN: there is no bet — the only question is whether the team works it out.',
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
