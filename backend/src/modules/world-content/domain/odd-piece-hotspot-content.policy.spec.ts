import { ContentItemStatus, ContentMediaType } from './world-content.constants';
import {
  ODD_PIECE_ITEM_COUNT,
  OddPieceCandidateItem,
  buildOddPieceHotspotPlan,
  oddPiecePayloadVersion,
  validateOddPiecePayload,
  validateOddPieceHotspotPayload,
} from './odd-piece-content.policy';
import { OddPieceHotspotPayload } from './world-content.types';

const image = (url: string) => ({
  media: { type: ContentMediaType.IMAGE, assets: [{ url }] },
  width: 1200,
  height: 800,
  orientation: 'landscape' as const,
  provenance: {
    assetOrigin: 'authentic' as const,
    sourceUrl: 'https://source.test/car',
  },
});

const payload = (
  difficulty: OddPieceHotspotPayload['difficulty'] = 'medium',
): OddPieceHotspotPayload => ({
  variant: 'odd-piece',
  version: 2,
  difficulty,
  modifiedImage: image('https://media.test/modified-1.jpg'),
  originalImage: image('https://media.test/original-1.jpg'),
  targetVehicleIdentity: 'bmw-m4-g82',
  targetVehicleLabel: 'BMW M4 G82',
  intruderVehicleIdentity: 'mercedes-amg-c63-w206',
  intruderVehicleLabel: 'Mercedes-AMG C63 W206',
  intruderPartIdentity: 'front-lamp',
  intruderPartLabel: 'front lamp',
  hotspot: {
    polygon: [
      { x: 0.4, y: 0.4 },
      { x: 0.6, y: 0.4 },
      { x: 0.6, y: 0.6 },
      { x: 0.4, y: 0.6 },
    ],
    tolerance: 0.01,
  },
});

const item = (
  id: string,
  value: OddPieceHotspotPayload = payload(),
): OddPieceCandidateItem => ({
  id,
  status: ContentItemStatus.READY,
  worldId: 'cars',
  scopeId: `scope-${id}`,
  prompt: { ar: 'أين القطعة الدخيلة؟' },
  mechanicPayload: value as unknown as Record<string, unknown>,
});

describe('Odd Piece V2 content policy', () => {
  it('keeps missing and explicit version 1 payloads on the legacy path', () => {
    expect(oddPiecePayloadVersion({ variant: 'odd-piece' })).toBe(1);
    expect(oddPiecePayloadVersion({ variant: 'odd-piece', version: 1 })).toBe(
      1,
    );
  });

  it('accepts the complete versioned hotspot contract', () => {
    expect(validateOddPieceHotspotPayload(payload())).toEqual([]);
    expect(validateOddPiecePayload(payload())).toEqual([]);
  });

  it.each([
    [
      'legacy payload',
      (value: OddPieceHotspotPayload) =>
        delete (value as Partial<OddPieceHotspotPayload>).version,
    ],
    [
      'bad difficulty',
      (value: OddPieceHotspotPayload) => (value.difficulty = 'expert' as never),
    ],
    [
      'missing original',
      (value: OddPieceHotspotPayload) =>
        (value.originalImage.media.assets = []),
    ],
    [
      'bad polygon',
      (value: OddPieceHotspotPayload) =>
        (value.hotspot.polygon = [{ x: 0, y: 0 }] as never),
    ],
    [
      'bad tolerance',
      (value: OddPieceHotspotPayload) => (value.hotspot.tolerance = 0.5),
    ],
    [
      'answer-bearing filename',
      (value: OddPieceHotspotPayload) =>
        (value.modifiedImage.media.assets[0].filename = 'bmw-m4-g82.jpg'),
    ],
  ])('rejects %s', (_label, mutate) => {
    const value = payload();
    mutate(value);
    expect(validateOddPieceHotspotPayload(value)).not.toEqual([]);
  });

  it('routes malformed V2 through the hotspot contract instead of the V1 validator', () => {
    const value = payload();
    value.hotspot.polygon = [{ x: 0, y: 0 }] as never;
    expect(validateOddPiecePayload(value)).toEqual(
      validateOddPieceHotspotPayload(value),
    );
  });

  it('rejects mixed-version bundles and requires exactly three V2 puzzles', () => {
    const legacy = { ...payload(), version: undefined } as unknown as Record<
      string,
      unknown
    >;
    expect(() =>
      buildOddPieceHotspotPlan(
        [
          item('a'),
          item('b'),
          item('c', legacy as unknown as OddPieceHotspotPayload),
        ],
        { worldId: 'cars' },
      ),
    ).toThrow();
    expect(() =>
      buildOddPieceHotspotPlan(
        Array.from({ length: ODD_PIECE_ITEM_COUNT - 1 }, (_, index) =>
          item(String(index)),
        ),
        { worldId: 'cars' },
      ),
    ).toThrow();
  });

  it('orders one puzzle from each difficulty tier for the V2 progression', () => {
    const plan = buildOddPieceHotspotPlan(
      [
        item('hard', payload('hard')),
        item('easy', payload('easy')),
        item('medium', payload('medium')),
      ],
      { worldId: 'cars' },
    );
    expect(plan.map((puzzle) => puzzle.difficulty)).toEqual([
      'easy',
      'medium',
      'hard',
    ]);
    expect(() =>
      buildOddPieceHotspotPlan([item('a'), item('b'), item('c')], {
        worldId: 'cars',
      }),
    ).toThrow('one easy, one medium and one hard');
  });
});
