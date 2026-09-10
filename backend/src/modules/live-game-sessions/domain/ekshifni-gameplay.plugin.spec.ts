import {
  EKSHIFNI_GAMEPLAY_PLUGIN,
  EKSHIFNI_REGION_COUNT,
  EkshifniImageResult,
  EkshifniRuntimeImage,
  ekshifniOpeningTeam,
  ekshifniValue,
  validateEkshifniImage,
} from './ekshifni-gameplay.plugin';
import { GameplayModeState } from './gameplay-mode.plugin';
import {
  ContentMediaType,
  EKSHIFNI_REGION_ROLES,
} from '../../world-content/domain/world-content.constants';

/**
 * "اكشفني", tested for the two rights it splits.
 *
 * The mechanic is only interesting because *choosing what to uncover* and
 * *being allowed to answer* are different permissions held by possibly different
 * teams at the same instant. Most of what follows is about keeping them apart,
 * and about the picture staying a picture: the celebrity's name, the accepted
 * answers, and even the shape of a mask nobody has taken must not be readable
 * from anything a client is handed.
 */

const A = 'team-a';
const B = 'team-b';
const NOW = new Date('2026-01-01T00:00:00.000Z');

const region = (index: number) => ({
  id: `r${index + 1}`,
  role: EKSHIFNI_REGION_ROLES[index],
  shape: { x: index * 0.15, y: 0.1, width: 0.12, height: 0.2 },
});

const image = (id: string, identity = 'فيروز'): EkshifniRuntimeImage => ({
  contentItemId: id,
  identity,
  prompt: { ar: 'من هذا المشهور؟' },
  media: {
    type: ContentMediaType.IMAGE,
    assets: [{ url: `https://cdn.example/${id}.jpg`, altText: 'صورة' }],
  } as EkshifniRuntimeImage['media'],
  acceptedAnswers: [identity, 'fairuz'],
  regions: Array.from({ length: EKSHIFNI_REGION_COUNT }, (_, i) => region(i)),
});

const initial = (over: Partial<GameplayModeState> = {}): GameplayModeState => ({
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
  ...over,
});

const context = (participantId: string, now = NOW) => ({
  sessionId: 's',
  runtimeId: 'r',
  submitterParticipantId: participantId,
  now,
  eligibleParticipants: [
    { participantId: 'pa', teamId: A, connected: true },
    { participantId: 'pb', teamId: B, connected: true },
  ],
});

const PHONE = { pa: A, pb: B } as const;

const run = (
  state: GameplayModeState,
  type: string,
  participantId: keyof typeof PHONE = 'pa',
  payload: Record<string, unknown> = {},
  now = NOW,
) =>
  EKSHIFNI_GAMEPLAY_PLUGIN.handleCommand(context(participantId, now), {
    type,
    payload: payload as GameplayModeState,
    runtimeState: state,
    roundState: { phase: state.phase, imageIndex: state.currentImageIndex },
  });

const reveal = (
  state: GameplayModeState,
  regionId: string,
  who: keyof typeof PHONE = 'pa',
) => run(state, 'reveal-ekshifni-region', who, { regionId }).runtimeState;

const answer = (
  state: GameplayModeState,
  text: string,
  who: keyof typeof PHONE = 'pa',
  now = NOW,
) => run(state, 'submit-ekshifni', who, { answer: text }, now).runtimeState;

const forActor = (state: GameplayModeState, teamId: string) =>
  EKSHIFNI_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(state, {
    teamId,
    participantId: teamId === A ? 'pa' : 'pb',
  } as never);

const shared = (state: GameplayModeState) =>
  EKSHIFNI_GAMEPLAY_PLUGIN.projectRuntimeState(state);

describe('اكشفني value ladder', () => {
  it('starts at 5 and drops one per reveal', () => {
    expect([0, 1, 2, 3, 4].map(ekshifniValue)).toEqual([5, 4, 3, 2, 1]);
  });

  it('keeps the sixth region worth taking by flooring at 1', () => {
    // The floor is the point: a team that has spent everything still has a move.
    expect(ekshifniValue(5)).toBe(1);
    expect(ekshifniValue(EKSHIFNI_REGION_COUNT)).toBe(1);
  });

  it('charges the value at the moment of the answer, not the moment of launch', () => {
    let state = initial();
    state = reveal(state, 'r1');
    state = reveal(state, 'r2');
    const resolved = answer(state, 'فيروز');
    const result = JSON.parse(String(resolved.resultsJson))[0];
    expect(result.value).toBe(3);
    expect(result.points).toEqual({ [A]: 3, [B]: 0 });
  });
});

describe('اكشفني opening initiative', () => {
  it('opens A → B → A across the three images', () => {
    expect([0, 1, 2].map((i) => ekshifniOpeningTeam([A, B], A, i))).toEqual([
      A,
      B,
      A,
    ]);
  });

  it('hands image 2 to the opponent when the image advances', () => {
    const resolved = answer(initial(), 'فيروز');
    const next = run(resolved, 'advance-ekshifni').runtimeState;
    expect(next.currentImageIndex).toBe(1);
    expect(next.initiativeTeamId).toBe(B);
    // A fresh Fair-Start generation, hidden and clockless until the room is ready.
    expect(next.phase).toBe('preparing');
    expect(next.deadlineAt).toBeNull();
    expect(run(resolved, 'advance-ekshifni').prepareNextPresentation).toBe(
      true,
    );
  });
});

describe('اكشفني reveal is gated by initiative alone', () => {
  it('lets only the initiative team uncover a region', () => {
    expect(() => reveal(initial(), 'r1', 'pb')).toThrow(
      expect.objectContaining({ code: 'EKSHIFNI_NOT_YOUR_TURN' }),
    );
  });

  it('rejects a region that is already uncovered', () => {
    const state = reveal(initial(), 'r1');
    expect(() => reveal(state, 'r1')).toThrow(
      expect.objectContaining({ code: 'EKSHIFNI_REGION_ALREADY_REVEALED' }),
    );
    // And the board is unchanged by the rejected attempt.
    expect(JSON.parse(String(state.revealedRegionIdsJson))).toEqual(['r1']);
  });

  it('rejects a region id that is not on this image', () => {
    expect(() => reveal(initial(), 'r99')).toThrow(
      expect.objectContaining({ code: 'EKSHIFNI_UNKNOWN_REGION' }),
    );
  });

  it('lets the sixth region be taken, at value 1', () => {
    let state = initial();
    for (const id of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) {
      state = reveal(state, id);
    }
    expect(JSON.parse(String(state.revealedRegionIdsJson))).toHaveLength(6);
    expect(shared(state).currentValue).toBe(1);
  });
});

describe('اكشفني answering is an open race', () => {
  it('lets the team without initiative answer', () => {
    // Initiative is A's; B may still answer, and does.
    const resolved = answer(initial(), 'فيروز', 'pb');
    expect(resolved.phase).toBe('resolved');
    expect(JSON.parse(String(resolved.resultsJson))[0].winnerTeamId).toBe(B);
  });

  it('accepts any authored alias through the canonical normalizer', () => {
    const resolved = answer(initial(), '  Fairuz ', 'pb');
    expect(resolved.phase).toBe('resolved');
  });
});

describe('اكشفني wrong answer costs the turn, not the game', () => {
  it('parks the answering team and hands initiative over', () => {
    const state = answer(initial(), 'أم كلثوم');
    expect(state.answerPenaltyTeamId).toBe(A);
    expect(state.initiativeTeamId).toBe(B);
    // Still playable, and the celebrity is not disclosed by being wrong.
    expect(state.phase).toBe('playing');
    expect(JSON.stringify(shared(state))).not.toContain('فيروز');
  });

  it('refuses a second answer from the parked team', () => {
    const state = answer(initial(), 'أم كلثوم');
    expect(() => answer(state, 'فيروز')).toThrow(
      expect.objectContaining({ code: 'EKSHIFNI_ANSWER_NOT_ELIGIBLE' }),
    );
  });

  it('restores eligibility after the opponent reveals', () => {
    let state = answer(initial(), 'أم كلثوم');
    state = reveal(state, 'r1', 'pb');
    expect(state.answerPenaltyTeamId).toBeNull();
    expect(answer(state, 'فيروز').phase).toBe('resolved');
  });

  it('restores eligibility after the opponent answers wrongly too', () => {
    // One *action*, not one correct action — otherwise two wrong answers would
    // leave both teams waiting on each other with the image frozen.
    let state = answer(initial(), 'أم كلثوم');
    state = answer(state, 'نانسي', 'pb');
    expect(state.answerPenaltyTeamId).toBe(B);
    expect(state.initiativeTeamId).toBe(A);
    expect(answer(state, 'فيروز').phase).toBe('resolved');
  });

  it('eliminates nobody: a team may lose an image and still win the next', () => {
    let state = answer(initial(), 'أم كلثوم');
    state = answer(state, 'فيروز', 'pb');
    state = run(state, 'advance-ekshifni').runtimeState;
    state = { ...state, phase: 'playing' };
    const resolved = answer(state, 'فيروز');
    const results = JSON.parse(
      String(resolved.resultsJson),
    ) as EkshifniImageResult[];
    expect(results.map((r) => r.winnerTeamId)).toEqual([B, A]);
  });

  it('clears the penalty at the image boundary', () => {
    let state = answer(initial(), 'أم كلثوم');
    state = answer(state, 'فيروز', 'pb');
    expect(state.answerPenaltyTeamId).toBeNull();
    expect(
      run(state, 'advance-ekshifni').runtimeState.answerPenaltyTeamId,
    ).toBeNull();
  });
});

describe('اكشفني resolution and convergence', () => {
  it('records every attempt in order, with its outcome', () => {
    let state = answer(initial(), 'أم كلثوم');
    state = answer(state, 'فيروز', 'pb');
    const result = JSON.parse(String(state.resultsJson))[0];
    expect(result.attempts).toEqual([
      { teamId: A, answer: 'أم كلثوم', correct: false },
      { teamId: B, answer: 'فيروز', correct: true },
    ]);
  });

  it('rewards nobody when the safety deadline ends the image', () => {
    const late = new Date(NOW.getTime() + 200_000);
    const state = run(
      initial(),
      'expire-ekshifni-image',
      'pa',
      {},
      late,
    ).runtimeState;
    const result = JSON.parse(String(state.resultsJson))[0];
    expect(result.resolvedBy).toBe('timeout');
    expect(result.winnerTeamId).toBeNull();
    expect(result.points).toEqual({ [A]: 0, [B]: 0 });
    // The identity still reaches the room, through the ordinary reveal.
    expect(result.identity).toBe('فيروز');
  });

  it('refuses to expire an image whose clock is still running', () => {
    expect(() => run(initial(), 'expire-ekshifni-image')).toThrow(
      expect.objectContaining({ code: 'EKSHIFNI_NOT_EXPIRED' }),
    );
  });

  it('completes once, after the third image, with the mechanic totals', () => {
    let state = initial();
    for (let index = 0; index < 3; index += 1) {
      state = answer({ ...state, phase: 'playing' }, 'فيروز', 'pa');
      state = run(state, 'advance-ekshifni').runtimeState;
    }
    expect(state.phase).toBe('completed');
    expect(JSON.parse(String(state.resultJson))).toEqual({
      winnerTeamId: A,
      tie: false,
      points: { [A]: 15, [B]: 0 },
    });
    // Terminal is terminal: nothing may advance past it.
    expect(() => run(state, 'advance-ekshifni')).toThrow(
      expect.objectContaining({ code: 'EKSHIFNI_NOT_RESOLVED' }),
    );
  });

  it('burns only the images actually put on screen', () => {
    const presented = EKSHIFNI_GAMEPLAY_PLUGIN.presentedContentItemIds!({
      runtimeState: initial(),
      roundState: {},
      orderedContentItemIds: [],
    });
    expect(presented).toEqual(['i1']);
  });
});

describe('اكشفني shows the picture and hides everything else', () => {
  it('never projects the celebrity, the aliases, or a role', () => {
    const state = reveal(initial(), 'r1');
    for (const projection of [shared(state), forActor(state, A)]) {
      const text = JSON.stringify(projection);
      expect(text).not.toContain('فيروز');
      expect(text).not.toContain('fairuz');
      for (const role of EKSHIFNI_REGION_ROLES) {
        expect(text).not.toContain(role);
      }
    }
  });

  it('gives the shared board every mask box, numbered 1..6', () => {
    // The board draws six masks and prints a number on each, so it needs all six
    // boxes from the first frame. A rectangle says where a mask sits, never what
    // is under it — and the role, which would say, is not sent to anyone.
    const regions = JSON.parse(String(shared(initial()).regionsJson));
    expect(regions).toHaveLength(EKSHIFNI_REGION_COUNT);
    expect(regions.map((r: { number: number }) => r.number)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(regions.every((r: { shape?: unknown }) => r.shape)).toBe(true);
    expect(regions[0]).toMatchObject({
      number: 1,
      revealed: false,
      shape: { x: 0, y: 0.1, width: 0.12, height: 0.2 },
    });
  });

  it('marks an uncovered region as uncovered without moving its box', () => {
    const state = reveal(initial(), 'r1');
    const sharedRegions = JSON.parse(String(shared(state).regionsJson));
    expect(sharedRegions[0]).toMatchObject({ number: 1, revealed: true });
    expect(sharedRegions[0].shape).toEqual({
      x: 0,
      y: 0.1,
      width: 0.12,
      height: 0.2,
    });
    expect(sharedRegions[1]).toMatchObject({ number: 2, revealed: false });
  });

  it('gives a phone the numbers and never a box', () => {
    // A phone renders no picture, so a mask box would be geometry it has no use
    // for and no business holding.
    const state = reveal(initial(), 'r1');
    const phoneRegions = JSON.parse(String(forActor(state, A).regionsJson));
    expect(phoneRegions).toHaveLength(EKSHIFNI_REGION_COUNT);
    expect(phoneRegions[0]).toEqual({ id: 'r1', number: 1, revealed: true });
    expect(phoneRegions.every((r: { shape?: unknown }) => !r.shape)).toBe(true);
  });

  it('sends the picture to the shared screen and never to a phone', () => {
    const state = initial();
    expect(String(shared(state).imageMediaJson)).toContain('i1.jpg');
    expect(forActor(state, A).imageMediaJson).toBeNull();
  });

  it('withholds the picture entirely until Fair-Start activation', () => {
    const preparing = initial({ phase: 'preparing', deadlineAt: null });
    expect(shared(preparing).imageMediaJson).toBeUndefined();
    expect(JSON.stringify(shared(preparing))).not.toContain('i1.jpg');
  });

  it('tells each phone which of its two rights are live', () => {
    const state = answer(initial(), 'أم كلثوم');
    // A answered wrongly: it lost both the turn and, for now, its eligibility.
    expect(forActor(state, A)).toMatchObject({
      canReveal: false,
      canAnswer: false,
    });
    // B holds initiative and was never parked.
    expect(forActor(state, B)).toMatchObject({
      canReveal: true,
      canAnswer: true,
    });
  });

  it('holds the identity back until the image is terminal', () => {
    const open = initial();
    expect(shared(open).revealJson).toBeUndefined();
    const resolved = answer(open, 'فيروز');
    expect(String(shared(resolved).revealJson)).toContain('فيروز');
  });

  it('keeps an unresolved image out of the results projection', () => {
    let state = answer(initial(), 'فيروز');
    state = run(state, 'advance-ekshifni').runtimeState;
    const results = JSON.parse(String(shared(state).resultsJson));
    // Image 1 is finished and safe to show whole; image 2 is only an index.
    expect(results[0].identity).toBe('فيروز');
    expect(state.currentImageIndex).toBe(1);
  });
});

describe('اكشفني Fair-Start', () => {
  it('activates into play and anchors the safety clock to activation', () => {
    const activated = EKSHIFNI_GAMEPLAY_PLUGIN.activatePresentation!(
      initial({ phase: 'preparing', deadlineAt: null }),
      NOW,
      context('pa') as never,
    ) as GameplayModeState;
    expect(activated.phase).toBe('playing');
    expect(activated.deadlineAt).toBe(
      new Date(NOW.getTime() + 180_000).toISOString(),
    );
  });

  it('requires the shared surface, and only the shared surface', () => {
    expect(
      EKSHIFNI_GAMEPLAY_PLUGIN.requiredPresentationSurfaces!({
        runtimeState: initial(),
        roundState: {},
      }),
    ).toEqual([{ capability: 'shared' }]);
  });

  it('leaves an already-playing image alone', () => {
    const state = initial();
    expect(
      EKSHIFNI_GAMEPLAY_PLUGIN.activatePresentation!(
        state,
        new Date(NOW.getTime() + 5_000),
        context('pa') as never,
      ),
    ).toBe(state);
  });

  it('refuses a reveal or an answer before the picture is up', () => {
    const preparing = initial({ phase: 'preparing', deadlineAt: null });
    expect(() => reveal(preparing, 'r1')).toThrow(
      expect.objectContaining({ code: 'EKSHIFNI_IMAGE_CLOSED' }),
    );
    expect(() => answer(preparing, 'فيروز')).toThrow(
      expect.objectContaining({ code: 'EKSHIFNI_IMAGE_CLOSED' }),
    );
  });
});

describe('اكشفني reconnect preserves the board exactly', () => {
  it('re-projects the same masks, value, initiative and penalty', () => {
    let state = answer(initial(), 'أم كلثوم');
    state = reveal(state, 'r1', 'pb');
    state = reveal(state, 'r2', 'pb');
    // Whatever a client does, the projection is recomputed from committed state:
    // the same reveals, no replay, and nothing silently re-hidden.
    const first = forActor(state, A);
    const second = forActor(
      EKSHIFNI_GAMEPLAY_PLUGIN.validateRuntimeState(state),
      A,
    );
    expect(second).toEqual(first);
    expect(JSON.parse(String(first.revealedRegionIdsJson))).toEqual([
      'r1',
      'r2',
    ]);
    expect(first.currentValue).toBe(3);
    expect(first.initiativeTeamId).toBe(B);
    expect(first.answerPenaltyTeamId).toBeNull();
  });
});

describe('اكشفني content contract', () => {
  it('demands exactly six regions', () => {
    const short = image('i1');
    short.regions = short.regions.slice(0, 5);
    expect(() => validateEkshifniImage(short)).toThrow(
      expect.objectContaining({ code: 'EKSHIFNI_CONTENT_INVALID' }),
    );
  });

  it('demands unique stable region ids', () => {
    const duplicated = image('i1');
    duplicated.regions[1] = { ...duplicated.regions[1], id: 'r1' };
    expect(() => validateEkshifniImage(duplicated)).toThrow(
      expect.objectContaining({ code: 'EKSHIFNI_CONTENT_INVALID' }),
    );
  });

  it('demands geometry in image fractions that stays inside the image', () => {
    const spilling = image('i1');
    spilling.regions[0] = {
      ...spilling.regions[0],
      shape: { x: 0.9, y: 0.1, width: 0.5, height: 0.2 },
    };
    expect(() => validateEkshifniImage(spilling)).toThrow(
      expect.objectContaining({ code: 'EKSHIFNI_CONTENT_INVALID' }),
    );
    const pixels = image('i1');
    pixels.regions[0] = {
      ...pixels.regions[0],
      shape: { x: 240, y: 120, width: 80, height: 90 },
    };
    expect(() => validateEkshifniImage(pixels)).toThrow(
      expect.objectContaining({ code: 'EKSHIFNI_CONTENT_INVALID' }),
    );
  });

  it('demands three images and two teams', () => {
    expect(() =>
      EKSHIFNI_GAMEPLAY_PLUGIN.validateRuntimeState(
        initial({ imagesJson: JSON.stringify([image('i1'), image('i2')]) }),
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_EKSHIFNI_STATE' }));
  });

  it('refuses an initiative that names a team outside the match', () => {
    expect(() =>
      EKSHIFNI_GAMEPLAY_PLUGIN.validateRuntimeState(
        initial({ initiativeTeamId: 'team-c' }),
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_EKSHIFNI_STATE' }));
  });
});
