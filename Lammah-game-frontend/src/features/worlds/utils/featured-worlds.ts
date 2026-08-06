import type { PlayableWorld } from "../types";

/**
 * The three Worlds the home page leads with. They are matched by slug so an
 * admin can rename a World in Arabic without the home page losing its feature
 * row, and each entry keeps the fallback aliases the content team has used.
 */
export const FEATURED_WORLD_KEYS = [
  { key: "football", aliases: ["football", "soccer", "كرة-القدم", "كورة"] },
  { key: "anime", aliases: ["anime", "animé", "انمي", "أنمي"] },
  {
    key: "video-games",
    aliases: ["video-games", "videogames", "games", "gaming", "العاب", "ألعاب"],
  },
] as const;

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[أإآ]/g, "ا");

/** A World a player may actually open. */
export function isPlayableWorld(_world: PlayableWorld): boolean {
  return true;
}

export function playableWorlds(worlds: PlayableWorld[]): PlayableWorld[] {
  return worlds
    .filter(isPlayableWorld)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function matches(world: PlayableWorld, aliases: readonly string[]): boolean {
  const slug = normalize(world.slug);
  const name = normalize(world.name);
  return aliases.some((alias) => {
    const target = normalize(alias);
    return (
      slug === target ||
      slug.includes(target) ||
      name === target ||
      name.includes(target)
    );
  });
}

/**
 * Football, Anime, and Video Games when they exist, in that order. Any missing
 * slot is filled with the next playable World so the row is never half empty,
 * and a World is never featured twice.
 */
export function selectFeaturedWorlds(
  worlds: PlayableWorld[],
  limit = 3,
): PlayableWorld[] {
  const playable = playableWorlds(worlds);
  const featured: PlayableWorld[] = [];
  const taken = new Set<string>();

  for (const { aliases } of FEATURED_WORLD_KEYS) {
    const match = playable.find(
      (world) => !taken.has(world.id) && matches(world, aliases),
    );
    if (match) {
      featured.push(match);
      taken.add(match.id);
    }
  }

  for (const world of playable) {
    if (featured.length >= limit) break;
    if (taken.has(world.id)) continue;
    featured.push(world);
    taken.add(world.id);
  }

  return featured.slice(0, limit);
}
