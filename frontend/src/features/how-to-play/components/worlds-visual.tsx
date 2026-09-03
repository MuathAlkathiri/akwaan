"use client";

import { cn } from "@/lib/utils";
import { WorldCover } from "@/features/worlds/components/world-cover";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { playableWorlds, selectFeaturedWorlds } from "@/features/worlds/utils/featured-worlds";
import { worldSignatureLabel } from "@/features/worlds/utils/world-signature";
import type { PlayableWorld } from "@/features/worlds/types";

/** How many portals the step shows, and how many of them read as chosen. */
const SHOWN = 4;
const SELECTED = 3;

/**
 * The Worlds this step puts on screen: three that read as chosen, plus one left
 * alone so "اختاروا 3 عوالم" is visible as a rule rather than merely stated.
 *
 * Curation reuses `selectFeaturedWorlds` for *which* Worlds lead. The one
 * preference added here is for Worlds that actually have approved artwork: this
 * is a marketing shot, and a catalogue carrying half-finished or fixture Worlds
 * would otherwise put "الصورة قيد الإعداد" — or a smoke-test name — in the
 * product's own shop window.
 *
 * It is presentational curation only. Nothing about play consults it, and if too
 * few Worlds have artwork the grid still fills from the plain playable list, so
 * the step keeps its shape and falls back to the product's own pending plate.
 */
function worldsForVisual(all: PlayableWorld[]): PlayableWorld[] {
  const withArtwork = playableWorlds(all).filter((world) => world.banner?.url);
  const picked: PlayableWorld[] = [...selectFeaturedWorlds(withArtwork, SELECTED)];
  const taken = new Set(picked.map((world) => world.id));

  // Artwork first, then anything playable, so the grid is only ever short if the
  // catalogue itself is.
  for (const pool of [withArtwork, playableWorlds(all)]) {
    for (const world of pool) {
      if (picked.length >= SHOWN) break;
      if (taken.has(world.id)) continue;
      picked.push(world);
      taken.add(world.id);
    }
  }
  return picked.slice(0, SHOWN);
}

/**
 * Step 2's picture: four Worlds as Akwaan's circular portals, three of them taken.
 *
 * Artwork comes from the same query the home grid uses — one shared React Query
 * key, so a visitor arriving from the home page pays nothing for it — and is
 * drawn by `WorldCover`, the canonical resolver. A World still waiting for its
 * banner therefore gets the product's own "artwork pending" plate here too,
 * rather than anything invented for this page.
 *
 * Nothing here is interactive. A portal is a `<span>`, not a button: this step
 * explains the rule, and must never look like it has enrolled a World in a Match.
 */
export function WorldsVisual() {
  const query = usePlayableWorlds();
  const worlds = query.isSuccess ? worldsForVisual(query.data) : [];

  // The request is in flight, or it failed and there is nothing to draw. Either
  // way the grid keeps its shape so the step does not jump when data lands.
  if (worlds.length === 0) {
    return (
      <PortalGrid>
        {Array.from({ length: SHOWN }, (_, index) => (
          <li key={index} className="flex w-full flex-col items-center gap-2">
            <span
              className={cn(
                "block aspect-square w-full max-w-[8.5rem] rounded-full border-2 border-white/90 bg-card",
                query.isLoading && "animate-pulse",
              )}
            />
            {/* Two bars, because the loaded portal carries a name *and* its
                signature: one bar here and the grid jumps when data lands. */}
            <span className="flex flex-col items-center gap-0.5">
              <span className="block h-5 w-16 rounded-full bg-[hsl(var(--brand-navy)/.07)]" />
              <span className="block h-[0.95rem] w-10 rounded-full bg-[hsl(var(--brand-navy)/.05)]" />
            </span>
          </li>
        ))}
      </PortalGrid>
    );
  }

  return (
    <PortalGrid>
      {worlds.slice(0, SHOWN).map((world, index) => {
        const order = index < SELECTED ? index + 1 : undefined;
        const selected = Boolean(order);
        const signature = worldSignatureLabel(world);
        return (
          <li key={world.id} className="flex w-full flex-col items-center gap-2">
            <span className="relative block aspect-square w-full max-w-[8.5rem]">
              <span
                className={cn(
                  "absolute inset-[5px] overflow-hidden rounded-full border-2 shadow-[0_18px_38px_-18px_rgba(24,16,54,.4)]",
                  selected
                    ? "border-[hsl(var(--brand-gold))] ring-2 ring-[hsl(var(--brand-navy)/.18)]"
                    // Quieter, not greyed out. The desaturation that used to sit
                    // here is what made an available World read as disabled, so
                    // the artwork keeps its own colour and only opacity steps it
                    // back behind the three that are chosen.
                    : "border-white/90 opacity-60",
                )}
              >
                <WorldCover
                  world={world}
                  sizes="(min-width: 1024px) 136px, 34vw"
                />
                {selected && (
                  <span className="absolute inset-0 rounded-full ring-[3px] ring-inset ring-[hsl(var(--brand-gold)/.55)]" />
                )}
              </span>

              {selected && (
                <span className="absolute -top-1 right-2 z-10 grid size-8 place-items-center rounded-full border-2 border-[hsl(var(--brand-gold))] bg-[hsl(var(--brand-navy))] text-sm font-black text-white shadow-[0_7px_18px_rgba(24,16,54,.32)]">
                  <span className="akwaan-numeral">{order}</span>
                </span>
              )}

              <span
                className={cn(
                  "absolute left-3 top-5 size-1.5 rounded-full",
                  selected
                    ? "bg-[hsl(var(--brand-gold))]"
                    : "bg-[hsl(var(--brand-navy)/.28)]",
                )}
              />
            </span>

            <span className="flex flex-col items-center gap-0.5 text-center">
              <span
                className={cn(
                  "text-sm font-black",
                  selected
                    ? "text-[hsl(var(--brand-navy))]"
                    : "text-[hsl(var(--brand-navy)/.62)]",
                )}
              >
                {world.name}
              </span>
              {signature && (
                <span className="text-[0.65rem] font-bold text-[hsl(var(--brand-gold))]">
                  {signature}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </PortalGrid>
  );
}

/** The 2×2 frame both the loaded and the waiting state fill, so neither shifts. */
function PortalGrid({ children }: { children: React.ReactNode }) {
  return (
    <ul
      aria-hidden
      dir="rtl"
      className="mx-auto grid w-full max-w-md list-none grid-cols-2 justify-items-center gap-x-5 gap-y-6"
    >
      {children}
    </ul>
  );
}
