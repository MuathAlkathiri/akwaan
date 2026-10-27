import { World } from '../../world-content/schemas/world.schema';
import { Scope } from '../../world-content/schemas/scope.schema';
import { ChallengeType } from '../../world-content/schemas/challenge-type.schema';
import { WorldContentStatus } from '../../world-content/domain/world-content.constants';
import {
  CANONICAL_WORLD_ALIASES,
  CANONICAL_SCOPE_ALIASES,
  CANONICAL_CHALLENGE_TYPE_ALIASES,
} from './authoring-target-aliases';

export {
  CANONICAL_WORLD_ALIASES,
  CANONICAL_SCOPE_ALIASES,
  CANONICAL_CHALLENGE_TYPE_ALIASES,
};

export interface WorldLookup {
  findBySlug(slug: string): Promise<World | null>;
  list?(filter?: Record<string, unknown>): Promise<World[]>;
}

export interface ScopeLookup {
  findBySlugInWorld(worldId: string, slug: string): Promise<Scope | null>;
  listByWorld?(worldId: string): Promise<Scope[]>;
  list?(): Promise<Scope[]>;
}

export interface ChallengeTypeLookup {
  findBySlug(slug: string): Promise<ChallengeType | null>;
  list?(filter?: Record<string, unknown>): Promise<ChallengeType[]>;
}

/**
 * Returns all candidate lookup keys/slugs for a given world key,
 * beginning with the key itself followed by its canonical aliases.
 */
export function getCandidateWorldAliases(worldKey: string): string[] {
  const trimmed = (worldKey ?? '').trim();
  if (!trimmed) return [];
  const candidates = new Set<string>([trimmed]);

  for (const [canonical, aliases] of Object.entries(CANONICAL_WORLD_ALIASES)) {
    if (canonical === trimmed || aliases.includes(trimmed)) {
      candidates.add(canonical);
      for (const alias of aliases) {
        candidates.add(alias);
      }
    }
  }

  return [...candidates];
}

/**
 * Returns all candidate lookup keys/slugs for a given scope key.
 */
export function getCandidateScopeAliases(scopeKey: string): string[] {
  const trimmed = (scopeKey ?? '').trim();
  if (!trimmed) return [];
  const candidates = new Set<string>([trimmed]);

  for (const [canonical, aliases] of Object.entries(CANONICAL_SCOPE_ALIASES)) {
    if (canonical === trimmed || aliases.includes(trimmed)) {
      candidates.add(canonical);
      for (const alias of aliases) {
        candidates.add(alias);
      }
    }
  }

  return [...candidates];
}

/**
 * Returns all candidate lookup keys/slugs for a given challenge type key.
 */
export function getCandidateChallengeTypeAliases(
  mechanicKey: string,
): string[] {
  const trimmed = (mechanicKey ?? '').trim();
  if (!trimmed) return [];
  const candidates = new Set<string>([trimmed]);

  for (const [canonical, aliases] of Object.entries(
    CANONICAL_CHALLENGE_TYPE_ALIASES,
  )) {
    if (canonical === trimmed || aliases.includes(trimmed)) {
      candidates.add(canonical);
      for (const alias of aliases) {
        candidates.add(alias);
      }
    }
  }

  return [...candidates];
}

/**
 * Resolves a World entity by direct slug match or canonical alias resolution.
 * Disambiguates when multiple entities match by preferring active over archived entities,
 * and fails safely (returns null) on ambiguous multi-entity collisions.
 */
export async function resolveCanonicalWorld(
  worldRepository: WorldLookup | undefined | null,
  worldKey: string,
): Promise<World | null> {
  if (!worldRepository || !worldKey?.trim()) return null;

  // 1. Direct slug lookup
  const direct = await worldRepository.findBySlug(worldKey);
  if (direct) return direct;

  // 2. Alias slug lookups
  const candidateKeys = getCandidateWorldAliases(worldKey);
  const candidateMatches: World[] = [];
  for (const candidate of candidateKeys) {
    if (candidate === worldKey) continue;
    const found = await worldRepository.findBySlug(candidate);
    if (found) {
      candidateMatches.push(found);
    }
  }

  if (candidateMatches.length === 1) {
    return candidateMatches[0];
  }
  if (candidateMatches.length > 1) {
    const active = candidateMatches.filter(
      (w) => w.status !== WorldContentStatus.ARCHIVED,
    );
    if (active.length === 1) return active[0];
    const uniqueIds = new Set(active.map((w) => String(w._id)));
    if (uniqueIds.size === 1) return active[0];
    // Ambiguous multiple active worlds match alias
    return null;
  }

  // 3. Fallback to list matching by slug or name
  if (typeof worldRepository.list === 'function') {
    const all = await worldRepository.list();
    const matched: World[] = [];
    for (const w of all) {
      const wSlug = (w?.slug ?? '').trim();
      const wName = (w?.name ?? '').trim();
      if (candidateKeys.includes(wSlug) || candidateKeys.includes(wName)) {
        matched.push(w);
      }
    }
    if (matched.length === 1) return matched[0];
    if (matched.length > 1) {
      const active = matched.filter(
        (w) => w.status !== WorldContentStatus.ARCHIVED,
      );
      if (active.length === 1) return active[0];
      const uniqueIds = new Set(active.map((w) => String(w._id)));
      if (uniqueIds.size === 1) return active[0];
      return null;
    }
  }

  return null;
}

/**
 * Resolves a Scope entity within a World by direct slug match or canonical alias resolution.
 * Strictly scopes queries to the target worldId to guarantee cross-world isolation.
 */
export async function resolveCanonicalScope(
  scopeRepository: ScopeLookup | undefined | null,
  worldId: string,
  scopeKey: string,
): Promise<Scope | null> {
  if (!scopeRepository || !worldId || !scopeKey?.trim()) return null;

  // 1. Direct slug lookup in world
  const direct = await scopeRepository.findBySlugInWorld(worldId, scopeKey);
  if (direct) return direct;

  // 2. Alias slug lookups in world
  const candidateKeys = getCandidateScopeAliases(scopeKey);
  const candidateMatches: Scope[] = [];
  for (const candidate of candidateKeys) {
    if (candidate === scopeKey) continue;
    const found = await scopeRepository.findBySlugInWorld(worldId, candidate);
    if (found) {
      candidateMatches.push(found);
    }
  }

  if (candidateMatches.length === 1) {
    return candidateMatches[0];
  }
  if (candidateMatches.length > 1) {
    const active = candidateMatches.filter(
      (s) => s.status !== WorldContentStatus.ARCHIVED,
    );
    if (active.length === 1) return active[0];
    const uniqueIds = new Set(active.map((s) => String(s._id)));
    if (uniqueIds.size === 1) return active[0];
    return null;
  }

  // 3. Fallback to listByWorld matching by slug or name
  if (typeof scopeRepository.listByWorld === 'function') {
    const all = await scopeRepository.listByWorld(worldId);
    const matched: Scope[] = [];
    for (const s of all) {
      const sSlug = (s?.slug ?? '').trim();
      const sName = (s?.name ?? '').trim();
      if (candidateKeys.includes(sSlug) || candidateKeys.includes(sName)) {
        matched.push(s);
      }
    }
    if (matched.length === 1) return matched[0];
    if (matched.length > 1) {
      const active = matched.filter(
        (s) => s.status !== WorldContentStatus.ARCHIVED,
      );
      if (active.length === 1) return active[0];
      const uniqueIds = new Set(active.map((s) => String(s._id)));
      if (uniqueIds.size === 1) return active[0];
      return null;
    }
  }

  return null;
}

/**
 * Resolves a ChallengeType entity by direct slug match or canonical alias resolution.
 */
export async function resolveCanonicalChallengeType(
  challengeTypeRepository: ChallengeTypeLookup | undefined | null,
  mechanicKey: string,
): Promise<ChallengeType | null> {
  if (!challengeTypeRepository || !mechanicKey?.trim()) return null;

  // 1. Direct slug lookup
  const direct = await challengeTypeRepository.findBySlug(mechanicKey);
  if (direct) return direct;

  // 2. Alias slug lookups
  const candidateKeys = getCandidateChallengeTypeAliases(mechanicKey);
  const candidateMatches: ChallengeType[] = [];
  for (const candidate of candidateKeys) {
    if (candidate === mechanicKey) continue;
    const found = await challengeTypeRepository.findBySlug(candidate);
    if (found) {
      candidateMatches.push(found);
    }
  }

  if (candidateMatches.length === 1) {
    return candidateMatches[0];
  }
  if (candidateMatches.length > 1) {
    const active = candidateMatches.filter(
      (t) => t.status !== WorldContentStatus.ARCHIVED,
    );
    if (active.length === 1) return active[0];
    const uniqueIds = new Set(active.map((t) => String(t._id)));
    if (uniqueIds.size === 1) return active[0];
    return null;
  }

  // 3. Fallback to list matching by slug or name
  if (typeof challengeTypeRepository.list === 'function') {
    const all = await challengeTypeRepository.list();
    const matched: ChallengeType[] = [];
    for (const t of all) {
      const tSlug = (t?.slug ?? '').trim();
      const tName = (t?.name ?? '').trim();
      if (candidateKeys.includes(tSlug) || candidateKeys.includes(tName)) {
        matched.push(t);
      }
    }
    if (matched.length === 1) return matched[0];
    if (matched.length > 1) {
      const active = matched.filter(
        (t) => t.status !== WorldContentStatus.ARCHIVED,
      );
      if (active.length === 1) return active[0];
      const uniqueIds = new Set(active.map((t) => String(t._id)));
      if (uniqueIds.size === 1) return active[0];
      return null;
    }
  }

  return null;
}
