import { Reflector } from '@nestjs/core';
import {
  attributionRequiredFor,
  clearanceView,
  effectiveStatus,
} from './domain/media-rights.policy';
import { MediaRightsService } from './application/media-rights.service';
import { AdminMediaRightsController } from './presentation/media-rights.controller';
import { MediaRightsDocument } from './schemas/media-rights.schema';

const NOW = new Date('2026-10-04T00:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2027-01-01T00:00:00.000Z');
const URL = '/uploads/questions/bomb-items/bomb-item-1-a.jpg';

/** Layers are fully-typed on the document; a test only ever sets a few fields. */
type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

function record(over: DeepPartial<MediaRightsDocument> = {}): MediaRightsDocument {
  return {
    assetUrl: URL,
    assetRights: { status: 'CLEARED' },
    likenessUseBasis: { status: 'CLEARED' },
    attribution: {},
    replacementRequired: false,
    ...over,
  } as MediaRightsDocument;
}

/** A repository stand-in that records whether anything was written. */
function fakeRepository(stored: MediaRightsDocument | null) {
  const writes: unknown[] = [];
  return {
    writes,
    findByAssetUrl: jest.fn().mockResolvedValue(stored),
    findManyByAssetUrl: jest
      .fn()
      .mockResolvedValue(new Map(stored ? [[stored.assetUrl, stored]] : [])),
    upsert: jest.fn(async (assetUrl: string, patch: object) => {
      writes.push({ assetUrl, patch });
      return record(patch as Partial<MediaRightsDocument>);
    }),
    affectedContentItems: jest.fn().mockResolvedValue([]),
  };
}

describe('media rights — two-layer derivation', () => {
  it('is production ready only when both layers are cleared', () => {
    expect(clearanceView(record(), NOW)).toEqual({
      assetRights: 'CLEARED',
      likenessUseBasis: 'CLEARED',
      productionReady: true,
    });
  });

  it.each([
    ['assetRights PENDING', { assetRights: { status: 'PENDING' as const } }],
    ['assetRights BLOCKED', { assetRights: { status: 'BLOCKED' as const } }],
    ['assetRights UNKNOWN', { assetRights: { status: 'UNKNOWN' as const } }],
    ['likeness UNKNOWN', { likenessUseBasis: { status: 'UNKNOWN' as const } }],
    ['likeness PENDING', { likenessUseBasis: { status: 'PENDING' as const } }],
    ['likeness BLOCKED', { likenessUseBasis: { status: 'BLOCKED' as const } }],
  ])('is not production ready when %s', (_label, over) => {
    expect(clearanceView(record(over), NOW).productionReady).toBe(false);
  });

  it('treats a missing record as UNKNOWN on both layers rather than an error', () => {
    expect(clearanceView(null, NOW)).toEqual({
      assetRights: 'UNKNOWN',
      likenessUseBasis: 'UNKNOWN',
      productionReady: false,
    });
  });

  // -- expiry, on both layers ---------------------------------------------- //

  it('reads an expired asset-rights layer as EXPIRED', () => {
    const view = clearanceView(
      record({ assetRights: { status: 'CLEARED', expiresAt: PAST } }),
      NOW,
    );
    expect(view.assetRights).toBe('EXPIRED');
    expect(view.productionReady).toBe(false);
  });

  it('reads an expired likeness layer as EXPIRED', () => {
    const view = clearanceView(
      record({ likenessUseBasis: { status: 'CLEARED', expiresAt: PAST } }),
      NOW,
    );
    expect(view.likenessUseBasis).toBe('EXPIRED');
    expect(view.productionReady).toBe(false);
  });

  it('keeps a future expiry cleared', () => {
    const view = clearanceView(
      record({
        assetRights: { status: 'CLEARED', expiresAt: FUTURE },
        likenessUseBasis: { status: 'CLEARED', expiresAt: FUTURE },
      }),
      NOW,
    );
    expect(view.productionReady).toBe(true);
  });

  it('never expires a layer that was not cleared', () => {
    // A stale date on a PENDING layer means nothing: it never conferred
    // anything that could lapse.
    expect(
      effectiveStatus({ status: 'PENDING', expiresAt: PAST }, NOW),
    ).toBe('PENDING');
  });

  it('derives EXPIRED without writing to the database', async () => {
    const repo = fakeRepository(
      record({ likenessUseBasis: { status: 'CLEARED', expiresAt: PAST } }),
    );
    const service = new MediaRightsService(repo as never);
    const status = await service.statusFor(URL, NOW);
    expect(status.likenessUseBasis).toBe('EXPIRED');
    expect(status.productionReady).toBe(false);
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(repo.writes).toEqual([]);
  });
});

describe('media rights — attribution is independent of clearance', () => {
  it('derives attribution from a CC licence', () => {
    expect(attributionRequiredFor('cc', 'CC BY-SA 3.0')).toBe(true);
  });

  it('derives no attribution for public domain', () => {
    expect(attributionRequiredFor('public-domain', undefined)).toBe(false);
  });

  it('leaves a custom grant to its evidence', () => {
    expect(attributionRequiredFor('grant', undefined)).toBeUndefined();
    expect(attributionRequiredFor('commercial-licence', undefined)).toBeUndefined();
  });

  it('marks a derived requirement as derived, overriding a supplied boolean', async () => {
    const repo = fakeRepository(null);
    const service = new MediaRightsService(repo as never);
    // Public domain AND "attribution required" is exactly the contradiction two
    // hand-maintained ledgers already produced for one asset. The licence wins.
    await service.record(URL, {
      assetRights: { status: 'CLEARED', basisType: 'public-domain' },
      likenessUseBasis: { status: 'UNKNOWN' },
      attribution: { required: true },
    } as never);
    const written = (repo.writes[0] as { patch: MediaRightsDocument }).patch;
    expect(written.attribution.required).toBe(false);
    expect(written.attribution.requirementBasis).toBe('derived-from-licence');
  });

  it('keeps an evidence-backed requirement where the licence does not settle it', async () => {
    const repo = fakeRepository(null);
    const service = new MediaRightsService(repo as never);
    await service.record(URL, {
      assetRights: { status: 'CLEARED', basisType: 'contract' as never },
      likenessUseBasis: { status: 'CLEARED' },
      attribution: { required: true, text: 'Courtesy of the broadcaster' },
    } as never);
    const written = (repo.writes[0] as { patch: MediaRightsDocument }).patch;
    expect(written.attribution.required).toBe(true);
    expect(written.attribution.requirementBasis).toBe('evidence');
  });

  it('does not let attribution affect production readiness', () => {
    const view = clearanceView(
      record({ attribution: { required: true } }),
      NOW,
    );
    expect(view.productionReady).toBe(true);
  });
});

describe('media rights — projection keeps evidence private', () => {
  const PRIVATE = [
    'evidenceRef',
    'notes',
    'territory',
    'grantedBy',
    'commercialUseScope',
    'redistributionNote',
  ];

  it('never projects evidence, notes or commercial terms', async () => {
    const repo = fakeRepository(
      record({
        notes: 'internal: contract in the shared drive',
        assetRights: {
          status: 'CLEARED',
          evidenceRef: 'vault://contract/123',
          redistributionNote: 'no sublicensing',
        },
        likenessUseBasis: {
          status: 'CLEARED',
          evidenceRef: 'vault://grant/456',
          grantedBy: 'Management Co',
          territory: 'GCC',
          commercialUseScope: 'in-game display only',
        },
      }),
    );
    const service = new MediaRightsService(repo as never);
    const serialized = JSON.stringify(await service.statusFor(URL, NOW));
    for (const field of PRIVATE) {
      expect(serialized).not.toContain(field);
    }
    expect(serialized).not.toContain('vault://');
    expect(serialized).not.toContain('Management Co');
  });

  it('derives storageKey from the url rather than storing a second identity', async () => {
    const service = new MediaRightsService(fakeRepository(record()) as never);
    const status = await service.statusFor(URL, NOW);
    expect(status.storageKey).toBe('uploads/questions/bomb-items/bomb-item-1-a.jpg');
    expect(`/${status.storageKey}`).toBe(status.assetUrl);
  });
});

describe('media rights — impact lookup', () => {
  it('returns every ContentItem using the asset', async () => {
    const repo = fakeRepository(record());
    repo.affectedContentItems.mockResolvedValue([
      { contentItemId: 'a', worldId: 'w', scopeId: 's', status: 'ready' },
      { contentItemId: 'b', worldId: 'w', scopeId: 's', status: 'draft' },
    ]);
    const service = new MediaRightsService(repo as never);
    const affected = await service.affectedContentItems(URL);
    expect(affected).toHaveLength(2);
    expect(affected.map((a) => a.contentItemId)).toEqual(['a', 'b']);
    expect(affected[0]).toHaveProperty('worldId');
    expect(affected[0]).toHaveProperty('status');
  });
});

describe('media rights — admin authorization', () => {
  it('guards every route with JWT + admin role', () => {
    const guards = Reflector.prototype.get.call(
      new Reflector(),
      '__guards__',
      AdminMediaRightsController,
    ) as Array<{ name: string }> | undefined;
    expect((guards ?? []).map((g) => g.name)).toEqual([
      'JwtAuthGuard',
      'RolesGuard',
    ]);
    const roles = Reflector.prototype.get.call(
      new Reflector(),
      'roles',
      AdminMediaRightsController,
    );
    expect(roles).toEqual(['admin']);
  });
});
