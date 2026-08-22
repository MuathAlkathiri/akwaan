import {
  findEligibleTeamParticipant,
  isEligibleTeamParticipant,
} from './team-participant-eligibility';

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: 'player-a',
  role: 'team-player',
  teamId: 'team-a',
  ready: false,
  connected: true,
  ...overrides,
});

describe('team participant eligibility', () => {
  const unified = {
    teamId: 'team-a',
    requiresConnectedPresence: true,
  };

  it('accepts a connected assigned Unified Match player without persisted ready', () => {
    expect(isEligibleTeamParticipant(candidate(), unified)).toBe(true);
  });

  it.each([
    ['disconnected', { connected: false }],
    ['wrong team', { teamId: 'team-b' }],
    ['removed', { removedAt: new Date() }],
    ['observer', { role: 'observer' }],
    ['controller', { role: 'controller' }],
  ])('rejects %s participants', (_label, overrides) => {
    expect(isEligibleTeamParticipant(candidate(overrides), unified)).toBe(
      false,
    );
  });

  it('accepts a reconnected ready=false player from current presence', () => {
    const stale = candidate({ connected: false });
    const reconnected = { ...stale, connected: true };
    expect(findEligibleTeamParticipant([reconnected], unified)?.id).toBe(
      'player-a',
    );
  });

  it('preserves the standalone Bomb explicit-ready requirement', () => {
    const standalone = { ...unified, requiresReady: true };
    expect(isEligibleTeamParticipant(candidate(), standalone)).toBe(false);
    expect(
      isEligibleTeamParticipant(candidate({ ready: true }), standalone),
    ).toBe(true);
  });
});
