"use client";

import Link from "next/link";
import { smoothScrollToHash } from "./header";

const QUICK_LINKS = [
  { label: "الرئيسية", href: "/" },
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
 * Three columns on desktop collapse to one stacked column on a phone, over a
 * single centred copyright row.
 */
export function Footer() {
  return (
    <footer className="relative z-10 mt-auto border-t border-[hsl(var(--brand-navy)/.08)] bg-white">
      {/* Narrower than the header's full-bleed width on purpose: at 1440px the
          three columns drifted so far apart they stopped reading as one block. */}
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 text-right md:grid-cols-3">
          <div>
            <p className="text-2xl font-black text-[hsl(var(--brand-navy))] sm:text-3xl">
              أكوان
            </p>
            <p className="mt-3 max-w-xs text-sm leading-7 text-muted-foreground">
              لعبة تحديات ومعرفة تجمعك مع أصحابك في عوالم مختلفة.
            </p>
          </div>

          <nav aria-labelledby="footer-quick-links">
            <h2
              id="footer-quick-links"
              className="text-base font-black text-[hsl(var(--brand-navy))]"
            >
              روابط سريعة
            </h2>
            <ul className="mt-4 list-none space-y-3">
              {QUICK_LINKS.map((item) => (
                <li key={item.href}>
                  <FooterLink href={item.href}>{item.label}</FooterLink>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-legal">
            <h2
              id="footer-legal"
              className="text-base font-black text-[hsl(var(--brand-navy))]"
            >
              الدعم والقانونية
            </h2>
            <ul className="mt-4 list-none space-y-3">
              {LEGAL_LINKS.map((item) => (
                <li key={item.href}>
                  <FooterLink href={item.href}>{item.label}</FooterLink>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  dir="ltr"
                  className="inline-block text-sm text-[hsl(var(--brand-navy)/.72)] transition-colors hover:text-[hsl(var(--brand-navy))]"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 border-t border-[hsl(var(--brand-navy)/.08)] pt-6 text-center text-sm text-muted-foreground">
          © 2026 أكوان. جميع الحقوق محفوظة.
        </div>
      </div>
    </footer>
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
      // The footer's "كيف تلعب" glides to the section the same way the header's
      // does, rather than snapping the reader back up the page.
      onClick={(event) =>
        href.includes("#") ? smoothScrollToHash(event, href) : undefined
      }
      className="inline-block text-sm text-[hsl(var(--brand-navy)/.72)] transition-colors hover:text-[hsl(var(--brand-navy))]"
    >
      {children}
    </Link>
  );
}
