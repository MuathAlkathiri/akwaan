import { pendingDeadline } from '../application/gameplay-deadline.scheduler';
import { GameplayRuntime } from './gameplay-runtime';
import {
  ODD_PIECE_GAMEPLAY_PLUGIN,
  OddPiecePuzzle,
} from './odd-piece-gameplay.plugin';

const NOW = new Date('2026-01-01T00:00:00Z');
const puzzle = (id: string): OddPiecePuzzle => ({
  id,
  prompt: 'اختر القطعة الدخيلة',
  targetVehicleIdentity: 'target',
  targetVehicleLabel: 'BMW M4',
  targetReveal: { imageUrl: `https://test/${id}/full.jpg` },
  pieces: [
    ['a', 'target', 'BMW M4'],
    ['b', 'target', 'BMW M4'],
    ['c', 'target', 'BMW M4'],
    ['d', 'odd', 'AMG C63'],
  ].map(([pieceId, vehicleIdentity, vehicleLabel]) => ({
    id: `${id}-${pieceId}`,
    imageUrl: `https://test/${id}/${pieceId}.jpg`,
    vehicleIdentity,
    vehicleLabel,
  })),
});

const activeRuntime = () => {
  const runtime = GameplayRuntime.create({
    id: 'runtime-cars',
    sessionId: 'session-cars',
    plugin: ODD_PIECE_GAMEPLAY_PLUGIN,
    commandId: 'create',
    actorId: 'controller',
    now: NOW,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    initialState: {
      phase: 'preparing',
      puzzlesJson: JSON.stringify([puzzle('p1'), puzzle('p2'), puzzle('p3')]),
      teamIdsJson: JSON.stringify(['team-a', 'team-b']),
      currentPuzzleIndex: 0,
      attemptsJson: '[]',
      failedTeamIdsJson: '[]',
      resultsJson: '[]',
      answerOwnerTeamId: null,
      deadlineAt: null,
      openSeconds: 30,
    },
  });
  runtime.start('start', 'controller', NOW);
  const round = runtime.createRound(
    { commandId: 'round', actorId: 'controller' },
    NOW,
  );
  runtime.startRound(round.id, 'round-start', 'controller', NOW);
  return runtime;
};

describe('Odd Piece recurring Fair-Start', () => {
  it('requires only the presentation-bearing shared surface', () => {
    expect(
      ODD_PIECE_GAMEPLAY_PLUGIN.requiredPresentationSurfaces!({
        runtimeState: activeRuntime().serialize().runtimeState,
        roundState: {},
      }),
    ).toEqual([{ capability: 'shared' }]);
  });

  it('has no deadline before activation and anchors the full playtest window from activation', () => {
    const runtime = activeRuntime();
    expect(
      pendingDeadline(runtime.serialize(), ODD_PIECE_GAMEPLAY_PLUGIN.deadline),
    ).toBeUndefined();
    const activatedAt = new Date(NOW.getTime() + 12_000);
    runtime.activatePresentation('activate', 'controller', activatedAt);
    const deadline = pendingDeadline(
      runtime.serialize(),
      ODD_PIECE_GAMEPLAY_PLUGIN.deadline,
    );
    expect(Date.parse(deadline!.deadlineAt)).toBe(
      activatedAt.getTime() + 30_000,
    );
  });

  it('gives puzzle two a new generation, rejects stale activation, and never restamps puzzle one', () => {
    const runtime = activeRuntime();
    runtime.activatePresentation('activate', 'controller', NOW);
    const initialActivatedAt = runtime.serialize().presentationActivatedAt;
    const generation = runtime.prepareNextPresentation(
      'prepare-2',
      'controller',
      new Date(NOW.getTime() + 40_000),
    );
    expect(
      pendingDeadline(runtime.serialize(), ODD_PIECE_GAMEPLAY_PLUGIN.deadline),
    ).toBeUndefined();
    expect(() =>
      runtime.activateCurrentPresentation(
        generation - 1,
        'stale',
        'controller',
        new Date(NOW.getTime() + 50_000),
      ),
    ).toThrow();
    const activatedAt = new Date(NOW.getTime() + 55_000);
    runtime.activateCurrentPresentation(
      generation,
      'activate-2',
      'controller',
      activatedAt,
    );
    expect(runtime.serialize().presentationActivatedAt).toEqual(
      initialActivatedAt,
    );
    expect(
      Date.parse(
        pendingDeadline(
          runtime.serialize(),
          ODD_PIECE_GAMEPLAY_PLUGIN.deadline,
        )!.deadlineAt,
      ),
    ).toBe(activatedAt.getTime() + 30_000);
  });
});
