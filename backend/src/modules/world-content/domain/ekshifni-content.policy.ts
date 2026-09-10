import {
  ContentMediaType,
  EKSHIFNI_REGION_COUNT,
  EKSHIFNI_REGION_ROLES,
  EkshifniRegionRole,
} from './world-content.constants';
import {
  ContentItemMedia,
  EkshifniPayload,
  EkshifniRegionAuthoring,
  WorldContentIssue,
} from './world-content.types';

/**
 * The one structural contract for an "اكشفني" item, shared by Admin authoring and
 * the launcher.
 *
 * Both call this, so an item the Admin accepted cannot fail at launch — the
 * failure mode where a producer publishes a celebrity on Thursday and the room
 * discovers on Friday that it will not start.
 */

const issue = (code: string, message: string): WorldContentIssue => ({
  code,
  message,
});

/** A geometry value is a fraction of the source image, never a screen pixel. */
const isFraction = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

/**
 * Whether one authored region is drawable.
 *
 * Geometry is stored as fractions of the image so a single authored mask lands
 * on the same feature at 1920×1080, on a 390-wide phone, and on whatever the
 * room's television actually is. A tolerance of 1e-4 on the far edge forgives
 * the rounding an authoring UI produces when a box is dragged flush to the
 * border.
 */
export function ekshifniRegionShapeIssue(
  shape: EkshifniRegionAuthoring['shape'] | undefined,
  label: string,
): WorldContentIssue | undefined {
  if (
    !shape ||
    ![shape.x, shape.y, shape.width, shape.height].every(isFraction) ||
    shape.width <= 0 ||
    shape.height <= 0 ||
    shape.x + shape.width > 1.0001 ||
    shape.y + shape.height > 1.0001
  ) {
    return issue(
      'EKSHIFNI_REGION_GEOMETRY_INVALID',
      `${label} must be a box in image fractions (0..1) that stays inside the image`,
    );
  }
  return undefined;
}

/** The celebrity photograph itself: exactly one canonical image asset. */
export function ekshifniImageIssue(
  media: ContentItemMedia | undefined,
): WorldContentIssue | undefined {
  if (
    media?.type !== ContentMediaType.IMAGE ||
    media.assets?.length !== 1 ||
    !media.assets[0]?.url?.trim()
  ) {
    return issue(
      'EKSHIFNI_IMAGE_INVALID',
      'اكشفني requires exactly one canonical celebrity image asset',
    );
  }
  return undefined;
}

/**
 * The six regions.
 *
 * Six exactly, because the value ladder is 5→1 with the sixth still worth
 * taking; unique stable ids, because a reveal recorded against an id must never
 * drift onto a different mask when an author edits the item; and one of the six
 * authored roles each, which is authoring vocabulary the players never see.
 */
export function validateEkshifniPayload(
  raw: Partial<EkshifniPayload> | undefined,
): WorldContentIssue[] {
  const problems: WorldContentIssue[] = [];
  if (raw?.variant !== 'ekshifni') {
    problems.push(
      issue(
        'EKSHIFNI_PAYLOAD_REQUIRED',
        'اكشفني requires its canonical reveal-region payload',
      ),
    );
  }
  const regions = Array.isArray(raw?.regions) ? raw.regions : [];
  if (regions.length !== EKSHIFNI_REGION_COUNT) {
    problems.push(
      issue(
        'EKSHIFNI_REGION_COUNT_INVALID',
        `اكشفني requires exactly ${EKSHIFNI_REGION_COUNT} reveal regions`,
      ),
    );
  }
  const ids = regions.map((region) => region?.localId?.trim()).filter(Boolean);
  if (ids.length !== regions.length || new Set(ids).size !== regions.length) {
    problems.push(
      issue(
        'EKSHIFNI_REGION_IDS_INVALID',
        'Every اكشفني region needs a unique stable local id',
      ),
    );
  }
  regions.forEach((region, index) => {
    const label = `اكشفني region ${index + 1}`;
    if (!EKSHIFNI_REGION_ROLES.includes(region?.role as EkshifniRegionRole)) {
      problems.push(
        issue(
          'EKSHIFNI_REGION_ROLE_INVALID',
          `${label} needs one of the authored roles`,
        ),
      );
    }
    const shapeProblem = ekshifniRegionShapeIssue(region?.shape, label);
    if (shapeProblem) problems.push(shapeProblem);
  });
  // Each authored role appears once, so an item cannot ship six variations of
  // "the outfit" and leave the face uncovered until the value floor.
  const roles = regions
    .map((region) => region?.role)
    .filter((role): role is EkshifniRegionRole =>
      EKSHIFNI_REGION_ROLES.includes(role as EkshifniRegionRole),
    );
  if (roles.length === regions.length && new Set(roles).size !== roles.length) {
    problems.push(
      issue(
        'EKSHIFNI_REGION_ROLES_DUPLICATED',
        'Each اكشفني region role may be authored only once per image',
      ),
    );
  }
  return problems;
}
