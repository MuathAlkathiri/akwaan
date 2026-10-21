import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EffectiveRuleSet,
  resolveEffectiveRules,
} from '../domain/effective-rules';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import {
  ExemplarMetadataError,
  resolveExemplarDocument,
} from './exemplar-metadata';

/** Exactly the blocking codes `ai/scripts/resolve_authoring_context.py` emits. */
export const AUTHORING_BLOCKERS = [
  'AUTHORING_MANIFEST_MISSING',
  'UNKNOWN_MECHANIC',
  'MECHANIC_NOT_AUTHORABLE',
  'UNKNOWN_WORLD',
  'MECHANIC_WORLD_MISMATCH',
  'UNKNOWN_SCOPE',
  'SCOPE_WORLD_MISMATCH',
  'REQUIRED_GLOBAL_PROFILE_MISSING',
  'REQUIRED_MECHANIC_PROFILE_MISSING',
  'REQUIRED_WORLD_PROFILE_MISSING',
  'REQUIRED_SCOPE_PROFILE_MISSING',
  'REQUIRED_SCOPE_KNOWLEDGE_MISSING',
  'EXEMPLAR_METADATA_INVALID',
] as const;
export type AuthoringBlocker = (typeof AUTHORING_BLOCKERS)[number];

export class AuthoringContextUnavailableError extends Error {
  constructor(
    readonly code: AuthoringBlocker,
    detail?: string,
  ) {
    super(`AUTHORING_BLOCKED — ${code}${detail ? ` (${detail})` : ''}`);
  }
}

export interface ResolvedAuthoringContext {
  mechanicKey: string;
  worldKey: string;
  scopeKey: string;
  /** Section texts, in the order the canonical resolver composes them. */
  global: string;
  mechanic: string;
  world: string;
  scope: string;
  knowledge: string;
  /** Explicitly APPROVED exemplar blocks only; safe for generation prompts. */
  exemplars: string;
  /** Untouched source, reserved for audit and deterministic duplicate screening. */
  historicalExemplars: string;
  /** Non-blocking diagnostics for legacy/unclassified material. */
  exemplarDiagnostics: string[];
  /** sha256 over every byte that shaped this context. */
  contextHash: string;
  sources: Record<string, string>;
  /**
   * Machine-readable rules declared by these same profiles, with provenance.
   *
   * Empty for profiles that carry no structured block — which is most of them
   * today. An empty set means "nothing was declared here", **not** "this
   * context has no requirements": the prose in every section remains active in
   * the generation prompt and is simply not machine-verifiable.
   */
  effectiveRules: EffectiveRuleSet;
}

interface ManifestMechanic {
  category?: string;
  boundWorld?: string;
  status?: string;
  profile: string;
  aliases?: string[];
}

interface Manifest {
  mechanics: Record<string, ManifestMechanic>;
  worlds: Record<string, { profile: string; scopes: string[] }>;
  scopes: Record<
    string,
    {
      world: string;
      scopePath: string;
      knowledgePath: string;
      exemplarsPath: string;
    }
  >;
}

/**
 * Canonical authoring context for the engine.
 *
 * This is a TypeScript reading of the **same** manifest and the **same** files
 * `ai/scripts/resolve_authoring_context.py` reads, with the same fail-closed
 * codes — not a second source of truth. Shelling out to Python from a Nest
 * request path would be the other option, and a worse one: a subprocess per
 * job, an interpreter dependency in the container, and failures that surface as
 * exit codes rather than typed errors. The parity that matters is the data and
 * the refusals, and `authoring-context.parity.spec.ts` asserts both against the
 * Python resolver's own output.
 *
 * Nothing here is cached across calls on purpose. Skills change during
 * authoring sessions, and a stale context that still reports a fresh hash is
 * worse than a few milliseconds of file reads.
 */
@Injectable()
export class AuthoringContextService {
  private readonly logger = new Logger(AuthoringContextService.name);

  constructor(private readonly config: ConfigService) {}

  /** Repository root. Configurable because the backend runs from `backend/`. */
  private root(): string {
    const configured = this.config.get<string>('ENGINE_AUTHORING_ROOT')?.trim();
    if (configured) return resolve(configured);
    // Walk up until the manifest appears; the backend's cwd is a subdirectory.
    let dir = process.cwd();
    for (let i = 0; i < 6; i += 1) {
      if (existsSync(join(dir, 'ai/.opencode/authoring-manifest.json')))
        return dir;
      dir = dirname(dir);
    }
    return process.cwd();
  }

  private read(relative: string, missing: AuthoringBlocker): string {
    const absolute = join(this.root(), relative);
    if (!existsSync(absolute)) {
      throw new AuthoringContextUnavailableError(missing, relative);
    }
    return readFileSync(absolute, 'utf8');
  }

  private manifest(): Manifest {
    const path = join(this.root(), 'ai/.opencode/authoring-manifest.json');
    if (!existsSync(path)) {
      throw new AuthoringContextUnavailableError('AUTHORING_MANIFEST_MISSING');
    }
    return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  }

  /**
   * Resolve one mechanic × World × Scope, or refuse with the canonical code.
   *
   * The order of checks mirrors the Python resolver exactly, because the code a
   * caller sees for a bad combination is part of the contract.
   */
  resolve(input: {
    mechanicKey: string;
    worldKey: string;
    scopeKey: string;
  }): ResolvedAuthoringContext {
    const manifest = this.manifest();

    // 1. Mechanic, by canonical key or alias.
    const entry = Object.entries(manifest.mechanics).find(
      ([key, value]) =>
        key === input.mechanicKey ||
        (value.aliases ?? []).includes(input.mechanicKey),
    );
    if (!entry) {
      throw new AuthoringContextUnavailableError(
        'UNKNOWN_MECHANIC',
        input.mechanicKey,
      );
    }
    const [mechanicKey, mechanic] = entry;
    if (mechanic.status !== 'AUTHORABLE') {
      throw new AuthoringContextUnavailableError(
        'MECHANIC_NOT_AUTHORABLE',
        mechanicKey,
      );
    }

    // 2. World, and the Signature binding.
    const world = manifest.worlds[input.worldKey];
    if (!world) {
      throw new AuthoringContextUnavailableError(
        'UNKNOWN_WORLD',
        input.worldKey,
      );
    }
    if (
      mechanic.category === 'SIGNATURE' &&
      mechanic.boundWorld &&
      mechanic.boundWorld !== input.worldKey
    ) {
      throw new AuthoringContextUnavailableError(
        'MECHANIC_WORLD_MISMATCH',
        `${mechanicKey} is bound to ${mechanic.boundWorld}, not ${input.worldKey}`,
      );
    }

    // 3. Scope, distinguishing "wrong World" from "no such Scope".
    const comboKey = `${input.worldKey}/${input.scopeKey}`;
    const scope = manifest.scopes[comboKey];
    if (!scope) {
      const existsElsewhere = Object.keys(manifest.scopes).some((key) =>
        key.endsWith(`/${input.scopeKey}`),
      );
      throw new AuthoringContextUnavailableError(
        existsElsewhere ? 'SCOPE_WORLD_MISMATCH' : 'UNKNOWN_SCOPE',
        input.scopeKey,
      );
    }

    // 4. Required files. Exemplars stay optional, as in the resolver.
    const globalPath = 'ai/.opencode/knowledge/architecture/QUESTION-CRAFT.md';
    const sources = {
      global: globalPath,
      mechanic: mechanic.profile,
      world: world.profile,
      scope: scope.scopePath,
      knowledge: scope.knowledgePath,
      exemplars: scope.exemplarsPath,
    };

    const globalText = this.read(globalPath, 'REQUIRED_GLOBAL_PROFILE_MISSING');
    const mechanicText = this.read(
      mechanic.profile,
      'REQUIRED_MECHANIC_PROFILE_MISSING',
    );
    const worldText = this.read(
      world.profile,
      'REQUIRED_WORLD_PROFILE_MISSING',
    );
    const scopeText = this.read(
      scope.scopePath,
      'REQUIRED_SCOPE_PROFILE_MISSING',
    );
    const knowledgeText = this.read(
      scope.knowledgePath,
      'REQUIRED_SCOPE_KNOWLEDGE_MISSING',
    );
    // Exemplars are optional by design — not every Scope has worked items yet.
    // The absence was previously silent, which is how the first Puzzles pilot
    // generated against a manifest that promised exemplars for a file that did
    // not exist. A missing file is still not an error; it is now at least
    // visible, because worked examples are the strongest single signal in this
    // prompt and their absence changes what comes back.
    const exemplarsAbsolute = join(this.root(), scope.exemplarsPath);
    const exemplarsPresent = existsSync(exemplarsAbsolute);
    const exemplarsText = exemplarsPresent
      ? readFileSync(exemplarsAbsolute, 'utf8')
      : '';
    if (!exemplarsPresent) {
      this.logger.warn({
        event: 'engine_authoring_exemplars_missing',
        scope: `${input.worldKey}/${input.scopeKey}`,
        mechanic: input.mechanicKey,
        path: scope.exemplarsPath,
      });
    }

    let approvedExemplars = '';
    let exemplarDiagnostics: string[] = [];
    if (exemplarsPresent) {
      try {
        const document = resolveExemplarDocument(exemplarsText);
        approvedExemplars = document.approvedText;
        exemplarDiagnostics = document.diagnostics;
      } catch (error) {
        if (error instanceof ExemplarMetadataError) {
          throw new AuthoringContextUnavailableError(
            'EXEMPLAR_METADATA_INVALID',
            error.message,
          );
        }
        throw error;
      }
    }

    // Resolved from the bodies just read, never from disk a second time, so
    // the rules and the prompt can never describe different files.
    const effectiveRules = resolveEffectiveRules([
      { slot: 'global', source: sources.global, text: globalText },
      { slot: 'mechanic', source: sources.mechanic, text: mechanicText },
      { slot: 'world', source: sources.world, text: worldText },
      { slot: 'scope', source: sources.scope, text: scopeText },
      { slot: 'knowledge', source: sources.knowledge, text: knowledgeText },
      { slot: 'exemplars', source: sources.exemplars, text: approvedExemplars },
    ]);

    const contextHash = createHash('sha256')
      .update(
        JSON.stringify([
          mechanicKey,
          input.worldKey,
          input.scopeKey,
          globalText,
          mechanicText,
          worldText,
          scopeText,
          knowledgeText,
          exemplarsText,
        ]),
      )
      .digest('hex');

    return {
      mechanicKey,
      worldKey: input.worldKey,
      scopeKey: input.scopeKey,
      global: globalText,
      mechanic: mechanicText,
      world: worldText,
      scope: scopeText,
      knowledge: knowledgeText,
      exemplars: approvedExemplars,
      historicalExemplars: exemplarsText,
      exemplarDiagnostics,
      contextHash,
      sources,
      effectiveRules,
    };
  }
}
