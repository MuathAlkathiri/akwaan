"use client";

import Image from "next/image";
import Link from "next/link";
import { smoothScrollToHash } from "./header";

/**
 * The same destinations the header offers, in the order a visitor is likely to
 * want them. `العوالم` is a section of the home page rather than a route, so it
 * keeps the header's own `/#worlds` target — this file adds no second idea of
 * where a World lives.
 */
const QUICK_LINKS = [
  { label: "الرئيسية", href: "/" },
  { label: "العوالم", href: "/#worlds" },
  { label: "كيف تلعب", href: "/how-to-play" },
  { label: "مبارياتي", href: "/matches" },
];

const LEGAL_LINKS = [
  { label: "شروط الاستخدام", href: "/terms" },
  { label: "سياسة الخصوصية", href: "/privacy" },
];

const SUPPORT_EMAIL = "support@playakwaan.com";

/**
 * The close of the page: who Akwaan is, where to go next, and how to reach us.
 *
 * Composed rather than columned. Three equal columns gave the brand exactly as
 * much weight as a list of legal links, which read as a corporate template. Here
 * the mark sits alone on the right and the two utility lists cluster together on
 * the left, dropped a little below it — enough that the eye starts at the brand,
 * not so much that the footer reads as two separate strips.
 *
 * It stays deliberately short. This is the end of a page, not a section of one,
 * so the offset and the grouping do the work that extra height would otherwise
 * be asked to do.
 */
export function Footer() {
  return (
    <footer className="relative z-10 mt-auto overflow-hidden border-t border-[hsl(var(--brand-navy)/.08)] bg-white">
      <FooterOrbit />

      {/* Narrower than the header's full-bleed width on purpose: at 1440px the
          blocks drifted so far apart they stopped reading as one composition. */}
      <div className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-9">
        <div className="flex flex-col gap-8 text-right md:flex-row md:items-start md:justify-between md:gap-10">
          {/* Brand — right, and highest on the page. */}
          <div className="md:max-w-[17rem]">
            <div className="relative h-9 w-[6.4rem] sm:h-10 sm:w-28">
              <Image
                src="/brand/akwaan-logo.png"
                alt="أكوان"
                fill
                sizes="(min-width: 640px) 112px, 102px"
                className="object-contain object-right"
              />
            </div>
            {/* Quieter than the mark, and broken where the sentence breaks. */}
            <p className="mt-3 text-sm leading-7 text-[hsl(var(--brand-navy)/.6)]">
              لعبة جماعية تجمع المعرفة،
              <br />
              التحدي والحماس.
            </p>
          </div>

          {/* The two utility lists, kept together and set a touch lower than the
              brand. The offset is desktop-only: stacked, it would read as a gap. */}
          {/* `me-*` is margin-inline-end, so in RTL it pulls the cluster in from
              the left edge to left-of-centre — close enough that the footer
              reads as one composition rather than two facing corners. */}
          <div className="flex flex-wrap gap-x-12 gap-y-8 sm:gap-x-16 md:mt-[22px] md:me-10 lg:me-24">
            <FooterNav id="footer-quick-links" title="روابط سريعة">
              {QUICK_LINKS.map((item) => (
                <li key={item.href}>
                  <FooterLink href={item.href}>{item.label}</FooterLink>
                </li>
              ))}
            </FooterNav>

            <FooterNav id="footer-legal" title="الدعم والقانونية">
              {LEGAL_LINKS.map((item) => (
                <li key={item.href}>
                  <FooterLink href={item.href}>{item.label}</FooterLink>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  dir="ltr"
                  className="inline-block rounded-sm text-sm text-[hsl(var(--brand-navy)/.72)] transition-colors hover:text-[hsl(var(--brand-navy))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold))] focus-visible:ring-offset-2"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
            </FooterNav>
          </div>
        </div>

        <div className="mt-8 border-t border-[hsl(var(--brand-navy)/.08)] pt-5 text-center text-sm text-muted-foreground">
          © 2026 أكوان. جميع الحقوق محفوظة.
        </div>
      </div>
    </footer>
  );
}

/** One titled list of links, so both groups are built the same way. */
function FooterNav({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <nav aria-labelledby={id}>
      <h2
        id={id}
        className="text-sm font-black text-[hsl(var(--brand-navy))]"
      >
        {title}
      </h2>
      <ul className="mt-3 list-none space-y-2.5">{children}</ul>
    </nav>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // A hash link glides to its section through the header's helper rather
      // than this file growing a second copy of that behaviour.
      onClick={(event) =>
        href.includes("#") ? smoothScrollToHash(event, href) : undefined
      }
      className="inline-block rounded-sm text-sm text-[hsl(var(--brand-navy)/.72)] transition-colors hover:text-[hsl(var(--brand-navy))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold))] focus-visible:ring-offset-2"
    >
      {children}
    </Link>
  );
}

/**
 * One orbit arc behind the brand, in the same stroke language the shell's
 * background already uses. Decoration only, and only where there is room for it:
 * on a phone the footer is a stack of text and has none to spare.
 */
function FooterOrbit() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 520 200"
      fill="none"
      className="pointer-events-none absolute -top-10 right-[-7rem] h-44 w-[520px] max-md:hidden"
    >
      <ellipse
        cx="260"
        cy="100"
        rx="238"
        ry="60"
        transform="rotate(-16 260 100)"
        stroke="hsl(var(--brand-gold))"
        strokeWidth="1"
        opacity=".13"
      />
      <ellipse
        cx="264"
        cy="98"
        rx="250"
        ry="80"
        transform="rotate(-22 264 98)"
        stroke="hsl(var(--brand-navy))"
        strokeWidth=".75"
        strokeDasharray="3 7"
        opacity=".05"
      />
    </svg>
  );
}
