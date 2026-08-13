"use client";

import Image from "next/image";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";

/**
 * The one canonical World media treatment.
 *
 * A World is presented by its artwork: a wide, rounded banner with the title
 * resting on it. Every surface that shows a World — the home grid, a World page,
 * the board, a preflight, a result header — uses this, so a new World needs
 * artwork and nothing else to look right.
 *
 * A World with no artwork yet is not a broken image and not a random gradient: it
 * gets a quiet warm plate carrying the same title in the same place, so the
 * layout is identical and the missing asset is obvious to whoever authors it
 * rather than disguised.
 */

const RATIOS = {
  /** Board and home: wide enough to read as a banner in a column. */
  banner: "aspect-[16/6]",
  /** A World's own page: taller hero. */
  hero: "aspect-[16/7] sm:aspect-[16/5]",
  /** Inline context strip above a challenge or a result. */
  strip: "aspect-[16/4] sm:aspect-[16/3]",
} as const;

export function WorldMedia({
  name,
  imageUrl,
  variant = "banner",
  eyebrow,
  priority = false,
  className,
  children,
}: {
  name: string;
  /** The approved banner, as the server stored it. */
  imageUrl?: string;
  variant?: keyof typeof RATIOS;
  /** Small line above the title, e.g. which occurrence this is. */
  eyebrow?: string;
  priority?: boolean;
  className?: string;
  /** Corner slot for a badge or a count. */
  children?: React.ReactNode;
}) {
  const source = imageUrl ? getMediaUrl(imageUrl) : undefined;

  return (
    <div
      data-testid="world-media"
      data-has-artwork={source ? "true" : "false"}
      className={cn(
        "relative isolate w-full overflow-hidden rounded-[var(--radius)] bg-muted",
        RATIOS[variant],
        className,
      )}
    >
      {source ? (
        <Image
          src={source}
          alt=""
          fill
          // Uploaded media is served by the backend, and Next's optimizer runs
          // server-side — inside the frontend container, the browser-facing
          // backend origin is not reachable, so an optimized request fails while
          // the browser's own request succeeds. Serving it directly is what makes
          // World artwork appear at all in a containerised deployment.
          unoptimized
          priority={priority}
          sizes="(max-width: 768px) 100vw, 40rem"
          className="object-cover"
        />
      ) : (
        <div
          aria-hidden
          data-testid="world-artwork-pending"
          className="absolute inset-0 bg-secondary bg-[radial-gradient(hsl(var(--foreground)/0.07)_1px,transparent_1px)] [background-size:14px_14px]"
        />
      )}
      {/* A single bottom scrim rather than a full overlay: the artwork stays the
          hero, and only the strip under the title is darkened enough to read. */}
      {source && (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-[hsl(219_45%_10%/0.78)] via-[hsl(219_45%_10%/0.34)] to-transparent"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          {eyebrow && (
            <p
              className={cn(
                "truncate text-[0.7rem] font-black uppercase tracking-wide",
                source ? "text-white/75" : "text-muted-foreground",
              )}
            >
              {eyebrow}
            </p>
          )}
          <h3
            className={cn(
              "truncate font-black",
              source
                ? "text-white drop-shadow-[0_1px_6px_hsl(219_45%_8%/0.6)]"
                : "text-foreground",
              variant === "hero"
                ? "text-2xl sm:text-4xl"
                : variant === "strip"
                  ? "text-lg sm:text-xl"
                  : "text-xl sm:text-2xl",
            )}
          >
            {name}
          </h3>
        </div>
        {children}
      </div>
    </div>
  );
}
