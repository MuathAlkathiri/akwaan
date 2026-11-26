import { cn } from "@/lib/utils";

/**
 * The small ringed planet with a face that fronts every state and every wait.
 *
 * Happy while something is being prepared, level when something went missing.
 * Never sad and never red: a lost connection or a missing page is not the
 * player's mistake.
 */
export function FacePlanet({
  mood = "level",
  className,
}: {
  mood?: "happy" | "level";
  className?: string;
}) {
  const navy = "hsl(var(--brand-navy))";
  return (
    <svg aria-hidden viewBox="0 0 80 80" className={className}>
      <ellipse
        cx="40"
        cy="42"
        rx="36"
        ry="11"
        fill="none"
        stroke={navy}
        strokeWidth="3"
        transform="rotate(-14 40 42)"
      />
      <circle
        cx="40"
        cy="40"
        r="22"
        fill="#D9D0F3"
        stroke={navy}
        strokeWidth="3.5"
      />
      <path
        d="M5.5 47.5 A36 11 -14 0 0 74.5 36.5"
        fill="none"
        stroke={navy}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse cx="33" cy="37" rx="2.6" ry="3.8" fill={navy} />
      <ellipse cx="47" cy="37" rx="2.6" ry="3.8" fill={navy} />
      {mood === "happy" ? (
        <path
          d="M33 46 Q40 52 47 46"
          fill="none"
          stroke={navy}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M34 48 H46"
          fill="none"
          stroke={navy}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/**
 * One card for every state that is not the game itself: a missing page, a
 * stage that could not be drawn, a cancelled challenge.
 *
 * Lavender, not coral. It says what is safe before it says what to do, and a
 * raw technical message, where there is one, sits small and grey at the foot —
 * it is never the title.
 */
export function StateCard({
  title,
  line,
  actions,
  detail,
  size = "page",
  className,
  children,
  ...rest
}: {
  title: string;
  line?: React.ReactNode;
  /** Primary first. */
  actions?: React.ReactNode;
  /** Raw technical text, for support. */
  detail?: React.ReactNode;
  size?: "screen" | "phone" | "page";
  className?: string;
  children?: React.ReactNode;
  role?: string;
  dir?: string;
  "data-testid"?: string;
}) {
  return (
    <section
      dir="rtl"
      {...rest}
      className={cn(
        "mx-auto flex w-full flex-col items-center gap-4 rounded-[26px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-lavender text-center text-[hsl(var(--brand-navy))] shadow-[6px_7px_0_hsl(var(--brand-navy))]",
        size === "screen" && "max-w-3xl px-10 py-12",
        size === "page" && "max-w-xl px-8 py-10",
        size === "phone" && "max-w-sm px-5 py-8",
        className,
      )}
    >
      <FacePlanet className={size === "phone" ? "size-20" : "size-28"} />
      <h1
        className={cn(
          "font-display font-black leading-snug",
          size === "screen"
            ? "text-4xl"
            : size === "phone"
              ? "text-2xl"
              : "text-3xl",
        )}
      >
        {title}
      </h1>
      {line && (
        <p
          className={cn(
            "max-w-prose leading-relaxed text-brand-slate",
            size === "screen" ? "text-xl" : "text-base",
          )}
        >
          {line}
        </p>
      )}
      {children}
      {actions && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
          {actions}
        </div>
      )}
      {detail && (
        <p dir="ltr" className="font-mono text-xs text-brand-slate/80">
          {detail}
        </p>
      )}
    </section>
  );
}

/** The gold primary and the white secondary every state offers. */
export const STATE_ACTION = {
  primary:
    "inline-flex min-h-12 items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-6 font-display text-base font-extrabold text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5",
  secondary:
    "inline-flex min-h-12 items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white px-6 font-display text-base font-extrabold text-[hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5",
} as const;
