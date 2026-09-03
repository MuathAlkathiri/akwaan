import { cn } from "@/lib/utils";
import { ConnectVisual, SharedScreenVisual } from "./step-visuals";
import { PlayVisual } from "./play-visual";
import { WorldsVisual } from "./worlds-visual";

const STEPS = [
  {
    key: "screen",
    title: "جهزوا الشاشة",
    copy: "افتحوا أكوان على شاشة يشوفها الجميع، ومنها تتابعون التحديات والنتيجة والمباراة.",
    Visual: SharedScreenVisual,
  },
  {
    key: "worlds",
    title: "اختاروا 3 عوالم",
    copy: "اختاروا 3 عوالم للمباراة، وكل عالم له تحدياته وهويته الخاصة.",
    Visual: WorldsVisual,
  },
  {
    key: "connect",
    title: "اربطوا جوالاتكم",
    copy: "امسحوا الرمز مرة وحدة، وجوالكم يبقى معكم طول المباراة.",
    Visual: ConnectVisual,
  },
  {
    key: "play",
    title: "العبوا وتنافسوا",
    copy: "ناقشوا، جاوبوا، خاطروا واقرأوا خصومكم، وأكوان يحسب كل شيء تلقائيًا.",
    Visual: PlayVisual,
  },
] as const;

/**
 * The walkthrough: four steps, each a full band of the page rather than a tile
 * in a grid.
 *
 * Steps alternate which side carries the picture, so the eye crosses the page on
 * the way down instead of running along one rail. In RTL the odd steps put their
 * words on the right — where reading starts — and the even ones answer from the
 * left. On a phone the two halves stack, and the picture always leads: it is the
 * faster of the two to read, and it sets up the sentence underneath it.
 */
export function HowToPlayJourney() {
  return (
    <section
      aria-labelledby="how-to-play-journey-title"
      className="relative mx-auto w-full max-w-6xl px-4 py-9 sm:px-6 lg:py-14"
    >
      <h2 id="how-to-play-journey-title" className="sr-only">
        خطوات اللعب
      </h2>

      <JourneyConnector />

      <ol className="relative z-10 list-none space-y-14 lg:space-y-24">
        {STEPS.map(({ key, title, copy, Visual }, index) => {
          const wordsFirst = index % 2 === 0;
          return (
            <li
              key={key}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
            >
              <div
                className={cn(
                  "order-2 text-center lg:order-none lg:text-right",
                  // `order-none` hands the columns back to source order, so this
                  // flip is the only thing deciding which side words land on.
                  wordsFirst ? "lg:col-start-1" : "lg:col-start-2",
                )}
              >
                <div className="flex items-center justify-center gap-3 lg:justify-start">
                  <span
                    aria-hidden
                    className="akwaan-numeral grid size-10 shrink-0 place-items-center rounded-full border border-[hsl(var(--brand-gold)/.45)] bg-[hsl(var(--brand-gold)/.12)] text-base font-black text-[hsl(var(--brand-navy))]"
                  >
                    {index + 1}
                  </span>
                  <h3 className="text-2xl font-black text-[hsl(var(--brand-navy))] sm:text-[1.75rem]">
                    {title}
                  </h3>
                </div>
                <p className="mt-4 text-base leading-loose text-[hsl(var(--brand-navy)/.66)] sm:text-lg">
                  {copy}
                </p>
              </div>

              <div
                className={cn(
                  "order-1 lg:order-none",
                  wordsFirst ? "lg:col-start-2" : "lg:col-start-1",
                  "lg:row-start-1",
                )}
              >
                <Visual />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * The thread the four steps hang from.
 *
 * On a phone it is a plain vertical rule — a timeline, which is what a stacked
 * list of steps actually is. From `lg` up, where the steps alternate sides, it
 * becomes a slow S-curve crossing between them with a few small nodes on it. It
 * is decoration and sits behind the content at very low contrast; nothing on the
 * page depends on it being visible.
 */
function JourneyConnector() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-16 right-4 w-px bg-gradient-to-b from-transparent via-[hsl(var(--brand-gold)/.35)] to-transparent sm:right-6 lg:hidden"
      />

      <svg
        aria-hidden
        viewBox="0 0 1000 1600"
        fill="none"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 z-0 hidden h-full w-full lg:block"
      >
        <path
          d="M300 60 C760 260, 240 420, 700 620 C240 820, 760 980, 300 1180 C700 1340, 500 1480, 500 1560"
          stroke="hsl(var(--brand-gold))"
          strokeWidth="1.25"
          strokeDasharray="5 9"
          opacity=".3"
        />
        {[
          [300, 60],
          [700, 620],
          [300, 1180],
          [500, 1560],
        ].map(([cx, cy]) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r="4"
            fill="hsl(var(--brand-gold))"
            opacity=".34"
          />
        ))}
      </svg>
    </>
  );
}
