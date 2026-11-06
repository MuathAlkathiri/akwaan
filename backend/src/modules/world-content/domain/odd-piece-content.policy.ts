import { ContentItemStatus, ContentMediaType } from './world-content.constants';
import { WorldContentValidationError } from './world-content.errors';
import {
  ContentItemMedia,
  LocalizedText,
  OddPiecePayload,
  OddPieceHotspotPayload,
  OddPieceHotspotImage,
  OddPieceDifficulty,
  WorldContentIssue,
} from './world-content.types';
import {
  validateHotspotTolerance,
  validateNormalizedPolygon,
} from './odd-piece-hotspot.geometry';

export const ODD_PIECE_ITEM_COUNT = 3;
export const ODD_PIECE_VISUAL_COUNT = 4;
export const ODD_PIECE_V2_DIFFICULTY_PROGRESSION = [
  'easy',
  'medium',
  'hard',
] as const;

export interface OddPieceCandidateItem {
  id: string;
  status: ContentItemStatus;
  worldId: string;
  scopeId: string;
  prompt: LocalizedText;
  mechanicPayload?: Record<string, unknown>;
}

export interface OddPieceAuthoredPuzzle {
  contentItemId: string;
  scopeId: string;
  prompt: string;
  targetVehicleIdentity: string;
  targetVehicleLabel: string;
  targetReveal: { imageUrl: string; altText?: string };
  pieces: Array<{
    id: string;
    imageUrl: string;
    altText?: string;
    vehicleIdentity: string;
    vehicleLabel: string;
  }>;
}

export interface OddPieceHotspotAuthoredPuzzle {
  contentItemId: string;
  scopeId: string;
  prompt: string;
  difficulty: OddPieceDifficulty;
  modifiedImage: OddPieceHotspotImage;
  originalImage: OddPieceHotspotImage;
  targetVehicleIdentity: string;
  targetVehicleLabel: string;
  intruderVehicleIdentity: string;
  intruderVehicleLabel: string;
  intruderPartIdentity: string;
  intruderPartLabel: string;
  hotspot: OddPieceHotspotPayload['hotspot'];
}

const issue = (code: string, message: string): WorldContentIssue => ({
  code,
  message,
});

function imageProblem(media: ContentItemMedia | undefined, label: string) {
  if (
    media?.type !== ContentMediaType.IMAGE ||
    media.assets?.length !== 1 ||
    typeof media.assets[0]?.url !== 'string' ||
    !media.assets[0].url.trim()
  ) {
    return issue(
      'ODD_PIECE_IMAGE_INVALID',
      `${label} requires exactly one canonical image asset`,
    );
  }
  return undefined;
}

function v2ImageProblem(
  image: OddPieceHotspotImage | undefined,
  label: string,
) {
  const problems: WorldContentIssue[] = [];
  const mediaProblem = imageProblem(image?.media, label);
  if (mediaProblem) problems.push(mediaProblem);
  if (
    !image ||
    !Number.isInteger(image.width) ||
    image.width <= 0 ||
    !Number.isInteger(image.height) ||
    image.height <= 0
  ) {
    problems.push(
      issue(
        'ODD_PIECE_IMAGE_DIMENSIONS_INVALID',
        `${label} needs positive integer dimensions`,
      ),
    );
  }
  if (
    !image ||
    !['landscape', 'portrait', 'square'].includes(image.orientation)
  ) {
    problems.push(
      issue(
        'ODD_PIECE_IMAGE_ORIENTATION_INVALID',
        `${label} needs a canonical orientation`,
      ),
    );
  }
  if (image) {
    const expectedOrientation =
      image.width === image.height
        ? 'square'
        : image.width > image.height
          ? 'landscape'
          : 'portrait';
    if (image.orientation !== expectedOrientation) {
      problems.push(
        issue(
          'ODD_PIECE_IMAGE_ORIENTATION_MISMATCH',
          `${label} orientation must match its dimensions`,
        ),
      );
    }
  }
  const provenance = image?.provenance;
  if (
    !provenance ||
    !['authentic', 'ai-edited'].includes(provenance.assetOrigin)
  ) {
    problems.push(
      issue(
        'ODD_PIECE_PROVENANCE_INVALID',
        `${label} needs authentic/ai-edited provenance`,
      ),
    );
  }
  if (
    typeof provenance?.sourceUrl !== 'string' ||
    !provenance.sourceUrl.trim()
  ) {
    problems.push(
      issue(
        'ODD_PIECE_SOURCE_REQUIRED',
        `${label} needs a source URL in its provenance record`,
      ),
    );
  }
  if (
    provenance?.assetOrigin === 'ai-edited' &&
    (typeof provenance.editedRegion !== 'string' ||
      !provenance.editedRegion.trim() ||
      typeof provenance.editModel !== 'string' ||
      !provenance.editModel.trim())
  ) {
    problems.push(
      issue(
        'ODD_PIECE_EDIT_PROVENANCE_REQUIRED',
        `${label} needs editedRegion and editModel for AI-edited media`,
      ),
    );
  }
  return problems;
}

function answerBearingAssetProblem(
  image: OddPieceHotspotImage | undefined,
  identities: string[],
  label: string,
) {
  const asset = image?.media?.assets?.[0];
  if (!asset) return undefined;
  const haystack = [asset.url, asset.path, asset.filename, asset.altText]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  const leaked = identities
    .map((value) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ''))
    .filter((value) => value.length >= 3)
    .some((value) => haystack.includes(value));
  return leaked
    ? issue(
        'ODD_PIECE_ANSWER_LEAK',
        `${label} asset metadata must not contain vehicle identities`,
      )
    : undefined;
}

function answerBearingPromptProblem(prompt: string, identities: string[]) {
  const haystack = prompt.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '');
  const leaked = identities
    .map((value) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ''))
    .filter((value) => value.length >= 3)
    .some((value) => haystack.includes(value));
  return leaked
    ? issue(
        'ODD_PIECE_ANSWER_LEAK',
        'The question prompt must not contain vehicle identities',
      )
    : undefined;
}

export function oddPiecePayloadVersion(raw: unknown): 1 | 2 | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as { variant?: unknown; version?: unknown };
  if (value.variant !== 'odd-piece') return undefined;
  if (value.version === undefined || value.version === 1) return 1;
  if (value.version === 2) return 2;
  return undefined;
}

/** V2 is opt-in; a missing version remains the legacy four-piece contract. */
export function validateOddPieceHotspotPayload(
  raw: Partial<OddPieceHotspotPayload> | undefined,
): WorldContentIssue[] {
  const problems: WorldContentIssue[] = [];
  if (raw?.variant !== 'odd-piece' || raw.version !== 2)
    problems.push(
      issue(
        'ODD_PIECE_V2_PAYLOAD_REQUIRED',
        'Odd Piece V2 requires variant odd-piece and version 2',
      ),
    );
  if (!raw?.difficulty || !['easy', 'medium', 'hard'].includes(raw.difficulty))
    problems.push(
      issue(
        'ODD_PIECE_DIFFICULTY_INVALID',
        'Odd Piece V2 difficulty must be easy, medium or hard',
      ),
    );
  if (!raw?.targetVehicleIdentity?.trim() || !raw.targetVehicleLabel?.trim())
    problems.push(
      issue(
        'ODD_PIECE_TARGET_REQUIRED',
        'A target vehicle identity and label are required',
      ),
    );
  if (
    !raw?.intruderVehicleIdentity?.trim() ||
    !raw.intruderVehicleLabel?.trim() ||
    !raw.intruderPartIdentity?.trim() ||
    !raw.intruderPartLabel?.trim()
  )
    problems.push(
      issue(
        'ODD_PIECE_INTRUDER_REQUIRED',
        'An intruder vehicle and part identity are required',
      ),
    );
  if (
    raw?.targetVehicleIdentity?.trim() &&
    raw.intruderVehicleIdentity?.trim() &&
    raw.targetVehicleIdentity.trim() === raw.intruderVehicleIdentity.trim()
  )
    problems.push(
      issue(
        'ODD_PIECE_IDENTITIES_MUST_DIFFER',
        'Target and intruder vehicles must be different identities',
      ),
    );
  problems.push(
    ...v2ImageProblem(raw?.modifiedImage, 'Modified image'),
    ...v2ImageProblem(raw?.originalImage, 'Original image'),
  );
  const identities = [
    raw?.targetVehicleIdentity,
    raw?.targetVehicleLabel,
    raw?.intruderVehicleIdentity,
    raw?.intruderVehicleLabel,
    raw?.intruderPartIdentity,
    raw?.intruderPartLabel,
  ].filter((value): value is string => Boolean(value?.trim()));
  const modifiedLeak = answerBearingAssetProblem(
    raw?.modifiedImage,
    identities,
    'Modified image',
  );
  if (modifiedLeak) problems.push(modifiedLeak);
  if (
    raw?.modifiedImage &&
    raw?.originalImage &&
    (raw.modifiedImage.width !== raw.originalImage.width ||
      raw.modifiedImage.height !== raw.originalImage.height)
  )
    problems.push(
      issue(
        'ODD_PIECE_IMAGE_DIMENSIONS_MISMATCH',
        'Modified and original images must share dimensions',
      ),
    );
  const polygonProblems = validateNormalizedPolygon(raw?.hotspot?.polygon);
  const toleranceProblems = validateHotspotTolerance(raw?.hotspot?.tolerance);
  polygonProblems.forEach((message) =>
    problems.push(issue('ODD_PIECE_HOTSPOT_INVALID', message)),
  );
  toleranceProblems.forEach((message) =>
    problems.push(issue('ODD_PIECE_HOTSPOT_TOLERANCE_INVALID', message)),
  );
  return problems;
}

/** One structural predicate shared by authoring and launch. */
export function validateOddPiecePayload(
  raw: Partial<OddPiecePayload> | undefined,
): WorldContentIssue[] {
  // V2 is an opt-in contract. Keep the legacy four-piece validator intact for
  // unversioned/version 1 records, but route version 2 through the hotspot
  // validator everywhere ContentItem compatibility/readiness is checked.
  if (oddPiecePayloadVersion(raw) === 2)
    return validateOddPieceHotspotPayload(
      raw as Partial<OddPieceHotspotPayload>,
    );
  const problems: WorldContentIssue[] = [];
  if (raw?.variant !== 'odd-piece')
    problems.push(
      issue(
        'ODD_PIECE_PAYLOAD_REQUIRED',
        'القطعة الدخيلة requires its canonical visual payload',
      ),
    );
  if (!raw?.targetVehicleIdentity?.trim() || !raw.targetVehicleLabel?.trim())
    problems.push(
      issue(
        'ODD_PIECE_TARGET_REQUIRED',
        'A target vehicle identity and reveal label are required',
      ),
    );
  const revealProblem = imageProblem(
    raw?.targetVehicleReveal,
    'The full target-vehicle reveal',
  );
  if (revealProblem) problems.push(revealProblem);

  const pieces = Array.isArray(raw?.pieces) ? raw.pieces : [];
  if (pieces.length !== ODD_PIECE_VISUAL_COUNT)
    problems.push(
      issue(
        'ODD_PIECE_VISUAL_COUNT_INVALID',
        `القطعة الدخيلة requires exactly ${ODD_PIECE_VISUAL_COUNT} visual pieces`,
      ),
    );
  const ids = pieces.map((piece) => piece?.localId?.trim()).filter(Boolean);
  if (ids.length !== pieces.length || new Set(ids).size !== pieces.length)
    problems.push(
      issue(
        'ODD_PIECE_LOCAL_IDS_INVALID',
        'Every piece needs a unique stable local id',
      ),
    );
  pieces.forEach((piece, index) => {
    if (!piece?.vehicleIdentity?.trim() || !piece?.vehicleLabel?.trim())
      problems.push(
        issue(
          'ODD_PIECE_IDENTITY_INVALID',
          `Piece ${index + 1} needs a vehicle identity and reveal label`,
        ),
      );
    const mediaProblem = imageProblem(piece?.media, `Piece ${index + 1}`);
    if (mediaProblem) problems.push(mediaProblem);
  });
  const identities = new Map<string, number>();
  for (const piece of pieces) {
    const identity = piece?.vehicleIdentity?.trim();
    if (identity) identities.set(identity, (identities.get(identity) ?? 0) + 1);
  }
  const counts = [...identities.values()].sort((a, b) => a - b);
  if (counts.join(',') !== '1,3')
    problems.push(
      issue(
        'ODD_PIECE_IDENTITY_SPLIT_INVALID',
        'The four pieces must have an exact three-plus-one vehicle identity split',
      ),
    );
  if (
    raw?.targetVehicleIdentity?.trim() &&
    identities.get(raw.targetVehicleIdentity.trim()) !== 3
  )
    problems.push(
      issue(
        'ODD_PIECE_TARGET_MISMATCH',
        'targetVehicleIdentity must identify the three matching pieces',
      ),
    );
  return problems;
}

function reject(problems: WorldContentIssue[]): never {
  throw new WorldContentValidationError(problems, problems[0]?.message);
}

export function readOddPieceItem(
  item: OddPieceCandidateItem,
  input: { worldId: string; position: number },
): OddPieceAuthoredPuzzle {
  const problems = validateOddPiecePayload(
    item.mechanicPayload as Partial<OddPiecePayload> | undefined,
  );
  if (item.status !== ContentItemStatus.READY)
    problems.push(
      issue(
        'ODD_PIECE_ITEM_NOT_READY',
        `Puzzle ${input.position} is not ready`,
      ),
    );
  if (item.worldId !== input.worldId)
    problems.push(
      issue(
        'ODD_PIECE_WORLD_MISMATCH',
        `Puzzle ${input.position} belongs to another World`,
      ),
    );
  if (!item.prompt?.ar?.trim())
    problems.push(
      issue(
        'ODD_PIECE_PROMPT_REQUIRED',
        `Puzzle ${input.position} needs Arabic copy`,
      ),
    );
  if (problems.length) reject(problems);
  const payload = item.mechanicPayload as unknown as OddPiecePayload;
  const asset = payload.targetVehicleReveal.assets[0];
  return {
    contentItemId: item.id,
    scopeId: item.scopeId,
    prompt: item.prompt.ar.trim(),
    targetVehicleIdentity: payload.targetVehicleIdentity.trim(),
    targetVehicleLabel: payload.targetVehicleLabel.trim(),
    targetReveal: {
      imageUrl: asset.url.trim(),
      ...(asset.altText?.trim() ? { altText: asset.altText.trim() } : {}),
    },
    pieces: payload.pieces.map((piece) => {
      const pieceAsset = piece.media.assets[0];
      return {
        id: piece.localId.trim(),
        imageUrl: pieceAsset.url.trim(),
        vehicleIdentity: piece.vehicleIdentity.trim(),
        vehicleLabel: piece.vehicleLabel.trim(),
      };
    }),
  };
}

export function readOddPieceHotspotItem(
  item: OddPieceCandidateItem,
  input: { worldId: string; position: number },
): OddPieceHotspotAuthoredPuzzle {
  const raw = item.mechanicPayload as
    Partial<OddPieceHotspotPayload> | undefined;
  const problems = validateOddPieceHotspotPayload(raw);
  const identities = [
    raw?.targetVehicleIdentity,
    raw?.targetVehicleLabel,
    raw?.intruderVehicleIdentity,
    raw?.intruderVehicleLabel,
    raw?.intruderPartIdentity,
    raw?.intruderPartLabel,
  ].filter((value): value is string => Boolean(value?.trim()));
  const promptLeak = item.prompt?.ar?.trim()
    ? answerBearingPromptProblem(item.prompt.ar.trim(), identities)
    : undefined;
  if (promptLeak) problems.push(promptLeak);
  if (item.status !== ContentItemStatus.READY)
    problems.push(
      issue(
        'ODD_PIECE_ITEM_NOT_READY',
        `Puzzle ${input.position} is not ready`,
      ),
    );
  if (item.worldId !== input.worldId)
    problems.push(
      issue(
        'ODD_PIECE_WORLD_MISMATCH',
        `Puzzle ${input.position} belongs to another World`,
      ),
    );
  if (!item.prompt?.ar?.trim())
    problems.push(
      issue(
        'ODD_PIECE_PROMPT_REQUIRED',
        `Puzzle ${input.position} needs Arabic copy`,
      ),
    );
  if (problems.length) reject(problems);
  const payload = raw as OddPieceHotspotPayload;
  return {
    contentItemId: item.id,
    scopeId: item.scopeId,
    prompt: item.prompt.ar.trim(),
    difficulty: payload.difficulty,
    modifiedImage: payload.modifiedImage,
    originalImage: payload.originalImage,
    targetVehicleIdentity: payload.targetVehicleIdentity.trim(),
    targetVehicleLabel: payload.targetVehicleLabel.trim(),
    intruderVehicleIdentity: payload.intruderVehicleIdentity.trim(),
    intruderVehicleLabel: payload.intruderVehicleLabel.trim(),
    intruderPartIdentity: payload.intruderPartIdentity.trim(),
    intruderPartLabel: payload.intruderPartLabel.trim(),
    hotspot: payload.hotspot,
  };
}

export function buildOddPieceHotspotPlan(
  items: OddPieceCandidateItem[],
  input: { worldId: string; shuffle?: <T>(values: T[]) => T[] },
): OddPieceHotspotAuthoredPuzzle[] {
  if (
    items.length !== ODD_PIECE_ITEM_COUNT ||
    new Set(items.map((item) => item.id)).size !== ODD_PIECE_ITEM_COUNT
  )
    reject([
      issue(
        'ODD_PIECE_REQUIRES_THREE_ITEMS',
        `القطعة الدخيلة requires exactly ${ODD_PIECE_ITEM_COUNT} distinct puzzles`,
      ),
    ]);
  const versions = items.map((item) =>
    oddPiecePayloadVersion(item.mechanicPayload),
  );
  if (versions.some((version) => version !== 2))
    reject([
      issue(
        'ODD_PIECE_MIXED_VERSIONS',
        'Odd Piece V2 bundles must contain only version 2 payloads',
      ),
    ]);
  const puzzles = items.map((item, index) =>
    readOddPieceHotspotItem(item, {
      worldId: input.worldId,
      position: index + 1,
    }),
  );
  const difficulties = puzzles.map((puzzle) => puzzle.difficulty);
  if (
    new Set(difficulties).size !== ODD_PIECE_ITEM_COUNT ||
    ODD_PIECE_V2_DIFFICULTY_PROGRESSION.some(
      (difficulty) => !difficulties.includes(difficulty),
    )
  )
    reject([
      issue(
        'ODD_PIECE_DIFFICULTY_SET_INVALID',
        'Odd Piece V2 requires one easy, one medium and one hard puzzle',
      ),
    ]);
  const order = new Map(
    ODD_PIECE_V2_DIFFICULTY_PROGRESSION.map((difficulty, index) => [
      difficulty,
      index,
    ]),
  );
  return puzzles.sort(
    (left, right) =>
      (order.get(left.difficulty) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.difficulty) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Build exactly three distinct persisted puzzles; ordering is committed by launch. */
export function buildOddPiecePlan(
  items: OddPieceCandidateItem[],
  input: { worldId: string; shuffle?: <T>(values: T[]) => T[] },
): OddPieceAuthoredPuzzle[] {
  if (
    items.length !== ODD_PIECE_ITEM_COUNT ||
    new Set(items.map((item) => item.id)).size !== ODD_PIECE_ITEM_COUNT
  ) {
    reject([
      issue(
        'ODD_PIECE_REQUIRES_THREE_ITEMS',
        `القطعة الدخيلة requires exactly ${ODD_PIECE_ITEM_COUNT} distinct puzzles`,
      ),
    ]);
  }
  const versions = items.map((item) =>
    oddPiecePayloadVersion(item.mechanicPayload),
  );
  if (versions.some((version) => version !== 1))
    reject([
      issue(
        'ODD_PIECE_MIXED_VERSIONS',
        'Legacy Odd Piece bundles must contain only unversioned/version 1 payloads',
      ),
    ]);
  const shuffle = input.shuffle ?? ((values) => values);
  return items.map((item, index) => {
    const puzzle = readOddPieceItem(item, {
      worldId: input.worldId,
      position: index + 1,
    });
    return { ...puzzle, pieces: shuffle([...puzzle.pieces]) };
  });
}
