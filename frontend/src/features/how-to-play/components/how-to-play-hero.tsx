import { cn } from "@/lib/utils";
import { PhoneFrame, SharedScreenFrame } from "./device-frames";
import { BoardPreview, PhoneScreen } from "./product-visuals";

/**
 * One phone in the hero cluster.
 *
 * The tilt and the float sit on two different elements on purpose: an animated
 * `transform` replaces a static one outright, so a phone that carried both on a
 * single node would snap upright the moment the float started.
 */
function HeroPhone({
  slot,
  tilt,
  delay,
  className,
}: {
  slot: "1" | "2";
  tilt: string;
  delay: string;
  className?: string;
}) {
  return (
    <div className={cn("shrink-0", tilt, className)}>
      <PhoneFrame className="akwaan-float w-full" style={{ animationDelay: delay }}>
        <PhoneScreen slot={slot} />
      </PhoneFrame>
    </div>
  );
}

/**
 * The one picture the whole page rests on: a room around a single screen.
 *
 * The composition is the argument — the shared screen is large and central and
 * carries the real board, while the phones are small, angled and clearly
 * separate. A reader should understand "we all watch that, and I hold this"
 * before reading a word of the steps below.
 *
 * Phones are dropped at narrow widths rather than shrunk, which is what keeps
 * the row from overflowing: two on a phone, four from `lg` up.
 */
export function HowToPlayHero() {
  return (
    <section className="relative z-10 px-4 pb-4 pt-10 text-center sm:px-6 lg:pt-14">
      <div className="mx-auto flex max-w-3xl flex-col items-center">
        <h1 className="akwaan-hero-copy-in text-3xl font-black leading-[1.25] text-[hsl(var(--brand-navy))] sm:text-4xl lg:text-[2.9rem]">
          كيف تلعب أكوان؟
        </h1>
        <p className="akwaan-hero-copy-in mt-4 max-w-xl text-base font-bold leading-8 text-[hsl(var(--brand-navy)/.72)] [animation-delay:80ms] sm:text-lg">
          شاشة وحدة تجمعكم، وجوال كل لاعب يصير أداة اللعب
        </p>
      </div>

      <div
        aria-hidden
        className="akwaan-hero-cta-in mx-auto mt-9 flex w-full max-w-4xl items-end justify-center gap-2 [animation-delay:160ms] sm:gap-5 lg:mt-12 lg:gap-7"
      >
        <HeroPhone
          slot="2"
          tilt="-rotate-6"
          delay="0ms"
          className="hidden w-[78px] lg:block"
        />
        <HeroPhone
          slot="1"
          tilt="-rotate-3"
          delay="900ms"
          className="w-[54px] sm:w-[76px]"
        />

        <SharedScreenFrame className="min-w-0 max-w-[30rem] flex-1">
          <BoardPreview detail="compact" />
        </SharedScreenFrame>

        <HeroPhone
          slot="2"
          tilt="rotate-3"
          delay="1800ms"
          className="w-[54px] sm:w-[76px]"
        />
        <HeroPhone
          slot="1"
          tilt="rotate-6"
          delay="2700ms"
          className="hidden w-[78px] lg:block"
        />
      </div>
    </section>
  );
}
