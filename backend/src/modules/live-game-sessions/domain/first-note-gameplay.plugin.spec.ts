import {
  FIRST_NOTE_GAMEPLAY_PLUGIN,
  FirstNoteRuntimeSong,
  firstNoteReward,
  validateFirstNoteSong,
} from './first-note-gameplay.plugin';
import { GameplayModeState } from './gameplay-mode.plugin';
import {
  ContentMediaType,
  FIRST_NOTE_ANSWER_SECONDS,
} from '../../world-content/domain/world-content.constants';

const song = (id: string): FirstNoteRuntimeSong => ({
  contentItemId: id,
  title: 'الأماكن',
  acceptedAnswers: ['الأماكن', 'al amaken'],
  contextualClue: { ar: 'أغنية خليجية من التسعينات' },
  clueLabel: { ar: 'الحقبة' },
  audio: {
    type: ContentMediaType.AUDIO,
    assets: [{ url: `https://cdn/${id}.mp3` }],
  },
});
const initial = (): GameplayModeState => ({
  songsJson: JSON.stringify([song('s1'), song('s2'), song('s3')]),
  teamIdsJson: JSON.stringify(['t1', 't2']),
  currentSongIndex: 0,
  phase: 'preparing',
  biddingTeamId: 't1',
  currentBidSeconds: null,
  currentBidTeamId: null,
  answerOwnerTeamId: null,
  finalBidSeconds: null,
  bidHistoryJson: '[]',
  resultsJson: '[]',
  deadlineAt: null,
  answerWindowSeconds: FIRST_NOTE_ANSWER_SECONDS,
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
const run = (
  state: GameplayModeState,
  type: string,
  participantId = 'p1',
  payload: Record<string, unknown> = {},
  now = new Date('2026-01-01T00:00:00Z'),
) =>
  FIRST_NOTE_GAMEPLAY_PLUGIN.handleCommand(context(participantId, now), {
    type,
    payload: payload as GameplayModeState,
    runtimeState: state,
    roundState: { phase: state.phase },
  });
const auction = () =>
  FIRST_NOTE_GAMEPLAY_PLUGIN.activatePresentation!(
    initial(),
    new Date(),
    context('p1'),
  ) as GameplayModeState;

describe('First Note content and rewards', () => {
  it('requires clue, title, accepted answers, and canonical audio', () => {
    expect(validateFirstNoteSong(song('x'))).toBeDefined();
    expect(() =>
      validateFirstNoteSong({ ...song('x'), contextualClue: { ar: '' } }),
    ).toThrow();
    expect(() =>
      validateFirstNoteSong({
        ...song('x'),
        audio: { type: ContentMediaType.IMAGE, assets: [] },
      }),
    ).toThrow();
  });
  it.each([
    [1, 3],
    [3, 3],
    [4, 2],
    [7, 2],
    [8, 1],
    [15, 1],
  ])('maps %s seconds to %s points', (seconds, points) =>
    expect(firstNoteReward(seconds)).toBe(points),
  );
});

describe('First Note auction', () => {
  it('does not begin before Fair-Start and activation opens the auction', () => {
    expect(initial().phase).toBe('preparing');
    expect(auction().phase).toBe('auction');
  });
  it('accepts a direct numeric drop, alternates teams, and first teammate write consumes the turn', () => {
    const a = run(auction(), 'submit-first-note-bid', 'p1b', {
      seconds: 15,
    }).runtimeState;
    expect(a).toMatchObject({
      currentBidSeconds: 15,
      currentBidTeamId: 't1',
      biddingTeamId: 't2',
    });
    expect(() =>
      run(a, 'submit-first-note-bid', 'p1', { seconds: 14 }),
    ).toThrow(/turn/i);
    const b = run(a, 'submit-first-note-bid', 'p2', {
      seconds: 3,
    }).runtimeState;
    expect(b).toMatchObject({
      currentBidSeconds: 3,
      currentBidTeamId: 't2',
      biddingTeamId: 't1',
    });
  });
  it.each([0, 16, 1.5])('rejects invalid bid %s', (seconds) =>
    expect(() =>
      run(auction(), 'submit-first-note-bid', 'p1', { seconds }),
    ).toThrow(),
  );
  it('requires strictly lower bids', () => {
    const state = run(auction(), 'submit-first-note-bid', 'p1', {
      seconds: 9,
    }).runtimeState;
    expect(() =>
      run(state, 'submit-first-note-bid', 'p2', { seconds: 9 }),
    ).toThrow();
    expect(() =>
      run(state, 'submit-first-note-bid', 'p2', { seconds: 10 }),
    ).toThrow();
  });
  it('cannot pass before an opponent owns a bid or from the wrong team', () => {
    expect(() => run(auction(), 'pass-first-note-bid', 'p1')).toThrow();
    const state = run(auction(), 'submit-first-note-bid', 'p1', {
      seconds: 8,
    }).runtimeState;
    expect(() => run(state, 'pass-first-note-bid', 'p1')).toThrow();
  });
  it('pass gives the opposing lowest bidder priority and preserves exact duration', () => {
    const state = run(auction(), 'submit-first-note-bid', 'p1', {
      seconds: 4,
    }).runtimeState;
    const answer = run(state, 'pass-first-note-bid', 'p2').runtimeState;
    expect(answer).toMatchObject({
      phase: 'answering',
      answerOwnerTeamId: 't1',
      finalBidSeconds: 4,
    });
  });
});

describe('First Note answer, privacy, and progression', () => {
  const answering = () =>
    run(
      run(auction(), 'submit-first-note-bid', 'p1', { seconds: 2 })
        .runtimeState,
      'pass-first-note-bid',
      'p2',
    ).runtimeState;
  it('awards the frozen bid reward for a normalized correct title', () => {
    const state = run(answering(), 'submit-first-note-answer', 'p1b', {
      answer: 'الاماكن',
    }).runtimeState;
    expect(JSON.parse(String(state.resultsJson))[0].points).toEqual({
      t1: 3,
      t2: 0,
    });
  });
  it('wrong answer opens exactly one same-duration steal worth one', () => {
    const steal = run(answering(), 'submit-first-note-answer', 'p1', {
      answer: 'خطأ',
    }).runtimeState;
    expect(steal).toMatchObject({
      phase: 'steal',
      answerOwnerTeamId: 't2',
      finalBidSeconds: 2,
    });
    const result = run(steal, 'submit-first-note-answer', 'p2', {
      answer: 'الأماكن',
    }).runtimeState;
    expect(JSON.parse(String(result.resultsJson))[0]).toMatchObject({
      stolen: true,
      points: { t1: 0, t2: 1 },
    });
    expect(() =>
      run(result, 'submit-first-note-answer', 'p2', { answer: 'الأماكن' }),
    ).toThrow();
  });
  it('phones never receive audio or answers while shared receives only current public audio', () => {
    const state = answering();
    const shared = FIRST_NOTE_GAMEPLAY_PLUGIN.projectRuntimeState(state);
    const phone = FIRST_NOTE_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
      state,
      { controller: false, participantId: 'p1', teamId: 't1' },
    );
    expect(shared.audioJson).toContain('s1.mp3');
    expect(phone.audioJson).toBeUndefined();
    expect(JSON.stringify(shared)).not.toContain('al amaken');
    expect(JSON.stringify(shared)).not.toContain('s2.mp3');
  });

  it('lets only the canonical shared surface preload the current song during the untimed auction', () => {
    const state = auction();
    const shared = FIRST_NOTE_GAMEPLAY_PLUGIN.projectRuntimeState(state);
    const phone = FIRST_NOTE_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
      state,
      { controller: false, participantId: 'p1', teamId: 't1' },
    );
    expect(shared.audioJson).toContain('s1.mp3');
    expect(shared.audioJson).not.toContain('s2.mp3');
    expect(phone.audioJson).toBeUndefined();
  });
  it('prepares a fresh presentation generation and permits a tied challenge', () => {
    let state = run(answering(), 'submit-first-note-answer', 'p1', {
      answer: 'الأماكن',
    }).runtimeState;
    state = run(state, 'advance-first-note').runtimeState;
    expect(state).toMatchObject({ phase: 'preparing', currentSongIndex: 1 });
  });
});
