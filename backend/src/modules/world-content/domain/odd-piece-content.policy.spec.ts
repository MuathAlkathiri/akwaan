import { ContentItemStatus, ContentMediaType } from './world-content.constants';
import {
  ODD_PIECE_ITEM_COUNT,
  OddPieceCandidateItem,
  buildOddPiecePlan,
  validateOddPiecePayload,
} from './odd-piece-content.policy';
import { OddPiecePayload } from './world-content.types';

const image = (url: string) => ({
  type: ContentMediaType.IMAGE,
  assets: [{ url }],
});
const payload = (): OddPiecePayload => ({
  variant: 'odd-piece',
  targetVehicleIdentity: 'bmw-m4',
  targetVehicleLabel: 'BMW M4',
  targetVehicleReveal: image('https://test/full.jpg'),
  pieces: [
    ['a', 'bmw-m4', 'BMW M4'],
    ['b', 'bmw-m4', 'BMW M4'],
    ['c', 'bmw-m4', 'BMW M4'],
    ['d', 'amg-c63', 'Mercedes-AMG C63'],
  ].map(([localId, vehicleIdentity, vehicleLabel]) => ({
    localId,
    vehicleIdentity,
    vehicleLabel,
    media: image(`https://test/${localId}.jpg`),
  })),
});
const item = (id: string): OddPieceCandidateItem => ({
  id,
  status: ContentItemStatus.READY,
  worldId: 'cars',
  scopeId: `scope-${id}`,
  prompt: { ar: 'اختر القطعة الدخيلة' },
  mechanicPayload: payload() as unknown as Record<string, unknown>,
});

describe('Odd Piece content policy', () => {
  it('accepts the canonical four-piece visual contract and full reveal', () => {
    expect(validateOddPiecePayload(payload())).toEqual([]);
  });

  it.each([
    ['fewer than four', (value: OddPiecePayload) => value.pieces.pop()],
    [
      'more than four',
      (value: OddPiecePayload) => value.pieces.push(value.pieces[0]),
    ],
    [
      'a two-plus-two split',
      (value: OddPiecePayload) => {
        value.pieces[2].vehicleIdentity = 'amg-c63';
      },
    ],
    [
      'all four identical',
      (value: OddPiecePayload) => {
        value.pieces[3].vehicleIdentity = 'bmw-m4';
      },
    ],
    [
      'duplicate ids',
      (value: OddPiecePayload) => {
        value.pieces[3].localId = 'a';
      },
    ],
    [
      'missing piece media',
      (value: OddPiecePayload) => {
        value.pieces[0].media.assets = [];
      },
    ],
    [
      'missing full reveal',
      (value: OddPiecePayload) => {
        value.targetVehicleReveal.assets = [];
      },
    ],
  ])('rejects %s', (_label, mutate) => {
    const value = payload();
    mutate(value);
    expect(validateOddPiecePayload(value)).not.toEqual([]);
  });

  it('builds exactly three distinct puzzles and commits server ordering', () => {
    const plan = buildOddPiecePlan(
      Array.from({ length: ODD_PIECE_ITEM_COUNT }, (_, index) =>
        item(`item-${index + 1}`),
      ),
      { worldId: 'cars', shuffle: (values) => values.reverse() },
    );
    expect(plan).toHaveLength(3);
    expect(new Set(plan.map((entry) => entry.contentItemId)).size).toBe(3);
    expect(plan[0].pieces.map((piece) => piece.id)).toEqual([
      'd',
      'c',
      'b',
      'a',
    ]);
    expect(plan[0].pieces.map((piece) => piece.id)).toEqual(
      plan[0].pieces.map((piece) => piece.id),
    );
  });

  it('rejects a non-distinct three-puzzle plan', () => {
    expect(() =>
      buildOddPiecePlan([item('a'), item('a'), item('b')], {
        worldId: 'cars',
      }),
    ).toThrow();
  });
});
