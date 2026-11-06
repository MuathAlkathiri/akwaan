import {
  ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN,
  OddPieceHotspotPuzzle,
} from './odd-piece-hotspot-gameplay.plugin';
import { GameplayModeState } from './gameplay-mode.plugin';
import { GameplayRuntime } from './gameplay-runtime';
import { ContentMediaType } from '../../world-content/domain/world-content.constants';

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

const puzzle = (id: string): OddPieceHotspotPuzzle => ({
  id,
  prompt: 'أين القطعة الدخيلة؟',
  difficulty: 'medium',
  modifiedImage: image(`https://media.test/${id}-modified.jpg`),
  originalImage: image(`https://media.test/${id}-original.jpg`),
  targetVehicleIdentity: 'bmw-m4-g82',
  targetVehicleLabel: 'BMW M4 G82',
  intruderVehicleIdentity: 'mercedes-amg-c63-w206',
  intruderVehicleLabel: 'Mercedes-AMG C63 W206',
  intruderPartIdentity: 'front-lamp',
  intruderPartLabel: 'مصباح أمامي',
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

const initial = (): GameplayModeState => ({
  phase: 'preparing',
  puzzlesJson: JSON.stringify([puzzle('p1'), puzzle('p2'), puzzle('p3')]),
  teamIdsJson: JSON.stringify(['t1', 't2']),
  requiredPresentationParticipantIdsJson: JSON.stringify(['pa', 'pb']),
  currentPuzzleIndex: 0,
  attemptsJson: '[]',
  resultsJson: '[]',
  deadlineAt: null,
  answerOwnerTeamId: null,
  discussionSeconds: 30,
  answerSeconds: 5,
});

const context = (
  participantId: string,
  now = new Date('2026-01-01T00:00:00Z'),
) => ({
  sessionId: 's',
  runtimeId: 'r',
  submitterParticipantId: participantId,
  now,
  eligibleParticipants: [
    { participantId: 'pa', teamId: 't1', connected: true },
    { participantId: 'pc', teamId: 't1', connected: true },
    { participantId: 'pb', teamId: 't2', connected: true },
    { participantId: 'pd', teamId: 't2', connected: true },
  ],
});

const command = (
  state: GameplayModeState,
  type: string,
  payload = {},
  participantId = 'pa',
  now?: Date,
) =>
  ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.handleCommand(context(participantId, now), {
    type,
    payload,
    runtimeState: state,
    roundState: { phase: state.phase, puzzleIndex: state.currentPuzzleIndex },
  });

describe('Odd Piece V2 hotspot gameplay', () => {
  it('requires identity-bound shared and team presentation surfaces', () => {
    expect(
      ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.requiredPresentationSurfaces!({
        runtimeState: initial(),
        roundState: {},
      }),
    ).toEqual([
      { capability: 'shared' },
      { capability: 'answering', participantId: 'pa' },
      { capability: 'decision', participantId: 'pb' },
    ]);
  });

  it('binds readiness to a connected teammate at acknowledgement time, not a launch representative', () => {
    const state = {
      ...initial(),
      requiredPresentationParticipantIdsJson: '[]',
      requiredPresentationTeamIdsJson: JSON.stringify(['t1', 't2']),
    };
    expect(
      ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.requiredPresentationSurfaces!({
        runtimeState: state,
        roundState: {},
      }),
    ).toEqual([
      { capability: 'shared' },
      { capability: 'answering', teamId: 't1' },
      { capability: 'decision', teamId: 't2' },
    ]);
    const activated = ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.activatePresentation!(
      state,
      new Date('2026-01-01T00:00:00Z'),
      { ...context('pc'), presentationReadyParticipantIds: ['pc', 'pd'] },
    ) as GameplayModeState;
    expect(() =>
      command(activated, 'claim-odd-piece-hotspot', {}, 'pc'),
    ).not.toThrow();
  });

  it('allows a connected teammate to rejoin an already-active puzzle after a phone reconnect', () => {
    const activated = {
      ...(ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.activatePresentation!(
        {
          ...initial(),
        },
        new Date('2026-01-01T00:00:00Z'),
        { ...context('pa'), presentationReadyParticipantIds: ['pa', 'pb'] },
      ) as GameplayModeState),
      presentationReadyParticipantIdsJson: JSON.stringify(['pa', 'pb', 'pc']),
    };
    expect(() =>
      command(activated, 'claim-odd-piece-hotspot', {}, 'pc'),
    ).not.toThrow();
  });

  it('rejects a connected teammate until that phone has acknowledged the image', () => {
    const activated = ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.activatePresentation!(
      initial(),
      new Date('2026-01-01T00:00:00Z'),
      { ...context('pa'), presentationReadyParticipantIds: ['pa', 'pb'] },
    ) as GameplayModeState;
    expect(() =>
      command(activated, 'claim-odd-piece-hotspot', {}, 'pc'),
    ).toThrow('Only an acknowledged answer surface may submit');
  });

  it('does not let a disconnected launch phone hold the barrier when another teammate takes its readiness slot', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const runtime = GameplayRuntime.create({
      id: 'odd-piece-v2-runtime',
      sessionId: 'session-1',
      plugin: ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN,
      commandId: 'create',
      actorId: 'controller',
      now,
      expiresAt: new Date(now.getTime() + 3_600_000),
      initialState: {
        ...initial(),
        requiredPresentationParticipantIdsJson: '[]',
        requiredPresentationTeamIdsJson: JSON.stringify(['t1', 't2']),
      },
    });
    runtime.start('start', 'controller', now);
    const round = runtime.createRound(
      { commandId: 'round', actorId: 'controller' },
      now,
    );
    runtime.startRound(round.id, 'round-start', 'controller', now);
    runtime.recordSurfaceReady(
      'shared',
      'shared',
      'shared-ready',
      'controller',
      now,
    );
    runtime.recordSurfaceReady(
      'answering',
      'phone-a',
      'phone-a-ready',
      'pa',
      now,
      'pa',
    );
    runtime.clearSurfaceReadiness('phone-a');
    expect(runtime.areAllRequiredSurfacesReady()).toBe(false);
    runtime.recordSurfaceReady(
      'answering',
      'phone-c',
      'phone-c-ready',
      'pc',
      now,
      'pc',
    );
    runtime.recordSurfaceReady(
      'decision',
      'phone-b',
      'phone-b-ready',
      'pb',
      now,
      'pb',
    );
    expect(runtime.areAllRequiredSurfacesReady()).toBe(true);
    runtime.activatePresentation('activate', 'controller', now);
    expect(
      JSON.parse(
        String(
          runtime.serialize().runtimeState.presentationReadyParticipantIdsJson,
        ),
      ),
    ).toEqual(['pc', 'pb']);
    runtime.recordSurfaceReady(
      'answering',
      'reconnect-phone',
      'reconnect-ready',
      'pc',
      now,
      'pc',
    );
    runtime.clearSurfaceReadiness('reconnect-phone');
    runtime.clearSurfaceReadiness('phone-c');
    expect(
      JSON.parse(
        String(
          runtime.serialize().runtimeState.presentationReadyParticipantIdsJson,
        ),
      ),
    ).toEqual(['pb']);
  });

  it('starts the discussion clock only at presentation activation', () => {
    const activated = ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.activatePresentation!(
      initial(),
      new Date('2026-01-01T00:00:10Z'),
      context('pa'),
    ) as GameplayModeState;
    expect(activated.phase).toBe('open');
    expect(activated.deadlineAt).toBe('2026-01-01T00:00:40.000Z');
  });

  it('does not permit blind submissions when the bounded Fair-Start fallback activated without a ready phone', () => {
    const activated = ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.activatePresentation!(
      initial(),
      new Date('2026-01-01T00:00:00Z'),
      { ...context('pa'), presentationReadyParticipantIds: [] },
    ) as GameplayModeState;
    expect(() => command(activated, 'claim-odd-piece-hotspot')).toThrow(
      'Only an acknowledged answer surface may submit',
    );
  });

  it('claims atomically, gives the owner a separate five-second answer window, and awards the correct team', () => {
    const open = {
      ...initial(),
      phase: 'open',
      deadlineAt: '2026-01-01T00:00:30.000Z',
    };
    const claimed = command(open, 'claim-odd-piece-hotspot').runtimeState;
    expect(claimed.answerOwnerTeamId).toBe('t1');
    expect(claimed.deadlineAt).toBe('2026-01-01T00:00:05.000Z');
    const resolved = command(
      claimed,
      'submit-odd-piece-hotspot',
      { x: 0.5, y: 0.5 },
      'pa',
    ).runtimeState;
    expect(resolved.phase).toBe('revealed');
    expect(JSON.parse(String(resolved.resultsJson))[0].winnerTeamId).toBe('t1');
    expect(JSON.stringify(resolved)).not.toContain('0.5');
  });

  it('hands a wrong attempt to the opponent, gives each team one attempt, and resolves zero if both fail', () => {
    const open = {
      ...initial(),
      phase: 'open',
      deadlineAt: '2026-01-01T00:00:30.000Z',
    };
    const claimed = command(open, 'claim-odd-piece-hotspot').runtimeState;
    const handed = command(
      claimed,
      'submit-odd-piece-hotspot',
      { x: 0.1, y: 0.1 },
      'pa',
    ).runtimeState;
    expect(handed.phase).toBe('answering');
    expect(handed.answerOwnerTeamId).toBe('t2');
    expect(handed.deadlineAt).toBe('2026-01-01T00:00:05.000Z');
    const resolved = command(
      handed,
      'submit-odd-piece-hotspot',
      { x: 0.1, y: 0.1 },
      'pb',
    ).runtimeState;
    expect(resolved.phase).toBe('revealed');
    expect(JSON.parse(String(resolved.resultsJson))[0].winnerTeamId).toBeNull();
    expect(JSON.parse(String(resolved.attemptsJson))).toEqual([
      { teamId: 't1', correct: false, outcome: 'wrong' },
      { teamId: 't2', correct: false, outcome: 'wrong' },
    ]);
  });

  it('rejects malformed, out-of-range and duplicate coordinate submissions', () => {
    const open = {
      ...initial(),
      phase: 'open',
      deadlineAt: '2026-01-01T00:00:30.000Z',
    };
    const claimed = command(open, 'claim-odd-piece-hotspot').runtimeState;
    expect(() =>
      command(claimed, 'submit-odd-piece-hotspot', { x: 2, y: 0.5 }),
    ).toThrow();
    const wrong = command(claimed, 'submit-odd-piece-hotspot', {
      x: 0.1,
      y: 0.1,
    }).runtimeState;
    expect(() =>
      command(wrong, 'submit-odd-piece-hotspot', { x: 0.1, y: 0.1 }, 'pa'),
    ).toThrow();
    expect(() =>
      command(wrong, 'submit-odd-piece-hotspot', { x: 0.5 }),
    ).toThrow();
  });

  it('gives the opponent an independent window after a timeout and awards no-claim timeout zero', () => {
    const open = {
      ...initial(),
      phase: 'open',
      deadlineAt: '2026-01-01T00:00:30.000Z',
    };
    const noClaim = command(
      open,
      'expire-odd-piece-hotspot-discussion',
      {},
      'pa',
      new Date('2026-01-01T00:00:30.001Z'),
    ).runtimeState;
    expect(JSON.parse(String(noClaim.resultsJson))[0].attempts).toEqual([]);
    const claimed = command(open, 'claim-odd-piece-hotspot').runtimeState;
    const handed = command(
      claimed,
      'expire-odd-piece-hotspot-answer',
      {},
      'pa',
      new Date('2026-01-01T00:00:05.001Z'),
    ).runtimeState;
    expect(handed.phase).toBe('answering');
    expect(handed.answerOwnerTeamId).toBe('t2');
    expect(handed.deadlineAt).toBe('2026-01-01T00:00:10.001Z');
  });

  it('keeps the hotspot, original and identities private until reveal and never stores wrong coordinates', () => {
    const open = {
      ...initial(),
      phase: 'open',
      deadlineAt: '2026-01-01T00:00:30.000Z',
    };
    const live = ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.projectRuntimeState(open);
    expect(live).toHaveProperty('modifiedImageJson');
    expect(live).not.toHaveProperty('revealJson');
    expect(JSON.stringify(live)).not.toContain('bmw-m4-g82');
    expect(JSON.stringify(live)).not.toContain('original.jpg');
    const claimed = command(open, 'claim-odd-piece-hotspot').runtimeState;
    const wrong = command(claimed, 'submit-odd-piece-hotspot', {
      x: 0.1,
      y: 0.1,
    }).runtimeState;
    expect(JSON.stringify(wrong)).not.toContain('0.1');
    const reveal = JSON.parse(
      String(
        ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.projectRuntimeState({
          ...wrong,
          phase: 'revealed',
          resultsJson: JSON.stringify([
            {
              puzzleIndex: 0,
              contentItemId: 'p1',
              winnerTeamId: null,
              attempts: [{ teamId: 't1', correct: false, outcome: 'wrong' }],
            },
          ]),
        }).revealJson,
      ),
    );
    expect(reveal.hotspot.polygon).toHaveLength(4);
    expect(reveal.targetVehicleIdentity).toBe('bmw-m4-g82');
  });
});
