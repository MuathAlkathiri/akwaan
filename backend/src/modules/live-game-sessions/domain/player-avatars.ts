/**
 * The characters a player can be.
 *
 * Both teams wear one colour each, so a player's own identity on the shared
 * screen is carried entirely by this shape. Three things follow from that:
 *
 * - **They are cosmic objects, not faces.** No skin tone, no hair, no gender:
 *   nobody has to find a face that resembles them, and nobody is handed one that
 *   does not. It also happens to be what أكوان means.
 * - **They are told apart by silhouette.** A living-room screen renders one at
 *   about forty pixels from three metres away, where only the outline survives.
 * - **They are unique within a session.** The shape is the only thing that
 *   distinguishes two players on the same team, so two players cannot wear it.
 *
 * This list is the contract. The frontend holds the drawings under the same
 * keys and a test pins the two sets together.
 */
export const PLAYER_AVATAR_KEYS = [
  'astronaut',
  'alien',
  'robot',
  'planet',
  'star',
  'moon',
  'rocket',
  'ufo',
  'comet',
  'sun',
  'satellite',
  'nebula',
] as const;

export type PlayerAvatarKey = (typeof PLAYER_AVATAR_KEYS)[number];

export function isPlayerAvatarKey(value: unknown): value is PlayerAvatarKey {
  return (
    typeof value === 'string' &&
    (PLAYER_AVATAR_KEYS as readonly string[]).includes(value)
  );
}

/**
 * The avatar a player gets when they do not choose one.
 *
 * In list order rather than at random: the room fills in a predictable sequence,
 * and a host who has seen one session recognises the next. Returns `undefined`
 * only when every character is taken, which needs more players than a session
 * holds — the caller decides what that means rather than being handed a clash.
 */
export function firstFreeAvatar(
  taken: Iterable<string | undefined>,
): PlayerAvatarKey | undefined {
  const used = new Set(taken);
  return PLAYER_AVATAR_KEYS.find((key) => !used.has(key));
}
