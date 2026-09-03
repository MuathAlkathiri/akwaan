import Link from "next/link";
import { Button } from "@/components/ui/button";

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
    <section className="relative z-10 px-4 pb-20 pt-4 text-center sm:px-6 lg:pb-28">
      <div className="mx-auto flex max-w-2xl flex-col items-center">
        <p className="text-lg font-black leading-8 text-[hsl(var(--brand-navy))] sm:text-xl">
          جاهزين تجمعون أصحابكم وتبدأون المنافسة؟
        </p>

        <Button
          asChild
          size="lg"
          className="akwaan-primary-action mt-6 rounded-full border border-[hsl(var(--brand-gold)/.32)] bg-[hsl(var(--brand-navy))] px-10 py-6 text-base font-black text-white shadow-[0_16px_34px_-18px_hsl(var(--brand-navy)/.8)] hover:border-[hsl(var(--brand-gold)/.72)] hover:bg-[hsl(var(--brand-navy)/.96)] hover:shadow-[0_18px_38px_-16px_hsl(var(--brand-gold)/.42)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold))] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          <Link href="/#worlds">ابدأ اللعبة</Link>
        </Button>
      </div>
    </section>
  );
}
