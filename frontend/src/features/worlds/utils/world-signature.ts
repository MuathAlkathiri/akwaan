import type { PlayableWorld } from "../types";

/**
 * The signature mechanic each headline World is known by, for the home card
 * subtitle. Matched by slug/name alias so an admin can rename a World in Arabic
 * without the label disappearing. Presentational only — it never decides what a
 * World actually plays; the board does. A World with no known signature simply
 * shows no subtitle rather than a wrong one.
 */
const WORLD_SIGNATURES: ReadonlyArray<{
  label: string;
  aliases: readonly string[];
}> = [
  { label: "أفضل 5", aliases: ["football", "soccer", "كرة-القدم", "كورة", "كرة"] },
  {
    label: "المرحلة",
    aliases: ["video-games", "videogames", "games", "gaming", "العاب", "ألعاب", "فيديو"],
  },
  {
    label: "ركّبها",
    aliases: ["puzzles", "puzzle", "alghaz", "الغاز", "ألغاز", "لغز"],
  },
  { label: "الكومبو", aliases: ["anime", "animé", "انمي", "أنمي"] },
];

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[أإآ]/g, "ا");

/** The signature mechanic label for a World, or undefined when none is known. */
export function worldSignatureLabel(world: PlayableWorld): string | undefined {
  const slug = normalize(world.slug);
  const name = normalize(world.name);
  return WORLD_SIGNATURES.find(({ aliases }) =>
    aliases.some((alias) => {
      const target = normalize(alias);
      return (
        slug === target ||
        slug.includes(target) ||
        name === target ||
        name.includes(target)
      );
    }),
  )?.label;
}
