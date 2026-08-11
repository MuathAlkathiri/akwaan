"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/components/auth/auth-provider";
import {
  adminNavigation,
  isAdminNavigationActive,
} from "@/config/admin-navigation";

/** Worlds are the primary destination; everything else hangs off them. */
const userNavItems = [
  { label: "الرئيسية", href: "/" },
  { label: "العوالم", href: "/#all-worlds" },
];

export function Header() {
  const pathname = usePathname();
  const { user, isAdmin, isAuthenticated, logout } = useAuth();
  const visibleItems = isAdmin ? adminNavigation : userNavItems;
  const displayName = user?.fullName || "لاعب";
  const initial = displayName.trim().charAt(0) || "ل";

  // One header, one surface. It shares the page canvas instead of floating in a
  // second card, so the brand, navigation and Home content read as one system.
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/95 backdrop-blur-xl">
      <div className="container flex min-h-[72px] items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex shrink-0 items-center">
          <Link
            href="/"
            className="relative block h-14 w-32 overflow-hidden sm:h-16 sm:w-36"
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

        {isAuthenticated && (
          <nav className="flex max-w-[46vw] items-center gap-2 overflow-x-auto md:max-w-none">
            {visibleItems.map((item) => {
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
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-bold transition-colors hover:bg-muted hover:text-primary",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <div className="hidden items-center gap-2 rounded-lg border border-border/70 bg-card/45 px-2.5 py-1.5 sm:flex">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-accent text-accent-foreground">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <span className="leading-tight">
                  <span className="block text-sm font-black">
                    {displayName}
                  </span>
                  <span className="block text-xs font-bold text-muted-foreground">
                    مرحبًا بك 👋
                  </span>
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-muted-foreground hover:text-primary"
              >
                خروج
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-bold text-muted-foreground hover:text-primary"
              >
                دخول
              </Link>
              <Link href="/register">
                <Button size="sm">حساب جديد</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
