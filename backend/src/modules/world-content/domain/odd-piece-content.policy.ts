import { ContentItemStatus, ContentMediaType } from './world-content.constants';
import { WorldContentValidationError } from './world-content.errors';
import {
  ContentItemMedia,
  LocalizedText,
  OddPiecePayload,
  WorldContentIssue,
} from './world-content.types';

export const ODD_PIECE_ITEM_COUNT = 3;
export const ODD_PIECE_VISUAL_COUNT = 4;

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

const issue = (code: string, message: string): WorldContentIssue => ({
  code,
  message,
});

function imageProblem(media: ContentItemMedia | undefined, label: string) {
  if (
    media?.type !== ContentMediaType.IMAGE ||
    media.assets?.length !== 1 ||
    !media.assets[0]?.url?.trim()
  ) {
    return issue(
      'ODD_PIECE_IMAGE_INVALID',
      `${label} requires exactly one canonical image asset`,
    );
  }
  return undefined;
}

/** One structural predicate shared by authoring and launch. */
export function validateOddPiecePayload(
  raw: Partial<OddPiecePayload> | undefined,
): WorldContentIssue[] {
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
  const shuffle = input.shuffle ?? ((values) => values);
  return items.map((item, index) => {
    const puzzle = readOddPieceItem(item, {
      worldId: input.worldId,
      position: index + 1,
    });
    return { ...puzzle, pieces: shuffle([...puzzle.pieces]) };
  });
}
