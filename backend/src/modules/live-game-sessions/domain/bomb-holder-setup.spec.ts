import { BOMB_GAMEPLAY_PLUGIN } from './bomb-gameplay.plugin';
import {
  BOMB_CHOOSE_HOLDER_COMMAND,
  BOMB_START_COMMAND,
  BombHolderSetup,
  bombHolderChooser,
  isBombHolderSetupComplete,
} from './bomb-holder-setup';

/**
 * Bomb's initial holders (approved): the lobby captain chooses the team's
 * holder before the challenge starts; a team without a captain gets one from
 * the rotation; neither clock starts until both teams have one. After that,
 * Bomb is unchanged — the handoff just lands on the receiving team's holder
 * while they are connected.
 */
describe('Bomb initial holder setup', () => {
  const A = 'team-a';
  const B = 'team-b';
  const ROSTER = [
    { participantId: 'a1', teamId: A, connected: true },
    { participantId: 'a2', teamId: A, connected: true },
    { participantId: 'b1', teamId: B, connected: true },
    { participantId: 'b2', teamId: B, connected: true },
  ];
  const items = [
    {
      prompt: 'س١',
      imageUrl: '/a.webp',
      altText: 'a',
      acceptedAnswers: ['ميسي'],
    },
    {
      prompt: 'س٢',
      imageUrl: '/b.webp',
      altText: 'b',
      acceptedAnswers: ['رونالدو'],
    },
  ];
  const setup = (
    over: Partial<Record<string, string | null>> = {},
    startedAt?: string,
  ): BombHolderSetup => ({
    ...(startedAt ? { startedAt } : {}),
    teams: [
      {
        teamId: A,
        captainParticipantId: 'a2',
        holderParticipantId: over[A] ?? null,
        autoAssigned: false,
      },
      {
        teamId: B,
        captainParticipantId: null,
        holderParticipantId: 'b1',
        autoAssigned: true,
      },
    ],
  });
  const runtime = (holders?: BombHolderSetup) => ({
    phase: 'ready',
    questionIndex: 0,
    questionsJson: JSON.stringify([{ id: 'q1', prompt: 'س١', items }]),
    ...(holders ? { holderSetupJson: JSON.stringify(holders) } : {}),
  });
  const round = {
    phase: 'presenting',
    questionId: 'q1',
    prompt: 'س١',
    itemIndex: 0,
    itemCount: 2,
    imageUrl: '/a.webp',
    altText: 'a',
    answersJson: JSON.stringify(['ميسي']),
  };
  const send = (
    type: string,
    payload: Record<string, unknown>,
    state: Record<string, unknown>,
    submitter?: string,
    roster = ROSTER,
    activeTeamId = A,
  ) =>
    BOMB_GAMEPLAY_PLUGIN.handleCommand(
      {
        sessionId: 's',
        runtimeId: 'r',
        activeTeamId,
        eligibleParticipants: roster,
        ...(submitter ? { submitterParticipantId: submitter } : {}),
      } as never,
      { type, payload, runtimeState: state, roundState: round } as never,
    );
  const holdersOf = (state: Record<string, unknown>) =>
    (JSON.parse(String(state.holderSetupJson)) as BombHolderSetup).teams.map(
      (team) => team.holderParticipantId,
    );

  const start = (state: Record<string, unknown>) =>
    send(BOMB_START_COMMAND, {}, state, undefined);
  const STARTED = '2026-11-15T12:00:00.000Z';

  it('holds activation until both teams are ready AND the host starts', () => {
    const held = BOMB_GAMEPLAY_PLUGIN.presentationActivationHeld!;
    expect(held(runtime(setup()))).toBe(true);
    // READY is not started: the last choice enables Start and nothing else.
    expect(held(runtime(setup({ [A]: 'a1' })))).toBe(true);
    expect(held(runtime(setup({ [A]: 'a1' }, STARTED)))).toBe(false);
    // A runtime launched before holders existed is never held.
    expect(held(runtime())).toBe(false);
  });

  it('counts the screen wait from the host’s Start, not from launch', () => {
    const from = BOMB_GAMEPLAY_PLUGIN.presentationBarrierStartedAt!;
    expect(from(runtime(setup({ [A]: 'a1' })))).toBeUndefined();
    expect(from(runtime(setup({ [A]: 'a1' }, STARTED)))).toBe(STARTED);
  });

  it('shows the setup, and nothing else, while held', () => {
    const shown = BOMB_GAMEPLAY_PLUGIN.projectPresentationPreparation!(
      runtime(setup()),
    );
    expect(Object.keys(shown)).toEqual(['holderSetupJson']);
    expect(String(shown.holderSetupJson)).not.toContain('ميسي');
  });

  it('lets the captain choose a teammate, or themselves', () => {
    const teammate = send(
      BOMB_CHOOSE_HOLDER_COMMAND,
      { participantId: 'a1' },
      runtime(setup()),
      'a2',
    );
    expect(holdersOf(teammate.runtimeState)).toEqual(['a1', 'b1']);
    const self = send(
      BOMB_CHOOSE_HOLDER_COMMAND,
      { participantId: 'a2' },
      runtime(setup()),
      'a2',
    );
    expect(holdersOf(self.runtimeState)).toEqual(['a2', 'b1']);
  });

  it('makes the team READY on the last choice — and starts nothing', () => {
    const ready = send(
      BOMB_CHOOSE_HOLDER_COMMAND,
      { participantId: 'a1' },
      runtime(setup()),
      'a2',
    );
    expect(isBombHolderSetupComplete(ready.runtimeState)).toBe(true);
    expect(ready.activatePresentationIfReady).toBeUndefined();
    expect(ready.assignment).toBeUndefined();
    expect(ready.effects).toEqual([]);
    expect(ready.eventPayload).toMatchObject({ ready: true });
  });

  it('lets a READY captain change the choice until Start', () => {
    const changed = send(
      BOMB_CHOOSE_HOLDER_COMMAND,
      { participantId: 'a2' },
      runtime(setup({ [A]: 'a1' })),
      'a2',
    );
    expect(holdersOf(changed.runtimeState)).toEqual(['a2', 'b1']);
  });

  it('starts on the host’s Start, with the starting team’s initial holder', () => {
    const started = start(runtime(setup({ [A]: 'a1' })));
    expect(started.activatePresentationIfReady).toBe(true);
    expect(started.assignment).toEqual({ teamId: A, participantId: 'a1' });
    expect(started.effects).toEqual([]);
    const after = JSON.parse(
      String(started.runtimeState.holderSetupJson),
    ) as BombHolderSetup;
    expect(after.startedAt).toBeTruthy();
    expect(after.teams[0].initialTurnTaken).toBe(true);
    expect(after.teams[1].initialTurnTaken).toBeUndefined();
  });

  it('refuses a premature Start and a duplicate one', () => {
    expect(() => start(runtime(setup()))).toThrow(
      expect.objectContaining({ code: 'BOMB_HOLDERS_NOT_READY' }),
    );
    const started = start(runtime(setup({ [A]: 'a1' }))).runtimeState;
    expect(() => start(started)).toThrow(
      expect.objectContaining({ code: 'BOMB_ALREADY_STARTED' }),
    );
    // A legacy runtime has nothing to start.
    expect(() => start(runtime())).toThrow(
      expect.objectContaining({ code: 'BOMB_START_NOT_AVAILABLE' }),
    );
  });

  it('declares Start as the host’s command', () => {
    expect(BOMB_GAMEPLAY_PLUGIN.command(BOMB_START_COMMAND)).toMatchObject({
      authorization: 'controller',
    });
  });

  it('refuses a teammate who is not the captain', () => {
    expect(() =>
      send(
        BOMB_CHOOSE_HOLDER_COMMAND,
        { participantId: 'a1' },
        runtime(setup()),
        'a1',
      ),
    ).toThrow(expect.objectContaining({ code: 'BOMB_NOT_HOLDER_CHOOSER' }));
  });

  it('refuses the other team and a team whose holder was auto-assigned', () => {
    expect(() =>
      send(
        BOMB_CHOOSE_HOLDER_COMMAND,
        { participantId: 'b2' },
        runtime(setup()),
        'b1',
      ),
    ).toThrow(expect.objectContaining({ code: 'BOMB_HOLDER_AUTO_ASSIGNED' }));
  });

  it('refuses a holder from another team, or one who is away', () => {
    expect(() =>
      send(
        BOMB_CHOOSE_HOLDER_COMMAND,
        { participantId: 'b1' },
        runtime(setup()),
        'a2',
      ),
    ).toThrow(expect.objectContaining({ code: 'BOMB_HOLDER_NOT_ELIGIBLE' }));
    const a1Away = ROSTER.map((p) =>
      p.participantId === 'a1' ? { ...p, connected: false } : p,
    );
    expect(() =>
      send(
        BOMB_CHOOSE_HOLDER_COMMAND,
        { participantId: 'a1' },
        runtime(setup()),
        'a2',
        a1Away,
      ),
    ).toThrow(expect.objectContaining({ code: 'BOMB_HOLDER_NOT_ELIGIBLE' }));
  });

  it('lets a teammate choose while the captain is away, without changing the captain', () => {
    const captainAway = ROSTER.map((p) =>
      p.participantId === 'a2' ? { ...p, connected: false } : p,
    );
    expect(bombHolderChooser(setup().teams[0], captainAway)).toBe('a1');
    const chosen = send(
      BOMB_CHOOSE_HOLDER_COMMAND,
      { participantId: 'a1' },
      runtime(setup()),
      'a1',
      captainAway,
    );
    const team = (
      JSON.parse(String(chosen.runtimeState.holderSetupJson)) as BombHolderSetup
    ).teams[0];
    expect(team).toMatchObject({
      captainParticipantId: 'a2',
      holderParticipantId: 'a1',
    });
  });

  it('waits safely while a whole captain team is offline: nobody chooses, nothing starts', () => {
    const teamAway = ROSTER.map((p) =>
      p.teamId === A ? { ...p, connected: false } : p,
    );
    expect(bombHolderChooser(setup().teams[0], teamAway)).toBeUndefined();
    // No player of the other team, nor anyone else, may choose for it.
    for (const who of ['a1', 'a2', 'b1']) {
      expect(() =>
        send(
          BOMB_CHOOSE_HOLDER_COMMAND,
          { participantId: 'b1' },
          runtime(setup()),
          who,
          teamAway,
        ),
      ).toThrow();
    }
    // The host cannot start around it, and play stays held.
    expect(() => start(runtime(setup()))).toThrow(
      expect.objectContaining({ code: 'BOMB_HOLDERS_NOT_READY' }),
    );
    expect(
      BOMB_GAMEPLAY_PLUGIN.presentationActivationHeld!(runtime(setup())),
    ).toBe(true);
    // The first teammate back may choose.
    const a1Back = teamAway.map((p) =>
      p.participantId === 'a1' ? { ...p, connected: true } : p,
    );
    expect(bombHolderChooser(setup().teams[0], a1Back)).toBe('a1');
  });

  it('fixes the initial holders once started', () => {
    expect(() =>
      send(
        BOMB_CHOOSE_HOLDER_COMMAND,
        { participantId: 'a2' },
        runtime(setup({ [A]: 'a1' }, STARTED)),
        'a2',
      ),
    ).toThrow(expect.objectContaining({ code: 'BOMB_HOLDER_SETUP_CLOSED' }));
  });

  it('refuses answers, skips and expiry until the host has started', () => {
    for (const state of [runtime(setup()), runtime(setup({ [A]: 'a1' }))]) {
      for (const [type, payload] of [
        ['submit-answer', { answer: 'ميسي' }],
        ['skip', {}],
        ['expire-team', {}],
      ] as const) {
        expect(() => send(type, payload, state, 'a1')).toThrow(
          expect.objectContaining({ code: 'BOMB_NOT_STARTED' }),
        );
      }
    }
  });

  describe('after Start: initial holder on first arrival only', () => {
    const playing = () => start(runtime(setup({ [A]: 'a1' }))).runtimeState;

    it('gives the bomb’s first arrival at a team to its initial holder', () => {
      const correct = send(
        'submit-answer',
        { answer: 'ميسي' },
        playing(),
        'a1',
      );
      expect(correct.effects).toContainEqual(
        expect.objectContaining({ type: 'switch-active-team' }),
      );
      expect(correct.assignment).toEqual({ teamId: B, participantId: 'b1' });
    });

    it('never forces a later arrival back to the initial holder', () => {
      // Team B has already had its first arrival.
      const afterB = send(
        'submit-answer',
        { answer: 'ميسي' },
        playing(),
        'a1',
      ).runtimeState;
      // Back to team A: its first turn was taken at Start, so existing rules decide.
      const toA = send(
        'submit-answer',
        { answer: 'رونالدو' },
        afterB,
        'b1',
        ROSTER,
        B,
      );
      expect(toA.assignment).toBeUndefined();
      // And to team B again: existing rules decide here too.
      const toB = send(
        'submit-answer',
        { answer: 'ميسي' },
        toA.runtimeState,
        'a2',
      );
      expect(toB.assignment).toBeUndefined();
    });

    it('falls back to the existing rule when the initial holder is away', () => {
      const b1Away = ROSTER.map((p) =>
        p.participantId === 'b1' ? { ...p, connected: false } : p,
      );
      const correct = send(
        'submit-answer',
        { answer: 'ميسي' },
        playing(),
        'a1',
        b1Away,
      );
      expect(correct.assignment).toBeUndefined();
    });

    it('never moves the bomb on a wrong answer or a skip', () => {
      expect(
        send('submit-answer', { answer: 'خطأ' }, playing(), 'a1').assignment,
      ).toBeUndefined();
      const skipped = send('skip', {}, playing(), 'a1');
      expect(skipped.assignment).toBeUndefined();
      // The skip penalty is the existing one.
      expect(skipped.effects).toContainEqual({
        type: 'adjust-active-team-time',
        deltaMs: -5000,
      });
    });
  });
});
