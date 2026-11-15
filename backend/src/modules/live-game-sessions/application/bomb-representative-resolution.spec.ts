import { resolveUnifiedBombRepresentative } from './start-bomb-from-content.use-case';
import { resolveGameplayRoundParticipant } from './gameplay-runtime.lifecycle';
import { resolveGameplayCommandRepresentative } from './submit-gameplay-command.use-case';

const player = (overrides: Record<string, unknown> = {}) => ({
  id: 'player-a',
  role: 'team-player',
  teamId: 'team-a',
  ready: false,
  connected: true,
  ...overrides,
});

describe('Bomb gameplay round representative resolution', () => {
  it('keeps the same ready=false Unified representative after a command', () => {
    expect(
      resolveGameplayCommandRepresentative(
        {
          activeTeamId: 'team-a',
          participants: [player()],
        } as never,
        'bomb',
      ),
    ).toBe('player-a');
  });

  it('keeps the current owner through a command, ahead of a teammate listed first', () => {
    // The reconnected previous owner is listed first and connected again. The
    // owner who took over while they were away keeps the bomb: a wrong answer
    // is not a reason to hand it back.
    expect(
      resolveGameplayCommandRepresentative(
        {
          activeTeamId: 'team-a',
          participants: [player(), player({ id: 'player-b' })],
        } as never,
        'bomb',
        'player-b',
      ),
    ).toBe('player-b');
  });

  it('falls back to the first eligible player once the owner cannot hold it', () => {
    const state = (owner: Record<string, unknown>) =>
      ({
        activeTeamId: 'team-a',
        participants: [player(), player({ id: 'player-b', ...owner })],
      }) as never;
    // Disconnected, or on the other team because the turn just passed.
    expect(
      resolveGameplayCommandRepresentative(
        state({ connected: false }),
        'bomb',
        'player-b',
      ),
    ).toBe('player-a');
    expect(
      resolveGameplayCommandRepresentative(
        state({ teamId: 'team-b' }),
        'bomb',
        'player-b',
      ),
    ).toBe('player-a');
  });

  it('leaves every other mechanic on the first-eligible rule', () => {
    expect(
      resolveGameplayCommandRepresentative(
        {
          activeTeamId: 'team-a',
          participants: [
            player({ ready: true }),
            player({ id: 'player-b', ready: true }),
          ],
        } as never,
        'closest',
        'player-b',
      ),
    ).toBe('player-a');
  });

  it('revalidates an explicit Unified representative without requiring ready', () => {
    expect(
      resolveGameplayRoundParticipant([player()], {
        teamId: 'team-a',
        modeKey: 'bomb',
        explicitParticipantId: 'player-a',
      })?.id,
    ).toBe('player-a');
  });

  it('rejects an explicit disconnected representative', () => {
    expect(
      resolveGameplayRoundParticipant([player({ connected: false })], {
        teamId: 'team-a',
        modeKey: 'bomb',
        explicitParticipantId: 'player-a',
      }),
    ).toBeUndefined();
  });

  it('keeps ready=true mandatory for the generic legacy Bomb fallback', () => {
    expect(
      resolveGameplayRoundParticipant([player()], {
        teamId: 'team-a',
        modeKey: 'bomb',
      }),
    ).toBeUndefined();
    expect(
      resolveGameplayRoundParticipant([player({ ready: true })], {
        teamId: 'team-a',
        modeKey: 'bomb',
      })?.id,
    ).toBe('player-a');
  });
});

describe('Unified Match Bomb representative resolution', () => {
  it('selects a connected assigned ready=false participant', () => {
    expect(resolveUnifiedBombRepresentative([player()], 'team-a')?.id).toBe(
      'player-a',
    );
  });

  it.each([
    ['disconnected', { connected: false }],
    ['wrong team', { teamId: 'team-b' }],
    ['removed', { removedAt: new Date() }],
    ['observer', { role: 'observer' }],
    ['controller', { role: 'controller' }],
  ])('rejects %s participants', (_label, overrides) => {
    expect(
      resolveUnifiedBombRepresentative([player(overrides)], 'team-a'),
    ).toBeUndefined();
  });

  it('uses current connected presence after reconnect without changing ready', () => {
    const reconnected = player({ connected: true, ready: false });
    expect(resolveUnifiedBombRepresentative([reconnected], 'team-a')?.id).toBe(
      'player-a',
    );
  });
});
