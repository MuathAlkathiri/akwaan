import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";

/** What an account is for, in three lines — each one true of the product. */
const REASONS = [
  "مبارياتك ورصيدك محفوظين في حسابك",
  "بدون كلمة سر، رمز يوصلك وتدخل",
  "كمل لعبك من أي جهاز",
] as const;

/** A star from the identity, outlined in navy the way the design draws it. */
function Star({ fill, className }: { fill: string; className: string }) {
  return (
    <svg
      aria-hidden
      viewBox="-12 -12 24 24"
      className={`pointer-events-none absolute ${className}`}
    >
      <path
        d="M0 -10 Q1.8 -1.8 10 0 Q1.8 1.8 0 10 Q-1.8 1.8 -10 0 Q-1.8 -1.8 0 -10Z"
        fill={fill}
        stroke="hsl(var(--brand-navy))"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The frame around signing in.
 *
 * One task on the page, so the header is cut down to the logo and a single
 * way out to «كيف تلعب». The card is the page; the lavender panel beside it
 * only says why an account is worth having, and drops under the card on a
 * phone, where the form must come first.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative isolate flex min-h-screen w-full flex-col gap-7 bg-white px-4 pb-12 pt-6 sm:px-10 lg:px-20">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          aria-label="أكوان، الرئيسية"
          className="relative block h-[54px] w-[124px] shrink-0"
        >
          <Image
            src="/brand/logo-header.svg"
            alt="أكوان"
            fill
            priority
            sizes="124px"
            className="object-contain object-right"
          />
        </Link>
        <Link
          href="/how-to-play"
          className="inline-flex min-h-11 items-center text-base font-bold text-brand-navy no-underline hover:text-brand-bronze"
        >
          كيف تلعب
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col items-stretch gap-10 lg:flex-row lg:gap-14">
        <main className="flex flex-1 items-center justify-center">
          {children}
        </main>

        <aside className="relative flex flex-1 flex-col items-center justify-center gap-7 rounded-[32px] border-[3px] border-brand-navy bg-brand-lavender p-10 shadow-[8px_9px_0_hsl(var(--brand-navy))]">
          <Star
            fill="hsl(var(--brand-purple))"
            className="right-11 top-9 size-[60px] rotate-12"
          />
          <Star
            fill="hsl(var(--brand-gold))"
            className="left-[60px] top-[110px] size-9 -rotate-[10deg]"
          />
          <Star
            fill="hsl(var(--brand-purple))"
            className="bottom-12 left-12 size-11 rotate-[8deg]"
          />
          {/* The full mark, as the home hero draws it: a plain element, since
              an SVG gains nothing from the image optimiser. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-full.svg"
            alt="أكوان"
            className="block h-auto w-[340px] max-w-[80%] select-none"
            draggable={false}
          />
          <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
            {REASONS.map((reason) => (
              <li
                key={reason}
                className="flex items-center gap-3 text-base font-semibold text-brand-navy sm:text-lg"
              >
                <span
                  aria-hidden
                  className="grid size-[30px] shrink-0 place-items-center rounded-full border-2 border-brand-navy bg-brand-gold"
                >
                  <Check className="size-3.5" strokeWidth={3.5} />
                </span>
                {reason}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
