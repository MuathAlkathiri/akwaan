import {
  FIRST_NOTE_GAMEPLAY_PLUGIN,
  FIRST_NOTE_TURN_ACTION,
  FirstNoteRuntimeSong,
} from './first-note-gameplay.plugin';
import { GameplayModeState } from './gameplay-mode.plugin';
import {
  assignmentFor,
  assignNextTeamActionOrHold,
  buildTeamRotations,
  createTeamActionAssignmentState,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
} from './team-action-assignment';
import {
  ContentMediaType,
  FIRST_NOTE_ANSWER_SECONDS,
} from '../../world-content/domain/world-content.constants';

/**
 * Who, on a team, may act in «من أول نغمة».
 *
 * The auction was already a strict team alternation, so the mechanic always
 * knew *which team* owed a decision. What it did not know was which phone —
 * so any of a team's four phones could fire a bid, and the room argued about
 * which one counted. The captain decides the bid and gives the answer; the
 * rotation supplies a stand-in only when there is no captain or the captain is
 * away.
 *
 * The race is untouched: this is about control, not about speed.
 */
const song = (id: string): FirstNoteRuntimeSong => ({
  contentItemId: id,
  title: 'الأماكن',
  acceptedAnswers: ['الأماكن'],
  contextualClue: { ar: 'أغنية خليجية' },
  clueLabel: { ar: 'الحقبة' },
  audio: {
    type: ContentMediaType.AUDIO,
    assets: [{ url: `https://cdn/${id}.mp3` }],
  },
});

const NOW = new Date('2026-08-18T00:00:00.000Z');
const TEAMS = ['t1', 't2'];
const ROSTER = [
  { participantId: 'p1', teamId: 't1', connected: true },
  { participantId: 'p1b', teamId: 't1', connected: true },
  { participantId: 'p2', teamId: 't2', connected: true },
  { participantId: 'p2b', teamId: 't2', connected: true },
];

const turnsFor = (captains?: Record<string, string>) =>
  serializeTeamActionAssignments(
    assignNextTeamActionOrHold(
      createTeamActionAssignmentState(
        buildTeamRotations({
          teams: TEAMS,
          participants: ROSTER,
          randomIndex: () => 0,
          ...(captains ? { captains } : {}),
        }),
      ),
      {
        teamId: 't1',
        action: FIRST_NOTE_TURN_ACTION,
        participants: ROSTER,
        now: NOW,
      },
    ).state,
  );

const auction = (over: GameplayModeState = {}): GameplayModeState => ({
  songsJson: JSON.stringify([song('s1'), song('s2'), song('s3')]),
  teamIdsJson: JSON.stringify(TEAMS),
  currentSongIndex: 0,
  phase: 'auction',
  biddingTeamId: 't1',
  currentBidSeconds: null,
  currentBidTeamId: null,
  answerOwnerTeamId: null,
  finalBidSeconds: null,
  bidHistoryJson: '[]',
  resultsJson: '[]',
  deadlineAt: null,
  answerWindowSeconds: FIRST_NOTE_ANSWER_SECONDS,
  teamActionJson: turnsFor({ t1: 'p1', t2: 'p2' }),
  ...over,
});

const send = (
  state: GameplayModeState,
  type: string,
  participantId: string,
  payload: Record<string, unknown> = {},
) =>
  FIRST_NOTE_GAMEPLAY_PLUGIN.handleCommand(
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

const holder = (state: GameplayModeState) =>
  assignmentFor(
    parseTeamActionAssignments(String(state.teamActionJson)),
    FIRST_NOTE_TURN_ACTION,
  );

describe('من أول نغمة — who may act', () => {
  describe('the auction', () => {
    it('lets the captain bid', () => {
      const next = send(auction(), 'submit-first-note-bid', 'p1', {
        seconds: 10,
      });
      expect(next.runtimeState.currentBidTeamId).toBe('t1');
    });

    it('refuses a teammate who is not holding the turn', () => {
      // This is the whole point: four phones, one bid.
      expect(() =>
        send(auction(), 'submit-first-note-bid', 'p1b', { seconds: 10 }),
      ).toThrow(
        expect.objectContaining({ code: 'TEAM_ACTION_WRONG_PARTICIPANT' }),
      );
    });

    it('moves the turn to the other team’s captain after a bid', () => {
      const next = send(auction(), 'submit-first-note-bid', 'p1', {
        seconds: 10,
      });
      expect(next.runtimeState.biddingTeamId).toBe('t2');
      expect(holder(next.runtimeState)).toMatchObject({
        teamId: 't2',
        participantId: 'p2',
      });
    });

    it('refuses the opposing team outright', () => {
      expect(() =>
        send(auction(), 'submit-first-note-bid', 'p2', { seconds: 10 }),
      ).toThrow();
    });
  });

  describe('the answer', () => {
    /** t1 opened, t2 passed, so t1 owns the answer. */
    const answering = () => {
      const bid = send(auction(), 'submit-first-note-bid', 'p1', {
        seconds: 10,
      });
      return send(bid.runtimeState, 'pass-first-note-bid', 'p2').runtimeState;
    };

    it('hands the answer to the captain who won the bid', () => {
      const state = answering();
      expect(state.phase).toBe('answering');
      expect(state.answerOwnerTeamId).toBe('t1');
      expect(holder(state)).toMatchObject({
        teamId: 't1',
        participantId: 'p1',
      });
    });

    it('refuses a teammate of the answer owner', () => {
      // The captain bid for this answer, so the captain gives it.
      expect(() =>
        send(answering(), 'submit-first-note-answer', 'p1b', {
          answer: 'الأماكن',
        }),
      ).toThrow(
        expect.objectContaining({ code: 'TEAM_ACTION_WRONG_PARTICIPANT' }),
      );
    });

    it('lets the captain answer', () => {
      const next = send(answering(), 'submit-first-note-answer', 'p1', {
        answer: 'الأماكن',
      });
      expect(next.runtimeState.phase).not.toBe('answering');
    });
  });

  describe('without a captain', () => {
    it('still names one phone, and refuses the others', () => {
      const state = auction({ teamActionJson: turnsFor() });
      const named = holder(state)!.participantId;
      const other = ROSTER.filter(
        (p) => p.teamId === 't1' && p.participantId !== named,
      )[0].participantId;
      expect(
        send(state, 'submit-first-note-bid', named, { seconds: 10 })
          .runtimeState.currentBidTeamId,
      ).toBe('t1');
      expect(() =>
        send(state, 'submit-first-note-bid', other, { seconds: 10 }),
      ).toThrow();
    });
  });

  describe('a Match that started before this existed', () => {
    it('keeps the old team-wide rule rather than breaking', () => {
      // No `teamActionJson`: a runtime mid-flight when this landed must not
      // become unplayable.
      const legacy = auction();
      delete legacy.teamActionJson;
      expect(
        send(legacy, 'submit-first-note-bid', 'p1b', { seconds: 10 })
          .runtimeState.currentBidTeamId,
      ).toBe('t1');
    });
  });
});
