import {
  DiscoveredMedia,
  MediaDiscoveryProvider,
  MediaDiscoverySearchOptions,
  subjectTokens,
} from '../domain/media-discovery';
import { DiscoveryHttpOptions, discoveryJson } from './discovery-http';
import { WikimediaCommonsDiscoveryProvider } from './wikimedia-commons.discovery';

export const WIKIDATA_PROVIDER = 'wikidata';
const API_URL = 'https://www.wikidata.org/w/api.php';
/** Entries read per phrase. Names are ambiguous; three is enough to find the one meant. */
const ENTRY_LIMIT = 3;
const HUMAN = 'Q5';
const IMAGE = 'P18';
const LOGO_IMAGE = 'P154';
const INSTANCE_OF = 'P31';

interface WikidataSearchHit {
  id?: unknown;
  description?: unknown;
  match?: { text?: unknown };
  label?: unknown;
}

interface WikidataClaim {
  rank?: unknown;
  mainsnak?: { datavalue?: { value?: unknown } };
}

type WikidataClaims = Record<string, WikidataClaim[] | undefined>;

const sameWords = (a: string[], b: string[]): boolean =>
  a.length > 0 && a.length === b.length && a.every((word) => b.includes(word));

const values = (claims: WikidataClaims | undefined, property: string) =>
  (claims?.[property] ?? [])
    .filter((claim) => claim?.rank !== 'deprecated')
    // The entry's editors mark the value they consider current as preferred.
    .sort(
      (a, b) =>
        Number(b?.rank === 'preferred') - Number(a?.rank === 'preferred'),
    )
    .map((claim) => claim?.mainsnak?.datavalue?.value);

/**
 * Wikidata as a discovery provider: the picture a subject's own catalogue
 * entry names for it.
 *
 * Word search answers "which files mention these words", and a painting of
 * foxes kept in Leicester mentions Leicester. This asks a different question —
 * "what is this thing, and which picture did its entry choose" — so the file
 * is tied to the subject by the catalogue rather than by coincidence of text.
 * At most one image per phrase: the entry's logo for a club or brand mark, its
 * main image for anything else. The file itself lives on Commons, which is
 * where its sizes and licence statement are read from.
 */
export class WikidataDiscoveryProvider implements MediaDiscoveryProvider {
  readonly name = WIKIDATA_PROVIDER;
  private readonly commons: WikimediaCommonsDiscoveryProvider;

  constructor(private readonly options: DiscoveryHttpOptions = {}) {
    this.commons = new WikimediaCommonsDiscoveryProvider(options);
  }

  async search(
    phrase: string,
    options: MediaDiscoverySearchOptions,
  ): Promise<DiscoveredMedia[]> {
    // "Stamford Bridge (stadium)": the bracket says which Stamford Bridge.
    const gloss = subjectTokens(/\(([^)]*)\)/.exec(phrase)?.[1] ?? '');
    const name = phrase.replace(/\([^)]*\)/g, ' ').trim();
    const wanted = subjectTokens(name);
    if (wanted.length === 0) return [];

    const hits = await this.entries(name, options.signal);
    const named = hits
      // Only an entry called exactly this. "Battle of Stamford Bridge" is not.
      .filter((hit) =>
        [hit.match?.text, hit.label].some(
          (text) =>
            typeof text === 'string' && sameWords(subjectTokens(text), wanted),
        ),
      )
      .map((hit, order) => {
        const description = subjectTokens(
          typeof hit.description === 'string' ? hit.description : '',
        );
        return {
          id: String(hit.id),
          order,
          glossed: gloss.some((word) => description.includes(word)),
        };
      })
      .sort(
        (a, b) => Number(b.glossed) - Number(a.glossed) || a.order - b.order,
      )
      .slice(0, ENTRY_LIMIT);
    if (named.length === 0) return [];

    const claims = await this.claims(
      named.map((entry) => entry.id),
      options.signal,
    );
    const wantsPerson = options.kind === 'person';
    const wantsMark = options.kind === 'club-or-brand-mark';
    for (const entry of named) {
      const own = claims[entry.id];
      const human = values(own, INSTANCE_OF).some(
        (value) => (value as { id?: unknown } | undefined)?.id === HUMAN,
      );
      // A club and a person can share a name; the kind says which is meant.
      if (options.kind && human !== wantsPerson) continue;
      const file = values(own, wantsMark ? LOGO_IMAGE : IMAGE).find(
        (value): value is string => typeof value === 'string' && !!value.trim(),
      );
      if (!file) continue;
      const [media] = await this.commons.lookup([file], phrase, options.signal);
      if (!media) continue;
      return [
        {
          ...media,
          provider: this.name,
          rank: 0,
          subjectVerified: true,
        },
      ];
    }
    return [];
  }

  private async entries(
    name: string,
    signal?: AbortSignal,
  ): Promise<WikidataSearchHit[]> {
    const language = /[؀-ۿ]/.test(name) ? 'ar' : 'en';
    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      action: 'wbsearchentities',
      format: 'json',
      search: name,
      language,
      uselang: language,
      type: 'item',
      limit: '7',
    }).toString();
    const payload = await discoveryJson(url, 'Wikidata', this.options, signal);
    const search = (payload as { search?: unknown })?.search;
    return Array.isArray(search)
      ? (search as WikidataSearchHit[]).filter(
          (hit) => typeof hit?.id === 'string',
        )
      : [];
  }

  private async claims(
    ids: string[],
    signal?: AbortSignal,
  ): Promise<Record<string, WikidataClaims | undefined>> {
    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      action: 'wbgetentities',
      format: 'json',
      ids: ids.join('|'),
      props: 'claims',
    }).toString();
    const payload = await discoveryJson(url, 'Wikidata', this.options, signal);
    const entities = (
      payload as { entities?: Record<string, { claims?: WikidataClaims }> }
    )?.entities;
    return Object.fromEntries(
      ids.map((id) => [id, entities?.[id]?.claims] as const),
    );
  }
}
