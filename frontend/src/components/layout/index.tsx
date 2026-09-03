"use client";

import { usePathname } from "next/navigation";
import { Header } from "./header";
import { Footer } from "./footer";
import { Toaster } from "@/components/ui/sonner";
import { AkwaanBackground } from "@/components/akwaan/akwaan-background";
import { cn } from "@/lib/utils";
import { MATCH_SETUP_ROUTE } from "@/features/match-setup";

/**
 * The player journey: home, a World, and the Match itself. These screens own their
 * own surface edge to edge, so the shell neither wraps them in the page container
 * nor paints anything behind them.
 */
export function isJourneyPath(pathname: string) {
  return (
    pathname === "/" || pathname.startsWith("/worlds") || isMatchPath(pathname)
  );
}

export function isAuthPath(pathname: string) {
  return pathname === "/login";
}

/**
 * The How to Play walkthrough, which lays out edge to edge like the journey
 * screens rather than sitting in the standard page container.
 */
export function isStoryPath(pathname: string) {
  return pathname === "/how-to-play";
}

/**
 * Whether this route belongs to the player-facing visual environment.
 *
 * Standard player pages all consume the same shell-owned environment. Admin and
 * paired/live gameplay surfaces keep their purpose-built canvases.
 *
 * It is deliberately absent from three places. Admin is a tool, not a room. A
 * paired phone is held at arm's length and gains nothing from a background it
 * cannot see, while an rAF loop on it would cost battery for a whole Match. And
 * the retired classic game keeps its own look.
 */
export function hasCosmicBackground(pathname: string) {
  if (
    isAuthPath(pathname) ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/join/") ||
    pathname.startsWith("/live-sessions/")
  ) {
    return false;
  }
  return true;
}

/**
 * Surfaces that own their whole screen: a Match, and a paired phone.
 *
 * Both are game surfaces rather than pages of a website. A phone in particular
 * must never be offered "دخول / حساب جديد" — its player has no account and is
 * mid-Match; site chrome there is an invitation to leave the game.
 */
export function isMatchPath(pathname: string) {
  // `/matches/new` is the setup wizard, not a Match: it is an ordinary page with
  // site chrome, and a host who lands there has not started anything yet.
  return (
    (pathname.startsWith("/matches/") && pathname !== MATCH_SETUP_ROUTE) ||
    pathname.startsWith("/join/")
  );
}

export function isHostMatchPath(pathname: string) {
  return pathname.startsWith("/matches/") && pathname !== MATCH_SETUP_ROUTE;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isJourney = isJourneyPath(pathname);
  const isMatch = isMatchPath(pathname);
  const isHostMatch = isHostMatchPath(pathname);
  const isPairedMatch = pathname.startsWith("/join/");
  const isAuth = isAuthPath(pathname);
  // The retired identity painted a dark purple canvas behind every authenticated
  // player screen. Akwaan is one warm room: the surface comes from the tokens, and
  // nothing paints over it.
  const bare = isJourney || isMatch || isAuth || isStoryPath(pathname);
  const hasBackground = hasCosmicBackground(pathname);
  const hasPageArtwork = hasBackground;

  return (
    <div
      className={cn(
        "relative flex min-h-screen flex-col",
        hasPageArtwork && "isolate bg-white",
      )}
    >
      {hasPageArtwork && <AkwaanBackground />}
      {/* The live Match renders its own header HUD from inside the session (so the
          score can reach it); the shell supplies the header everywhere else. */}
      {!isAuth && !isPairedMatch && !isHostMatch && (
        <Header merged={hasPageArtwork} />
      )}
      <main
        data-testid="app-main"
        className={cn(
          "relative z-10 flex-1",
          isAuth
            ? "min-h-screen"
            : !isPairedMatch && "min-h-[calc(100vh-5.5rem)]",
        )}
      >
        {bare ? (
          children
        ) : (
          <div className="container py-8 md:py-12">{children}</div>
        )}
      </main>
      {/* The footer belongs to the website, not to a game surface: a live Match
          and a paired phone own their whole screen, and the login page is a
          single focused card. */}
      {!isAuth && !isPairedMatch && !isHostMatch && <Footer />}
      <Toaster />
    </div>
  );
}
