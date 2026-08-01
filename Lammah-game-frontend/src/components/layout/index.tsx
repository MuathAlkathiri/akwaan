"use client";

import { usePathname } from "next/navigation";
import { Header } from "./header";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";

export function isGameBoardPath(pathname: string) {
  return (
    pathname !== "/games/new" &&
    /^\/games\/[^/]+$/.test(pathname)
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAdmin, isAuthenticated } = useAuth();
  const isPlayerHome = pathname === "/" && isAuthenticated && !isAdmin;
  const isPlayerExperience = isAuthenticated && !isAdmin;
  const isGameBoard = isPlayerExperience && isGameBoardPath(pathname);

  return (
    <div
      className={cn(
        "min-h-screen",
        isPlayerExperience &&
          "dark bg-[#130d27] text-white [background-image:radial-gradient(circle_at_50%_10%,rgba(139,92,246,.22),transparent_38rem),radial-gradient(circle_at_12%_32%,rgba(91,33,182,.11),transparent_28rem),radial-gradient(circle_at_88%_70%,rgba(109,40,217,.09),transparent_30rem),radial-gradient(circle_at_8%_58%,transparent_0,transparent_8.9rem,rgba(196,181,253,.025)_9rem,transparent_9.1rem),radial-gradient(circle_at_92%_35%,transparent_0,transparent_11.9rem,rgba(196,181,253,.022)_12rem,transparent_12.1rem),radial-gradient(circle_at_1px_1px,rgba(255,255,255,.038)_1px,transparent_0),linear-gradient(180deg,#1c1238_0%,#15102b_52%,#100b21_100%)] [background-size:auto,auto,auto,auto,auto,30px_30px,auto]",
      )}
    >
      {!isGameBoard && <Header />}
      <main
        className={cn(
          "min-h-[calc(100vh-5.5rem)]",
          isGameBoard && "min-h-screen lg:h-dvh lg:overflow-hidden",
        )}
      >
        {isPlayerHome || isGameBoard ? (
          children
        ) : (
          <div
            className={cn(
              "container py-8 md:py-12",
              isPlayerExperience && "max-w-[1800px]",
            )}
          >
            {children}
          </div>
        )}
      </main>
      <Toaster position="bottom-center" />
    </div>
  );
}
