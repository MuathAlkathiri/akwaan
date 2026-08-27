"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import {
  adminNavigation,
  isAdminNavigationActive,
} from "@/config/admin-navigation";

/** Worlds are the primary destination; everything else hangs off them. The
 *  public nav mirrors the approved Pencil homepage design. */
const userNavItems = [
  { label: "الرئيسية", href: "/" },
  { label: "كيف نلعب", href: "/#why" },
  { label: "العوالم", href: "/#worlds" },
];

/**
 * One entry point, two surfaces. The site header carries navigation and the
 * account controls; the Match header is a compact HUD that carries the live
 * scoreboard. They are split so the Match bar never depends on the auth provider
 * (a live Match renders it inside the session, not the site shell) while the site
 * header keeps its existing behaviour untouched.
 */
export function Header({
  merged = false,
  variant = "default",
  hud,
}: {
  merged?: boolean;
  variant?: "default" | "match";
  /** The Match HUD (scoreboard) placed opposite the logo in Match mode. */
  hud?: React.ReactNode;
}) {
  if (variant === "match") {
    return <MatchHeaderBar merged={merged} hud={hud} />;
  }
  return <SiteHeader merged={merged} />;
}

/** Full-width Match bar: logo + Team 1 right, VS centred, Team 2 left. */
function MatchHeaderBar({
  merged,
  hud,
}: {
  merged: boolean;
  hud?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 w-full shrink-0 bg-white",
        merged
          ? "border-b border-[hsl(var(--brand-navy)/.08)]"
          : "border-b border-border/60",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[92rem] items-center gap-8 px-3 sm:h-[4.5rem] sm:px-5 lg:px-8">
        <Link
          href="/"
          className="relative block h-10 w-20 shrink-0 overflow-hidden sm:h-12 sm:w-28"
          aria-label="أكوان - العودة للرئيسية"
        >
          <Image
            src="/brand/akwaan-logo.png"
            alt=""
            fill
            priority
            sizes="(min-width: 640px) 112px, 80px"
            className="object-contain"
          />
        </Link>
        {hud ? (
           <div className="min-w-0 flex-1" data-testid="match-hud-safe-area">{hud}</div>
        ) : null}
      </div>
    </header>
  );
}

function SiteHeader({ merged }: { merged: boolean }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin, isAuthenticated, logout } = useAuth();
  const isLoginPage = pathname === "/login";
  const visibleItems = isAdmin
    ? adminNavigation
    : [
        ...userNavItems,
        ...(isAuthenticated ? [{ label: "مبارياتي", href: "/matches" }] : []),
      ];
  // Admins only see their nav once signed in; the public World nav shows for
  // everyone (guests included), matching the home design's centre links.
  const showNav = isAdmin ? isAuthenticated : true;
  const navItems = (closeOnNavigate = false) =>
    visibleItems.map((item) => {
      const itemPath = item.href.split("#")[0].split("?")[0] || "/";
      const isHashLink = item.href.includes("#");
      const isActive =
        !isHashLink &&
        (isAdmin
          ? isAdminNavigationActive(pathname, itemPath)
          : pathname === itemPath);

      return (
        <Link
          key={`${item.label}-${item.href}`}
          href={item.href}
          onClick={closeOnNavigate ? () => setMobileOpen(false) : undefined}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "relative whitespace-nowrap text-[15px] transition-colors duration-200 after:origin-center after:transition-transform after:duration-200 before:transition-[opacity,transform] before:duration-200",
            isAdmin
              ? cn(
                  "rounded-lg px-4 py-2 text-sm font-bold hover:bg-muted hover:text-primary",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )
              : cn(
                  "px-1 py-2 text-[hsl(var(--brand-navy)/.72)] hover:text-[hsl(var(--brand-navy))]",
                  isActive &&
                    "font-bold text-[hsl(var(--brand-navy))] after:absolute after:-bottom-0.5 after:left-1/2 after:h-px after:w-12 after:-translate-x-1/2 after:scale-x-100 after:bg-[hsl(var(--brand-navy)/.7)] before:absolute before:bottom-[-3px] before:left-1/2 before:z-10 before:size-1.5 before:-translate-x-1/2 before:scale-100 before:rounded-full before:bg-[hsl(var(--brand-gold))] before:opacity-100",
                ),
          )}
        >
          {item.label}
        </Link>
      );
    });

  // One header, one surface. It shares the page canvas instead of floating in a
  // second card, so the brand, navigation and Home content read as one system.
  return (
    <header
      className={cn(
        "sticky top-0 z-20 w-full shrink-0 bg-white",
        merged
          ? "border-b border-[hsl(var(--brand-navy)/.08)]"
          : "border-b border-border/60",
      )}
    >
      <div className="relative mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6 lg:h-[84px] lg:px-20">
        <div className="flex shrink-0 items-center">
          <Link
            href="/"
            className="relative block h-14 w-28 overflow-hidden sm:h-16 sm:w-36"
            aria-label="أكوان - الرئيسية"
          >
            <Image
              src="/brand/akwaan-logo.png"
              alt="أكوان"
              fill
              priority
              sizes="(min-width: 640px) 144px, 128px"
              className="object-contain"
            />
          </Link>
        </div>

        {showNav && (
          <nav className="hidden items-center gap-6 md:flex lg:gap-10">
            {navItems()}
          </nav>
        )}

        <div className="flex min-w-28 shrink-0 items-center justify-end gap-1.5 sm:min-w-36 sm:gap-3">
          {showNav && (
            <button
              type="button"
              aria-label={
                mobileOpen ? "إغلاق قائمة التنقل" : "فتح قائمة التنقل"
              }
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileOpen((open) => !open)}
              className="grid size-10 place-items-center rounded-full text-[hsl(var(--brand-navy))] transition-colors hover:bg-[hsl(var(--brand-navy)/.06)] md:hidden"
            >
              {mobileOpen ? (
                <X className="size-5" aria-hidden />
              ) : (
                <Menu className="size-5" aria-hidden />
              )}
            </button>
          )}
          {isAuthenticated ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-muted-foreground hover:text-primary"
            >
              خروج
            </Button>
          ) : isLoginPage ? null : (
            <Link
              href="/login"
              className="inline-flex items-center rounded-2xl bg-[hsl(var(--brand-navy))] px-3 py-2.5 text-xs font-bold text-white shadow-[0px_5px_12px_0px_#1A183D1A] outline outline-1 -outline-offset-1 outline-[hsl(var(--brand-navy))] transition-colors hover:bg-[hsl(var(--brand-navy)/.92)] sm:px-5 sm:text-sm"
            >
              تسجيل الدخول
            </Link>
          )}
        </div>

        {showNav && mobileOpen && (
          <nav
            id="mobile-navigation"
            className="absolute inset-x-3 top-[calc(100%_-_2px)] grid gap-1 rounded-2xl border border-[hsl(var(--brand-navy)/.08)] bg-white p-3 text-right shadow-[0_18px_42px_-24px_rgba(24,16,54,.32)] md:hidden"
          >
            {navItems(true)}
          </nav>
        )}
      </div>
    </header>
  );
}
