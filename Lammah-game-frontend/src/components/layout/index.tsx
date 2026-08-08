"use client";

import { usePathname } from "next/navigation";
import { Header } from "./header";
import { Toaster } from "@/components/ui/sonner";
import { Starfield } from "@/components/akwaan/starfield";
import { cn } from "@/lib/utils";
import { MATCH_SETUP_ROUTE } from "@/features/match-setup";

/**
 * The player journey: home, a World, and the Match itself. These screens own their
 * own surface edge to edge, so the shell neither wraps them in the page container
 * nor paints anything behind them.
 */
export function isJourneyPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/worlds") ||
    isMatchPath(pathname)
  );
}

/**
 * Where the lightly cosmic layer belongs.
 *
 * It is part of the Akwaan player identity, not a decoration on one route, so it
 * is mounted once here for every player-facing surface: home, a World, setup, and
 * the Match in all its stages.
 *
 * It is deliberately absent from three places. Admin is a tool, not a room. A
 * paired phone is held at arm's length and gains nothing from a background it
 * cannot see, while an rAF loop on it would cost battery for a whole Match. And
 * the retired classic game keeps its own look.
 */
export function hasCosmicBackground(pathname: string) {
  if (pathname.startsWith("/admin") || pathname.startsWith("/join/")) {
    return false;
  }
  return (
    pathname === "/" ||
    pathname.startsWith("/worlds") ||
    pathname.startsWith("/matches")
  );
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

export function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isJourney = isJourneyPath(pathname);
  const isMatch = isMatchPath(pathname);
  // The retired identity painted a dark purple canvas behind every authenticated
  // player screen. Akwaan is one warm room: the surface comes from the tokens, and
  // nothing paints over it.
  const bare = isJourney || isMatch;

  return (
    <div className="min-h-screen">
      {/* Mounted once, behind everything. World artwork and cards are opaque and
          paint over it, so the artwork stays the loudest thing on the screen. */}
      {hasCosmicBackground(pathname) && <Starfield />}
      {/* The Match brings its own shell; a second header above it would be two
          products stacked on one screen. */}
      {!isMatch && <Header />}
      <main
        className={cn(
          !isMatch && "min-h-[calc(100vh-5.5rem)]",
        )}
      >
        {bare ? children : <div className="container py-8 md:py-12">{children}</div>}
      </main>
      <Toaster position="bottom-center" />
    </div>
  );
}
