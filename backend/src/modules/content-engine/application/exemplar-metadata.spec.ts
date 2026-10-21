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
    const approved = OPEN + '\nAPPROVED BODY\n' + CLOSE;
    const withheld =
      OPEN.replace('sample-one', 'sample-two').replace(
        '"APPROVED"',
        '"WITHHELD"',
      ) +
      '\nWITHHELD BODY\n' +
      CLOSE;
    const document = resolveExemplarDocument([approved, withheld].join('\n'));
    expect(document.approvedText).toContain('APPROVED BODY');
    expect(document.approvedText).toContain('"DO_NOT_REGENERATE"');
    expect(document.approvedText).not.toContain('WITHHELD BODY');
    expect(document.historicalText).toContain('WITHHELD BODY');
  });

  it('diagnoses unclassified legacy entries without treating them as approved', () => {
    const document = resolveExemplarDocument(
      '### 1. Legacy example\n> answer\n',
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
