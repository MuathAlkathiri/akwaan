import { CandidateMediaSlot } from '../domain/candidate-media-plan';
import { evaluateCandidateMedia } from '../domain/candidate-media-plan';
import {
  DiscoveredMedia,
  MediaDiscoveryResult,
} from '../domain/media-discovery';
import { EngineImageIngestionResult } from '../infrastructure/engine-image-ingestion.service';
import { ContentEngineOrchestratorService } from './content-engine-orchestrator.service';
import { CandidateMediaEnrichmentService } from './candidate-media-enrichment.service';

const media = (name: string, title?: string): DiscoveredMedia => ({
  provider: 'wikimedia-commons',
  rank: 0,
  matchedPhrase: 'Arsène Wenger',
  title: title ?? `Arsène Wenger ${name}.jpg`,
  downloadUrl: `https://img.example/${name}.jpg`,
  width: 1280,
  height: 960,
  originalUrl: `https://img.example/original/${name}.jpg`,
  pageUrl: `https://commons.example/File:${name}.jpg`,
  originalMimetype: 'image/jpeg',
  licence: { name: 'CC BY-SA 4.0', url: null, attributionRequired: true },
  author: 'Someone',
  credit: null,
});

const stored = (
  name: string,
): Extract<EngineImageIngestionResult, { status: 'resolved' }> => ({
  status: 'resolved',
  asset: {
    url: `/uploads/world-content/content-items/engine-${name}.jpg`,
    mimetype: 'image/jpeg',
    width: 1280,
    height: 960,
    sha256: name.padEnd(64, '0'),
  },
  provenance: {
    acquisition: 'retrieve',
    provider: 'wikimedia-commons',
    sourceUrl: `https://img.example/${name}.jpg`,
    licenceNote: 'CC BY-SA 4.0 — by Someone — via wikimedia-commons',
  },
  rights: { status: 'UNKNOWN', source: 'unrecorded' },
  storage: { objectKey: `k/${name}`, mirrored: true, reusedLocalFile: false },
});

const failed = (failureReason: string): EngineImageIngestionResult => ({
  status: 'failed',
  failureReason,
  detail: failureReason,
});

const planned = (
  over: Partial<CandidateMediaSlot> = {},
): CandidateMediaSlot => ({
  slotKey: 'item-image',
  purpose: 'gameplay',
  required: true,
  status: 'planned',
  failureReason: 'MEDIA_RETRIEVAL_NOT_CONFIGURED',
  ...over,
});

const authoring = {
  concept: 'A manager any follower knows on sight.',
  mediaIntent: {
    slotKey: 'item-image',
    subject: 'Arsène Wenger',
    subjectAr: 'أرسين فينغر',
    kind: 'person',
    mustNotShow: [],
    altText: 'مدرب فرنسي يقف على خط التماس.',
  },
};

const build = (options: {
  found?: DiscoveredMedia[];
  discover?: () => Promise<MediaDiscoveryResult>;
  ingest?: (url: string) => EngineImageIngestionResult;
  available?: boolean;
  web?: DiscoveredMedia[];
  /** The Admin's own picture for the subject, when the library has one. */
  owned?: { url: string } | null;
  /** Verdict per image title; presence switches the visual check on. */
  looks?: Record<string, 'clear' | 'leaks' | 'unchecked'>;
}) => {
  const primary =
    options.discover ??
    (async () => ({
      candidates: options.found ?? [media('a'), media('b'), media('c')],
      reports: [
        {
          provider: 'wikimedia-commons',
          phrase: 'Arsène Wenger',
          status: 'ok' as const,
          returned: 3,
        },
      ],
    }));
  const discover = jest.fn(async (query?: { tier?: string }) =>
    query?.tier === 'fallback'
      ? { candidates: options.web ?? [], reports: [] }
      : primary(),
  );
  const ingestRemote = jest.fn(async (input: { url: string }) =>
    (options.ingest ?? ((url) => stored(url.split('/').pop()!.split('.')[0])))(
      input.url,
    ),
  );
  const check = jest.fn(async (request: { imageUrl: string }) => {
    const name = request.imageUrl.split('/').pop()!.split('.')[0];
    const status = options.looks?.[name] ?? 'clear';
    return status === 'leaks'
      ? { status, evidence: `reads "${name}"` }
      : { status };
  });
  const visual = { isAvailable: () => options.looks !== undefined, check };
  const find = jest.fn(async () =>
    options.owned
      ? {
          id: 'entry-1',
          name: 'Arsène Wenger',
          asset: {
            url: options.owned.url,
            mimetype: 'image/png',
            width: 600,
            height: 600,
            sha256: 'c'.repeat(64),
          },
        }
      : null,
  );
  const library = { find };
  const service = new CandidateMediaEnrichmentService(
    {
      discover,
      isAvailable: () => options.available ?? true,
      hasFallback: () => options.web !== undefined,
    } as never,
    { ingestRemote } as never,
    visual as never,
    library as never,
  );
  const pause = jest.fn(async () => undefined);
  service.pause = pause;
  return { service, discover, ingestRemote, pause, check, find };
};

const input = (over: Record<string, unknown> = {}) => ({
  mechanicKey: 'bomb',
  scopeKey: 'premier-league',
  authoring,
  mediaPlan: [planned()],
  mediaReviewRevision: null,
  ...over,
});

describe('CandidateMediaEnrichmentService', () => {
  it('searches for the subject the candidate named, Arabic name as the fallback', async () => {
    const { service, discover } = build({});
    await service.enrich(input());
    expect(discover).toHaveBeenCalledWith({
      subject: 'Arsène Wenger',
      alternatives: ['أرسين فينغر'],
      kind: 'person',
      limit: 4,
    });
  });

  it('attaches the first image found and keeps the rest as suggestions', async () => {
    const { service, ingestRemote } = build({});
    const outcome = await service.enrich(input());

    expect(outcome.resolved).toEqual(['item-image']);
    expect(ingestRemote).toHaveBeenCalledTimes(1);
    expect(ingestRemote.mock.calls[0][0]).toMatchObject({
      url: 'https://img.example/a.jpg',
      provenance: {
        provider: 'wikimedia-commons',
        licenceNote: expect.stringContaining('CC BY-SA 4.0'),
      },
    });

    const [slot] = outcome.set.mediaPlan as CandidateMediaSlot[];
    expect(slot).toMatchObject({
      slotKey: 'item-image',
      purpose: 'gameplay',
      required: true,
      status: 'resolved',
      asset: { url: '/uploads/world-content/content-items/engine-a.jpg' },
      provenance: { acquisition: 'retrieve', provider: 'wikimedia-commons' },
      failureReason: null,
    });
    expect(slot.suggestions?.map((s) => s.downloadUrl)).toEqual([
      'https://img.example/b.jpg',
      'https://img.example/c.jpg',
    ]);
    expect(slot.suggestions?.[0]).toEqual({
      provider: 'wikimedia-commons',
      title: 'Arsène Wenger b.jpg',
      downloadUrl: 'https://img.example/b.jpg',
      pageUrl: 'https://commons.example/File:b.jpg',
      width: 1280,
      height: 960,
      licenceNote: expect.stringContaining(
        'https://commons.example/File:b.jpg',
      ),
    });
  });

  it('does not attach a file that is not named after the subject', async () => {
    const { service, ingestRemote } = build({
      found: [media('foxes', 'Common foxes in the snow.jpg')],
    });
    const outcome = await service.enrich(input());
    expect(ingestRemote).not.toHaveBeenCalled();
    expect(outcome.resolved).toEqual([]);
    expect(outcome.unresolved).toEqual(['item-image']);
    const slot = (outcome.set.mediaPlan as any[])[0];
    expect(slot.failureReason).toBe('MEDIA_DISCOVERY_NO_CONFIDENT_MATCH');
    expect(slot.suggestions.map((s: any) => s.title)).toEqual([
      'Common foxes in the snow.jpg',
    ]);
    expect(outcome.set['draft.media']).toBeUndefined();
  });

  it('skips an unrelated first result and attaches the one named after the subject', async () => {
    const { service, ingestRemote } = build({
      found: [
        media('foxes', 'Common foxes in the snow.jpg'),
        media('a', 'Arsene Wenger 2012.jpg'),
      ],
    });
    const outcome = await service.enrich(input());
    expect(ingestRemote).toHaveBeenCalledTimes(1);
    expect(ingestRemote.mock.calls[0][0].url).toBe('https://img.example/a.jpg');
    const slot = (outcome.set.mediaPlan as any[])[0];
    expect(slot.suggestions.map((s: any) => s.title)).toEqual([
      'Common foxes in the snow.jpg',
    ]);
  });

  it("attaches a file its subject's catalogue entry names, whatever it is called", async () => {
    const { service, ingestRemote } = build({
      found: [{ ...media('a', 'IMG 4471.jpg'), subjectVerified: true }],
    });
    const outcome = await service.enrich(input());
    expect(ingestRemote).toHaveBeenCalledTimes(1);
    expect(outcome.resolved).toEqual(['item-image']);
  });

  it('for a club mark, a file merely named after the club is only a suggestion', async () => {
    const { service, ingestRemote } = build({
      found: [media('m', 'Peterborough United v Leicester City.jpg')],
    });
    const outcome = await service.enrich(
      input({
        authoring: {
          mediaIntent: {
            slotKey: 'item-image',
            subject: 'Leicester City F.C.',
            kind: 'club-or-brand-mark',
            mustNotShow: [],
          },
        },
      }),
    );
    expect(ingestRemote).not.toHaveBeenCalled();
    const [slot] = outcome.set.mediaPlan as CandidateMediaSlot[];
    expect(slot.failureReason).toBe('MEDIA_DISCOVERY_NO_CONFIDENT_MATCH');
    expect(slot.suggestions).toHaveLength(1);
  });

  describe('web search as a last resort', () => {
    const web = [
      {
        ...media('w', 'Leicester City logo'),
        provider: 'brave-search',
        previewUrl: 'https://imgs.example/thumb-w.jpg',
      },
    ];

    it('is not asked when a trusted image was found', async () => {
      const { service, discover } = build({ web });
      await service.enrich(input());
      expect(discover).toHaveBeenCalledTimes(1);
    });

    it('adds web results as suggestions, and attaches none of them', async () => {
      const { service, discover, ingestRemote } = build({
        found: [media('foxes', 'Common foxes in the snow.jpg')],
        web,
      });
      const outcome = await service.enrich(input());
      expect(discover).toHaveBeenLastCalledWith({
        subject: 'Arsène Wenger',
        kind: 'person',
        tier: 'fallback',
        limit: 6,
      });
      expect(ingestRemote).not.toHaveBeenCalled();
      expect(outcome.resolved).toEqual([]);
      const [slot] = outcome.set.mediaPlan as CandidateMediaSlot[];
      expect(slot.suggestions?.map((s) => s.provider)).toEqual([
        'wikimedia-commons',
        'brave-search',
      ]);
      expect(slot.suggestions?.[1].previewUrl).toBe(
        'https://imgs.example/thumb-w.jpg',
      );
    });

    it('offers web results even when the licensed sources found nothing at all', async () => {
      const { service } = build({ found: [], web });
      const outcome = await service.enrich(input());
      const [slot] = outcome.set.mediaPlan as CandidateMediaSlot[];
      expect(slot.failureReason).toBe('MEDIA_DISCOVERY_NO_CONFIDENT_MATCH');
      expect(slot.suggestions).toHaveLength(1);
    });
  });

  describe('looking at images for the answer written on them', () => {
    const checked = (over: Record<string, unknown> = {}) =>
      input({
        check: {
          jobId: 'job-1',
          candidateId: 'cand-1',
          question: 'من هذا المدرب؟',
          acceptedAnswers: ['أرسين فينغر'],
        },
        ...over,
      });

    it('does not look when the check is off or the candidate gave no question', async () => {
      const off = build({});
      await off.service.enrich(checked());
      expect(off.check).not.toHaveBeenCalled();

      const noQuestion = build({ looks: {} });
      await noQuestion.service.enrich(input());
      expect(noQuestion.check).not.toHaveBeenCalled();
    });

    it('skips an image that shows the answer and attaches the next one', async () => {
      const { service, ingestRemote, check } = build({ looks: { a: 'leaks' } });
      const outcome = await service.enrich(checked());
      expect(check.mock.calls[0][0]).toMatchObject({
        jobId: 'job-1',
        imageUrl: 'https://img.example/a.jpg',
        question: 'من هذا المدرب؟',
        acceptedAnswers: ['أرسين فينغر'],
        mustNotShow: [],
      });
      // The leaking image was never downloaded.
      expect(ingestRemote.mock.calls.map(([call]) => call.url)).toEqual([
        'https://img.example/b.jpg',
      ]);
      const [slot] = outcome.set.mediaPlan as CandidateMediaSlot[];
      expect(slot.visualCheck).toEqual({ status: 'clear' });
      expect(
        slot.suggestions?.map((s) => [s.title, s.visualCheck?.status]),
      ).toEqual([
        ['Arsène Wenger a.jpg', 'leaks'],
        ['Arsène Wenger c.jpg', 'clear'],
      ]);
      expect(slot.suggestions?.[0].visualCheck?.evidence).toBe('reads "a"');
    });

    it('attaches nothing when every image shows the answer, and says why', async () => {
      const { service, ingestRemote } = build({
        looks: { a: 'leaks', b: 'leaks', c: 'leaks' },
      });
      const outcome = await service.enrich(checked());
      expect(ingestRemote).not.toHaveBeenCalled();
      expect(outcome.resolved).toEqual([]);
      const [slot] = outcome.set.mediaPlan as CandidateMediaSlot[];
      expect(slot.failureReason).toBe('MEDIA_ANSWER_VISIBLE_IN_ALL');
      expect(slot.suggestions).toHaveLength(3);
    });

    it('treats an image nobody could look at as attachable, and records that nobody looked', async () => {
      const { service } = build({ looks: { a: 'unchecked' } });
      const outcome = await service.enrich(checked());
      const [slot] = outcome.set.mediaPlan as CandidateMediaSlot[];
      expect(slot.asset?.url).toContain('engine-a');
      expect(slot.visualCheck).toEqual({ status: 'unchecked' });
    });

    it('uses a different ledger key for each image', async () => {
      const { service, check } = build({ looks: {} });
      await service.enrich(checked());
      const keys = check.mock.calls.map(
        ([call]) => (call as any).reservationKey,
      );
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys[0]).toMatch(/^cand-1:item-image:[0-9a-f]{16}$/);
    });
  });

  describe("the Admin's own library", () => {
    const LOCAL = '/uploads/world-content/content-items/engine-lib.png';
    const PUBLIC = 'https://media.example/engine-lib.png';
    const checked = () =>
      input({
        check: {
          jobId: 'job-1',
          candidateId: 'cand-1',
          question: 'من هذا المدرب؟',
          acceptedAnswers: ['أرسين فينغر'],
        },
      });

    it('uses the library picture without searching or downloading anything', async () => {
      const { service, discover, ingestRemote, find } = build({
        owned: { url: LOCAL },
      });
      const outcome = await service.enrich(input());
      expect(find).toHaveBeenCalledWith(
        ['Arsène Wenger', 'أرسين فينغر'],
        'person',
      );
      expect(discover).not.toHaveBeenCalled();
      expect(ingestRemote).not.toHaveBeenCalled();
      expect(outcome.resolved).toEqual(['item-image']);
      const [slot] = outcome.set.mediaPlan as CandidateMediaSlot[];
      expect(slot).toMatchObject({
        status: 'resolved',
        asset: { url: LOCAL },
        provenance: { acquisition: 'upload', provider: 'media-library' },
        rights: { status: 'UNKNOWN' },
      });
      expect(outcome.set['draft.media']).toEqual({
        type: 'image',
        assets: [{ url: LOCAL, altText: 'مدرب فرنسي يقف على خط التماس.' }],
      });
    });

    it('still looks at a public library picture, and searches instead when it shows the answer', async () => {
      const leaking = build({
        owned: { url: PUBLIC },
        looks: { 'engine-lib': 'leaks' },
      });
      const outcome = await leaking.service.enrich(checked());
      expect(leaking.check).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: PUBLIC }),
      );
      // Fell back to discovery and attached a found image instead.
      expect(leaking.discover).toHaveBeenCalled();
      const [slot] = outcome.set.mediaPlan as CandidateMediaSlot[];
      expect(slot.asset?.url).not.toBe(PUBLIC);

      const clear = build({ owned: { url: PUBLIC }, looks: {} });
      const kept = await clear.service.enrich(checked());
      const [used] = kept.set.mediaPlan as CandidateMediaSlot[];
      expect(used.asset?.url).toBe(PUBLIC);
      expect(used.visualCheck).toEqual({ status: 'clear' });
    });

    it('does not show a local address to a model, and records that nobody looked', async () => {
      const { service, check } = build({ owned: { url: LOCAL }, looks: {} });
      const outcome = await service.enrich(checked());
      expect(check).not.toHaveBeenCalled();
      const [slot] = outcome.set.mediaPlan as CandidateMediaSlot[];
      expect(slot.visualCheck).toBeUndefined();
    });
  });

  it('writes the image into the draft in the canonical asset shape', async () => {
    const { service } = build({});
    const outcome = await service.enrich(input());
    expect(outcome.set['draft.media']).toEqual({
      type: 'image',
      assets: [
        {
          url: '/uploads/world-content/content-items/engine-a.jpg',
          altText: 'مدرب فرنسي يقف على خط التماس.',
        },
      ],
    });
    expect(outcome.set.mediaReviewRevision).toBe(1);
  });

  it('decides nothing: the found image is unreviewed and its rights unknown', async () => {
    const { service } = build({});
    const outcome = await service.enrich(input());
    const [slot] = outcome.set.mediaPlan as CandidateMediaSlot[];
    expect(slot.review).toBeNull();
    expect(slot.rightsAcknowledgement).toBeNull();
    expect(slot.rights).toEqual({ status: 'UNKNOWN', source: 'unrecorded' });

    // And the canonical gate agrees: still blocked, now on a person.
    const evaluation = evaluateCandidateMedia({
      mechanicKey: 'bomb',
      scopeKey: 'premier-league',
      mediaPlan: outcome.set.mediaPlan as CandidateMediaSlot[],
      mediaReviewRevision: outcome.set.mediaReviewRevision as number,
      draft: { media: outcome.set['draft.media'] },
    } as never);
    expect(evaluation.ready).toBe(false);
    const codes = evaluation.blockers.map((finding) => finding.code);
    expect(codes).toContain('MEDIA_REVIEW_REQUIRED');
    expect(codes).not.toContain('MEDIA_REQUIRED_SLOT_UNRESOLVED');
  });

  it('moves to the next image when one cannot be downloaded, pausing between', async () => {
    const { service, ingestRemote, pause } = build({
      ingest: (url) =>
        url.endsWith('a.jpg') ? failed('HTTP_STATUS_NOT_OK') : stored('b'),
    });
    const outcome = await service.enrich(input());
    expect(ingestRemote).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(1);
    const [slot] = outcome.set.mediaPlan as CandidateMediaSlot[];
    expect(slot.asset?.url).toBe(
      '/uploads/world-content/content-items/engine-b.jpg',
    );
    // The one that failed is still offered; the one attached is not.
    expect(slot.suggestions?.map((s) => s.title)).toEqual([
      'Arsène Wenger a.jpg',
      'Arsène Wenger c.jpg',
    ]);
  });

  describe('leaves the slot waiting, with the reason, and never throws', () => {
    const waiting = async (
      options: Parameters<typeof build>[0],
      over: Record<string, unknown> = {},
    ) => {
      const { service, ingestRemote } = build(options);
      const outcome = await service.enrich(input(over));
      const plan = (outcome.set.mediaPlan ?? [
        planned(),
      ]) as CandidateMediaSlot[];
      return { outcome, slot: plan[0], ingestRemote };
    };

    it('when the candidate does not say what the picture shows', async () => {
      const { outcome, slot, ingestRemote } = await waiting(
        {},
        { authoring: { concept: 'x' } },
      );
      expect(outcome.resolved).toEqual([]);
      expect(outcome.unresolved).toEqual(['item-image']);
      expect(slot).toMatchObject({
        status: 'planned',
        failureReason: 'MEDIA_INTENT_MISSING',
      });
      expect(ingestRemote).not.toHaveBeenCalled();
      expect(outcome.set).not.toHaveProperty('draft.media');
    });

    it('when nothing was found', async () => {
      const { slot } = await waiting({
        discover: async () => ({
          candidates: [],
          reports: [{ provider: 'p', phrase: 'x', status: 'ok', returned: 0 }],
        }),
      });
      expect(slot.failureReason).toBe('MEDIA_DISCOVERY_NO_RESULT');
    });

    it('when nobody could be asked — which is not the same as nothing existing', async () => {
      const { slot } = await waiting({
        discover: async () => ({
          candidates: [],
          reports: [
            {
              provider: 'p',
              phrase: 'x',
              status: 'failed',
              returned: 0,
              code: 'DISCOVERY_TIMEOUT',
            },
          ],
        }),
      });
      expect(slot.failureReason).toBe('MEDIA_DISCOVERY_UNAVAILABLE');
    });

    it('when discovery itself throws', async () => {
      const { slot } = await waiting({
        discover: async () => {
          throw new Error('boom');
        },
      });
      expect(slot.failureReason).toBe('MEDIA_DISCOVERY_UNAVAILABLE');
    });

    it('when every image is refused', async () => {
      const { slot, ingestRemote } = await waiting({
        ingest: () => failed('RESPONSE_TOO_LARGE'),
      });
      expect(ingestRemote).toHaveBeenCalledTimes(3);
      expect(slot).toMatchObject({
        status: 'planned',
        failureReason: 'MEDIA_RETRIEVAL_FAILED:RESPONSE_TOO_LARGE',
      });
    });

    it('and stops at once when storage is the problem, not the image', async () => {
      const { slot, ingestRemote } = await waiting({
        ingest: () => failed('STORAGE_NOT_DURABLE'),
      });
      expect(ingestRemote).toHaveBeenCalledTimes(1);
      expect(slot.failureReason).toBe(
        'MEDIA_RETRIEVAL_FAILED:STORAGE_NOT_DURABLE',
      );
    });
  });

  it('never replaces an image, a decision or an acknowledgment already there', async () => {
    const settled = planned({
      status: 'resolved',
      failureReason: null,
      asset: { url: '/uploads/world-content/content-items/admin-upload.jpg' },
    });
    const { service, discover } = build({});
    const outcome = await service.enrich(input({ mediaPlan: [settled] }));
    expect(discover).not.toHaveBeenCalled();
    expect(outcome).toEqual({ set: {}, resolved: [], unresolved: [] });
  });

  it('does nothing for a mechanic with no retrievable image slot', async () => {
    const { service, discover } = build({});
    expect(
      await service.enrich(
        input({ mechanicKey: 'read-your-opponent', mediaPlan: [] }),
      ),
    ).toEqual({ set: {}, resolved: [], unresolved: [] });
    expect(discover).not.toHaveBeenCalled();
  });

  it('writes nothing when a waiting slot already carries the same reason', async () => {
    const { service } = build({ found: [] });
    const outcome = await service.enrich(
      input({
        mediaPlan: [planned({ failureReason: 'MEDIA_DISCOVERY_NO_RESULT' })],
      }),
    );
    expect(outcome.set).toEqual({});
    expect(outcome.unresolved).toEqual(['item-image']);
  });
});

/**
 * The stage, not the service: that the orchestrator calls enrichment where
 * §30.22 puts it — on survivors, behind the enrichment switch — and writes
 * what it returns in the same lease-fenced update as the plan.
 */
describe('media stage with enrichment', () => {
  const orchestrator = (
    rows: Record<string, unknown>[],
    env: Record<string, string>,
    enrichment: unknown,
  ) => {
    const updateOne: jest.Mock = jest.fn(() => ({
      exec: async () => ({ matchedCount: 1 }),
    }));
    const renew: jest.Mock = jest.fn(async () => true);
    const service = new ContentEngineOrchestratorService(
      {
        find: () => ({
          sort: () => ({ lean: () => ({ exec: async () => rows }) }),
        }),
        updateOne,
      } as never,
      {
        checkpoint: jest.fn(async () => undefined),
        holdsLease: async () => true,
        renew,
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined as never,
      { get: (key: string) => env[key] } as never,
      enrichment as never,
    );
    const planMedia = () =>
      (
        service as unknown as { planMedia: (j: unknown) => Promise<void> }
      ).planMedia({
        jobId: 'job-1',
        leaseEpoch: 1,
        mechanicKey: 'bomb',
        worldKey: 'football',
        scopeKey: 'premier-league',
      });
    return { planMedia, updateOne, renew };
  };

  const on = {
    CONTENT_ENGINE_ENABLED: 'true',
    ENGINE_MEDIA_ENRICHMENT_ENABLED: 'true',
  };
  const survivor = { _id: 'c1', status: 'awaiting_review', authoring };

  it('plans the slot and fills it in one write', async () => {
    const { service } = build({});
    const { planMedia, updateOne, renew } = orchestrator(
      [survivor],
      on,
      service,
    );
    await planMedia();

    expect(updateOne).toHaveBeenCalledTimes(1);
    const set = updateOne.mock.calls[0][1].$set;
    expect(set.mediaPlan[0]).toMatchObject({
      slotKey: 'item-image',
      status: 'resolved',
    });
    expect(set['draft.media'].assets[0].url).toBe(
      '/uploads/world-content/content-items/engine-a.jpg',
    );
    expect(set.mediaReviewRevision).toBe(1);
    // A search and a download take seconds; the lease is extended first.
    expect(renew).toHaveBeenCalledWith({ jobId: 'job-1', leaseEpoch: 1 });
  });

  it('only plans when the enrichment switch is down', async () => {
    const { service, discover } = build({});
    const { planMedia, updateOne } = orchestrator(
      [survivor],
      { CONTENT_ENGINE_ENABLED: 'true' },
      service,
    );
    await planMedia();
    expect(discover).not.toHaveBeenCalled();
    expect(updateOne.mock.calls[0][1].$set.mediaPlan[0]).toMatchObject({
      status: 'planned',
      failureReason: 'MEDIA_ENRICHMENT_DISABLED',
    });
  });

  it('only plans when no discovery provider is switched on', async () => {
    const { service, discover } = build({ available: false });
    const { planMedia, updateOne } = orchestrator([survivor], on, service);
    await planMedia();
    expect(discover).not.toHaveBeenCalled();
    expect(updateOne.mock.calls[0][1].$set.mediaPlan[0].status).toBe('planned');
  });

  it('never searches for a candidate the earlier stages rejected', async () => {
    const { service, discover } = build({});
    const { planMedia, updateOne } = orchestrator(
      [{ ...survivor, status: 'screened_reject' }],
      on,
      service,
    );
    await planMedia();
    expect(discover).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('leaves a text mechanic’s candidate untouched', async () => {
    const { service, discover } = build({});
    const updateOne: jest.Mock = jest.fn(() => ({
      exec: async () => ({ matchedCount: 1 }),
    }));
    const text = new ContentEngineOrchestratorService(
      {
        find: () => ({
          sort: () => ({
            lean: () => ({ exec: async () => [survivor] }),
          }),
        }),
        updateOne,
      } as never,
      {
        checkpoint: jest.fn(async () => undefined),
        holdsLease: async () => true,
        renew: jest.fn(async () => true),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined as never,
      { get: (key: string) => (on as Record<string, string>)[key] } as never,
      service as never,
    );
    await (
      text as unknown as { planMedia: (j: unknown) => Promise<void> }
    ).planMedia({
      jobId: 'job-1',
      leaseEpoch: 1,
      mechanicKey: 'combo',
      worldKey: 'anime',
      scopeKey: 'naruto',
    });
    expect(discover).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });
});
