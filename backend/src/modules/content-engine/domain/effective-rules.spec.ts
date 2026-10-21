import {
  RuleConflictError,
  RuleResolutionError,
  assertNoRuleConflicts,
  parseRuleBlock,
  resolveEffectiveRules,
  ruleSetDigest,
  SOURCE_LAYERS,
} from './effective-rules';

const block = (body: unknown) =>
  [
    '# Profile',
    '',
    '```akwaan-rules',
    JSON.stringify(body, null, 2),
    '```',
    '',
  ].join('\n');

const RULE = {
  id: 'ryo.answer-option-count',
  kind: 'integer-range',
  min: 2,
  max: 4,
};
const ONE = block({ version: 1, rules: [RULE] });

const section = (slot: string, source: string, text: string) => ({
  slot,
  source,
  text,
});

describe('structured rule block', () => {
  it('reads a declared rule and keeps its provenance', () => {
    const [rule] = parseRuleBlock(ONE, 'skills/ryo/SKILL.md', 'mechanic');
    expect(rule).toEqual({
      id: 'ryo.answer-option-count',
      layer: 'mechanic',
      source: 'skills/ryo/SKILL.md',
      value: { kind: 'integer-range', min: 2, max: 4 },
    });
  });

  it('returns nothing for a profile with no block', () => {
    expect(
      parseRuleBlock('# Just prose\n\nSome guidance.', 'p.md', 'world'),
    ).toEqual([]);
  });

  it('takes the layer from the declaring profile, not the block', () => {
    // A World profile cannot assert a core rule.
    const [rule] = parseRuleBlock(ONE, 'WORLD.md', 'world');
    expect(rule.layer).toBe('world');
  });

  it('accepts a block that restates its own layer correctly', () => {
    const text = block({ version: 1, rules: [{ ...RULE, layer: 'mechanic' }] });
    expect(parseRuleBlock(text, 'SKILL.md', 'mechanic')).toHaveLength(1);
  });

  describe('malformed input is never silently ignored', () => {
    const fails = (text: string, code: string, layer = 'mechanic' as const) => {
      let thrown: RuleResolutionError | undefined;
      try {
        parseRuleBlock(text, 'SKILL.md', layer);
      } catch (error) {
        thrown = error as RuleResolutionError;
      }
      expect(thrown).toBeInstanceOf(RuleResolutionError);
      expect(thrown!.code).toBe(code);
      expect(thrown!.source).toBe('SKILL.md');
    };

    it('rejects unparseable JSON', () => {
      fails('```akwaan-rules\n{ not json\n```', 'RULE_BLOCK_MALFORMED');
    });
    it('rejects an unsupported version', () => {
      fails(block({ version: 2, rules: [] }), 'RULE_BLOCK_VERSION_UNSUPPORTED');
    });
    it('rejects a missing rules array', () => {
      fails(block({ version: 1 }), 'RULE_BLOCK_MALFORMED');
    });
    it('rejects a rule with no id', () => {
      fails(
        block({
          version: 1,
          rules: [{ kind: 'integer-range', min: 1, max: 2 }],
        }),
        'RULE_ID_REQUIRED',
      );
    });
    it('rejects the same id twice in one profile', () => {
      fails(block({ version: 1, rules: [RULE, RULE] }), 'RULE_ID_DUPLICATED');
    });
    it('rejects an unsupported kind', () => {
      fails(
        block({
          version: 1,
          rules: [{ id: 'x', kind: 'regex-match', pattern: 'a' }],
        }),
        'RULE_KIND_UNSUPPORTED',
      );
    });
    it('rejects a non-integer range', () => {
      fails(
        block({
          version: 1,
          rules: [{ id: 'x', kind: 'integer-range', min: 1.5, max: 4 }],
        }),
        'RULE_VALUE_INVALID',
      );
    });
    it('rejects an inverted range', () => {
      fails(
        block({
          version: 1,
          rules: [{ id: 'x', kind: 'integer-range', min: 9, max: 4 }],
        }),
        'RULE_VALUE_INVALID',
      );
    });
    it('rejects a layer the profile does not own', () => {
      fails(
        block({ version: 1, rules: [{ ...RULE, layer: 'core' }] }),
        'RULE_LAYER_INVALID',
      );
    });
    it('rejects two blocks in one profile', () => {
      fails(`${ONE}\n${ONE}`, 'RULE_BLOCK_DUPLICATED');
    });
  });
});

describe('resolution', () => {
  it('maps all six canonical sources onto the four layers', () => {
    expect(SOURCE_LAYERS).toEqual({
      global: 'core',
      mechanic: 'mechanic',
      world: 'world',
      scope: 'scope',
      // Scope-owned material contributes Scope rules; no source is discarded.
      knowledge: 'scope',
      exemplars: 'scope',
    });
  });

  it('orders by layer then id, never by read order', () => {
    const scopeRule = block({
      version: 1,
      rules: [{ id: 'a.rule', kind: 'integer-range', min: 1, max: 2 }],
    });
    const coreRule = block({
      version: 1,
      rules: [{ id: 'z.rule', kind: 'integer-range', min: 1, max: 2 }],
    });
    const forward = resolveEffectiveRules([
      section('scope', 'SCOPE.md', scopeRule),
      section('global', 'CORE.md', coreRule),
    ]);
    const reversed = resolveEffectiveRules([
      section('global', 'CORE.md', coreRule),
      section('scope', 'SCOPE.md', scopeRule),
    ]);
    // Core precedes scope even though its id sorts last.
    expect(forward.rules.map((r) => r.layer)).toEqual(['core', 'scope']);
    expect(forward.digest).toBe(reversed.digest);
  });

  it('preserves both definitions when two layers declare one id', () => {
    // R1 is not a merge engine: R2 needs both sides and their provenance.
    const same = (min: number, max: number) =>
      block({
        version: 1,
        rules: [{ id: 'shared.rule', kind: 'integer-range', min, max }],
      });
    const set = resolveEffectiveRules([
      section('mechanic', 'SKILL.md', same(2, 4)),
      section('scope', 'SCOPE.md', same(3, 3)),
    ]);
    expect(set.rules).toHaveLength(2);
    expect(set.rules.map((r) => r.layer)).toEqual(['mechanic', 'scope']);
    expect(set.rules.map((r) => r.source)).toEqual(['SKILL.md', 'SCOPE.md']);
  });

  it('returns a valid empty set for profiles with no blocks', () => {
    const set = resolveEffectiveRules([
      section('world', 'WORLD.md', '# prose only'),
    ]);
    expect(set).toMatchObject({ version: 1, rules: [], structuredSources: [] });
    expect(set.digest).toHaveLength(64);
  });

  it('records which sources carried a block', () => {
    const set = resolveEffectiveRules([
      section('mechanic', 'SKILL.md', ONE),
      section('world', 'WORLD.md', '# prose only'),
    ]);
    expect(set.structuredSources).toEqual(['SKILL.md']);
  });

  it('ignores a slot that maps to no layer', () => {
    expect(
      resolveEffectiveRules([section('unknown-slot', 'X.md', ONE)]).rules,
    ).toEqual([]);
  });
});

describe('digest', () => {
  it('is stable across repeated resolution', () => {
    const run = () =>
      resolveEffectiveRules([section('mechanic', 'SKILL.md', ONE)]).digest;
    expect(run()).toBe(run());
  });

  it('changes when a rule value changes', () => {
    const a = resolveEffectiveRules([
      section('mechanic', 'SKILL.md', ONE),
    ]).digest;
    const b = resolveEffectiveRules([
      section(
        'mechanic',
        'SKILL.md',
        block({ version: 1, rules: [{ ...RULE, max: 5 }] }),
      ),
    ]).digest;
    expect(a).not.toBe(b);
  });

  it('is unchanged when only prose around the block changes', () => {
    // The companion assertion — that prose still moves `contextHash` — lives
    // in the context-service spec, where the hash is computed.
    const a = resolveEffectiveRules([
      section('mechanic', 'SKILL.md', ONE),
    ]).digest;
    const b = resolveEffectiveRules([
      section(
        'mechanic',
        'SKILL.md',
        `# Rewritten heading\n\nNew prose.\n${ONE}`,
      ),
    ]).digest;
    expect(a).toBe(b);
  });

  it('distinguishes the same rule declared by a different source', () => {
    const a = resolveEffectiveRules([section('mechanic', 'A.md', ONE)]).digest;
    const b = resolveEffectiveRules([section('mechanic', 'B.md', ONE)]).digest;
    expect(a).not.toBe(b);
  });

  it('is computable directly from a rule list', () => {
    expect(ruleSetDigest([])).toHaveLength(64);
  });
});

describe('rule policies — R2', () => {
  const decl = (over: Record<string, unknown> = {}) => ({
    id: 'm.range',
    kind: 'integer-range',
    policy: 'bounded',
    min: 2,
    max: 4,
    ...over,
  });
  const at = (slot: string, source: string, rule: Record<string, unknown>) =>
    section(slot, source, block({ version: 1, rules: [rule] }));

  const resolve = (...sections: ReturnType<typeof at>[]) =>
    resolveEffectiveRules(sections);

  describe('invariant', () => {
    const INV = decl({ policy: 'invariant', min: 3, max: 3 });

    it('accepts an identical restatement as redundant', () => {
      const set = resolve(
        at('mechanic', 'SKILL.md', INV),
        at('world', 'WORLD.md', { ...INV, policy: undefined }),
      );
      expect(set.conflicts).toEqual([]);
      expect(set.resolved[0].effective).toEqual({ min: 3, max: 3 });
      // The redundant declaration is recorded, not erased.
      expect(set.resolved[0].contributions).toHaveLength(2);
    });

    it('rejects any modification', () => {
      const set = resolve(
        at('mechanic', 'SKILL.md', INV),
        at('world', 'WORLD.md', { ...INV, policy: undefined, min: 2, max: 3 }),
      );
      expect(set.conflicts.map((c) => c.code)).toEqual([
        'RULE_INVARIANT_MODIFIED',
      ]);
    });

    it('rejects narrowing an invariant — immutable is not configurable', () => {
      const wide = decl({ policy: 'invariant', min: 2, max: 4 });
      const set = resolve(
        at('mechanic', 'SKILL.md', wide),
        at('scope', 'SCOPE.md', { ...wide, policy: undefined, min: 3, max: 3 }),
      );
      expect(set.conflicts.map((c) => c.code)).toEqual([
        'RULE_INVARIANT_MODIFIED',
      ]);
    });
  });

  describe('bounded', () => {
    it('narrows through World then Scope', () => {
      const set = resolve(
        at('mechanic', 'SKILL.md', decl()),
        at('world', 'WORLD.md', decl({ policy: undefined, min: 2, max: 3 })),
        at('scope', 'SCOPE.md', decl({ policy: undefined, min: 3, max: 3 })),
      );
      expect(set.conflicts).toEqual([]);
      expect(set.resolved[0].effective).toEqual({ min: 3, max: 3 });
      expect(set.resolved[0].contributions.map((c) => c.layer)).toEqual([
        'mechanic',
        'world',
        'scope',
      ]);
    });

    it.each([
      ['widening', { min: 1, max: 4 }, 'RULE_BOUND_WIDENED'],
      ['a disjoint range', { min: 5, max: 5 }, 'RULE_BOUND_OUT_OF_RANGE'],
      [
        'a range extending past the bound',
        { min: 4, max: 5 },
        'RULE_BOUND_OUT_OF_RANGE',
      ],
    ])('rejects %s', (_label, range, code) => {
      const set = resolve(
        at('mechanic', 'SKILL.md', decl()),
        at('world', 'WORLD.md', decl({ policy: undefined, ...range })),
      );
      expect(set.conflicts.map((c) => c.code)).toEqual([code]);
      // The effective value never absorbs an invalid declaration.
      expect(set.resolved[0].effective).toEqual({ min: 2, max: 4 });
    });

    it('rejects a Scope re-expanding a World restriction', () => {
      // [3,4] is inside the mechanic's [2,4] but outside the World's [2,3].
      const set = resolve(
        at('mechanic', 'SKILL.md', decl()),
        at('world', 'WORLD.md', decl({ policy: undefined, min: 2, max: 3 })),
        at('scope', 'SCOPE.md', decl({ policy: undefined, min: 3, max: 4 })),
      );
      expect(set.conflicts.map((c) => c.code)).toEqual([
        'RULE_BOUND_OUT_OF_RANGE',
      ]);
      expect(set.conflicts[0].parent).toEqual({ min: 2, max: 3 });
      expect(set.conflicts[0].parentLayer).toBe('world');
      expect(set.resolved[0].effective).toEqual({ min: 2, max: 3 });
    });
  });

  it('rejects a policy restated differently', () => {
    const set = resolve(
      at('mechanic', 'SKILL.md', decl()),
      at('world', 'WORLD.md', decl({ policy: 'invariant' })),
    );
    expect(set.conflicts.map((c) => c.code)).toEqual(['RULE_POLICY_CONFLICT']);
  });

  it('refuses specialization of a rule with no declared policy', () => {
    const set = resolve(
      at('mechanic', 'SKILL.md', decl({ policy: undefined })),
    );
    expect(set.conflicts.map((c) => c.code)).toEqual([
      'RULE_POLICY_UNDECLARED',
    ]);
    expect(set.resolved).toEqual([]);
  });

  it('rejects an unknown policy at parse time', () => {
    expect(() =>
      parseRuleBlock(
        block({ version: 1, rules: [decl({ policy: 'advisory' })] }),
        'SKILL.md',
        'mechanic',
      ),
    ).toThrow(/RULE_POLICY_INVALID/);
  });

  it('reports every field a reviewer needs', () => {
    const set = resolve(
      at('mechanic', 'SKILL.md', decl()),
      at('scope', 'SCOPE.md', decl({ policy: undefined, min: 1, max: 9 })),
    );
    expect(set.conflicts[0]).toMatchObject({
      code: 'RULE_BOUND_WIDENED',
      ruleId: 'm.range',
      layer: 'scope',
      source: 'SCOPE.md',
      attempted: { min: 1, max: 9 },
      parent: { min: 2, max: 4 },
      parentLayer: 'mechanic',
      parentSource: 'SKILL.md',
      policy: 'bounded',
    });
    expect(set.conflicts[0].message).toMatch(/widens it/);
  });

  it('throws only when a conflict exists', () => {
    const clean = resolve(at('mechanic', 'SKILL.md', decl()));
    expect(() => assertNoRuleConflicts(clean)).not.toThrow();
    const bad = resolve(
      at('mechanic', 'SKILL.md', decl()),
      at('world', 'WORLD.md', decl({ policy: undefined, min: 1, max: 9 })),
    );
    expect(() => assertNoRuleConflicts(bad)).toThrow(RuleConflictError);
  });

  it('changes the digest when a policy or an effective value changes', () => {
    const base = resolve(at('mechanic', 'SKILL.md', decl())).digest;
    const policyChanged = resolve(
      at('mechanic', 'SKILL.md', decl({ policy: 'invariant' })),
    ).digest;
    const narrowed = resolve(
      at('mechanic', 'SKILL.md', decl()),
      at('world', 'WORLD.md', decl({ policy: undefined, min: 3, max: 3 })),
    ).digest;
    expect(policyChanged).not.toBe(base);
    expect(narrowed).not.toBe(base);
  });
});
