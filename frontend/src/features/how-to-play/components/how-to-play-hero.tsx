import { cn } from "@/lib/utils";

/** One of the two little faces from the logo, drawn the way the logo draws it. */
function Face({
  tone,
  className,
}: {
  tone: "purple" | "gold";
  className?: string;
}) {
  const fill =
    tone === "purple" ? "hsl(var(--brand-purple))" : "hsl(var(--brand-gold))";
  const ink = tone === "purple" ? "#F7F4ED" : "hsl(var(--brand-navy))";
  return (
    <svg aria-hidden viewBox="0 0 40 40" className={className}>
      <circle
        cx="21.5"
        cy="22"
        r="14"
        fill="hsl(var(--brand-navy))"
        stroke="hsl(var(--brand-navy))"
        strokeWidth="4"
      />
      <circle
        cx="19"
        cy="19"
        r="14"
        fill={fill}
        stroke="hsl(var(--brand-navy))"
        strokeWidth="4"
      />
      <ellipse cx="14.5" cy="18" rx="2.3" ry="3.4" fill={ink} />
      <ellipse cx="23.5" cy="18" rx="2.3" ry="3.4" fill={ink} />
      <path
        d="M15.5 24.5 Q19 27.5 22.5 24.5"
        fill="none"
        stroke={ink}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ToyPhone({
  tilt,
  action,
}: {
  tilt: string;
  action: "purple" | "gold";
}) {
  return (
    <span
      className={cn(
        "flex h-32 w-[74px] shrink-0 flex-col gap-2 rounded-2xl bg-white px-2.5 py-3",
        "border-[3px] border-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))]",
        tilt,
      )}
    >
      <span className="h-2.5 rounded-full bg-brand-mist" />
      <span className="h-2.5 w-[70%] rounded-full bg-brand-mist" />
      <span
        className={cn(
          "mt-auto h-[26px] rounded-[10px] border-2 border-[hsl(var(--brand-navy))]",
          action === "purple"
            ? "bg-[hsl(var(--brand-purple))]"
            : "bg-[hsl(var(--brand-gold))]",
        )}
      />
    </span>
  );
}

/**
 * The opening: what Akwaan is, in two sentences and one picture.
 *
 * The picture is a toy, not a screenshot — one big navy screen between two
 * small tilted phones. That is the whole idea of the game, and the real
 * screens come in the steps right under it.
 */
export function HowToPlayHero() {
  return (
    <section className="flex flex-wrap items-center justify-between gap-x-14 gap-y-10 pb-2 pt-6 lg:pt-10">
      <div className="flex max-w-[620px] flex-[1_1_440px] flex-col items-start">
        <h1 className="font-display text-[40px] font-black leading-[1.3] text-[hsl(var(--brand-navy))] sm:text-[62px]">
          كيف تلعب{" "}
          <span className="text-[hsl(var(--brand-purple))]">أكوان؟</span>
        </h1>
        <p className="mt-5 text-lg leading-[1.8] text-brand-slate sm:text-[23px]">
          شاشة وحدة تجمعكم، وجوال كل لاعب يصير أداة اللعب
        </p>
        <p className="mt-5 max-w-[560px] text-base leading-[1.9] text-brand-slate sm:text-[17px]">
          أكوان لعبة جماعية تلعبونها وأنتم في نفس الجلسة: شاشة وحدة قدامكم، وكل
          لاعب يمسك جواله. فكرة اللعبة إن المعرفة وحدها ما تكفي — تحتاج تقرأ
          خصمك، وتعرف العالم اللي اخترتوه.
        </p>
      </div>

      <div
        aria-hidden
        className="relative mx-auto flex min-h-[300px] max-w-[480px] flex-[1_1_340px] items-end justify-center gap-3.5"
      >
        <ToyPhone tilt="-rotate-[8deg]" action="purple" />
        <span
          className={cn(
            "mb-[26px] flex h-[190px] w-[260px] min-w-0 shrink flex-col gap-3 rounded-[20px] bg-[hsl(var(--brand-navy))] p-5",
            "border-[3px] border-[hsl(var(--brand-navy))] shadow-[6px_7px_0_hsl(var(--brand-gold))]",
          )}
        >
          <span className="h-3.5 w-[60%] rounded-full bg-[hsl(var(--brand-gold))]" />
          <span className="h-3 w-[80%] rounded-full bg-[#3A3470]" />
          <span className="mt-auto flex gap-2.5">
            <span className="h-10 flex-1 rounded-xl bg-[hsl(var(--brand-purple))]" />
            <span className="h-10 flex-1 rounded-xl bg-white" />
          </span>
        </span>
        <ToyPhone tilt="rotate-[7deg]" action="gold" />
        <Face
          tone="purple"
          className="absolute right-[6%] top-0 size-[62px] -rotate-[10deg]"
        />
        <Face
          tone="gold"
          className="absolute left-[8%] top-[30px] size-12 rotate-12"
        />
      </div>
    </section>
  );
}
