import {
  DiscoveredMedia,
  licenceNoteOf,
  MediaDiscoveryError,
  MediaDiscoveryProvider,
  plainText,
} from '../domain/media-discovery';
import { MediaDiscoveryService } from './media-discovery.service';

const media = (
  name: string,
  overrides: Partial<DiscoveredMedia> = {},
): DiscoveredMedia => ({
  provider: 'fake',
  rank: 0,
  matchedPhrase: 'x',
  title: name,
  downloadUrl: `https://img.example/${name}`,
  width: 1600,
  height: 1200,
  originalUrl: `https://img.example/original/${name}`,
  pageUrl: `https://img.example/page/${name}`,
  originalMimetype: 'image/jpeg',
  licence: { name: 'CC BY 4.0', url: null, attributionRequired: true },
  author: 'Someone',
  credit: null,
  ...overrides,
});

const provider = (
  name: string,
  answers: Record<string, DiscoveredMedia[] | Error>,
): MediaDiscoveryProvider & { search: jest.Mock } => ({
  name,
  search: jest.fn(async (phrase: string) => {
    const answer = answers[phrase] ?? [];
    if (answer instanceof Error) throw answer;
    return answer;
  }),
});

describe('MediaDiscoveryService', () => {
  it('is unavailable, and finds nothing, when no provider is registered', async () => {
    const service = new MediaDiscoveryService();
    expect(service.isAvailable()).toBe(false);
    expect(await service.discover({ subject: 'x' })).toEqual({
      candidates: [],
      reports: [],
    });
    expect(new MediaDiscoveryService(null).isAvailable()).toBe(false);
  });

  it('refuses an empty subject before calling anything', async () => {
    const commons = provider('commons', {});
    const service = new MediaDiscoveryService([commons]);
    await expect(service.discover({ subject: '   ' })).rejects.toMatchObject({
      code: 'DISCOVERY_INVALID_QUERY',
    });
    await expect(
      service.discover({ subject: 'x', limit: 0 }),
    ).rejects.toMatchObject({ code: 'DISCOVERY_INVALID_QUERY' });
    expect(commons.search).not.toHaveBeenCalled();
  });

  it('stops at the first phrase when it already fills the limit', async () => {
    const commons = provider('commons', {
      'Arsène Wenger': [media('a.jpg'), media('b.jpg')],
      'أرسين فينغر': [media('c.jpg')],
    });
    const result = await new MediaDiscoveryService([commons]).discover({
      subject: 'Arsène Wenger',
      alternatives: ['أرسين فينغر'],
      limit: 2,
    });
    expect(result.candidates.map((found) => found.title)).toEqual([
      'a.jpg',
      'b.jpg',
    ]);
    expect(commons.search).toHaveBeenCalledTimes(1);
  });

  it('tries the next phrase only while short, and never returns one file twice', async () => {
    const commons = provider('commons', {
      'Arsène Wenger': [media('a.jpg')],
      'أرسين فينغر': [media('a.jpg'), media('c.jpg')],
    });
    const result = await new MediaDiscoveryService([commons]).discover({
      subject: 'Arsène Wenger',
      alternatives: ['أرسين فينغر', 'arsène wenger'],
      limit: 3,
    });
    expect(result.candidates.map((found) => found.title)).toEqual([
      'a.jpg',
      'c.jpg',
    ]);
    // The third phrase is the first again in another case: not a new phrase.
    expect(commons.search.mock.calls.map(([phrase]) => phrase)).toEqual([
      'Arsène Wenger',
      'أرسين فينغر',
    ]);
    expect(result.reports).toEqual([
      {
        provider: 'commons',
        phrase: 'Arsène Wenger',
        status: 'ok',
        returned: 1,
      },
      { provider: 'commons', phrase: 'أرسين فينغر', status: 'ok', returned: 2 },
    ]);
  });

  it('drops images too small to show, judged on the shorter side', async () => {
    const commons = provider('commons', {
      x: [
        media('wide-but-thin.jpg', { width: 2000, height: 300 }),
        media('ok.jpg', { width: 900, height: 600 }),
      ],
    });
    const service = new MediaDiscoveryService([commons]);
    expect(
      (await service.discover({ subject: 'x' })).candidates.map((f) => f.title),
    ).toEqual(['ok.jpg']);
    expect(
      (await service.discover({ subject: 'x', minShortSide: 200 })).candidates,
    ).toHaveLength(2);
  });

  it('reports a failing provider and still returns what another found', async () => {
    const broken = provider('broken', {
      x: new MediaDiscoveryError('DISCOVERY_TIMEOUT', 'too slow'),
      y: [media('never-asked.jpg')],
    });
    const working = provider('working', { x: [media('found.jpg')] });
    const result = await new MediaDiscoveryService([broken, working]).discover({
      subject: 'x',
      alternatives: ['y'],
    });
    expect(result.candidates.map((found) => found.title)).toEqual([
      'found.jpg',
    ]);
    expect(result.reports[0]).toMatchObject({
      provider: 'broken',
      phrase: 'x',
      status: 'failed',
      code: 'DISCOVERY_TIMEOUT',
    });
    // An unwell provider is not asked again with another phrase.
    expect(broken.search).toHaveBeenCalledTimes(1);
  });

  it('labels an unexpected error without letting it escape', async () => {
    const broken = provider('broken', { x: new Error('boom') });
    const result = await new MediaDiscoveryService([broken]).discover({
      subject: 'x',
    });
    expect(result.candidates).toEqual([]);
    expect(result.reports[0]).toMatchObject({
      status: 'failed',
      code: 'DISCOVERY_FAILED',
      detail: 'boom',
    });
  });

  it('caps the limit rather than passing an unbounded ask to a provider', async () => {
    const commons = provider('commons', { x: [] });
    await new MediaDiscoveryService([commons]).discover({
      subject: 'x',
      limit: 5000,
    });
    expect(commons.search.mock.calls[0][1].limit).toBe(40);
  });
});

describe('media discovery text helpers', () => {
  it('reduces provider markup to plain text', () => {
    expect(
      plainText('<a href="//x">Jane &amp; Co</a>  <br/> &quot;staff&quot;'),
    ).toBe('Jane & Co "staff"');
    expect(plainText('<span></span>')).toBeNull();
    expect(plainText(undefined)).toBeNull();
  });

  it('writes a provenance note that states the claim and where it was made', () => {
    expect(licenceNoteOf(media('a.jpg'))).toBe(
      'CC BY 4.0 — by Someone — via fake — https://img.example/page/a.jpg',
    );
    expect(
      licenceNoteOf(
        media('a.jpg', {
          author: null,
          licence: { name: null, url: null, attributionRequired: null },
        }),
      ),
    ).toBe('licence not stated — via fake — https://img.example/page/a.jpg');
  });
});
