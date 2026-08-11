"use client";

import Link from "next/link";
import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { matchSetupRouteForWorld } from "@/features/match-setup/routes";
import type { PlayableWorld } from "../types";
import { WorldCover } from "./world-cover";
import { WorldStats } from "./world-stats";

/**
 * An entrance into a World.
 *
 * It carries exactly what a player needs to choose one — cover, name, a short
 * line, how many regions, how many challenges — and nothing about the
 * content inside. The whole card is the door; the button names the action.
 */
export function WorldCard({
  world,
  featured = false,
  priority = false,
  className,
  carouselActive = true,
  onCarouselActivate,
}: {
  world: PlayableWorld;
  featured?: boolean;
  priority?: boolean;
  className?: string;
  carouselActive?: boolean;
  onCarouselActivate?: () => void;
}) {
  const accent = worldCardAccent(world);

  return (
    <Link
      href={matchSetupRouteForWorld(world.id)}
      aria-label={
        carouselActive ? `ادخل عالم ${world.name}` : `اعرض عالم ${world.name}`
      }
      onClick={(event) => {
        if (carouselActive || !onCarouselActivate) return;
        event.preventDefault();
        onCarouselActivate();
      }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border bg-card shadow-[0_12px_32px_rgba(24,16,54,.07)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_hsl(219_45%_16%/0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2",
        accent.card,
        className,
      )}
    >
      <span
        data-testid="world-card-media"
        className={cn(
          "relative -mx-px -mt-px mb-px block w-[calc(100%+2px)] shrink-0 overflow-hidden bg-secondary",
          featured ? "aspect-[3/2]" : "aspect-[5/3]",
        )}
      >
        <WorldCover
          world={world}
          priority={priority}
          imageClassName="scale-[1.1] object-[center_58%]"
          sizes={
            featured
              ? "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              : "(min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw"
          }
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card via-card/25 to-transparent"
        />
      </span>

      <span className="relative -mt-px flex flex-1 flex-col gap-2 px-5 pb-4 pt-3">
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate font-black tracking-tight text-foreground",
              featured ? "text-2xl sm:text-3xl" : "text-xl",
            )}
          >
            {worldCardDisplayName(world.name)}
          </span>
        </span>

        <span className="block min-h-[2.5rem] text-sm leading-6 text-muted-foreground">
          {world.description ? (
            <span className="line-clamp-2">{world.description}</span>
          ) : (
            <span className="text-disabled-foreground">عالم جاهز للعب.</span>
          )}
        </span>

        <WorldStats world={world} size="sm" />

        <span className="mt-auto flex items-center justify-between pt-1">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-[var(--radius)] px-4 py-2 text-sm font-black text-white shadow-[0_8px_20px_hsl(219_45%_16%/0.16)] transition group-hover:brightness-95",
              accent.cta,
            )}
          >
            <Compass className="h-4 w-4" aria-hidden="true" />
            استكشف العالم
          </span>
        </span>
      </span>
    </Link>
  );
}

export function worldCardDisplayName(name: string) {
  const trimmed = name.trim();
  return /^عالم(?:\s|$)/.test(trimmed) ? trimmed : `عالم ${trimmed}`;
}

function worldCardAccent(world: PlayableWorld) {
  const identity = `${world.slug} ${world.name}`.toLowerCase();

  if (/football|كرة/.test(identity)) {
    return {
      card: "border-success/25 hover:border-success/45",
      cta: "bg-success",
    };
  }

  if (/anime|انمي|أنمي/.test(identity)) {
    return {
      card: "border-team-coral-border/45 hover:border-team-coral-border/70",
      cta: "bg-team-coral",
    };
  }

  if (/video|game|قيمز|ألعاب/.test(identity)) {
    return {
      card: "border-violet-300/40 hover:border-violet-400/55",
      cta: "bg-violet-700",
    };
  }

  return {
    card: "border-border hover:border-primary/25",
    cta: "bg-primary",
  };
}
