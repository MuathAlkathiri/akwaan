import {
  ContentMediaType,
  EKSHIFNI_REGION_COUNT,
  EKSHIFNI_REGION_ROLES,
} from './world-content.constants';
import {
  ekshifniImageIssue,
  ekshifniRegionShapeIssue,
  validateEkshifniPayload,
} from './ekshifni-content.policy';
import { EkshifniPayload } from './world-content.types';

/**
 * The authoring contract for "اكشفني".
 *
 * The failure this prevents is a producer publishing a celebrity on Thursday and
 * the room discovering on Friday that it will not launch — so the launcher runs
 * these very predicates, and `start-ekshifni-gameplay` re-runs them on the way
 * into the runtime.
 */

const payload = (): EkshifniPayload => ({
  variant: 'ekshifni',
  regions: EKSHIFNI_REGION_ROLES.map((role, index) => ({
    localId: `r${index + 1}`,
    role,
    shape: { x: index * 0.15, y: 0.1, width: 0.12, height: 0.2 },
  })),
});

const image = () => ({
  type: ContentMediaType.IMAGE,
  assets: [{ url: 'https://test/celebrity.jpg' }],
});

const codes = (problems: { code: string }[]) => problems.map((p) => p.code);

describe('اكشفني content policy', () => {
  it('accepts the canonical six-region contract', () => {
    expect(validateEkshifniPayload(payload())).toEqual([]);
    expect(ekshifniImageIssue(image())).toBeUndefined();
  });

  it('requires the payload itself', () => {
    expect(codes(validateEkshifniPayload(undefined))).toContain(
      'EKSHIFNI_PAYLOAD_REQUIRED',
    );
  });

  it.each([
    ['five regions', (value: EkshifniPayload) => value.regions.pop()],
    [
      'seven regions',
      (value: EkshifniPayload) => value.regions.push(value.regions[0]),
    ],
  ])('rejects %s', (_label, mutate) => {
    const value = payload();
    mutate(value);
    expect(codes(validateEkshifniPayload(value))).toContain(
      'EKSHIFNI_REGION_COUNT_INVALID',
    );
  });

  it('rejects duplicate region ids, which would let a reveal drift', () => {
    const value = payload();
    value.regions[1].localId = value.regions[0].localId;
    expect(codes(validateEkshifniPayload(value))).toContain(
      'EKSHIFNI_REGION_IDS_INVALID',
    );
  });

  it('rejects a role outside the authored vocabulary', () => {
    const value = payload();
    value.regions[0].role = 'shoes' as never;
    expect(codes(validateEkshifniPayload(value))).toContain(
      'EKSHIFNI_REGION_ROLE_INVALID',
    );
  });

  it('rejects the same role authored twice', () => {
    // Otherwise an item can ship six patches of background and leave the face
    // covered all the way down to the value floor.
    const value = payload();
    value.regions[1].role = value.regions[0].role;
    expect(codes(validateEkshifniPayload(value))).toContain(
      'EKSHIFNI_REGION_ROLES_DUPLICATED',
    );
  });

  it.each([
    ['screen pixels', { x: 240, y: 120, width: 80, height: 90 }],
    [
      'a box that spills off the image',
      { x: 0.9, y: 0.1, width: 0.5, height: 0.2 },
    ],
    ['a zero-width box', { x: 0.1, y: 0.1, width: 0, height: 0.2 }],
    ['a negative origin', { x: -0.1, y: 0.1, width: 0.2, height: 0.2 }],
  ])('rejects geometry given as %s', (_label, shape) => {
    expect(ekshifniRegionShapeIssue(shape, 'region')?.code).toBe(
      'EKSHIFNI_REGION_GEOMETRY_INVALID',
    );
    const value = payload();
    value.regions[0].shape = shape;
    expect(codes(validateEkshifniPayload(value))).toContain(
      'EKSHIFNI_REGION_GEOMETRY_INVALID',
    );
  });

  it('accepts a box dragged flush to the far edge', () => {
    // An authoring UI rounds; a mask that reaches the border is legitimate.
    expect(
      ekshifniRegionShapeIssue(
        { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
        'region',
      ),
    ).toBeUndefined();
  });

  it.each([
    ['no media', undefined],
    ['audio', { type: ContentMediaType.AUDIO, assets: [{ url: 'a.mp3' }] }],
    [
      'two assets',
      { type: ContentMediaType.IMAGE, assets: [{ url: 'a' }, { url: 'b' }] },
    ],
    ['an empty url', { type: ContentMediaType.IMAGE, assets: [{ url: '  ' }] }],
  ])('rejects %s as the celebrity image', (_label, media) => {
    expect(ekshifniImageIssue(media as never)?.code).toBe(
      'EKSHIFNI_IMAGE_INVALID',
    );
  });

  it('authors exactly one region per role, and six of them', () => {
    expect(EKSHIFNI_REGION_ROLES).toHaveLength(EKSHIFNI_REGION_COUNT);
  });
});
