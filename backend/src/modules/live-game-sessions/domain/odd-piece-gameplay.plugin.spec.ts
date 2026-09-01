import {
  ODD_PIECE_GAMEPLAY_PLUGIN,
  OddPiecePuzzle,
  validateOddPiecePuzzle,
} from './odd-piece-gameplay.plugin';
import { GameplayModeState } from './gameplay-mode.plugin';

const puzzle = (id: string): OddPiecePuzzle => ({
  id,
  prompt: 'اختر القطعة الدخيلة',
  pieces: [
    {
      id: 'a',
      imageUrl: 'https://test/a.jpg',
      vehicleIdentity: 'target',
      vehicleLabel: 'BMW M4',
    },
    {
      id: 'b',
      imageUrl: 'https://test/b.jpg',
      vehicleIdentity: 'target',
      vehicleLabel: 'BMW M4',
    },
    {
      id: 'c',
      imageUrl: 'https://test/c.jpg',
      vehicleIdentity: 'target',
      vehicleLabel: 'BMW M4',
    },
    {
      id: 'd',
      imageUrl: 'https://test/d.jpg',
      vehicleIdentity: 'odd',
      vehicleLabel: 'AMG C63',
    },
  ],
  targetVehicleIdentity: 'target',
  targetVehicleLabel: 'BMW M4',
  targetReveal: { imageUrl: 'https://test/bmw-m4.jpg' },
});
const initial = (): GameplayModeState => ({
  phase: 'preparing',
  puzzlesJson: JSON.stringify([puzzle('p1'), puzzle('p2'), puzzle('p3')]),
  teamIdsJson: JSON.stringify(['t1', 't2']),
  currentPuzzleIndex: 0,
  attemptsJson: '[]',
  failedTeamIdsJson: '[]',
  resultsJson: '[]',
  deadlineAt: null,
  answerOwnerTeamId: null,
  openSeconds: 30,
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
    { participantId: 'p1', teamId: 't1', connected: true },
    { participantId: 'p1b', teamId: 't1', connected: true },
    { participantId: 'p2', teamId: 't2', connected: true },
  ],
});
const command = (state: GameplayModeState, type: string, payload = {}) =>
  ODD_PIECE_GAMEPLAY_PLUGIN.handleCommand(
    context(type === 'claim2' ? 'p2' : 'p1'),
    {
      type: type === 'claim2' ? 'claim-odd-piece' : type,
      payload,
      runtimeState: state,
      roundState: { phase: state.phase, puzzleIndex: state.currentPuzzleIndex },
    },
  );

describe('Odd Piece gameplay', () => {
  it('accepts exactly a three-plus-one visual identity split', () => {
    expect(validateOddPiecePuzzle(puzzle('p'))).toBeDefined();
    expect(() =>
      validateOddPiecePuzzle({
        ...puzzle('p'),
        pieces: puzzle('p').pieces.slice(0, 3),
      }),
    ).toThrow();
    expect(() =>
      validateOddPiecePuzzle({
        ...puzzle('p'),
        pieces: puzzle('p').pieces.map((p) => ({
          ...p,
          vehicleIdentity: 'same',
        })),
      }),
    ).toThrow();
    expect(() =>
      validateOddPiecePuzzle({
        ...puzzle('p'),
        pieces: puzzle('p').pieces.map((p, i) => ({
          ...p,
          vehicleIdentity: i < 2 ? 'x' : 'y',
        })),
      }),
    ).toThrow();
  });

  it('anchors the implementation window only at presentation activation', () => {
    const activated = ODD_PIECE_GAMEPLAY_PLUGIN.activatePresentation!(
      initial(),
      new Date('2026-01-01T00:00:10Z'),
      context('p1'),
    ) as Record<string, unknown>;
    expect(activated.phase).toBe('open');
    expect(activated.deadlineAt).toBe('2026-01-01T00:00:40.000Z');
  });

  it('gives one team ownership and hands the same puzzle to the opponent after a wrong selection', () => {
    const open = {
      ...initial(),
      phase: 'open',
      deadlineAt: '2026-01-01T00:00:30Z',
    };
    const claimed = command(open, 'claim-odd-piece').runtimeState;
    expect(claimed.answerOwnerTeamId).toBe('t1');
    const wrong = command(claimed, 'submit-odd-piece', {
      pieceId: 'a',
    }).runtimeState;
    expect(wrong.phase).toBe('selecting');
    expect(wrong.answerOwnerTeamId).toBe('t2');
    expect(() => command(wrong, 'claim-odd-piece')).toThrow();
    const opponentCorrect = ODD_PIECE_GAMEPLAY_PLUGIN.handleCommand(
      context('p2'),
      {
        type: 'submit-odd-piece',
        payload: { pieceId: 'd' },
        runtimeState: wrong,
        roundState: { phase: wrong.phase },
      },
    ).runtimeState;
    expect(
      JSON.parse(String(opponentCorrect.resultsJson))[0].winnerTeamId,
    ).toBe('t2');
  });

  it('rejects unauthorized actors and duplicate teammate claims after ownership commits', () => {
    const open = { ...initial(), phase: 'open' };
    expect(() =>
      ODD_PIECE_GAMEPLAY_PLUGIN.handleCommand(context('outsider'), {
        type: 'claim-odd-piece',
        payload: {},
        runtimeState: open,
        roundState: { phase: open.phase },
      }),
    ).toThrow('Only an eligible competing player may act');
    const claimed = command(open, 'claim-odd-piece').runtimeState;
    expect(() =>
      ODD_PIECE_GAMEPLAY_PLUGIN.handleCommand(context('p1b'), {
        type: 'claim-odd-piece',
        payload: {},
        runtimeState: claimed,
        roundState: { phase: claimed.phase },
      }),
    ).toThrow('The claim race is closed');
  });

  it('resolves two wrong attempts with no winner and locks the failed team out', () => {
    const open = { ...initial(), phase: 'open' };
    const claimed = command(open, 'claim-odd-piece').runtimeState;
    const handedOff = command(claimed, 'submit-odd-piece', {
      pieceId: 'a',
    }).runtimeState;
    expect(() =>
      ODD_PIECE_GAMEPLAY_PLUGIN.handleCommand(context('p1'), {
        type: 'submit-odd-piece',
        payload: { pieceId: 'd' },
        runtimeState: handedOff,
        roundState: { phase: handedOff.phase },
      }),
    ).toThrow();
    const resolved = ODD_PIECE_GAMEPLAY_PLUGIN.handleCommand(context('p2'), {
      type: 'submit-odd-piece',
      payload: { pieceId: 'b' },
      runtimeState: handedOff,
      roundState: { phase: handedOff.phase },
    }).runtimeState;
    expect(JSON.parse(String(resolved.resultsJson))[0].winnerTeamId).toBeNull();
  });

  it('never projects grading identities before reveal and keeps committed ordering on reconnect', () => {
    const open = { ...initial(), phase: 'open' };
    const first = ODD_PIECE_GAMEPLAY_PLUGIN.projectRuntimeState(open);
    const second = ODD_PIECE_GAMEPLAY_PLUGIN.projectRuntimeState(open);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain('vehicleIdentity');
    expect(JSON.stringify(first)).not.toContain('targetVehicleIdentity');
    expect(first).not.toHaveProperty('revealJson');
    const phone = ODD_PIECE_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(open, {
      controller: false,
      teamId: 't1',
    });
    expect(String(phone.piecesJson)).not.toContain('imageUrl');
    expect(JSON.parse(String(phone.piecesJson))).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
    ]);
  });

  it('resolves once, prepares a fresh generation, and completes after puzzle three', () => {
    let state: GameplayModeState = {
      ...initial(),
      phase: 'open',
      deadlineAt: '2026-01-01T00:00:30Z',
    };
    state = command(state, 'claim-odd-piece').runtimeState;
    state = command(state, 'submit-odd-piece', { pieceId: 'd' }).runtimeState;
    expect(JSON.parse(String(state.resultsJson))).toHaveLength(1);
    const advanced = command(state, 'advance-odd-piece');
    expect(advanced.prepareNextPresentation).toBe(true);
    expect(advanced.runtimeState.currentPuzzleIndex).toBe(1);
  });
});
