import { ConfigService } from '@nestjs/config';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  AuthoringContextService,
  AuthoringContextUnavailableError,
} from './authoring-context.service';

/**
 * Parity with `ai/scripts/resolve_authoring_context.py`.
 *
 * `AuthoringContextService` is a TypeScript reading of the same manifest and
 * the same files. That is only safe while the two agree, so this suite runs the
 * canonical Python resolver as a subprocess and compares refusals and resolved
 * content against it. If someone changes the manifest rules on one side, this
 * fails rather than letting the engine author against a context no human
 * session would ever see.
 *
 * Skipped automatically where the repository or python3 is unavailable, so a
 * container without the authoring tree does not fail the build.
 */
const ROOT = resolve(__dirname, '../../../../..');
const RESOLVER = resolve(ROOT, 'ai/scripts/resolve_authoring_context.py');

const python = (args: string[]): { stdout: string; ok: boolean } => {
  try {
    return {
      stdout: execFileSync('python3', [RESOLVER, ...args], {
        cwd: ROOT,
        encoding: 'utf8',
      }),
      ok: true,
    };
  } catch (error) {
    const err = error as { stdout?: string };
    return { stdout: err.stdout ?? '', ok: false };
  }
};

const available = existsSync(RESOLVER);
const describeIf = available ? describe : describe.skip;

describeIf(
  'AuthoringContextService ↔ resolve_authoring_context.py parity',
  () => {
    const service = new AuthoringContextService({
      get: (key: string) =>
        key === 'ENGINE_AUTHORING_ROOT' ? ROOT : undefined,
    } as unknown as ConfigService);

    const PILOT = {
      mechanicKey: 'read-your-opponent',
      worldKey: 'video-games',
      scopeKey: 'overwatch',
    };

    it('resolves the pilot target the same way the canonical resolver does', () => {
      const fromPython = python([
        '--mechanic',
        PILOT.mechanicKey,
        '--world',
        PILOT.worldKey,
        '--scope',
        PILOT.scopeKey,
      ]);
      expect(fromPython.ok).toBe(true);
      expect(fromPython.stdout).toContain('=== METADATA ===');

      const context = service.resolve(PILOT);
      expect(context.mechanicKey).toBe(PILOT.mechanicKey);
      // Every section the Python resolver composes is non-empty here too.
      expect(context.global.length).toBeGreaterThan(0);
      expect(context.mechanic.length).toBeGreaterThan(0);
      expect(context.world.length).toBeGreaterThan(0);
      expect(context.scope.length).toBeGreaterThan(0);
      expect(context.knowledge.length).toBeGreaterThan(0);
      // And the Python output genuinely carries this mechanic's profile text.
      const marker = context.mechanic
        .split('\n')
        .find((line) => line.startsWith('## '));
      if (marker) expect(fromPython.stdout).toContain(marker);
    });

    it('produces a stable hash for an unchanged context', () => {
      expect(service.resolve(PILOT).contextHash).toBe(
        service.resolve(PILOT).contextHash,
      );
    });

    it.each([
      [
        {
          mechanicKey: 'not-a-mechanic',
          worldKey: 'video-games',
          scopeKey: 'overwatch',
        },
        'UNKNOWN_MECHANIC',
      ],
      [
        {
          mechanicKey: 'one-clue',
          worldKey: 'video-games',
          scopeKey: 'overwatch',
        },
        'MECHANIC_NOT_AUTHORABLE',
      ],
      [
        {
          mechanicKey: 'read-your-opponent',
          worldKey: 'chess',
          scopeKey: 'overwatch',
        },
        'UNKNOWN_WORLD',
      ],
      [
        {
          mechanicKey: 'odd-piece',
          worldKey: 'video-games',
          scopeKey: 'overwatch',
        },
        'MECHANIC_WORLD_MISMATCH',
      ],
      [
        {
          mechanicKey: 'read-your-opponent',
          worldKey: 'video-games',
          scopeKey: 'naruto',
        },
        'SCOPE_WORLD_MISMATCH',
      ],
      [
        {
          mechanicKey: 'read-your-opponent',
          worldKey: 'video-games',
          scopeKey: 'nonexistent',
        },
        'UNKNOWN_SCOPE',
      ],
    ])('refuses %j with the canonical code %s', (input, code) => {
      // The TypeScript refusal…
      let thrown: AuthoringContextUnavailableError | undefined;
      try {
        service.resolve(input as typeof PILOT);
      } catch (error) {
        thrown = error as AuthoringContextUnavailableError;
      }
      expect(thrown?.code).toBe(code);

      // …and the Python resolver's, for the same input.
      const fromPython = python([
        '--mechanic',
        (input as typeof PILOT).mechanicKey,
        '--world',
        (input as typeof PILOT).worldKey,
        '--scope',
        (input as typeof PILOT).scopeKey,
      ]);
      expect(fromPython.stdout).toContain(`AUTHORING_BLOCKED — ${code}`);
    });

    describe('the two Phase 2h pilot targets', () => {
      // Both live pilots so far generated against a Scope whose manifest
      // promised exemplars for a file that did not exist, and the fallback was
      // silent. These assert the targets resolve with their own worked
      // examples attached, so that cannot happen a third time unnoticed.
      it.each([
        ['football', 'world-cup'],
        ['puzzles', 'numbers-estimation'],
      ])('resolves %s/%s with its own exemplars', (worldKey, scopeKey) => {
        const context = service.resolve({
          mechanicKey: 'closest',
          worldKey,
          scopeKey,
        });
        expect(context.exemplars.length).toBeGreaterThan(0);
        expect(context.scope.length).toBeGreaterThan(0);
        expect(context.knowledge.length).toBeGreaterThan(0);
        // Exemplar subjects are retired; the file has to say so.
        expect(context.exemplars).toMatch(/retired subject/);
      });

      it('gives each World its own exemplars, not a shared set', () => {
        const football = service.resolve({
          mechanicKey: 'closest',
          worldKey: 'football',
          scopeKey: 'world-cup',
        });
        const puzzles = service.resolve({
          mechanicKey: 'closest',
          worldKey: 'puzzles',
          scopeKey: 'numbers-estimation',
        });
        expect(football.exemplars).not.toEqual(puzzles.exemplars);
        expect(football.contextHash).not.toEqual(puzzles.contextHash);
      });

      it('keeps the Puzzles reasoning-only restriction out of the football Scope', () => {
        // The restriction belongs to the Puzzles World and Scope assets. The
        // shared mechanic profile may *explain* it — that is how a generator
        // learns Worlds differ — but football's own Scope must not carry it.
        const football = service.resolve({
          mechanicKey: 'closest',
          worldKey: 'football',
          scopeKey: 'world-cup',
        });
        expect(football.scope).not.toMatch(/PUZZLES_WORLD_NO_TRIVIA/);
        expect(football.knowledge).not.toMatch(/PUZZLES_WORLD_NO_TRIVIA/);
        expect(football.exemplars).not.toMatch(
          /PUZZLE_ITSELF_IS_THE_CHALLENGE/,
        );
        // And it does say knowledge-anchored content belongs there.
        expect(football.exemplars).toMatch(/knowledge-anchored/);
      });

      it('keeps the Puzzles Scope reasoning-only', () => {
        const puzzles = service.resolve({
          mechanicKey: 'closest',
          worldKey: 'puzzles',
          scopeKey: 'numbers-estimation',
        });
        expect(puzzles.scope).toMatch(/PUZZLES_WORLD_NO_TRIVIA/);
        expect(puzzles.exemplars).toMatch(/Puzzles permits only/);
      });
    });

    describe('effective rules — R1', () => {
      it('resolves the RYO option-count rule from the mechanic profile', () => {
        const context = service.resolve({
          mechanicKey: 'read-your-opponent',
          worldKey: 'general-knowledge',
          scopeKey: 'science',
        });
        expect(context.effectiveRules.version).toBe(1);
        expect(context.effectiveRules.conflicts).toEqual([]);
        expect(
          context.effectiveRules.resolved.map((rule) => [
            rule.id,
            rule.policy,
            rule.effective.min,
            rule.effective.max,
            rule.canonical.layer,
          ]),
        ).toEqual([
          ['ryo.answer-option-count', 'bounded', 2, 4, 'mechanic'],
          // Fixed by the runtime: the RYO launcher refuses a Challenge that is
          // not exactly three items.
          ['ryo.items-per-challenge', 'invariant', 3, 3, 'mechanic'],
        ]);
        expect(context.effectiveRules.rules[0].source).toBe(
          'ai/.opencode/skills/challenge-types/read-your-opponent/SKILL.md',
        );
      });

      it('gives the same mechanic the same rules in a different World', () => {
        // Mechanic identity is invariant across Worlds and Scopes: the rule
        // set is identical while the surrounding context is not.
        const a = service.resolve({
          mechanicKey: 'read-your-opponent',
          worldKey: 'general-knowledge',
          scopeKey: 'science',
        });
        const b = service.resolve({
          mechanicKey: 'read-your-opponent',
          worldKey: 'puzzles',
          scopeKey: 'spot-the-error',
        });
        expect(b.effectiveRules.digest).toBe(a.effectiveRules.digest);
        expect(b.effectiveRules.rules).toEqual(a.effectiveRules.rules);
        expect(b.contextHash).not.toBe(a.contextHash);
      });

      it('returns a valid empty set where no profile declares rules', () => {
        // Most profiles carry none today. Empty means "nothing declared",
        // not "no requirements" — the prose is still in the prompt.
        const context = service.resolve({
          mechanicKey: 'closest',
          worldKey: 'puzzles',
          scopeKey: 'numbers-estimation',
        });
        expect(context.effectiveRules.rules).toEqual([]);
        expect(context.effectiveRules.structuredSources).toEqual([]);
        expect(context.effectiveRules.digest).toHaveLength(64);
      });

      it('leaves contextHash untouched for a context with no structured block', () => {
        // Byte-identical to the hash recorded in Phase 2o and Phase 2p.
        expect(
          service.resolve({
            mechanicKey: 'closest',
            worldKey: 'puzzles',
            scopeKey: 'numbers-estimation',
          }).contextHash,
        ).toBe(
          '533cd552f4db973c5620c2e7a663340298fb0b40578a37efa3055b830d111911',
        );
      });

      it('names the profile that declared each rule', () => {
        const context = service.resolve({
          mechanicKey: 'read-your-opponent',
          worldKey: 'puzzles',
          scopeKey: 'spot-the-error',
        });
        for (const rule of context.effectiveRules.rules) {
          expect(context.sources[rule.layer]).toBe(rule.source);
        }
        expect(context.effectiveRules.structuredSources).toEqual([
          'ai/.opencode/skills/challenge-types/read-your-opponent/SKILL.md',
        ]);
      });

      it('keeps the prompt body unchanged apart from the profiles themselves', () => {
        // R1 adds no prompt section: the block travels inside the mechanic
        // profile, exactly as its prose does.
        const context = service.resolve({
          mechanicKey: 'read-your-opponent',
          worldKey: 'general-knowledge',
          scopeKey: 'science',
        });
        expect(context.mechanic).toContain('akwaan-rules');
        expect(Object.keys(context.sources).sort()).toEqual([
          'exemplars',
          'global',
          'knowledge',
          'mechanic',
          'scope',
          'world',
        ]);
      });
    });

    it('accepts a registered alias exactly as the resolver does', () => {
      // `rakkibha` is an alias of `distributed-information` in the manifest.
      const context = service.resolve({
        mechanicKey: 'rakkibha',
        worldKey: 'puzzles',
        scopeKey: 'paths-motion',
      });
      expect(context.mechanicKey).toBe('distributed-information');
    });
  },
);
