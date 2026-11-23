import Image from "next/image";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/api/media-url";
import type { PlayableWorld } from "../types";

/**
 * A World as the identity draws it: a tinted disc with its artwork breaking
 * out of the top, a thin gold orbit behind, and a small moon on the orbit.
 *
 * The artwork is a SLOT, never a shipped file. Every World's picture is
 * uploaded by an admin, so this component draws whatever the catalogue gives
 * it and draws a plain disc when the catalogue gives nothing. Hardcoding
 * artwork here would mean a World added next month looks broken until someone
 * remembers to edit this file — and it would put pictures in the repository
 * that nobody cleared the rights to.
 */

/**
 * The disc tint, chosen from the identity's palette by the World's own id.
 *
 * Deterministic rather than random, so a World keeps its colour between
 * visits, and derived rather than mapped, so a new World is tinted the moment
 * it exists instead of falling back to grey until someone adds it to a list.
 */
const DISC_TINTS = [
  "#E3DAF6", // lavender
  "#DDEED6", // sage
  "#F1DCEC", // blush
  "#EFE3C6", // sand
  "#D9E8F0", // sky
] as const;

export function discTint(worldId: string): string {
  let sum = 0;
  for (const char of worldId) sum = (sum + char.charCodeAt(0)) % 9973;
  return DISC_TINTS[sum % DISC_TINTS.length];
}

export function WorldDisc({
  world,
  className,
}: {
  world: PlayableWorld;
  className?: string;
}) {
  // `icon` is the cut-out the design wants — a subject on transparency that
  // can break the disc's edge. `banner` is the wide artwork and is only a
  // fallback, since a full-bleed image clipped to a circle has no silhouette
  // to pop out with.
  //
  // `getMediaUrl` answers with an empty string, not null, for anything it
  // cannot resolve, so the fallback is written on emptiness rather than nullish.
  const artwork =
    getMediaUrl(world.icon?.url) || getMediaUrl(world.banner?.url) || "";
  const tint = discTint(world.id);

  return (
    <span
      className={cn("relative block h-[15.625rem] w-[12.5rem]", className)}
      data-has-artwork={artwork ? "true" : "false"}
    >
      {/* The orbit, behind everything, with its moon resting on the ring. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 280 150"
        className="absolute -left-10 top-[4.875rem] w-[17.5rem]"
      >
        <ellipse
          cx="140"
          cy="75"
          rx="134"
          ry="46"
          fill="none"
          stroke="hsl(var(--brand-gold))"
          strokeWidth="2.5"
          transform="rotate(-14 140 75)"
        />
        <circle
          cx="18"
          cy="100"
          r="7"
          fill="hsl(var(--brand-gold))"
          stroke="hsl(var(--brand-navy))"
          strokeWidth="2"
        />
      </svg>

      {/* The disc. Its tint shows through wherever the artwork does not cover,
          which is what gives an empty World a finished look rather than a hole. */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-[3.125rem] block size-[12.5rem] overflow-hidden rounded-full"
        style={{ background: tint }}
      >
        {artwork && (
          <Image
            src={artwork}
            alt=""
            unoptimized
            width={220}
            height={220}
            className="absolute -left-2.5 -top-8 block size-[13.75rem] max-w-none object-contain"
          />
        )}
      </span>

      {/* The same artwork again, clipped to its top half and drawn over the
          disc's edge. Two draws of one file is what makes the subject look as
          if it is standing in front of the disc rather than printed on it. */}
      {artwork && (
        <Image
          src={artwork}
          alt={world.icon?.altText ?? ""}
          unoptimized
          width={220}
          height={220}
          className="absolute -left-2.5 top-[1.125rem] block size-[13.75rem] max-w-none object-contain"
          style={{ clipPath: "inset(0 0 52% 0)" }}
        />
      )}
    </span>
  );
}

/**
 * The soft ellipse the disc appears to rest on.
 *
 * The only blurred thing in the identity, and deliberately: without it the
 * discs float, and with a hard-edged shadow they would read as a second
 * sticker rather than as ground.
 */
export function WorldShadow() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 block h-5 w-[8.75rem] rounded-[50%]"
      style={{
        background:
          "radial-gradient(ellipse at center, hsl(var(--brand-navy) / .32) 0%, hsl(var(--brand-navy) / 0) 70%)",
      }}
    />
  );
}
