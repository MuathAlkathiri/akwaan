import Link from "next/link";
import { cn } from "@/lib/utils";
import { STICKER } from "@/components/akwaan/sticker";

/**
 * The close of the story: the same primary action the home hero offers, in the
 * same treatment, pointing at the same place.
 *
 * It routes to the Worlds picker on the home page — the real first move of a
 * Match — rather than jumping into setup, which has nothing to work with until
 * three Worlds have been chosen. This page opens no new way into a game.
 */
export function HowToPlayCta() {
  return (
    <section className="flex flex-col items-center gap-[26px] pt-4 text-center">
      <h2 className="max-w-[760px] font-display text-[26px] font-black leading-[1.5] text-[hsl(var(--brand-navy))] sm:text-4xl">
        جاهزين تجمعون أصحابكم وتبدأون المنافسة؟
      </h2>
      <Link
        href="/#worlds"
        className={cn(
          "inline-flex min-h-[3.5rem] items-center justify-center rounded-full px-10 sm:min-h-[4.25rem] sm:px-[52px]",
          "font-display text-[19px] font-extrabold sm:text-[22px]",
          "bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]",
          "transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-purple))]",
          STICKER.base,
        )}
      >
        ابدأ اللعبة
      </Link>
    </section>
  );
}
