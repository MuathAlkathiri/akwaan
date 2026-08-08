"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import type { PlayableWorld } from "../types";

/**
 * A World's cover art.
 *
 * The artwork is the World's identity, so a World without one gets the same
 * quiet warm plate every time rather than a random coloured wash. The old
 * slug-seeded rainbow made an unfinished catalogue look decorated instead of
 * unfinished, and put five hues into a product with a two-colour team palette.
 */
export function washFor(_seed: string) {
  return "from-secondary via-muted to-card";
}

/**
 * The plate a World without approved artwork gets.
 *
 * The problem it solves is that "no image" and "the image failed" look identical
 * when the answer is a pale rectangle — and a near-white card reads as broken
 * long before it reads as unfinished. So this is deliberately *stated*: a warm
 * plate a shade darker than the card so it is clearly a filled area rather than a
 * hole, a faint dot grid so it reads as a prepared surface, and a quiet mark with
 * one honest line of Arabic.
 *
 * No seeded colour, no random gradient. Every World still waiting for artwork
 * looks the same, so an unfinished catalogue looks unfinished rather than
 * decorated — and dropping the approved asset in is the only change needed.
 */
export function WorldArtworkPending({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="world-artwork-pending"
      className={cn(
        "absolute inset-0 grid place-items-center bg-secondary",
        // A 14px dot grid at very low contrast: texture, not pattern.
        "bg-[radial-gradient(hsl(var(--foreground)/0.07)_1px,transparent_1px)] [background-size:14px_14px]",
        className,
      )}
    >
      <span className="flex flex-col items-center gap-1.5 text-disabled-foreground">
        <ImageOff className="size-6" />
        <span className="text-[0.7rem] font-bold">الصورة قيد الإعداد</span>
      </span>
    </span>
  );
}

export function WorldCover({
  world,
  className,
  imageClassName,
  sizes,
  priority = false,
}: {
  world: PlayableWorld;
  className?: string;
  imageClassName?: string;
  sizes: string;
  priority?: boolean;
}) {
  const bannerUrl = getMediaUrl(world.banner?.url);

  return (
    <span
      className={cn("absolute inset-0 overflow-hidden", className)}
      data-has-artwork={bannerUrl ? "true" : "false"}
    >
      {bannerUrl ? (
        <>
          <span
            className={cn(
              "absolute inset-0 bg-gradient-to-bl",
              washFor(world.slug || world.id),
            )}
          />
          <Image
            src={bannerUrl}
            alt=""
            fill
            unoptimized
            priority={priority}
            sizes={sizes}
            className={cn("object-cover object-center", imageClassName)}
          />
        </>
      ) : (
        <WorldArtworkPending />
      )}
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
        "grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[0_6px_16px_rgba(24,16,54,.08)]",
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
