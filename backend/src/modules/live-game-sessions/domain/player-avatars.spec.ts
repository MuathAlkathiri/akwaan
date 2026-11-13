import { LiveGameSession } from './live-game-session';
import { CORE_TIMED_TURNS_MODE } from './live-game-mode.registry';
import {
  PLAYER_AVATAR_KEYS,
  firstFreeAvatar,
  isPlayerAvatarKey,
} from './player-avatars';

/**
 * A player's character, and the one rule that makes it worth having.
 *
 * Both teams wear one colour each, so the character is the only thing telling
 * two players on the same team apart on a screen across the room. That is why a
 * session hands them out rather than letting clients choose freely, and why a
 * duplicate is refused instead of tolerated.
 */
describe('player characters', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const create = () =>
    LiveGameSession.create({
      id: 'session-id',
      controllerActorId: 'actor-1',
      controllerDisplayName: 'Host',
      teamNames: ['الأزرق', 'الأحمر'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now,
    });

  const enrol = (session: LiveGameSession, index: number, avatarKey?: string) =>
    session.enrollParticipant({
      id: `player-${index}`,
      displayName: `لاعب ${index}`,
      role: 'team-player',
      joinRequestId: `join-${index}`,
      ...(avatarKey ? { avatarKey } : {}),
      now,
    });

  it('names twelve characters, each one once', () => {
    expect(PLAYER_AVATAR_KEYS).toHaveLength(12);
    expect(new Set(PLAYER_AVATAR_KEYS).size).toBe(12);
    expect(isPlayerAvatarKey('comet')).toBe(true);
    expect(isPlayerAvatarKey('wizard')).toBe(false);
    expect(isPlayerAvatarKey(undefined)).toBe(false);
  });

  it('gives a player who chose nothing the first free one', () => {
    const session = create();
    expect(enrol(session, 0).avatarKey).toBe(PLAYER_AVATAR_KEYS[0]);
    expect(enrol(session, 1).avatarKey).toBe(PLAYER_AVATAR_KEYS[1]);
    expect(enrol(session, 2).avatarKey).toBe(PLAYER_AVATAR_KEYS[2]);
  });

  it('honours a choice, and then nobody else can have it', () => {
    const session = create();
    expect(enrol(session, 0, 'nebula').avatarKey).toBe('nebula');
    expect(() => enrol(session, 1, 'nebula')).toThrow(
      expect.objectContaining({ code: 'AVATAR_TAKEN' }),
    );
    // The next player to choose nothing skips what is taken rather than
    // colliding with it.
    expect(enrol(session, 1).avatarKey).toBe(PLAYER_AVATAR_KEYS[0]);
  });

  it('refuses a character that does not exist', () => {
    expect(() => enrol(create(), 0, 'wizard')).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_AVATAR' }),
    );
  });

  it('frees a removed player’s character for the next player', () => {
    const session = create();
    enrol(session, 0, 'rocket');
    session.removeParticipant('player-0', now);
    expect(enrol(session, 1, 'rocket').avatarKey).toBe('rocket');
  });

  it('leaves the host without one: a controller is not a player', () => {
    const controller = create()
      .serialize()
      .participants.find((participant) => participant.role === 'controller');
    expect(controller?.avatarKey).toBeUndefined();
  });

  it('runs out honestly rather than handing out a duplicate', () => {
    expect(firstFreeAvatar(PLAYER_AVATAR_KEYS)).toBeUndefined();
    expect(firstFreeAvatar([])).toBe(PLAYER_AVATAR_KEYS[0]);
    expect(firstFreeAvatar([undefined, 'astronaut'])).toBe(
      PLAYER_AVATAR_KEYS[1],
    );
  });

  it('carries the character into the snapshot both screens read', () => {
    const session = create();
    enrol(session, 0, 'star');
    const player = session
      .serialize()
      .participants.find((participant) => participant.id === 'player-0');
    expect(player?.avatarKey).toBe('star');
  });
});
