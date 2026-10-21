import { createHash } from 'crypto';

/**
 * Structured, machine-readable rules carried inside the canonical authoring
 * profiles the engine already loads.
 *
 * ## Why rules live inside the profiles
 *
 * The Skills and World/Scope profiles are the single source of truth for what
 * content must be. A separate rules registry would be a second one, and the two
 * would drift — the exact failure `AuthoringContextService` was built to avoid.
 * So a rule is written in the profile that owns it, inside an explicitly
 * delimited fenced block, and the resolver reads only what is already loaded.
 *
 * ## What this is not
 *
 * This is **not** a merge engine. Two layers may legitimately declare the same
 * rule id; both are preserved with their provenance so R2 can analyse the
 * relationship. R1 never overrides, never resolves precedence and never
 * rejects a candidate.
 *
 * Prose guidance in the same files remains fully active in the generation
 * prompt. It is simply not machine-verifiable, and its absence from this set is
 * **not** evidence that a requirement does not exist.
 */

/** The four approved semantic layers. */
export const RULE_LAYERS = ['core', 'mechanic', 'world', 'scope'] as const;
export type RuleLayer = (typeof RULE_LAYERS)[number];

/** Deterministic layer ordering, widest first. Never alphabetical. */
const LAYER_ORDER: Record<RuleLayer, number> = {
  core: 0,
  mechanic: 1,
  world: 2,
  scope: 3,
};

/**
 * Which canonical source feeds which layer.
 *
 * Six sources, four layers: `knowledge` and `exemplars` are Scope-owned
 * material, so they contribute Scope rules. The mapping is explicit rather
 * than inferred, and no source is discarded.
 */
export const SOURCE_LAYERS: Record<string, RuleLayer> = {
  global: 'core',
  mechanic: 'mechanic',
  world: 'world',
  scope: 'scope',
  knowledge: 'scope',
  exemplars: 'scope',
};

/**
 * Rule values, discriminated by `kind`.
 *
 * Exactly one kind today — the one the R1 fixture uses. Adding a kind is a
 * member here plus a branch in `parseValue`; speculative kinds no phase
 * consumes are deliberately absent.
 */
export type RuleValue = {
  kind: 'integer-range';
  min: number;
  max: number;
};

/**
 * How a rule may be specialized by a narrower layer.
 *
 * `invariant` — immutable. A World or Scope may restate it identically, which
 * is accepted as redundant, but may not change, replace, weaken or **narrow**
 * it. Narrowing an invariant is still a change.
 *
 * `bounded` — a narrower layer may declare a **subset** of the bounds that are
 * currently in force. Not of the original bounds: once a World narrows, a Scope
 * must fit inside the World's restriction, not re-expand toward the mechanic's.
 *
 * The two are deliberately separate policies rather than one flag. An immutable
 * rule and a configurable range are different things, and a contract that let
 * an `invariant` narrow would be neither.
 */
export const RULE_POLICIES = ['invariant', 'bounded'] as const;
export type RulePolicy = (typeof RULE_POLICIES)[number];

export interface RuleDefinition {
  /** Stable, dotted, unique within its source. */
  id: string;
  layer: RuleLayer;
  /** Canonical repo-relative path of the profile that declared it. */
  source: string;
  value: RuleValue;
  /**
   * Required on the first (widest) declaration of an id, which owns the rule.
   * A narrower declaration is a *restriction* on that rule, not a replacement,
   * and restates the policy only to agree with it.
   */
  policy?: RulePolicy;
}

/** One profile's contribution to a rule's effective value. */
export interface RuleContribution {
  layer: RuleLayer;
  source: string;
  min: number;
  max: number;
}

/** A rule after every contributing restriction has been applied. */
export interface ResolvedRule {
  id: string;
  policy: RulePolicy;
  kind: RuleValue['kind'];
  /** What actually applies here. */
  effective: { min: number; max: number };
  /** The layer and profile that own the rule. */
  canonical: { layer: RuleLayer; source: string };
  /** Every declaration that shaped it, widest first. Never erased. */
  contributions: RuleContribution[];
}

/** A structurally detected disagreement between layers. */
export interface RuleConflict {
  code: string;
  ruleId: string;
  /** The layer that attempted the offending declaration. */
  layer: RuleLayer;
  source: string;
  attempted: { min: number; max: number } | null;
  /** The constraint in force when the attempt was made. */
  parent: { min: number; max: number } | null;
  parentLayer: RuleLayer | null;
  parentSource: string | null;
  policy: RulePolicy | null;
  message: string;
}

export interface EffectiveRuleSet {
  version: 1;
  /**
   * Every raw declaration, ordered by layer, then id, then source, and
   * independent of read order. Declarations are never erased when effective
   * values are derived.
   */
  rules: RuleDefinition[];
  /** Effective values with full provenance, one entry per rule id. */
  resolved: ResolvedRule[];
  /** Structural disagreements. Empty for a consistent configuration. */
  conflicts: RuleConflict[];
  /** sha256 over policies, effective values and raw declarations. */
  digest: string;
  /** Sources that carried a structured block, in resolution order. */
  structuredSources: string[];
}

/** Raised where a conflicting configuration must not proceed. */
export class RuleConflictError extends Error {
  constructor(readonly conflicts: RuleConflict[]) {
    super(
      `Structured rule conflict: ${conflicts
        .map(
          (conflict) =>
            `${conflict.code} (${conflict.ruleId} @ ${conflict.layer})`,
        )
        .join('; ')}`,
    );
  }
}

/** A structured block that could not be read. Never silently ignored. */
export class RuleResolutionError extends Error {
  constructor(
    readonly code: string,
    readonly source: string,
    detail: string,
  ) {
    super(`${code} in ${source}: ${detail}`);
  }
}

/**
 * The fenced block that carries rules.
 *
 * A fenced code block is the least disruptive delimiter for files that are
 * Markdown today and hand-edited. JSON rather than YAML deliberately: these
 * are a contract, and YAML's implicit coercions (`no` → false, sexagesimals)
 * are the wrong trade for something that must be strictly deterministic.
 */
const BLOCK = /```akwaan-rules\s*\n([\s\S]*?)\n```/g;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function parseValue(
  raw: Record<string, unknown>,
  source: string,
  id: string,
): RuleValue {
  const kind = raw.kind;
  if (kind !== 'integer-range') {
    throw new RuleResolutionError(
      'RULE_KIND_UNSUPPORTED',
      source,
      `rule "${id}" declares unsupported kind ${JSON.stringify(kind)}`,
    );
  }
  const { min, max } = raw;
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new RuleResolutionError(
      'RULE_VALUE_INVALID',
      source,
      `rule "${id}" needs integer min and max`,
    );
  }
  if ((min as number) > (max as number)) {
    throw new RuleResolutionError(
      'RULE_VALUE_INVALID',
      source,
      `rule "${id}" has min greater than max`,
    );
  }
  return { kind, min: min as number, max: max as number };
}

/** Rules declared by one source. Empty when it carries no block. */
export function parseRuleBlock(
  text: string,
  source: string,
  layer: RuleLayer,
): RuleDefinition[] {
  const blocks = [...(text ?? '').matchAll(BLOCK)];
  if (!blocks.length) return [];
  if (blocks.length > 1) {
    throw new RuleResolutionError(
      'RULE_BLOCK_DUPLICATED',
      source,
      `${blocks.length} structured blocks; exactly one is allowed`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(blocks[0][1]);
  } catch (error) {
    throw new RuleResolutionError(
      'RULE_BLOCK_MALFORMED',
      source,
      (error as Error).message,
    );
  }

  const body = asRecord(parsed);
  if (!body) {
    throw new RuleResolutionError(
      'RULE_BLOCK_MALFORMED',
      source,
      'the block must be a JSON object',
    );
  }
  if (body.version !== 1) {
    throw new RuleResolutionError(
      'RULE_BLOCK_VERSION_UNSUPPORTED',
      source,
      `version ${JSON.stringify(body.version)} is not supported`,
    );
  }
  if (!Array.isArray(body.rules)) {
    throw new RuleResolutionError(
      'RULE_BLOCK_MALFORMED',
      source,
      '"rules" must be an array',
    );
  }

  const seen = new Set<string>();
  return body.rules.map((entry) => {
    const raw = asRecord(entry);
    if (!raw) {
      throw new RuleResolutionError(
        'RULE_BLOCK_MALFORMED',
        source,
        'every rule must be an object',
      );
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) {
      throw new RuleResolutionError(
        'RULE_ID_REQUIRED',
        source,
        'every rule needs a non-empty id',
      );
    }
    // Within one source an id must be unique. Across sources it may repeat —
    // that is a layer relationship for R2, not an error here.
    if (seen.has(id)) {
      throw new RuleResolutionError(
        'RULE_ID_DUPLICATED',
        source,
        `rule "${id}" is declared twice in the same profile`,
      );
    }
    seen.add(id);

    // A block may restate its layer, but may not claim another one: the layer
    // is a property of which profile declared the rule, so a World profile
    // cannot assert a core rule.
    if (raw.layer !== undefined && raw.layer !== layer) {
      throw new RuleResolutionError(
        'RULE_LAYER_INVALID',
        source,
        `rule "${id}" declares layer ${JSON.stringify(raw.layer)} but this profile owns "${layer}"`,
      );
    }

    let policy: RulePolicy | undefined;
    if (raw.policy !== undefined) {
      if (!RULE_POLICIES.includes(raw.policy as RulePolicy)) {
        throw new RuleResolutionError(
          'RULE_POLICY_INVALID',
          source,
          `rule "${id}" declares policy ${JSON.stringify(raw.policy)}; expected one of ${RULE_POLICIES.join(', ')}`,
        );
      }
      policy = raw.policy as RulePolicy;
    }

    return {
      id,
      layer,
      source,
      value: parseValue(raw, source, id),
      ...(policy ? { policy } : {}),
    };
  });
}

/** sha256 over the canonical serialization. Distinct from `contextHash`. */
export function ruleSetDigest(
  rules: RuleDefinition[],
  resolved: ResolvedRule[] = [],
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        rules: rules.map((rule) => [
          rule.layer,
          rule.id,
          rule.source,
          rule.value,
          rule.policy ?? null,
        ]),
        // Effective values and policies are part of the identity: a narrowing
        // that changes what applies must change the digest.
        resolved: resolved.map((rule) => [
          rule.id,
          rule.policy,
          rule.effective.min,
          rule.effective.max,
        ]),
      }),
    )
    .digest('hex');
}

const subsetOf = (
  inner: { min: number; max: number },
  outer: { min: number; max: number },
): boolean => inner.min >= outer.min && inner.max <= outer.max;

const strictSupersetOf = (
  outer: { min: number; max: number },
  inner: { min: number; max: number },
): boolean =>
  outer.min <= inner.min &&
  outer.max >= inner.max &&
  (outer.min < inner.min || outer.max > inner.max);

/**
 * Apply declarations for one rule id, widest layer first.
 *
 * Each restriction is compared against the constraint **currently in force**,
 * not the original declaration. That is what stops a Scope re-expanding a
 * World's narrowing while still sitting inside the mechanic's range.
 */
function resolveOne(
  declarations: RuleDefinition[],
  conflicts: RuleConflict[],
): ResolvedRule | undefined {
  const [canonical, ...restrictions] = declarations;
  const conflict = (
    code: string,
    declaration: RuleDefinition,
    parent: { min: number; max: number } | null,
    parentOf: RuleDefinition | null,
    policy: RulePolicy | null,
    message: string,
  ) =>
    conflicts.push({
      code,
      ruleId: declaration.id,
      layer: declaration.layer,
      source: declaration.source,
      attempted: { min: declaration.value.min, max: declaration.value.max },
      parent,
      parentLayer: parentOf?.layer ?? null,
      parentSource: parentOf?.source ?? null,
      policy,
      message,
    });

  if (!canonical.policy) {
    conflict(
      'RULE_POLICY_UNDECLARED',
      canonical,
      null,
      null,
      null,
      `rule "${canonical.id}" is declared without a policy, so no layer may specialize it; declare "invariant" or "bounded" on the owning profile`,
    );
    return undefined;
  }

  const policy = canonical.policy;
  let effective = { min: canonical.value.min, max: canonical.value.max };
  let holder = canonical;
  const contributions: RuleContribution[] = [
    {
      layer: canonical.layer,
      source: canonical.source,
      min: canonical.value.min,
      max: canonical.value.max,
    },
  ];

  for (const declaration of restrictions) {
    const attempted = {
      min: declaration.value.min,
      max: declaration.value.max,
    };

    if (declaration.policy && declaration.policy !== policy) {
      conflict(
        'RULE_POLICY_CONFLICT',
        declaration,
        effective,
        holder,
        policy,
        `rule "${declaration.id}" is "${policy}" at ${holder.layer} but restated as "${declaration.policy}" here`,
      );
      continue;
    }

    if (policy === 'invariant') {
      if (attempted.min === effective.min && attempted.max === effective.max) {
        // Identical restatement: redundant, accepted, recorded.
        contributions.push({
          ...attempted,
          layer: declaration.layer,
          source: declaration.source,
        });
        continue;
      }
      conflict(
        'RULE_INVARIANT_MODIFIED',
        declaration,
        effective,
        holder,
        policy,
        `rule "${declaration.id}" is an invariant fixed at [${effective.min}, ${effective.max}] by ${holder.layer}; ${declaration.layer} may not change it, narrowing included`,
      );
      continue;
    }

    if (subsetOf(attempted, effective)) {
      contributions.push({
        ...attempted,
        layer: declaration.layer,
        source: declaration.source,
      });
      effective = attempted;
      holder = declaration;
      continue;
    }

    if (strictSupersetOf(attempted, effective)) {
      conflict(
        'RULE_BOUND_WIDENED',
        declaration,
        effective,
        holder,
        policy,
        `rule "${declaration.id}" is restricted to [${effective.min}, ${effective.max}] by ${holder.layer}; [${attempted.min}, ${attempted.max}] widens it`,
      );
      continue;
    }

    conflict(
      'RULE_BOUND_OUT_OF_RANGE',
      declaration,
      effective,
      holder,
      policy,
      `rule "${declaration.id}" permits [${effective.min}, ${effective.max}] here; [${attempted.min}, ${attempted.max}] falls outside it`,
    );
  }

  return {
    id: canonical.id,
    policy,
    kind: canonical.value.kind,
    effective,
    canonical: { layer: canonical.layer, source: canonical.source },
    contributions,
  };
}

/** Throws where a conflicting configuration must not proceed. */
export function assertNoRuleConflicts(set: EffectiveRuleSet): void {
  if (set.conflicts.length) throw new RuleConflictError(set.conflicts);
}

/**
 * Resolve the effective rule set from already-loaded canonical sources.
 *
 * Reads nothing from disk: the caller passes the same bodies it composed the
 * prompt from, so the rules and the prompt can never describe different files.
 */
export function resolveEffectiveRules(
  sections: { slot: string; source: string; text: string }[],
): EffectiveRuleSet {
  const rules: RuleDefinition[] = [];
  const structuredSources: string[] = [];

  for (const section of sections) {
    const layer = SOURCE_LAYERS[section.slot];
    if (!layer) continue;
    const declared = parseRuleBlock(section.text, section.source, layer);
    if (declared.length) {
      rules.push(...declared);
      if (!structuredSources.includes(section.source)) {
        structuredSources.push(section.source);
      }
    }
  }

  // Deterministic and independent of filesystem or object ordering.
  rules.sort(
    (a, b) =>
      LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] ||
      a.id.localeCompare(b.id) ||
      a.source.localeCompare(b.source),
  );

  // Group by id, preserving the deterministic order so the widest layer is
  // always the canonical declaration.
  const byId = new Map<string, RuleDefinition[]>();
  for (const rule of rules) {
    const group = byId.get(rule.id);
    if (group) group.push(rule);
    else byId.set(rule.id, [rule]);
  }

  const conflicts: RuleConflict[] = [];
  const resolved: ResolvedRule[] = [];
  for (const declarations of byId.values()) {
    const rule = resolveOne(declarations, conflicts);
    if (rule) resolved.push(rule);
  }
  resolved.sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: 1,
    rules,
    resolved,
    conflicts,
    digest: ruleSetDigest(rules, resolved),
    structuredSources,
  };
}
