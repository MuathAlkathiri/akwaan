import { TeamClock } from './team-clock';

describe('TeamClock', () => {
  const start = new Date('2026-01-01T00:00:00.000Z');

  it('derives elapsed time without mutating persisted consumption', () => {
    const clock = TeamClock.create(10_000);
    clock.start(start);
    expect(clock.remainingMs(new Date(start.getTime() + 2_500))).toBe(7_500);
    expect(clock.serialize().consumedMs).toBe(0);
  });

  it('preserves consumption across pause and resume', () => {
    const clock = TeamClock.create(10_000);
    clock.start(start);
    clock.pause(new Date(start.getTime() + 2_000));
    expect(clock.remainingMs(new Date(start.getTime() + 8_000))).toBe(8_000);
    clock.resume(new Date(start.getTime() + 8_000));
    expect(clock.remainingMs(new Date(start.getTime() + 9_500))).toBe(6_500);
  });

  it('applies adjustments and clamps at zero', () => {
    const clock = TeamClock.create(10_000);
    clock.adjust(-20_000, start);
    expect(clock.remainingMs(start)).toBe(0);
    expect(clock.isExpired(start)).toBe(true);
  });
});
