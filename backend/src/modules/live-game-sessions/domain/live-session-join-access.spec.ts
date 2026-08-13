import {
  generateJoinCode,
  LiveSessionJoinAccess,
  normalizeJoinCode,
} from './live-session-join-access';

describe('LiveSessionJoinAccess', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const create = () =>
    LiveSessionJoinAccess.create({
      sessionId: 'session-1',
      publicCode: 'a2bc3',
      assignmentPolicy: 'explicit',
      maximumParticipantCount: 8,
      createdByActorId: 'host-1',
      now,
      expiresAt: new Date(now.getTime() + 60_000),
    });

  it('normalizes and generates ambiguity-free codes', () => {
    expect(normalizeJoinCode(' ab2c ')).toBe('AB2C');
    for (let index = 0; index < 50; index += 1) {
      expect(generateJoinCode()).toMatch(
        /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{7}$/,
      );
    }
  });

  it('rejects expired and revoked access', () => {
    expect(() =>
      create().assertAvailable(new Date(now.getTime() + 60_000)),
    ).toThrow(expect.objectContaining({ code: 'JOIN_ACCESS_EXPIRED' }));
    const revoked = create();
    revoked.revoke('host-1', new Date(now.getTime() + 1));
    expect(() => revoked.assertAvailable(now)).toThrow(
      expect.objectContaining({ code: 'JOIN_ACCESS_REVOKED' }),
    );
    expect(revoked.serialize()).toMatchObject({
      enabled: false,
      revokedByActorId: 'host-1',
      revision: 1,
    });
  });

  it('bounds failure tracking', () => {
    const access = create();
    for (let index = 0; index < 30; index += 1) access.recordFailure();
    expect(access.serialize().failedAttempts).toBe(20);
  });
});
