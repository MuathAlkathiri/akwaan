import { ConfigService } from '@nestjs/config';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  AuthoringContextService,
  AuthoringContextUnavailableError,
} from './authoring-context.service';
import { composeGenerationPrompt } from './candidate-generator.service';
import { DeterministicScreenService } from './deterministic-screen.service';

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
      ])('resolves %s/%s with a safe exemplar view', (worldKey, scopeKey) => {
        const context = service.resolve({
          mechanicKey: 'closest',
          worldKey,
          scopeKey,
        });
        expect(context.historicalExemplars.length).toBeGreaterThan(0);
        expect(context.scope.length).toBeGreaterThan(0);
        expect(context.knowledge.length).toBeGreaterThan(0);
      });

      it('excludes unclassified football examples from generation', () => {
        const context = service.resolve({
          mechanicKey: 'closest',
          worldKey: 'football',
          scopeKey: 'world-cup',
        });
        expect(context.exemplars).toBe('');
        expect(context.exemplarDiagnostics).toEqual([
          expect.stringContaining('EXEMPLAR_STATUS_UNCLASSIFIED'),
        ]);
        expect(context.historicalExemplars).toMatch(/knowledge-anchored/);
      });

      it('keeps the rejected exemplar out of generation, in both resolvers', () => {
        // `missing-number-pattern` was APPROVED (2026-10-21), excluded as
        // untargeted in Phase 1, then REJECTED by the Product Owner in
        // Phase 1C. It must reach no prompt yet stay screened against.
        const fromPython = python([
          '--mechanic',
          'closest',
          '--world',
          'puzzles',
          '--scope',
          'numbers-estimation',
        ]);
        const context = service.resolve({
          mechanicKey: 'closest',
          worldKey: 'puzzles',
          scopeKey: 'numbers-estimation',
        });
        expect(context.exemplars).toBe('');
        // REJECTED is not an approved-but-excluded entry, so nothing is reported.
        expect(context.exemplarDiagnostics.join('\n')).not.toContain(
          'missing-number-pattern',
        );
        // Still screened against: duplicate protection is unchanged.
        expect(context.historicalExemplars).toMatch(/missing-number-pattern/);
        expect(context.historicalExemplars).toMatch(
          /Counting under a structure/,
        );
        const pythonExemplars = fromPython.stdout
          .split('## 6. HUMAN PRODUCT EXEMPLARS\n', 2)[1]
          .trim();
        expect(pythonExemplars).toBe('No exemplars recorded yet.');
        const pythonMetadata = JSON.parse(
          fromPython.stdout
            .split('=== METADATA ===\n', 2)[1]
            .split('=== CONTEXT ===')[0],
        ) as { _authoringContext: { exemplarDiagnostics: string[] } };
        expect(pythonMetadata._authoringContext.exemplarDiagnostics).toEqual(
          context.exemplarDiagnostics,
        );
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
        // Each World resolves its own exemplar source. Since Phase 1 neither
        // currently has an exemplar eligible for Closest, so both generation
        // views are legitimately empty; the sources and fingerprints differ.
        expect(football.historicalExemplars).not.toEqual(
          puzzles.historicalExemplars,
        );
        expect(football.historicalExemplars).not.toMatch(
          /missing-number-pattern/,
        );
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
        expect(football.historicalExemplars).toMatch(/knowledge-anchored/);
      });

      it('keeps the Puzzles Scope reasoning-only', () => {
        const puzzles = service.resolve({
          mechanicKey: 'closest',
          worldKey: 'puzzles',
          scopeKey: 'numbers-estimation',
        });
        expect(puzzles.scope).toMatch(/PUZZLES_WORLD_NO_TRIVIA/);
        expect(puzzles.historicalExemplars).toMatch(/Puzzles permits only/);
      });
    });

    describe('Phase 1B/1C — spot-the-error exemplars targeted to Moving XO', () => {
      // Product decisions: 01, 02 and 04 verified against their V1 families
      // and targeted to `moving-xo` (1B). 03 and numbers-estimation-05 were
      // then REJECTED by the Product Owner (1C) — kept as historical records,
      // screened against, never generation guidance.
      const TARGETED = [
        'spot-the-error-01-numeric-intruder',
        'spot-the-error-02-dotless-intruder',
        'spot-the-error-04-order-violation',
      ];
      const REJECTED_03 = 'spot-the-error-03-invalid-transformation-step';
      const REJECTED_05 = 'numbers-estimation-05-missing-number-pattern';
      const SPOT = { worldKey: 'puzzles', scopeKey: 'spot-the-error' };
      const NUMBERS = { worldKey: 'puzzles', scopeKey: 'numbers-estimation' };
      const UNRELATED = ['closest', 'read-your-opponent', 'bomb'];

      it('gives Moving XO exactly the three verified exemplars', () => {
        const context = service.resolve({ mechanicKey: 'moving-xo', ...SPOT });
        for (const id of TARGETED) expect(context.exemplars).toContain(id);
        expect(context.exemplars).not.toContain(REJECTED_03);
        // 03 is REJECTED, not an approved-but-untargeted entry: nothing to report.
        expect(context.exemplarDiagnostics).toEqual([]);
      });

      it.each(UNRELATED)('injects none of them into %s', (mechanicKey) => {
        const context = service.resolve({ mechanicKey, ...SPOT });
        expect(context.exemplars).toBe('');
        expect(context.exemplarDiagnostics).toEqual([
          `EXEMPLAR_MECHANIC_EXCLUDED: ${TARGETED.join(',')}`,
        ]);
      });

      it.each(UNRELATED)(
        'keeps them out of the %s generation prompt',
        (mechanicKey) => {
          const context = service.resolve({ mechanicKey, ...SPOT });
          const prompt = composeGenerationPrompt(
            context,
            2,
            mechanicKey === 'closest' ? 'closest' : 'multiple_choice',
          );
          for (const id of [...TARGETED, REJECTED_03]) {
            expect(prompt).not.toContain(id);
          }
        },
      );

      it.each(['moving-xo', ...UNRELATED])(
        'keeps the rejected numbers-estimation-05 out of %s, but screened',
        (mechanicKey) => {
          const context = service.resolve({ mechanicKey, ...NUMBERS });
          expect(context.exemplars).toBe('');
          expect(context.exemplarDiagnostics.join('\n')).not.toContain(
            REJECTED_05,
          );
          expect(context.historicalExemplars).toContain(REJECTED_05);
        },
      );

      it('agrees with the Python resolver for Moving XO', () => {
        const fromPython = python([
          '--mechanic',
          'moving-xo',
          '--world',
          'puzzles',
          '--scope',
          'spot-the-error',
        ]);
        expect(fromPython.ok).toBe(true);
        const context = service.resolve({ mechanicKey: 'moving-xo', ...SPOT });
        const pythonExemplars = fromPython.stdout
          .split('## 6. HUMAN PRODUCT EXEMPLARS\n', 2)[1]
          .trim();
        expect(pythonExemplars).toBe(context.exemplars);
        const pythonMetadata = JSON.parse(
          fromPython.stdout
            .split('=== METADATA ===\n', 2)[1]
            .split('=== CONTEXT ===')[0],
        ) as { _authoringContext: { exemplarDiagnostics: string[] } };
        expect(pythonMetadata._authoringContext.exemplarDiagnostics).toEqual(
          context.exemplarDiagnostics,
        );
      });

      it('carries the retired-subject and no-regenerate guards with every injected exemplar', () => {
        const { exemplars } = service.resolve({
          mechanicKey: 'moving-xo',
          ...SPOT,
        });
        const blocks = exemplars.split('<!-- /AKWAAN_EXEMPLAR_META -->');
        for (const id of TARGETED) {
          const block = blocks.find((candidate) => candidate.includes(id))!;
          expect(block).toContain('RETIRED — do not reuse this subject');
          expect(block).toContain('"reusePolicy":"DO_NOT_REGENERATE"');
        }
      });

      it('still screens every exemplar, targeted or not, for every mechanic', () => {
        for (const mechanicKey of ['moving-xo', ...UNRELATED]) {
          const { historicalExemplars } = service.resolve({
            mechanicKey,
            ...SPOT,
          });
          for (const id of [...TARGETED, REJECTED_03]) {
            expect(historicalExemplars).toContain(id);
          }
        }
      });

      it('flags a candidate that reuses a retired subject it can detect', () => {
        const screen = new DeterministicScreenService({
          get: () => undefined,
        } as unknown as ConfigService);
        const { historicalExemplars } = service.resolve({
          mechanicKey: 'moving-xo',
          ...SPOT,
        });
        const codesFor = (ar: string) => {
          screen.beginBatch(historicalExemplars);
          return screen
            .screen({
              prompt: { ar },
              answerPayload: {
                mode: 'multiple_choice',
                options: [
                  { id: 'a', label: { ar: 'أول' } },
                  { id: 'b', label: { ar: 'ثانٍ' } },
                ],
                correctOptionId: 'a',
              },
            } as never)
            .findings.map((finding) => finding.code);
        };
        // 02 (undotted words) and 04 (alphabetical ordering).
        expect(codesFor('مال · سهل · راحل · نهر')).toContain(
          'CANDIDATE_RESEMBLES_EXEMPLAR',
        );
        expect(
          codesFor(
            'رُتِّبت هذه الحروف حسب موضعها في الأبجدية، إلا حرفًا واحدًا. أيّه؟',
          ),
        ).toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
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
        // Byte-identical to the current canonical source snapshot. The
        // versioned exemplar metadata markers are source, so this fixture is
        // intentionally refreshed when those markers are migrated; the
        // production hash algorithm and job identity remain unchanged.
        expect(
          service.resolve({
            mechanicKey: 'closest',
            worldKey: 'puzzles',
            scopeKey: 'numbers-estimation',
          }).contextHash,
        ).toBe(
          // Refreshed 2026-11-06 (Phase 2B Batches 1–2): only QUESTION-CRAFT.md
          // (Batch 1: universal 90% media quota replaced by the roadmap §23.2
          // conditional rule; Batch 2: Closest year exception to META-TRIVIA)
          // and the Closest SKILL.md (Batch 2: *Year questions*, then the
          // pre-publication review's three-kind distinction) changed.
          // The previous values, 0ca63754… (pre-Batch 1), f3942825…
          // (Batch 1) and 6dd18592… (Batch 2), reproduce exactly from the
          // prior files, so the algorithm is unchanged.
          // Refreshed again for Phase 2B Batch 3B-1: only QUESTION-CRAFT.md
          // changed (Bomb/Top-5/Distributed Information contracts moved to
          // their mechanic Skills, then the pointer named the required Skill
          // files); c2205015… and 9c891eac… reproduce from the prior files.
          'f989ae76d25e38f5dcf74f7e57f4c750c34a6b62a027f963f1a86f66e0b5c505',
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

    it.each(['distributed-information', 'rakkibha'])(
      'rejects retained-inactive Rakkibha identity %s in parity with Python',
      (mechanicKey) => {
        expect(() =>
          service.resolve({
            mechanicKey,
            worldKey: 'puzzles',
            scopeKey: 'paths-motion',
          }),
        ).toThrow('AUTHORING_BLOCKED — MECHANIC_NOT_AUTHORABLE');

        const fromPython = python([
          '--mechanic',
          mechanicKey,
          '--world',
          'puzzles',
          '--scope',
          'paths-motion',
        ]);
        expect(fromPython.ok).toBe(false);
        expect(fromPython.stdout).toContain(
          'AUTHORING_BLOCKED — MECHANIC_NOT_AUTHORABLE',
        );
      },
    );
  },
);
