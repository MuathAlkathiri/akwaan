import { resolveUnifiedBombRepresentative } from './start-bomb-from-content.use-case';
import { resolveGameplayRoundParticipant } from './gameplay-runtime.lifecycle';

const player = (overrides: Record<string, unknown> = {}) => ({
  id: 'player-a',
  role: 'team-player',
  teamId: 'team-a',
  ready: false,
  connected: true,
  ...overrides,
});

describe('Bomb gameplay round representative resolution', () => {
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
