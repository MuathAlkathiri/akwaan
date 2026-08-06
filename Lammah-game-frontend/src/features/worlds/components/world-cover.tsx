"use client";

import Image from "next/image";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import type { PlayableWorld } from "../types";

/**
 * A World's cover art.
 *
 * A World with no banner yet still gets a stable, distinct wash derived from its
 * own slug, so an unfinished catalogue never looks broken.
 */

const WASHES = [
  "from-violet-200 via-violet-100 to-white",
  "from-emerald-200 via-emerald-100 to-white",
  "from-amber-200 via-amber-100 to-white",
  "from-sky-200 via-sky-100 to-white",
  "from-rose-200 via-rose-100 to-white",
];

export function washFor(seed: string) {
  const total = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return WASHES[total % WASHES.length];
}

export function WorldCover({
  world,
  className,
  sizes,
  priority = false,
}: {
  world: PlayableWorld;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  const bannerUrl = getMediaUrl(world.banner?.url);

  return (
    <span className={cn("absolute inset-0 overflow-hidden", className)}>
      <span
        className={cn(
          "absolute inset-0 bg-gradient-to-bl",
          washFor(world.slug || world.id),
        )}
      />
      {bannerUrl && (
        <Image
          src={bannerUrl}
          alt=""
          fill
          unoptimized
          priority={priority}
          sizes={sizes}
          className="object-cover"
        />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-white via-white/45 to-transparent" />
    </span>
  );
}

/** The World's own mark, shown beside its name. */
export function WorldIcon({
  world,
  className,
}: {
  world: PlayableWorld;
  className?: string;
}) {
  const iconUrl = getMediaUrl(world.icon?.url);

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_6px_16px_rgba(24,16,54,.08)]",
        className,
      )}
    >
      {iconUrl ? (
        <Image
          src={iconUrl}
          alt=""
          width={48}
          height={48}
          unoptimized
          className="h-full w-full object-contain p-1.5"
        />
      ) : (
        <span aria-hidden="true" className="text-lg font-black text-primary">
          {world.name.trim().charAt(0)}
        </span>
      )}
    </span>
  );
}
