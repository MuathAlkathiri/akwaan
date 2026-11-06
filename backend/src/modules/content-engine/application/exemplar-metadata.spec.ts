import {
  ExemplarMetadataError,
  parseExemplarMetadata,
  resolveExemplarDocument,
} from './exemplar-metadata';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const OPEN =
  '<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"sample-one","status":"APPROVED","reusePolicy":"DO_NOT_REGENERATE"} -->';
const CLOSE = '<!-- /AKWAAN_EXEMPLAR_META -->';

/** One complete exemplar block with the given metadata and body. */
const block = (
  fields: Record<string, unknown>,
  body = `${String(fields.id).toUpperCase()} BODY`,
) =>
  `<!-- AKWAAN_EXEMPLAR_META ${JSON.stringify({
    version: 1,
    reusePolicy: 'DO_NOT_REGENERATE',
    ...fields,
  })} -->\n${body}\n${CLOSE}`;

const RYO = { mechanicKey: 'read-your-opponent' };
const KNOWN = ['read-your-opponent', 'closest', 'one-clue', 'bomb'];

describe('exemplar metadata contract', () => {
  it('parses valid metadata and routing notes', () => {
    const text =
      '<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"sample-one","status":"APPROVED","reusePolicy":"DO_NOT_REGENERATE","routingNote":"Use only for rule inference"} -->\nExample\n' +
      CLOSE;
    expect(parseExemplarMetadata(text)[0].metadata).toEqual({
      version: 1,
      id: 'sample-one',
      status: 'APPROVED',
      reusePolicy: 'DO_NOT_REGENERATE',
      routingNote: 'Use only for rule inference',
    });
  });

  it('returns only APPROVED content for generation while retaining raw history', () => {
    const approved = block(
      {
        id: 'sample-one',
        status: 'APPROVED',
        mechanics: ['read-your-opponent'],
      },
      'APPROVED BODY',
    );
    const withheld = block(
      {
        id: 'sample-two',
        status: 'WITHHELD',
        mechanics: ['read-your-opponent'],
      },
      'WITHHELD BODY',
    );
    const document = resolveExemplarDocument(
      [approved, withheld].join('\n'),
      RYO,
    );
    expect(document.approvedText).toContain('APPROVED BODY');
    expect(document.approvedText).toContain('"DO_NOT_REGENERATE"');
    expect(document.approvedText).not.toContain('WITHHELD BODY');
    expect(document.historicalText).toContain('WITHHELD BODY');
  });

  it('diagnoses unclassified legacy entries without treating them as approved', () => {
    const document = resolveExemplarDocument(
      '### 1. Legacy example\n> answer\n',
      RYO,
    );
    expect(document.approvedText).toBe('');
    expect(document.diagnostics[0]).toMatch(/EXEMPLAR_STATUS_UNCLASSIFIED/);
  });

  it('does not treat headings, prose, emoji or tables as status metadata', () => {
    expect(
      parseExemplarMetadata(`
## APPROVED: prose heading
**Status**: APPROVED
| State | ✅ APPROVED |
## ⚠️ Every item below is a retired subject
`),
    ).toEqual([]);
  });

  it('rejects unknown and malformed metadata', () => {
    expect(() =>
      parseExemplarMetadata(
        OPEN.replace('"APPROVED"', '"PENDING"') + '\n' + CLOSE,
      ),
    ).toThrow(ExemplarMetadataError);
    expect(() =>
      parseExemplarMetadata(
        '<!-- AKWAAN_EXEMPLAR_META {not-json} -->\n' + CLOSE,
      ),
    ).toThrow(/malformed metadata JSON/);
  });

  it('accepts every contract status', () => {
    for (const status of [
      'APPROVED',
      'WITHHELD',
      'REJECTED',
      'RETIRED',
      'INVALID_TEST_SAMPLE',
    ] as const) {
      const exemplarId = status.toLowerCase().replaceAll('_', '-');
      const text = OPEN.replace(
        '"sample-one"',
        `"sample-${exemplarId}"`,
      ).replace('"APPROVED"', `"${status}"`);
      expect(
        parseExemplarMetadata(text + '\n' + CLOSE)[0].metadata.status,
      ).toBe(status);
    }
  });

  it('rejects unbalanced and duplicate markers', () => {
    expect(() => parseExemplarMetadata(OPEN)).toThrow(/missing closing/);
    expect(() =>
      parseExemplarMetadata([OPEN, CLOSE, OPEN, CLOSE].join('\n')),
    ).toThrow(/duplicate exemplar id/);
  });

  it('supports metadata around a table row without interpreting the row itself', () => {
    const text = '| ' + OPEN + ' prompt | reason ' + CLOSE + ' |';
    expect(parseExemplarMetadata(text)[0].metadata.status).toBe('APPROVED');
  });

  describe('mechanic targeting', () => {
    const ryoOnly = block({
      id: 'ryo-only',
      status: 'APPROVED',
      mechanics: ['read-your-opponent'],
    });

    it('includes an approved exemplar for the mechanic it targets', () => {
      const document = resolveExemplarDocument(ryoOnly, RYO);
      expect(document.approvedText).toContain('RYO-ONLY BODY');
      expect(document.diagnostics).toEqual([]);
    });

    it.each(['closest', 'one-clue', 'bomb'])(
      'excludes the same exemplar from %s and reports why',
      (mechanicKey) => {
        const document = resolveExemplarDocument(ryoOnly, { mechanicKey });
        expect(document.approvedText).toBe('');
        expect(document.diagnostics).toEqual([
          'EXEMPLAR_MECHANIC_EXCLUDED: ryo-only',
        ]);
        expect(document.historicalText).toContain('RYO-ONLY BODY');
      },
    );

    it('honours explicit multi-mechanic targeting, and only that', () => {
      const shared = block({
        id: 'shared',
        status: 'APPROVED',
        mechanics: ['read-your-opponent', 'closest'],
      });
      for (const mechanicKey of ['read-your-opponent', 'closest']) {
        expect(
          resolveExemplarDocument(shared, { mechanicKey }).approvedText,
        ).toContain('SHARED BODY');
      }
      expect(
        resolveExemplarDocument(shared, { mechanicKey: 'one-clue' })
          .approvedText,
      ).toBe('');
    });

    it('never treats a missing target as every mechanic', () => {
      const legacy = block({ id: 'legacy-approved', status: 'APPROVED' });
      for (const mechanicKey of KNOWN) {
        const document = resolveExemplarDocument(legacy, { mechanicKey });
        expect(document.approvedText).toBe('');
        expect(document.diagnostics).toEqual([
          'EXEMPLAR_UNTARGETED_EXCLUDED: legacy-approved',
        ]);
      }
    });

    it('selects per entry within one document', () => {
      const document = resolveExemplarDocument(
        [
          ryoOnly,
          block({
            id: 'closest-only',
            status: 'APPROVED',
            mechanics: ['closest'],
          }),
          block({ id: 'untargeted', status: 'APPROVED' }),
        ].join('\n'),
        RYO,
      );
      expect(document.approvedText).toContain('RYO-ONLY BODY');
      expect(document.approvedText).not.toContain('CLOSEST-ONLY BODY');
      expect(document.approvedText).not.toContain('UNTARGETED BODY');
      expect(document.diagnostics).toEqual([
        'EXEMPLAR_UNTARGETED_EXCLUDED: untargeted',
        'EXEMPLAR_MECHANIC_EXCLUDED: closest-only',
      ]);
    });

    it.each(['REJECTED', 'WITHHELD', 'RETIRED', 'INVALID_TEST_SAMPLE'])(
      'never turns a targeted %s exemplar into a positive example',
      (status) => {
        const document = resolveExemplarDocument(
          block({
            id: 'not-approved',
            status,
            mechanics: ['read-your-opponent'],
          }),
          RYO,
        );
        expect(document.approvedText).toBe('');
        expect(document.historicalText).toContain('NOT-APPROVED BODY');
      },
    );

    it('rejects a target that is not a canonical manifest mechanic', () => {
      // 'ryo' is an alias spelling, not the canonical key.
      for (const target of ['not-a-mechanic', 'ryo']) {
        expect(() =>
          resolveExemplarDocument(
            block({ id: 'typo', status: 'APPROVED', mechanics: [target] }),
            { mechanicKey: 'read-your-opponent', knownMechanics: KNOWN },
          ),
        ).toThrow(/unknown mechanic/);
      }
    });

    it.each([
      ['an empty list', []],
      ['a bare string', 'read-your-opponent'],
      ['a non-string entry', [7]],
      ['an empty entry', ['']],
      ['an uppercase key', ['Read-Your-Opponent']],
      ['a spaced key', ['read your opponent']],
      ['a repeated key', ['closest', 'closest']],
    ])('rejects malformed targeting: %s', (_label, mechanics) => {
      expect(() =>
        parseExemplarMetadata(
          block({ id: 'bad-target', status: 'APPROVED', mechanics }),
        ),
      ).toThrow(ExemplarMetadataError);
    });
  });

  describe('approval provenance', () => {
    const approved = (extra: Record<string, unknown>) =>
      block({
        id: 'with-provenance',
        status: 'APPROVED',
        mechanics: ['closest'],
        ...extra,
      });

    it('parses recorded provenance', () => {
      expect(
        parseExemplarMetadata(
          approved({
            approvedBy: 'product-owner',
            approvedAt: '2026-11-06',
            sourceRef: 'reference-library-v11:MM-003',
          }),
        )[0].metadata,
      ).toEqual({
        version: 1,
        id: 'with-provenance',
        status: 'APPROVED',
        reusePolicy: 'DO_NOT_REGENERATE',
        mechanics: ['closest'],
        approvedBy: 'product-owner',
        approvedAt: '2026-11-06',
        sourceRef: 'reference-library-v11:MM-003',
      });
    });

    it('keeps provenance optional for existing entries', () => {
      expect(
        parseExemplarMetadata(approved({}))[0].metadata,
      ).not.toHaveProperty('approvedBy');
    });

    it.each([
      ['approvedBy without approvedAt', { approvedBy: 'product-owner' }],
      ['approvedAt without approvedBy', { approvedAt: '2026-11-06' }],
      ['an empty approver', { approvedBy: '', approvedAt: '2026-11-06' }],
      ['a padded approver', { approvedBy: ' po ', approvedAt: '2026-11-06' }],
      [
        'a multi-line approver',
        { approvedBy: 'a\nb', approvedAt: '2026-11-06' },
      ],
      [
        'an over-long approver',
        { approvedBy: 'x'.repeat(121), approvedAt: '2026-11-06' },
      ],
      ['a non-ISO date', { approvedBy: 'po', approvedAt: '06/11/2026' }],
      ['an impossible date', { approvedBy: 'po', approvedAt: '2026-02-30' }],
      ['a timestamp', { approvedBy: 'po', approvedAt: '2026-11-06T10:00:00Z' }],
      ['an empty sourceRef', { sourceRef: '' }],
      ['a non-string sourceRef', { sourceRef: 42 }],
    ])('rejects %s', (_label, extra) => {
      expect(() => parseExemplarMetadata(approved(extra))).toThrow(
        ExemplarMetadataError,
      );
    });

    it('refuses approval fields on an entry that is not APPROVED', () => {
      expect(() =>
        parseExemplarMetadata(
          block({
            id: 'rejected-with-approver',
            status: 'REJECTED',
            approvedBy: 'product-owner',
            approvedAt: '2026-11-06',
          }),
        ),
      ).toThrow(/only valid on APPROVED/);
    });

    it('accepts a sourceRef on any status', () => {
      expect(
        parseExemplarMetadata(
          block({
            id: 'rejected-ref',
            status: 'REJECTED',
            sourceRef: 'MM-002',
          }),
        )[0].metadata.sourceRef,
      ).toBe('MM-002');
    });
  });

  it('parses the same eight repository EXEMPLARS.md files as the Python validator', () => {
    const root = resolve(__dirname, '../../../../../');
    const expected = new Map([
      ['football/scopes/world-cup', 4],
      ['general-knowledge/scopes/science', 5],
      ['puzzles/scopes/numbers-estimation', 12],
      ['puzzles/scopes/spot-the-error', 8],
      ['video-games/scopes/call-of-duty', 1],
      ['video-games/scopes/fifa', 4],
      ['video-games/scopes/gta', 1],
      ['video-games/scopes/overwatch', 1],
    ]);
    for (const [scope, count] of expected) {
      const path = resolve(
        root,
        'ai/.opencode/skills/worlds',
        scope,
        'EXEMPLARS.md',
      );
      const entries = parseExemplarMetadata(readFileSync(path, 'utf8'));
      expect(entries).toHaveLength(count);
      expect(new Set(entries.map((entry) => entry.metadata.id)).size).toBe(
        count,
      );
    }
  });
});
