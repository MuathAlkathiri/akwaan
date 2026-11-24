import Image from "next/image";
import Link from "next/link";
import { Spark } from "@/components/akwaan/sticker";

/** What an account is for, in three lines — each one true of the product. */
const REASONS = [
  "مبارياتك ورصيدك محفوظين في حسابك",
  "بدون كلمة سر، رمز يوصلك وتدخل",
  "كمل لعبك من أي جهاز",
] as const;

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
    <section className="relative isolate flex min-h-screen w-full flex-col bg-white px-4 py-5 sm:px-8">
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="أكوان - الرئيسية"
          className="relative block h-12 w-28 shrink-0 sm:h-[60px] sm:w-36"
        >
          <Image
            src="/brand/akwaan-logo.png"
            alt="أكوان"
            fill
            priority
            sizes="144px"
            className="object-contain"
          />
        </Link>
        <Link
          href="/how-to-play"
          className="inline-flex min-h-11 items-center text-base font-semibold text-brand-navy no-underline hover:text-brand-bronze"
        >
          كيف تلعب
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col items-center justify-center gap-8 py-8 lg:flex-row lg:items-stretch lg:gap-10 lg:py-12">
        <div className="flex w-full max-w-[520px] items-center lg:flex-1">
          {children}
        </div>

        <aside
          className="relative flex w-full max-w-[520px] flex-col items-center justify-center gap-7 overflow-hidden rounded-[28px] border-[3px] border-brand-navy bg-brand-lavender px-6 py-10 text-center shadow-[6px_7px_0_hsl(var(--brand-navy))] lg:flex-1"
        >
          <Spark
            className="pointer-events-none absolute right-[12%] top-[10%] size-9"
            fill="hsl(var(--brand-purple))"
          />
          <Spark
            className="pointer-events-none absolute bottom-[12%] left-[10%] size-7"
            fill="hsl(var(--brand-gold))"
          />
          <Spark
            className="pointer-events-none absolute left-[18%] top-[16%] size-4"
            fill="hsl(var(--brand-gold))"
          />
          <div className="relative h-24 w-56 sm:h-28 sm:w-64">
            <Image
              src="/brand/akwaan-logo.png"
              alt=""
              fill
              sizes="256px"
              className="object-contain"
            />
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {REASONS.map((reason) => (
              <li
                key={reason}
                className="inline-flex items-center justify-center gap-2.5 text-base font-bold text-brand-navy sm:text-lg"
              >
                <Spark className="size-3 shrink-0" />
                {reason}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
