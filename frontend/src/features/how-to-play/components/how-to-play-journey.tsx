import { cn } from "@/lib/utils";
import { SectionTag, STICKER } from "@/components/akwaan/sticker";
import { ConnectVisual, SharedScreenVisual } from "./step-visuals";
import { PlayVisual } from "./play-visual";
import { WorldsVisual } from "./worlds-visual";

const STEPS = [
  { key: "screen", title: "جهزوا الشاشة", Visual: SharedScreenVisual },
  { key: "worlds", title: "اختاروا 3 عوالم", Visual: WorldsVisual },
  { key: "connect", title: "اربطوا جوالاتكم", Visual: ConnectVisual },
  { key: "play", title: "العبوا وتنافسوا", Visual: PlayVisual },
] as const;

/**
 * The four steps, two cards to a row.
 *
 * Each card is a number, a title and a picture. The sentence that used to sit
 * under every step was removed on purpose: the picture already says it, and
 * the written sections below carry the detail for anyone who wants it.
 */
export function HowToPlayJourney() {
  return (
    <section
      aria-labelledby="how-to-play-journey-title"
      className="flex flex-col gap-[30px]"
    >
      <SectionTag
        tone="gold"
        tilt={-1.5}
        className="min-h-[60px] self-center px-[26px] text-[24px] sm:text-[30px]"
      >
        <h2 id="how-to-play-journey-title">خطوات اللعب</h2>
      </SectionTag>

      <ol
        aria-labelledby="how-to-play-journey-title"
        className="grid list-none gap-7 p-0 lg:grid-cols-2"
      >
        {STEPS.map(({ key, title, Visual }, index) => (
          <li
            key={key}
            className={cn(
              "flex min-w-0 flex-col gap-[18px] rounded-[22px] bg-brand-paper p-4 sm:p-[22px]",
              STICKER.base,
            )}
          >
            <div className="flex items-center gap-3.5">
              <span
                aria-hidden
                className={cn(
                  "akwaan-numeral grid size-[52px] shrink-0 place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] text-2xl font-extrabold",
                  index % 2 === 0
                    ? "bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]"
                    : "bg-[hsl(var(--brand-purple))] text-white",
                )}
              >
                {index + 1}
              </span>
              <h3 className="font-display text-[22px] font-extrabold text-[hsl(var(--brand-navy))] sm:text-[26px]">
                {title}
              </h3>
            </div>
            <div className="grid min-h-[280px] flex-1 place-items-center overflow-hidden rounded-2xl bg-brand-lavender p-4">
              <div className="w-full min-w-0">
                <Visual />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
