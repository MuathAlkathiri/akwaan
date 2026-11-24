import Link from "next/link";
import { cn } from "@/lib/utils";
import { STICKER } from "@/components/akwaan/sticker";

const PAGES = [
  { key: "terms", href: "/terms", label: "شروط الاستخدام" },
  { key: "privacy", href: "/privacy", label: "سياسة الخصوصية" },
  { key: "refund", href: "/refund", label: "سياسة الاسترجاع" },
] as const;

export type LegalPageKey = (typeof PAGES)[number]["key"];

/** A section's anchor, derived from its position so it never drifts. */
export const legalAnchor = (index: number) => `section-${index + 1}`;

/**
 * The one frame all three legal pages share.
 *
 * Deliberately the quietest pages on the site: no stars, no tilt, no
 * decoration. The words are a contract, so the frame only does two things —
 * lets a reader move between the three documents, and jump to a section of
 * the one they are on. The text itself is the page's own and is never
 * rephrased here.
 */
export function LegalShell({
  current,
  title,
  sections,
  children,
}: {
  current: LegalPageKey;
  title: string;
  /** Section titles, in order: they build the «في هذي الصفحة» box. */
  sections: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <main className="relative z-10 mx-auto w-full max-w-[1180px] px-4 pb-20 pt-8 text-right sm:px-8 sm:pt-12">
      <nav aria-label="الصفحات القانونية" className="flex flex-wrap gap-3">
        {PAGES.map((page) => (
          <Link
            key={page.key}
            href={page.href}
            aria-current={page.key === current ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border-[3px] border-brand-navy px-5 text-[15px] font-bold text-brand-navy no-underline",
              page.key === current ? "bg-brand-gold" : "bg-white",
            )}
          >
            {page.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8 flex flex-col items-start gap-8 lg:flex-row-reverse">
        <aside className="w-full shrink-0 rounded-[20px] border-[3px] border-brand-navy bg-brand-lavender p-5 lg:sticky lg:top-28 lg:w-[280px]">
          <h2 className="font-display text-lg font-extrabold text-brand-navy">
            في هذي الصفحة
          </h2>
          <ol className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {sections.map((section, index) => (
              <li key={section}>
                <a
                  href={`#${legalAnchor(index)}`}
                  className="text-[15px] font-semibold leading-7 text-brand-navy underline-offset-4 hover:underline"
                >
                  {index + 1}. {section}
                </a>
              </li>
            ))}
          </ol>
        </aside>

        <article
          className={cn(
            "w-full min-w-0 flex-1 rounded-3xl bg-brand-paper px-5 py-8 sm:px-10 sm:py-10",
            STICKER.base,
          )}
        >
          <div className="mx-auto max-w-[760px]">
            <h1 className="font-display text-3xl font-black text-brand-navy sm:text-[40px]">
              {title}
            </h1>
            <div className="mt-8 space-y-9 text-base leading-[2] text-brand-navy sm:text-[17px]">
              {children}
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}

/** One numbered section. The numeral is purple; nothing else is coloured. */
export function LegalSection({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={legalAnchor(index)} className="scroll-mt-28 space-y-3">
      <h2 className="flex items-baseline gap-3 font-display text-xl font-extrabold text-brand-navy sm:text-2xl">
        <span aria-hidden className="text-brand-purple">
          {index + 1}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
