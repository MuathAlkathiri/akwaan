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

const userNavItems = [
  { label: "الرئيسية", href: "/" },
  { label: "الألعاب", href: "/games" },
  { label: "ألعابي", href: "/games" },
  { label: "حسابي", href: "/#account" },
];

export function Header() {
  const pathname = usePathname();
  const { user, isAdmin, isAuthenticated, logout } = useAuth();
  const visibleItems = isAdmin ? adminNavigation : userNavItems;
  const displayName = user?.fullName || "لاعب";
  const initial = displayName.trim().charAt(0) || "ل";
  const isPlayerExperience = isAuthenticated && !isAdmin;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full px-4 py-3",
        isPlayerExperience &&
          "border-b border-white/[0.06] bg-[#110b25]/78 text-white shadow-[0_10px_28px_rgba(5,2,16,.2)] backdrop-blur-xl",
      )}
    >
      <div
        className={cn(
          "container flex min-h-16 items-center justify-between gap-4 rounded-lg border bg-card/95 px-4 shadow-sm backdrop-blur-xl md:px-6",
          isPlayerExperience &&
            "border-white/10 bg-[#211a38]/88 shadow-[0_10px_28px_rgba(4,1,15,.22)] backdrop-blur-xl",
        )}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="relative block h-12 w-36 shrink-0 sm:w-40"
            aria-label="لمة - الرئيسية"
          >
            <Image
              src="/brand/lammah-logo.png"
              alt="لمة"
              fill
              priority
              sizes="160px"
              className="object-contain drop-shadow-[0_4px_10px_rgba(91,33,182,.2)]"
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
                  : pathname === itemPath ||
                    (itemPath === "/games" && pathname.startsWith("/games/")));

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
              <div className="hidden items-center gap-3 rounded-lg border bg-muted/50 px-3 py-2 sm:flex">
                <Avatar>
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
