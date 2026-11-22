import { WikidataDiscoveryProvider } from './wikidata.discovery';

const json = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const claim = (value: unknown, rank = 'normal') => ({
  rank,
  mainsnak: { datavalue: { value } },
});

const commonsPage = (name: string) => ({
  title: `File:${name}`,
  imageinfo: [
    {
      url: `https://upload.example/${name}`,
      descriptionurl: `https://commons.example/File:${name}`,
      width: 2000,
      height: 1500,
      mime: 'image/jpeg',
      thumburl: `https://upload.example/thumb/${name}`,
      thumbwidth: 1280,
      thumbheight: 960,
      extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' } },
    },
  ],
});

/** A fake of the three calls: entity search, entity claims, Commons file info. */
const build = (world: {
  hits: Array<{ id: string; label: string; description?: string }>;
  claims: Record<string, Record<string, unknown[]>>;
}) => {
  const calls: URL[] = [];
  const fetchImpl = jest.fn(async (input: string) => {
    const url = new URL(input);
    calls.push(url);
    const action = url.searchParams.get('action');
    if (action === 'wbsearchentities') {
      return json({
        search: world.hits.map((hit) => ({
          ...hit,
          match: { text: hit.label },
        })),
      });
    }
    if (action === 'wbgetentities') {
      return json({
        entities: Object.fromEntries(
          Object.entries(world.claims).map(([id, claims]) => [id, { claims }]),
        ),
      });
    }
    const names = (url.searchParams.get('titles') ?? '')
      .split('|')
      .map((title) => title.replace(/^File:/, ''));
    return json({ query: { pages: names.map(commonsPage) } });
  });
  const provider = new WikidataDiscoveryProvider({
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { provider, calls, fetchImpl };
};

describe('WikidataDiscoveryProvider', () => {
  it("returns the entry's main image, marked as tied to the subject", async () => {
    const { provider } = build({
      hits: [{ id: 'Q1', label: "N'Golo Kanté", description: 'footballer' }],
      claims: {
        Q1: { P31: [claim({ id: 'Q5' })], P18: [claim('Kante 2018.jpg')] },
      },
    });
    const found = await provider.search("N'Golo Kanté", {
      limit: 4,
      kind: 'person',
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      provider: 'wikidata',
      title: 'Kante 2018.jpg',
      subjectVerified: true,
      downloadUrl: 'https://upload.example/thumb/Kante 2018.jpg',
      licence: { name: 'CC BY-SA 4.0' },
    });
  });

  it('ignores an entry that merely contains the name', async () => {
    const { provider, fetchImpl } = build({
      hits: [{ id: 'Q9', label: 'Battle of Stamford Bridge' }],
      claims: { Q9: { P18: [claim('Battle.jpg')] } },
    });
    expect(await provider.search('Stamford Bridge', { limit: 4 })).toEqual([]);
    // Nothing matched, so nothing further was asked.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses the bracketed gloss to choose between entries of the same name', async () => {
    const { provider } = build({
      hits: [
        {
          id: 'Q1',
          label: 'Stamford Bridge',
          description: 'village in England',
        },
        {
          id: 'Q2',
          label: 'Stamford Bridge',
          description: 'football stadium in London',
        },
      ],
      claims: {
        Q1: { P18: [claim('Village.jpg')] },
        Q2: { P18: [claim('Stadium.jpg')] },
      },
    });
    const found = await provider.search('Stamford Bridge (stadium)', {
      limit: 4,
      kind: 'place',
    });
    expect(found[0].title).toBe('Stadium.jpg');
  });

  it('for a club mark takes the logo, never the main image', async () => {
    const withLogo = build({
      hits: [{ id: 'Q1', label: 'Leicester City F.C.' }],
      claims: {
        Q1: { P18: [claim('Stadium.jpg')], P154: [claim('Crest.svg')] },
      },
    });
    const found = await withLogo.provider.search('Leicester City F.C.', {
      limit: 4,
      kind: 'club-or-brand-mark',
    });
    expect(found[0].title).toBe('Crest.svg');

    const withoutLogo = build({
      hits: [{ id: 'Q1', label: 'Leicester City F.C.' }],
      claims: { Q1: { P18: [claim('Stadium.jpg')] } },
    });
    expect(
      await withoutLogo.provider.search('Leicester City F.C.', {
        limit: 4,
        kind: 'club-or-brand-mark',
      }),
    ).toEqual([]);
  });

  it('skips a person when a thing is wanted, and a thing when a person is', async () => {
    const world = {
      hits: [
        { id: 'Q1', label: 'Arsenal' },
        { id: 'Q2', label: 'Arsenal' },
      ],
      claims: {
        Q1: { P31: [claim({ id: 'Q5' })], P18: [claim('Person.jpg')] },
        Q2: { P31: [claim({ id: 'Q476028' })], P18: [claim('Club.jpg')] },
      },
    };
    const place = await build(world).provider.search('Arsenal', {
      limit: 4,
      kind: 'place',
    });
    expect(place[0].title).toBe('Club.jpg');
    const person = await build(world).provider.search('Arsenal', {
      limit: 4,
      kind: 'person',
    });
    expect(person[0].title).toBe('Person.jpg');
  });

  it('prefers the value the entry marks preferred and skips deprecated ones', async () => {
    const { provider } = build({
      hits: [{ id: 'Q1', label: 'Thierry Henry' }],
      claims: {
        Q1: {
          P18: [
            claim('Old.jpg', 'deprecated'),
            claim('Normal.jpg'),
            claim('Preferred.jpg', 'preferred'),
          ],
        },
      },
    });
    const found = await provider.search('Thierry Henry', { limit: 4 });
    expect(found[0].title).toBe('Preferred.jpg');
  });

  it('searches Arabic names in Arabic', async () => {
    const { provider, calls } = build({ hits: [], claims: {} });
    await provider.search('تييري هنري', { limit: 4 });
    expect(calls[0].searchParams.get('language')).toBe('ar');
  });
});
