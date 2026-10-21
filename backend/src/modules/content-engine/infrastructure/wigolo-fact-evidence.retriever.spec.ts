import { ConfigService } from '@nestjs/config';
import { WigoloClient } from '../../ai-agent/infrastructure/wigolo/wigolo-client';
import { WigoloFactEvidenceRetriever } from './wigolo-fact-evidence.retriever';

const CLAIM = 'Genji uses Dragonblade as his ultimate ability in Overwatch.';

const config = (overrides: Record<string, string> = {}) =>
  ({ get: (key: string) => overrides[key] }) as unknown as ConfigService;

const clientReturning = (results: unknown, onCall?: () => void) =>
  ({
    callToolDetailed: jest.fn(async () => {
      onCall?.();
      return { data: { results } };
    }),
  }) as unknown as WigoloClient;

const row = (over: Record<string, unknown> = {}) => ({
  url: 'https://overwatch.fandom.com/wiki/Genji',
  title: 'Genji',
  snippet: 'Dragonblade is the ultimate ability used by Genji in Overwatch.',
  ...over,
});

describe('WigoloFactEvidenceRetriever', () => {
  it('maps a retrieved source into attributable evidence', async () => {
    const retriever = new WigoloFactEvidenceRetriever(
      clientReturning([row()]),
      config(),
    );
    const [evidence] = await retriever.retrieve({
      claim: CLAIM,
      attempt: 1,
      maxResults: 5,
    });

    expect(evidence.url).toBe('https://overwatch.fandom.com/wiki/Genji');
    expect(evidence.sourceName).toBe('Genji');
    expect(evidence.sourceId).toContain('overwatch.fandom.com');
    expect(evidence.excerpt).toContain('Dragonblade');
    expect(new Date(evidence.retrievedAt).toString()).not.toBe('Invalid Date');
  });

  it('never claims support from lexical overlap alone', async () => {
    // The Phase 2b heuristic called this `supports` because every distinctive
    // term appeared. Term co-occurrence is not entailment, and `supports` is
    // the state that unlocks spending — so it is no longer reachable here.
    const retriever = new WigoloFactEvidenceRetriever(
      clientReturning([row()]),
      config(),
    );
    const [evidence] = await retriever.retrieve({
      claim: CLAIM,
      attempt: 1,
      maxResults: 5,
    });
    expect(evidence.relation).toBe('mentions');
  });

  it('never claims contradiction from a nearby negation either', async () => {
    const retriever = new WigoloFactEvidenceRetriever(
      clientReturning([
        row({
          snippet:
            'Dragonblade is not the ultimate ability of Genji in Overwatch; that is a common mistake.',
        }),
      ]),
      config(),
    );
    const [evidence] = await retriever.retrieve({
      claim: CLAIM,
      attempt: 1,
      maxResults: 5,
    });
    // A real contradiction, and the adapter still declines to rule on it: the
    // human sees the source and decides.
    expect(evidence.relation).toBe('mentions');
  });

  it('keeps the source attached so a human can judge it', async () => {
    const retriever = new WigoloFactEvidenceRetriever(
      clientReturning([row()]),
      config(),
    );
    const [evidence] = await retriever.retrieve({
      claim: CLAIM,
      attempt: 1,
      maxResults: 5,
    });
    expect(evidence.url).toMatch(/^https:/);
    expect(evidence.excerpt.length).toBeGreaterThan(0);
    expect(evidence.sourceName).toBeTruthy();
  });

  it('rejects rows without a resolvable http(s) URL', async () => {
    const retriever = new WigoloFactEvidenceRetriever(
      clientReturning([
        row({ url: 'not-a-url' }),
        row({ url: 'ftp://example.com/x' }),
        row({ url: '' }),
      ]),
      config(),
    );
    expect(
      await retriever.retrieve({ claim: CLAIM, attempt: 1, maxResults: 5 }),
    ).toEqual([]);
  });

  it('rejects rows with no retrieved text', async () => {
    const retriever = new WigoloFactEvidenceRetriever(
      clientReturning([{ url: 'https://example.com/a', title: 'A' }]),
      config(),
    );
    // A search artefact with no text is not evidence.
    expect(
      await retriever.retrieve({ claim: CLAIM, attempt: 1, maxResults: 5 }),
    ).toEqual([]);
  });

  it('falls back to the hostname when a row has no title', async () => {
    const retriever = new WigoloFactEvidenceRetriever(
      clientReturning([row({ title: undefined })]),
      config(),
    );
    const [evidence] = await retriever.retrieve({
      claim: CLAIM,
      attempt: 1,
      maxResults: 5,
    });
    expect(evidence.sourceName).toBe('overwatch.fandom.com');
  });

  it('honours maxResults', async () => {
    const retriever = new WigoloFactEvidenceRetriever(
      clientReturning([
        row(),
        row({ url: 'https://b.example/x' }),
        row({ url: 'https://c.example/x' }),
      ]),
      config(),
    );
    expect(
      await retriever.retrieve({ claim: CLAIM, attempt: 1, maxResults: 2 }),
    ).toHaveLength(2);
  });

  it('serves a repeated claim from cache instead of searching again', async () => {
    let calls = 0;
    const retriever = new WigoloFactEvidenceRetriever(
      clientReturning([row()], () => {
        calls += 1;
      }),
      config(),
    );
    await retriever.retrieve({ claim: CLAIM, attempt: 1, maxResults: 5 });
    await retriever.retrieve({ claim: CLAIM, attempt: 2, maxResults: 5 });
    expect(calls).toBe(1);
  });

  it('propagates a timeout instead of returning empty evidence', async () => {
    // The distinction matters: the verifier reports RETRIEVAL_FAILED for a
    // throw and NO_RETRIEVED_EVIDENCE for an empty result, and those are
    // different facts about the world.
    const hanging = {
      callToolDetailed: () => new Promise(() => {}),
    } as unknown as WigoloClient;
    const retriever = new WigoloFactEvidenceRetriever(
      hanging,
      config({ ENGINE_EVIDENCE_TIMEOUT_MS: '30' }),
    );
    await expect(
      retriever.retrieve({ claim: CLAIM, attempt: 1, maxResults: 5 }),
    ).rejects.toThrow(/timed out/);
  });

  it('returns nothing for an empty claim without searching', async () => {
    let calls = 0;
    const retriever = new WigoloFactEvidenceRetriever(
      clientReturning([row()], () => {
        calls += 1;
      }),
      config(),
    );
    expect(
      await retriever.retrieve({ claim: '   ', attempt: 1, maxResults: 5 }),
    ).toEqual([]);
    expect(calls).toBe(0);
  });

  it('tolerates a malformed provider payload', async () => {
    const retriever = new WigoloFactEvidenceRetriever(
      clientReturning('not-an-array'),
      config(),
    );
    expect(
      await retriever.retrieve({ claim: CLAIM, attempt: 1, maxResults: 5 }),
    ).toEqual([]);
  });
});
