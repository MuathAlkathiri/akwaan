import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import {
  AuthoringContextService,
  AuthoringContextUnavailableError,
} from './authoring-context.service';
import { composeGenerationPrompt } from './candidate-generator.service';

/**
 * Mechanic-safe exemplar selection, end to end through the real resolver and
 * the real prompt builder, on a throwaway authoring root.
 *
 * The Scope's EXEMPLARS.md mixes an RYO-only, a Closest-only, a legacy
 * untargeted APPROVED entry and a targeted REJECTED one. Each body carries a
 * unique token so a leak into any prompt is detectable.
 */
const SCOPE_EXEMPLARS = 'ai/.opencode/skills/worlds/w/scopes/s/EXEMPLARS.md';

const block = (fields: Record<string, unknown>, body: string) =>
  `<!-- AKWAAN_EXEMPLAR_META ${JSON.stringify({
    version: 1,
    reusePolicy: 'DO_NOT_REGENERATE',
    ...fields,
  })} -->\n${body}\n<!-- /AKWAAN_EXEMPLAR_META -->`;

const EXEMPLARS = [
  '# Exemplars',
  block(
    {
      id: 'ryo-gold',
      status: 'APPROVED',
      mechanics: ['read-your-opponent'],
      approvedBy: 'product-owner',
      approvedAt: '2026-11-06',
      sourceRef: 'fixture:ryo',
    },
    'TOKEN_RYO_ONLY',
  ),
  block(
    { id: 'closest-gold', status: 'APPROVED', mechanics: ['closest'] },
    'TOKEN_CLOSEST_ONLY',
  ),
  block({ id: 'legacy-approved', status: 'APPROVED' }, 'TOKEN_UNTARGETED'),
  block(
    {
      id: 'rejected-ryo',
      status: 'REJECTED',
      mechanics: ['read-your-opponent'],
    },
    'TOKEN_REJECTED',
  ),
].join('\n\n');

const MANIFEST = {
  mechanics: {
    'read-your-opponent': {
      category: 'SHARED',
      status: 'AUTHORABLE',
      profile: 'ai/.opencode/skills/challenge-types/ryo/SKILL.md',
      aliases: ['ryo'],
    },
    closest: {
      category: 'SHARED',
      status: 'AUTHORABLE',
      profile: 'ai/.opencode/skills/challenge-types/closest/SKILL.md',
    },
    'one-clue': {
      category: 'SHARED',
      status: 'AUTHORABLE',
      profile: 'ai/.opencode/skills/challenge-types/one-clue/SKILL.md',
    },
  },
  worlds: {
    w: { profile: 'ai/.opencode/skills/worlds/w/WORLD.md', scopes: ['s'] },
  },
  scopes: {
    'w/s': {
      world: 'w',
      scopePath: 'ai/.opencode/skills/worlds/w/scopes/s/SCOPE.md',
      knowledgePath: 'ai/.opencode/skills/worlds/w/scopes/s/KNOWLEDGE.md',
      exemplarsPath: SCOPE_EXEMPLARS,
    },
  },
};

const TOKENS = [
  'TOKEN_RYO_ONLY',
  'TOKEN_CLOSEST_ONLY',
  'TOKEN_UNTARGETED',
  'TOKEN_REJECTED',
];

describe('AuthoringContextService — mechanic-safe exemplars', () => {
  let root: string;

  const write = (relative: string, text: string) => {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, 'utf8');
  };

  const service = () =>
    new AuthoringContextService({
      get: (key: string) =>
        key === 'ENGINE_AUTHORING_ROOT' ? root : undefined,
    } as never);

  const resolve = (mechanicKey: string) =>
    service().resolve(
      { mechanicKey, worldKey: 'w', scopeKey: 's' },
      { quiet: true },
    );

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'akwaan-exemplars-'));
    write('ai/.opencode/authoring-manifest.json', JSON.stringify(MANIFEST));
    write('ai/.opencode/knowledge/architecture/QUESTION-CRAFT.md', '# Global');
    for (const mechanic of ['ryo', 'closest', 'one-clue']) {
      write(
        `ai/.opencode/skills/challenge-types/${mechanic}/SKILL.md`,
        `# ${mechanic}`,
      );
    }
    write('ai/.opencode/skills/worlds/w/WORLD.md', '# World');
    write('ai/.opencode/skills/worlds/w/scopes/s/SCOPE.md', '# Scope');
    write('ai/.opencode/skills/worlds/w/scopes/s/KNOWLEDGE.md', '# Knowledge');
    write(SCOPE_EXEMPLARS, EXEMPLARS);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('gives RYO only its own approved exemplar', () => {
    const context = resolve('read-your-opponent');
    expect(context.exemplars).toContain('TOKEN_RYO_ONLY');
    for (const token of TOKENS.slice(1)) {
      expect(context.exemplars).not.toContain(token);
    }
    expect(context.exemplarDiagnostics).toEqual([
      'EXEMPLAR_UNTARGETED_EXCLUDED: legacy-approved',
      'EXEMPLAR_MECHANIC_EXCLUDED: closest-gold',
    ]);
  });

  it('resolves an alias to the canonical key before selecting', () => {
    expect(resolve('ryo').exemplars).toContain('TOKEN_RYO_ONLY');
  });

  it('gives Closest only its own, and One Clue none', () => {
    expect(resolve('closest').exemplars).toContain('TOKEN_CLOSEST_ONLY');
    expect(resolve('closest').exemplars).not.toContain('TOKEN_RYO_ONLY');
    const oneClue = resolve('one-clue');
    expect(oneClue.exemplars).toBe('');
    expect(oneClue.exemplarDiagnostics).toEqual([
      'EXEMPLAR_UNTARGETED_EXCLUDED: legacy-approved',
      'EXEMPLAR_MECHANIC_EXCLUDED: ryo-gold,closest-gold',
    ]);
  });

  it('keeps every entry, eligible or not, in the duplicate-screening corpus', () => {
    for (const mechanic of ['read-your-opponent', 'closest', 'one-clue']) {
      const { historicalExemplars } = resolve(mechanic);
      for (const token of TOKENS) {
        expect(historicalExemplars).toContain(token);
      }
    }
  });

  it('never lets an excluded exemplar into the generation prompt', () => {
    for (const [mechanic, answerMode, own] of [
      ['read-your-opponent', 'multiple_choice', 'TOKEN_RYO_ONLY'],
      ['closest', 'closest', 'TOKEN_CLOSEST_ONLY'],
    ] as const) {
      const prompt = composeGenerationPrompt(resolve(mechanic), 2, answerMode);
      expect(prompt).toContain(own);
      for (const token of TOKENS.filter((candidate) => candidate !== own)) {
        expect(prompt).not.toContain(token);
      }
    }
  });

  it('feeds only the selected exemplars to the effective-rule resolver', () => {
    write(
      SCOPE_EXEMPLARS,
      [
        block(
          {
            id: 'ryo-rule',
            status: 'APPROVED',
            mechanics: ['read-your-opponent'],
          },
          'TOKEN_RYO_ONLY',
        ),
        block(
          { id: 'closest-rule', status: 'APPROVED', mechanics: ['closest'] },
          [
            '```akwaan-rules',
            JSON.stringify({
              version: 1,
              rules: [
                {
                  id: 'closest.only.rule',
                  kind: 'integer-range',
                  policy: 'bounded',
                  min: 1,
                  max: 2,
                },
              ],
            }),
            '```',
          ].join('\n'),
        ),
      ].join('\n\n'),
    );
    const sources = (mechanic: string) =>
      resolve(mechanic).effectiveRules.structuredSources;
    // A rule block inside a Closest-only exemplar shapes Closest, not RYO.
    expect(sources('closest')).toContain(SCOPE_EXEMPLARS);
    expect(sources('read-your-opponent')).not.toContain(SCOPE_EXEMPLARS);
  });

  it('fails closed on a target that is not a canonical manifest mechanic', () => {
    write(
      SCOPE_EXEMPLARS,
      block(
        { id: 'typo', status: 'APPROVED', mechanics: ['read-your-oponent'] },
        'TOKEN_TYPO',
      ),
    );
    let thrown: unknown;
    try {
      resolve('read-your-opponent');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AuthoringContextUnavailableError);
    expect((thrown as AuthoringContextUnavailableError).code).toBe(
      'EXEMPLAR_METADATA_INVALID',
    );
  });

  describe('context fingerprint', () => {
    it('is stable for unchanged files', () => {
      expect(resolve('read-your-opponent').contextHash).toBe(
        resolve('read-your-opponent').contextHash,
      );
    });

    it.each([
      [
        'mechanic targeting',
        (text: string) =>
          text.replace(
            '"mechanics":["closest"]',
            '"mechanics":["closest","read-your-opponent"]',
          ),
      ],
      [
        'approval provenance',
        (text: string) =>
          text.replace(
            '"sourceRef":"fixture:ryo"',
            '"sourceRef":"fixture:ryo-v2"',
          ),
      ],
    ])('changes when %s changes', (_label, edit) => {
      const before = resolve('read-your-opponent').contextHash;
      const edited = edit(EXEMPLARS);
      expect(edited).not.toBe(EXEMPLARS);
      write(SCOPE_EXEMPLARS, edited);
      expect(resolve('read-your-opponent').contextHash).not.toBe(before);
    });

    it('differs per mechanic for the same files', () => {
      expect(resolve('read-your-opponent').contextHash).not.toBe(
        resolve('closest').contextHash,
      );
    });
  });
});
