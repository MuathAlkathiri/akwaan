import {
  parseFamilyBlock,
  resolveCanonicalFamilies,
  validateFamilyCatalogParity,
  assertFamilyCatalogParity,
  extractFamilyTables,
  FamilyResolutionError,
  MechanicFitRating,
} from './canonical-families';
import { AuthoringContextService } from '../application/authoring-context.service';
import { ConfigService } from '@nestjs/config';
import { resolve, join } from 'path';
import { readFileSync } from 'fs';

const block = (body: unknown) =>
  [
    '# Profile',
    '',
    '```akwaan-families',
    JSON.stringify(body, null, 2),
    '```',
    '',
  ].join('\n');

const VALID_FAMILY = {
  familyKey: 'plural-form',
  name: 'جمع الكلمات ومفرداتها المألوفة',
  description: 'التعرف السريع على صيغة الجمع المألوفة أو المفرد المقابل',
  playerSolve: 'استنتاج صيغة الجمع دون تعقيد',
  modality: 'morphology-lexical',
  scalability: 'HIGH',
  mechanicFit: {
    'moving-xo': 'EXCELLENT',
    'read-your-opponent': 'EXCELLENT',
    bomb: 'EXCELLENT',
    closest: 'DO_NOT_FORCE',
  } as Record<string, MechanicFitRating>,
  answerModes: ['multiple_choice'],
};

describe('Canonical Families Parser & Resolver (Slice 1)', () => {
  const context = { worldKey: 'puzzles', scopeKey: 'wordplay-letters' };

  describe('1. Successful parsing of canonical approved families', () => {
    it('parses a valid akwaan-families block with all canonical metadata', () => {
      const text = block({
        version: 1,
        scope: 'puzzles.wordplay-letters',
        families: [VALID_FAMILY],
      });
      const parsed = parseFamilyBlock(
        text,
        'skills/wordplay/KNOWLEDGE.md',
        context,
      );
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({
        ...VALID_FAMILY,
        scopeKey: 'wordplay-letters',
        worldKey: 'puzzles',
        source: 'skills/wordplay/KNOWLEDGE.md',
      });
    });

    it('accepts valid alternative scope formatting (e.g. worldKey/scopeKey or scopeKey only)', () => {
      const text1 = block({
        version: 1,
        scope: 'puzzles/wordplay-letters',
        families: [VALID_FAMILY],
      });
      const text2 = block({
        version: 1,
        scope: 'wordplay-letters',
        families: [VALID_FAMILY],
      });
      expect(parseFamilyBlock(text1, 's1.md', context)).toHaveLength(1);
      expect(parseFamilyBlock(text2, 's2.md', context)).toHaveLength(1);
    });
  });

  describe('2. Stable identifiers and deterministic ordering', () => {
    it('sorts families alphabetically by familyKey regardless of declaration order', () => {
      const f1 = { ...VALID_FAMILY, familyKey: 'zebra-word' };
      const f2 = { ...VALID_FAMILY, familyKey: 'alpha-anagram' };
      const f3 = { ...VALID_FAMILY, familyKey: 'middle-pattern' };

      const catalog = resolveCanonicalFamilies(
        [
          {
            slot: 'knowledge',
            source: 'test.md',
            text: block({ version: 1, families: [f1, f2, f3] }),
          },
        ],
        context,
      );

      expect(catalog.families.map((f) => f.familyKey)).toEqual([
        'alpha-anagram',
        'middle-pattern',
        'zebra-word',
      ]);
    });

    it('produces an identical SHA-256 digest for identical family definitions regardless of input order', () => {
      const f1 = { ...VALID_FAMILY, familyKey: 'zebra-word' };
      const f2 = { ...VALID_FAMILY, familyKey: 'alpha-anagram' };

      const catalogA = resolveCanonicalFamilies(
        [
          {
            slot: 'knowledge',
            source: 'test.md',
            text: block({ version: 1, families: [f1, f2] }),
          },
        ],
        context,
      );
      const catalogB = resolveCanonicalFamilies(
        [
          {
            slot: 'knowledge',
            source: 'test.md',
            text: block({ version: 1, families: [f2, f1] }),
          },
        ],
        context,
      );

      expect(catalogA.digest).toBe(catalogB.digest);
      expect(catalogA.digest).toHaveLength(64);
    });
  });

  describe('3. Duplicate family identifiers', () => {
    it('fails closed when the same familyKey is declared twice in the same block', () => {
      const text = block({
        version: 1,
        families: [VALID_FAMILY, VALID_FAMILY],
      });
      expect(() => parseFamilyBlock(text, 'test.md', context)).toThrow(
        FamilyResolutionError,
      );
      expect(() => parseFamilyBlock(text, 'test.md', context)).toThrow(
        /DUPLICATE_FAMILY_KEY/,
      );
    });

    it('fails closed when the same familyKey is declared across multiple sections', () => {
      const s1 = {
        slot: 'scope',
        source: 'SCOPE.md',
        text: block({ version: 1, families: [VALID_FAMILY] }),
      };
      const s2 = {
        slot: 'knowledge',
        source: 'KNOWLEDGE.md',
        text: block({ version: 1, families: [VALID_FAMILY] }),
      };
      expect(() => resolveCanonicalFamilies([s1, s2], context)).toThrow(
        /DUPLICATE_FAMILY_KEY.*declared in both "SCOPE.md" and "KNOWLEDGE.md"/,
      );
    });
  });

  describe('4. Malformed structured family definitions', () => {
    it('fails closed on invalid JSON', () => {
      const malformed =
        '```akwaan-families\n{ "version": 1, unquotedKey: bad \n```';
      expect(() => parseFamilyBlock(malformed, 'test.md', context)).toThrow(
        FamilyResolutionError,
      );
      expect(() => parseFamilyBlock(malformed, 'test.md', context)).toThrow(
        /MALFORMED_JSON/,
      );
    });

    it('fails closed on unsupported version', () => {
      const text = block({ version: 2, families: [VALID_FAMILY] });
      expect(() => parseFamilyBlock(text, 'test.md', context)).toThrow(
        /UNSUPPORTED_VERSION/,
      );
    });

    it('fails closed when catalog is not a JSON object', () => {
      const text = '```akwaan-families\n["just", "an", "array"]\n```';
      expect(() => parseFamilyBlock(text, 'test.md', context)).toThrow(
        /INVALID_CATALOG_SHAPE/,
      );
    });

    it('fails closed when families is not an array', () => {
      const text = block({ version: 1, families: 'not-an-array' });
      expect(() => parseFamilyBlock(text, 'test.md', context)).toThrow(
        /INVALID_FAMILIES_ARRAY/,
      );
    });
  });

  describe('5. Missing required fields', () => {
    it('fails closed when familyKey is missing or empty', () => {
      const text = block({
        version: 1,
        families: [{ ...VALID_FAMILY, familyKey: '' }],
      });
      expect(() => parseFamilyBlock(text, 'test.md', context)).toThrow(
        /FAMILY_KEY_REQUIRED/,
      );
    });

    it('fails closed when name is missing or empty', () => {
      const text = block({
        version: 1,
        families: [{ ...VALID_FAMILY, name: '   ' }],
      });
      expect(() => parseFamilyBlock(text, 'test.md', context)).toThrow(
        /FAMILY_NAME_REQUIRED/,
      );
    });

    it('fails closed when description is missing or empty', () => {
      const text = block({
        version: 1,
        families: [{ ...VALID_FAMILY, description: '' }],
      });
      expect(() => parseFamilyBlock(text, 'test.md', context)).toThrow(
        /FAMILY_DESCRIPTION_REQUIRED/,
      );
    });
  });

  describe('6. Unknown or conflicting identifiers & invalid values', () => {
    it('fails closed when familyKey is not a valid kebab-case slug', () => {
      const text1 = block({
        version: 1,
        families: [{ ...VALID_FAMILY, familyKey: 'INVALID_UPPERCASE' }],
      });
      const text2 = block({
        version: 1,
        families: [{ ...VALID_FAMILY, familyKey: 'with spaces' }],
      });
      const text3 = block({
        version: 1,
        families: [{ ...VALID_FAMILY, familyKey: 'under_score' }],
      });
      expect(() => parseFamilyBlock(text1, 't.md', context)).toThrow(
        /INVALID_FAMILY_KEY/,
      );
      expect(() => parseFamilyBlock(text2, 't.md', context)).toThrow(
        /INVALID_FAMILY_KEY/,
      );
      expect(() => parseFamilyBlock(text3, 't.md', context)).toThrow(
        /INVALID_FAMILY_KEY/,
      );
    });

    it('fails closed when scope does not match context', () => {
      const text = block({
        version: 1,
        scope: 'football.world-cup',
        families: [VALID_FAMILY],
      });
      expect(() => parseFamilyBlock(text, 't.md', context)).toThrow(
        /SCOPE_MISMATCH/,
      );
    });

    it('fails closed on unknown mechanic fit rating', () => {
      const text = block({
        version: 1,
        families: [
          {
            ...VALID_FAMILY,
            mechanicFit: { 'read-your-opponent': 'AMAZING' },
          },
        ],
      });
      expect(() => parseFamilyBlock(text, 't.md', context)).toThrow(
        /INVALID_MECHANIC_FIT_RATING/,
      );
    });
  });

  describe('7. Compatibility with existing Scope profiles', () => {
    it('returns an empty catalog with valid digest when profile carries no structured block', () => {
      const result = resolveCanonicalFamilies(
        [
          { slot: 'scope', source: 'SCOPE.md', text: '# Just prose\nNo block' },
          { slot: 'knowledge', source: 'KNOWLEDGE.md', text: '# Knowledge' },
        ],
        context,
      );
      expect(result.families).toEqual([]);
      expect(result.structuredSources).toEqual([]);
      expect(result.digest).toHaveLength(64);
    });
  });

  describe('8. Integration with AuthoringContextService & Canonical wordplay-letters profile', () => {
    const ROOT = resolve(__dirname, '../../../../..');
    const service = new AuthoringContextService({
      get: (key: string) =>
        key === 'ENGINE_AUTHORING_ROOT' ? ROOT : undefined,
    } as unknown as ConfigService);

    it('resolves the real canonical wordplay-letters profile and parses all 15 families', () => {
      const resolved = service.resolve({
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
      });

      expect(resolved.canonicalFamilies).toBeDefined();
      expect(resolved.canonicalFamilies.version).toBe(1);
      expect(resolved.canonicalFamilies.scopeKey).toBe('wordplay-letters');
      expect(resolved.canonicalFamilies.worldKey).toBe('puzzles');
      expect(resolved.canonicalFamilies.families).toHaveLength(15);

      const keys = resolved.canonicalFamilies.families.map((f) => f.familyKey);
      expect(keys).toEqual([
        'add-letter',
        'anagram-rearrange',
        'arabic-cipher-dhad',
        'dot-shift',
        'dotless-disambiguation',
        'hidden-word',
        'letter-pattern-progression',
        'letter-subtraction-math',
        'palindrome-symmetry',
        'plural-form',
        'remove-letter',
        'shared-letter-completion',
        'substitute-letter',
        'word-inside-word',
        'word-ladder-mini',
      ]);

      // Every family has its canonical ratings and properties populated
      const anagram = resolved.canonicalFamilies.families.find(
        (f) => f.familyKey === 'anagram-rearrange',
      );
      expect(anagram).toBeDefined();
      expect(anagram?.modality).toBe('letter-permutation');
      expect(anagram?.mechanicFit?.['read-your-opponent']).toBe('EXCELLENT');
      expect(anagram?.mechanicFit?.['bomb']).toBe('GOOD');
      expect(anagram?.mechanicFit?.['closest']).toBe('DO_NOT_FORCE');
    });

    it('leaves scopes without family catalogs with empty family catalogs', () => {
      const resolved = service.resolve({
        mechanicKey: 'closest',
        worldKey: 'football',
        scopeKey: 'world-cup',
      });
      expect(resolved.canonicalFamilies.families).toEqual([]);
      expect(resolved.canonicalFamilies.structuredSources).toEqual([]);
    });

    it('computes stable contextHash and digest', () => {
      const res1 = service.resolve({
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
      });
      const res2 = service.resolve({
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
      });
      expect(res1.canonicalFamilies.digest).toBe(res2.canonicalFamilies.digest);
      expect(res1.contextHash).toBe(res2.contextHash);
    });
  });

  describe('9. Existing Effective Rules behavior remains independent', () => {
    const ROOT = resolve(__dirname, '../../../../..');
    const service = new AuthoringContextService({
      get: (key: string) =>
        key === 'ENGINE_AUTHORING_ROOT' ? ROOT : undefined,
    } as unknown as ConfigService);

    it('leaves effectiveRules untouched and functional', () => {
      const resolved = service.resolve({
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
      });
      expect(resolved.effectiveRules).toBeDefined();
      expect(resolved.effectiveRules.rules.length).toBeGreaterThan(0);
      expect(
        resolved.effectiveRules.rules.some(
          (r) => r.id === 'ryo.answer-option-count',
        ),
      ).toBe(true);
    });
  });

  describe('10. Canonical Family Parity Validation (Part A)', () => {
    const ROOT = resolve(__dirname, '../../../../..');
    const scopePath = join(
      ROOT,
      'ai/.opencode/skills/worlds/puzzles/scopes/wordplay-letters/SCOPE.md',
    );
    const knowledgePath = join(
      ROOT,
      'ai/.opencode/skills/worlds/puzzles/scopes/wordplay-letters/KNOWLEDGE.md',
    );
    const scopeText = readFileSync(scopePath, 'utf8');
    const knowledgeText = readFileSync(knowledgePath, 'utf8');

    it('validates 100% parity on real canonical wordplay-letters profile', () => {
      const catalog = resolveCanonicalFamilies(
        [
          { slot: 'scope', source: scopePath, text: scopeText },
          { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
        ],
        context,
      );

      const report = validateFamilyCatalogParity(catalog, [
        { slot: 'scope', source: scopePath, text: scopeText },
        { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
      ]);

      expect(report.valid).toBe(true);
      expect(report.driftCount).toBe(0);
      expect(report.tablesFound).toBe(2);
      expect(report.authoritativeFamilyCount).toBe(15);
      expect(report.catalogFamilyCount).toBe(15);
      expect(report.verifiedFields).toEqual([
        'familyKey',
        'membership',
        'mechanicFit',
        'answerModes',
      ]);
      expect(report.limitations.length).toBeGreaterThan(0);
    });

    it('extracts family tables accurately from SCOPE and KNOWLEDGE markdown', () => {
      const scopeExtracted = extractFamilyTables(scopeText, 'SCOPE.md');
      const knowledgeExtracted = extractFamilyTables(
        knowledgeText,
        'KNOWLEDGE.md',
      );

      expect(scopeExtracted).toHaveLength(15);
      expect(knowledgeExtracted).toHaveLength(15);
      expect(scopeExtracted[0].familyKey).toBe('plural-form');
      expect(knowledgeExtracted[0].mechanicFit).toEqual({
        'moving-xo': 'EXCELLENT',
        'read-your-opponent': 'EXCELLENT',
        bomb: 'EXCELLENT',
        closest: 'DO_NOT_FORCE',
      });
    });

    it('detects missing families when table has a family not in catalog', () => {
      const catalog = resolveCanonicalFamilies(
        [
          { slot: 'scope', source: scopePath, text: scopeText },
          { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
        ],
        context,
      );

      // Remove plural-form from catalog
      const mutatedCatalog = {
        ...catalog,
        families: catalog.families.filter((f) => f.familyKey !== 'plural-form'),
      };

      const report = validateFamilyCatalogParity(mutatedCatalog, [
        { slot: 'scope', source: scopePath, text: scopeText },
        { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
      ]);

      expect(report.valid).toBe(false);
      expect(report.driftCount).toBeGreaterThanOrEqual(1);
      const missing = report.drifts.find(
        (d) => d.type === 'MISSING_IN_CATALOG' && d.familyKey === 'plural-form',
      );
      expect(missing).toBeDefined();

      expect(() =>
        assertFamilyCatalogParity(mutatedCatalog, [
          { slot: 'scope', source: scopePath, text: scopeText },
          { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
        ]),
      ).toThrow(FamilyResolutionError);
    });

    it('detects extra families when catalog contains a family not declared in authoritative tables', () => {
      const catalog = resolveCanonicalFamilies(
        [
          { slot: 'scope', source: scopePath, text: scopeText },
          { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
        ],
        context,
      );

      const mutatedCatalog = {
        ...catalog,
        families: [
          ...catalog.families,
          {
            ...VALID_FAMILY,
            familyKey: 'unapproved-invented-family',
            name: 'عائلة غير معتمدة',
            scopeKey: 'wordplay-letters',
            worldKey: 'puzzles',
            source: 'test.md',
          },
        ],
      };

      const report = validateFamilyCatalogParity(mutatedCatalog, [
        { slot: 'scope', source: scopePath, text: scopeText },
        { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
      ]);

      expect(report.valid).toBe(false);
      const extra = report.drifts.find(
        (d) =>
          d.type === 'EXTRA_IN_CATALOG' &&
          d.familyKey === 'unapproved-invented-family',
      );
      expect(extra).toBeDefined();

      expect(() =>
        assertFamilyCatalogParity(mutatedCatalog, [
          { slot: 'scope', source: scopePath, text: scopeText },
          { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
        ]),
      ).toThrow('PARITY_DRIFT:EXTRA_IN_CATALOG');
    });

    it('detects renamed identifiers between table and catalog', () => {
      const mutatedScopeText = scopeText.replace(
        '`plural-form`',
        '`plural-form-renamed`',
      );

      const catalog = resolveCanonicalFamilies(
        [
          { slot: 'scope', source: scopePath, text: scopeText },
          { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
        ],
        context,
      );

      const report = validateFamilyCatalogParity(catalog, [
        { slot: 'scope', source: 'mutated-scope.md', text: mutatedScopeText },
      ]);

      expect(report.valid).toBe(false);
      expect(
        report.drifts.some(
          (d) =>
            d.type === 'MISSING_IN_CATALOG' &&
            d.familyKey === 'plural-form-renamed',
        ),
      ).toBe(true);
      expect(
        report.drifts.some(
          (d) => d.type === 'EXTRA_IN_CATALOG' && d.familyKey === 'plural-form',
        ),
      ).toBe(true);
    });

    it('detects mechanic compatibility rating drift', () => {
      const catalog = resolveCanonicalFamilies(
        [
          { slot: 'scope', source: scopePath, text: scopeText },
          { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
        ],
        context,
      );

      // Drift bomb from EXCELLENT to LIMITED on plural-form
      const mutatedCatalog = {
        ...catalog,
        families: catalog.families.map((f) =>
          f.familyKey === 'plural-form'
            ? {
                ...f,
                mechanicFit: { ...f.mechanicFit, bomb: 'LIMITED' as const },
              }
            : f,
        ),
      };

      const report = validateFamilyCatalogParity(mutatedCatalog, [
        { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
      ]);

      expect(report.valid).toBe(false);
      const fitDrift = report.drifts.find(
        (d) =>
          d.type === 'MECHANIC_FIT_MISMATCH' && d.familyKey === 'plural-form',
      );
      expect(fitDrift).toBeDefined();
      expect(fitDrift?.expected).toBe('EXCELLENT');
      expect(fitDrift?.actual).toBe('LIMITED');

      expect(() =>
        assertFamilyCatalogParity(mutatedCatalog, [
          { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
        ]),
      ).toThrow('PARITY_DRIFT:MECHANIC_FIT_MISMATCH');
    });

    it('detects drift across multiple human-readable source tables', () => {
      const driftedKnowledgeText = knowledgeText.replace(
        '| 1 | `plural-form`',
        '| 1 | `plural-concept`',
      );

      const catalog = resolveCanonicalFamilies(
        [
          { slot: 'scope', source: scopePath, text: scopeText },
          { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
        ],
        context,
      );

      const report = validateFamilyCatalogParity(catalog, [
        { slot: 'scope', source: 'SCOPE.md', text: scopeText },
        {
          slot: 'knowledge',
          source: 'KNOWLEDGE.md',
          text: driftedKnowledgeText,
        },
      ]);

      expect(report.valid).toBe(false);
      expect(
        report.drifts.some((d) => d.type === 'SOURCE_TABLE_MISMATCH'),
      ).toBe(true);
    });

    it('passes cleanly when no markdown tables exist (legacy or minimal scopes)', () => {
      const catalog = resolveCanonicalFamilies(
        [
          {
            slot: 'knowledge',
            source: 'minimal.md',
            text: block({ version: 1, families: [VALID_FAMILY] }),
          },
        ],
        context,
      );

      const report = validateFamilyCatalogParity(catalog, [
        {
          slot: 'knowledge',
          source: 'minimal.md',
          text: block({ version: 1, families: [VALID_FAMILY] }),
        },
      ]);

      expect(report.valid).toBe(true);
      expect(report.tablesFound).toBe(0);
      expect(report.driftCount).toBe(0);
    });

    it('reports explicit non-comparable field limitations', () => {
      const catalog = resolveCanonicalFamilies(
        [
          { slot: 'scope', source: scopePath, text: scopeText },
          { slot: 'knowledge', source: knowledgePath, text: knowledgeText },
        ],
        context,
      );

      const report = validateFamilyCatalogParity(catalog, [
        { slot: 'scope', source: scopePath, text: scopeText },
      ]);

      expect(report.limitations).toContain(
        'Narrative prose descriptions and player-solve summaries cannot be compared by string equality without brittle failures across editorial formatting.',
      );
    });
  });
});
