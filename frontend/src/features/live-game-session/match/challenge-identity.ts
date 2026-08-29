import {
  Bomb,
  Eye,
  Flame,
  Gamepad2,
  Lightbulb,
  ListOrdered,
  Puzzle,
  Target,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon per challenge type, assigned once.
 *
 * An icon is an *identifier*, not decoration. Two challenge types wearing the same
 * gamepad — which is what happened to "فيلم مقلوب" and "معلومات منقوصة", both landing
 * on the shared fallback — makes the board unreadable in exactly the way it is meant
 * to be readable at a glance, from across a room.
 *
 * There were two of these resolvers, in the board tile and in the setup review, with
 * different matching rules. That is how the two screens disagreed about what a
 * challenge looked like. This is the only one, and `src/test/challenge-identity.test.ts`
 * enforces that no two entries share an icon.
 *
 * A key this registry does not know still gets the fallback — a new mechanic must not
 * blank the board — but the fallback is unreachable for anything in `CHALLENGE_ICONS`,
 * and adding a mechanic without an icon is a visible omission rather than a silent
 * collision.
 */
export const CHALLENGE_ICONS: Readonly<Record<string, LucideIcon>> = {
  "read-your-opponent": Eye,
  "top-5": ListOrdered,
  closest: Target,
  "one-clue": Lightbulb,
  rakkibha: Puzzle,
  combo: Flame,
  bomb: Bomb,
};

/** The icon for anything not in the registry. Never shared with a known type. */
export const CHALLENGE_FALLBACK_ICON: LucideIcon = Gamepad2;

/**
 * The icon for a challenge type.
 *
 * Takes the type's slug or runtime key. Matching is exact rather than by substring:
 * `slug.includes("top")` also matched "top-secret" and anything else containing it,
 * which is the kind of rule that starts correct and quietly stops being so.
 */
export function challengeIcon(challengeKey: string | undefined): LucideIcon {
  if (!challengeKey) return CHALLENGE_FALLBACK_ICON;
  return CHALLENGE_ICONS[challengeKey] ?? CHALLENGE_FALLBACK_ICON;
}
