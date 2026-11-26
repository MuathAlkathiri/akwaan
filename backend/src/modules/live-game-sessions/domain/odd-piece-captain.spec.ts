import {
  ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN,
  OddPieceHotspotPuzzle,
  oddPieceAction,
} from './odd-piece-hotspot-gameplay.plugin';
import { GameplayModeState } from './gameplay-mode.plugin';
import {
  assignNextTeamActionOrHold,
  assignmentFor,
  buildTeamRotations,
  createTeamActionAssignmentState,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
  TeamActionAssignmentState,
} from './team-action-assignment';
import { ContentMediaType } from '../../world-content/domain/world-content.constants';

/**
 * Which phone presses «جاوب» and makes the tap in «القطعة الدخيلة».
 *
 * A team's decision is one phone's: the captain if the team chose one,
 * otherwise the turn rotates per picture. The race between the two teams is
 * untouched — what ends is two phones of the same team pressing at once.
 */
const A = 't1';
const B = 't2';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const ROSTER = [
  { participantId: 'a1', teamId: A, connected: true },
  { participantId: 'a2', teamId: A, connected: true },
  { participantId: 'b1', teamId: B, connected: true },
  { participantId: 'b2', teamId: B, connected: true },
];

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
  prompt: 'وين القطعة الدخيلة؟',
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

const turns = (captains?: Record<string, string>) => {
  let assignments: TeamActionAssignmentState = createTeamActionAssignmentState(
    buildTeamRotations({
      teams: [A, B],
      participants: ROSTER,
      randomIndex: () => 0,
      ...(captains ? { captains } : {}),
    }),
  );
  for (const teamId of [A, B])
    assignments = assignNextTeamActionOrHold(assignments, {
      teamId,
      action: oddPieceAction(teamId),
      participants: ROSTER,
      now: NOW,
    }).state;
  return serializeTeamActionAssignments(assignments);
};

const open = (over: Partial<GameplayModeState> = {}): GameplayModeState => ({
  phase: 'open',
  puzzlesJson: JSON.stringify([puzzle('p1'), puzzle('p2'), puzzle('p3')]),
  teamIdsJson: JSON.stringify([A, B]),
  requiredPresentationTeamIdsJson: JSON.stringify([A, B]),
  presentationReadyParticipantIdsJson: JSON.stringify(['a1', 'a2', 'b1', 'b2']),
  currentPuzzleIndex: 0,
  attemptsJson: '[]',
  resultsJson: '[]',
  deadlineAt: new Date(NOW.getTime() + 30_000).toISOString(),
  answerOwnerTeamId: null,
  discussionSeconds: 30,
  answerSeconds: 5,
  teamActionJson: turns({ [A]: 'a1', [B]: 'b1' }),
  ...over,
});

const send = (
  state: GameplayModeState,
  type: string,
  participantId: string,
  payload: Record<string, unknown> = {},
) =>
  ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.handleCommand(
    {
      sessionId: 's',
      runtimeId: 'r',
      now: NOW,
      submitterParticipantId: participantId,
      eligibleParticipants: ROSTER,
    } as never,
    {
      type,
      payload: payload as GameplayModeState,
      runtimeState: state,
      roundState: { phase: state.phase },
    },
  );

const holderOf = (state: GameplayModeState, teamId: string) =>
  assignmentFor(
    parseTeamActionAssignments(state.teamActionJson),
    oddPieceAction(teamId),
  )?.participantId;

describe('القطعة الدخيلة — who may act', () => {
  it('lets the captain press «جاوب»', () => {
    const next = send(open(), 'claim-odd-piece-hotspot', 'a1').runtimeState;
    expect(next.phase).toBe('answering');
    expect(next.answerOwnerTeamId).toBe(A);
  });

  it('refuses a teammate who is not the captain', () => {
    expect(() => send(open(), 'claim-odd-piece-hotspot', 'a2')).toThrow(
      /assigned player/,
    );
  });

  it('keeps the race between the two teams: either captain may claim', () => {
    expect(
      send(open(), 'claim-odd-piece-hotspot', 'b1').runtimeState
        .answerOwnerTeamId,
    ).toBe(B);
  });

  it('gives the tap to the same phone that claimed, and refuses its teammate', () => {
    const claimed = send(open(), 'claim-odd-piece-hotspot', 'a1').runtimeState;
    expect(() =>
      send(claimed, 'submit-odd-piece-hotspot', 'a2', { x: 0.5, y: 0.5 }),
    ).toThrow(/assigned player/);
    const tapped = send(claimed, 'submit-odd-piece-hotspot', 'a1', {
      x: 0.5,
      y: 0.5,
    }).runtimeState;
    expect(tapped.phase).toBe('revealed');
  });

  it('hands a missed picture to the other team’s captain only', () => {
    const claimed = send(open(), 'claim-odd-piece-hotspot', 'a1').runtimeState;
    const missed = send(claimed, 'submit-odd-piece-hotspot', 'a1', {
      x: 0.05,
      y: 0.05,
    }).runtimeState;
    expect(missed.answerOwnerTeamId).toBe(B);
    expect(() =>
      send(missed, 'submit-odd-piece-hotspot', 'b2', { x: 0.5, y: 0.5 }),
    ).toThrow(/assigned player/);
    expect(
      send(missed, 'submit-odd-piece-hotspot', 'b1', { x: 0.5, y: 0.5 })
        .runtimeState.phase,
    ).toBe('revealed');
  });

  it('lets a teammate stand in once a silent holder has had the turn', () => {
    const later = new Date(NOW.getTime() + 21_000);
    const result = ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.handleCommand(
      {
        sessionId: 's',
        runtimeId: 'r',
        now: later,
        submitterParticipantId: 'a2',
        eligibleParticipants: ROSTER,
      } as never,
      {
        type: 'claim-odd-piece-hotspot',
        payload: {},
        runtimeState: open(),
        roundState: { phase: 'open' },
      },
    );
    expect(result.runtimeState.answerOwnerTeamId).toBe(A);
  });

  describe('without a captain', () => {
    it('still names one phone per team, and rotates it per picture', () => {
      const state = open({ teamActionJson: turns() });
      const first = holderOf(state, A);
      expect(first).toBe('a1');
      expect(() => send(state, 'claim-odd-piece-hotspot', 'a2')).toThrow(
        /assigned player/,
      );
      const next = send(
        { ...state, phase: 'revealed', deadlineAt: null },
        'advance-odd-piece-hotspot',
        'a1',
      ).runtimeState;
      expect(next.currentPuzzleIndex).toBe(1);
      expect(holderOf(next, A)).toBe('a2');
      expect(holderOf(next, B)).toBe('b2');
    });
  });

  describe('with a captain', () => {
    it('keeps the captain across pictures', () => {
      const next = send(
        { ...open(), phase: 'revealed', deadlineAt: null },
        'advance-odd-piece-hotspot',
        'a1',
      ).runtimeState;
      expect(holderOf(next, A)).toBe('a1');
      expect(holderOf(next, B)).toBe('b1');
    });
  });

  describe('what each phone is told', () => {
    it('tells the holder it holds, and a teammate who does', () => {
      const project = (participantId: string) =>
        ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(open(), {
          controller: false,
          participantId,
          teamId: A,
        });
      expect(project('a1').isAssignedActor).toBe(true);
      expect(project('a2').isAssignedActor).toBe(false);
      expect(project('a2').assignedParticipantId).toBe('a1');
      expect(typeof project('a2').standInAt).toBe('string');
    });
  });

  describe('a Match that started before this existed', () => {
    it('keeps the old team-wide rule rather than breaking', () => {
      const legacy = open();
      delete legacy.teamActionJson;
      expect(
        send(legacy, 'claim-odd-piece-hotspot', 'a2').runtimeState
          .answerOwnerTeamId,
      ).toBe(A);
    });
  });
});
