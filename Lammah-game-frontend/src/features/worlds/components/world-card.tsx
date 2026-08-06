"use client";

import Link from "next/link";
import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlayableWorld } from "../types";
import { WorldCover, WorldIcon } from "./world-cover";
import { WorldStats } from "./world-stats";

/**
 * An entrance into a World.
 *
 * It carries exactly what a player needs to choose one — cover, icon, name, a
 * short line, how many regions, how many challenges — and nothing about the
 * content inside. The whole card is the door; the button names the action.
 */
export function WorldCard({
  world,
  featured = false,
  priority = false,
}: {
  world: PlayableWorld;
  featured?: boolean;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/worlds/${world.id}`}
      aria-label={`ادخل عالم ${world.name}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border border-black/[0.06] bg-white shadow-[0_10px_30px_rgba(24,16,54,.06)] transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_16px_40px_rgba(91,33,182,.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2",
      )}
    >
      <span
        className={cn(
          "relative block w-full",
          featured ? "h-40 sm:h-44" : "h-28",
        )}
      >
        <WorldCover
          world={world}
          priority={priority}
          sizes={
            featured
              ? "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              : "(min-width: 1280px) 25vw, (min-width: 640px) 33vw, 50vw"
          }
        />
      </span>

      <span className="relative -mt-8 flex flex-1 flex-col gap-3 px-5 pb-5">
        <span className="flex items-end gap-3">
          <WorldIcon
            world={world}
            className={featured ? "h-16 w-16" : "h-12 w-12"}
          />
          <span className="min-w-0 pb-1">
            <span
              className={cn(
                "block truncate font-black text-slate-900",
                featured ? "text-2xl" : "text-lg",
              )}
            >
              {world.name}
            </span>
          </span>
        </span>

        <span className="block min-h-[2.5rem] text-sm leading-6 text-slate-500">
          {world.description ? (
            <span className="line-clamp-2">{world.description}</span>
          ) : (
            <span className="text-slate-400">عالم جاهز للعب.</span>
          )}
        </span>

        <WorldStats world={world} size={featured ? "md" : "sm"} />

        <span className="mt-auto flex items-center justify-between pt-2">
          <span className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground shadow-[0_8px_20px_rgba(91,33,182,.18)] transition group-hover:bg-primary/90">
            <Compass className="h-4 w-4" aria-hidden="true" />
            استكشف العالم
          </span>
        </span>
      </span>
    </Link>
  );
}
