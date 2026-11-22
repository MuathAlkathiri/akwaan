import {
  EKSHIFNI_GAMEPLAY_PLUGIN,
  EKSHIFNI_REGION_COUNT,
  EKSHIFNI_REVEAL_ACTION,
  EkshifniRuntimeImage,
  ekshifniAnswerAction,
} from './ekshifni-gameplay.plugin';
import { GameplayModeState } from './gameplay-mode.plugin';
import {
  assignNextTeamActionOrHold,
  buildTeamRotations,
  createTeamActionAssignmentState,
  serializeTeamActionAssignments,
  TeamActionAssignmentState,
} from './team-action-assignment';
import {
  ContentMediaType,
  EKSHIFNI_REGION_ROLES,
} from '../../world-content/domain/world-content.constants';

/**
 * Which phone carries each right in «اكشفني».
 *
 * The mechanic splits two permissions: choosing what to uncover belongs to
 * whoever holds initiative, while answering is open to both eligible teams at
 * once. Those are different shapes, so they get different assignments — one
 * reveal turn, and one answer right per team.
 *
 * The race between the teams is deliberately untouched. Two captains still
 * race each other; what ends is four phones on one team racing one another and
 * the room arguing about which tap counted.
 */
const A = 'team-a';
const B = 'team-b';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const ROSTER = [
  { participantId: 'a1', teamId: A, connected: true },
  { participantId: 'a2', teamId: A, connected: true },
  { participantId: 'b1', teamId: B, connected: true },
  { participantId: 'b2', teamId: B, connected: true },
];

const region = (index: number) => ({
  id: `r${index + 1}`,
  role: EKSHIFNI_REGION_ROLES[index],
  shape: { x: index * 0.15, y: 0.1, width: 0.12, height: 0.2 },
});

const image = (id: string): EkshifniRuntimeImage => ({
  contentItemId: id,
  identity: 'فيروز',
  prompt: { ar: 'من هذا المشهور؟' },
  media: {
    type: ContentMediaType.IMAGE,
    assets: [{ url: `https://cdn.example/${id}.jpg`, altText: 'صورة' }],
  } as EkshifniRuntimeImage['media'],
  acceptedAnswers: ['فيروز'],
  regions: Array.from({ length: EKSHIFNI_REGION_COUNT }, (_, i) => region(i)),
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
  const open = (teamId: string, action: string) => {
    assignments = assignNextTeamActionOrHold(assignments, {
      teamId,
      action,
      participants: ROSTER,
      now: NOW,
    }).state;
  };
  open(A, EKSHIFNI_REVEAL_ACTION);
  open(A, ekshifniAnswerAction(A));
  open(B, ekshifniAnswerAction(B));
  return serializeTeamActionAssignments(assignments);
};

const playing = (over: Partial<GameplayModeState> = {}): GameplayModeState => ({
  challengeId: 'c',
  worldId: 'w',
  slotKey: 'slot_1',
  imagesJson: JSON.stringify([image('i1'), image('i2'), image('i3')]),
  teamIdsJson: JSON.stringify([A, B]),
  selectingTeamId: A,
  currentImageIndex: 0,
  phase: 'playing',
  revealedRegionIdsJson: '[]',
  attemptsJson: '[]',
  resultsJson: '[]',
  initiativeTeamId: A,
  answerPenaltyTeamId: null,
  deadlineAt: new Date(NOW.getTime() + 180_000).toISOString(),
  teamActionJson: turns({ [A]: 'a1', [B]: 'b1' }),
  ...over,
});

const send = (
  state: GameplayModeState,
  type: string,
  participantId: string,
  payload: Record<string, unknown> = {},
) =>
  EKSHIFNI_GAMEPLAY_PLUGIN.handleCommand(
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

describe('اكشفني — who may act', () => {
  describe('uncovering', () => {
    it('lets the captain of the team holding initiative reveal', () => {
      const next = send(playing(), 'reveal-ekshifni-region', 'a1', {
        regionId: 'r1',
      });
      expect(String(next.runtimeState.revealedRegionIdsJson)).toContain('r1');
    });

    it('refuses a teammate of the team holding initiative', () => {
      expect(() =>
        send(playing(), 'reveal-ekshifni-region', 'a2', { regionId: 'r1' }),
      ).toThrow(
        expect.objectContaining({ code: 'TEAM_ACTION_WRONG_PARTICIPANT' }),
      );
    });

    it('still refuses the team without initiative', () => {
      // Initiative is the older rule and it stands ahead of this one.
      expect(() =>
        send(playing(), 'reveal-ekshifni-region', 'b1', { regionId: 'r1' }),
      ).toThrow(expect.objectContaining({ code: 'EKSHIFNI_NOT_YOUR_TURN' }));
    });
  });

  describe('answering', () => {
    it('lets either captain answer — the race between teams stands', () => {
      expect(() =>
        send(playing(), 'submit-ekshifni', 'a1', { answer: 'خطأ' }),
      ).not.toThrow();
      expect(() =>
        send(playing(), 'submit-ekshifni', 'b1', { answer: 'خطأ' }),
      ).not.toThrow();
    });

    it('refuses a teammate on either side', () => {
      for (const phone of ['a2', 'b2']) {
        expect(() =>
          send(playing(), 'submit-ekshifni', phone, { answer: 'خطأ' }),
        ).toThrow(
          expect.objectContaining({ code: 'TEAM_ACTION_WRONG_PARTICIPANT' }),
        );
      }
    });
  });

  describe('without a captain', () => {
    it('still names one phone per team', () => {
      const state = playing({ teamActionJson: turns() });
      expect(() =>
        send(state, 'reveal-ekshifni-region', 'a1', { regionId: 'r1' }),
      ).not.toThrow();
      expect(() =>
        send(state, 'reveal-ekshifni-region', 'a2', { regionId: 'r1' }),
      ).toThrow();
    });
  });

  describe('a Match that started before this existed', () => {
    it('keeps the old team-wide rule rather than breaking', () => {
      const legacy = playing();
      delete legacy.teamActionJson;
      expect(() =>
        send(legacy, 'reveal-ekshifni-region', 'a2', { regionId: 'r1' }),
      ).not.toThrow();
    });
  });
});
