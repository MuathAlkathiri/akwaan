"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { teamIdentities } from "@/lib/team-identity";
import { useOptionalAuth } from "@/features/auth";
import { useMyMatches } from "@/features/my-matches";

/**
 * The way back into a match that is still running.
 *
 * A host who closed the tab mid-game had to find مبارياتي in the navbar and
 * recognise their match in a list; the page they actually land on said nothing
 * about it. This is the one thing the home page owed a returning host.
 *
 * It renders nothing at all unless someone is signed in and has a match they
 * can rejoin — and the query is gated on `isAuthenticated` rather than left to
 * fail, because the API client sends a 401 to the login page and a visitor who
 * never asked to sign in would be thrown out of the home page.
 */
export function ResumeMatchCard() {
  // The fetch lives one component down so that a signed-out visitor never runs
  // it at all — not disabled, not mounted. A query hook cannot be conditional,
  // and this surface has to survive being rendered with no session and no
  // query client around it.
  const isAuthenticated = useOptionalAuth()?.isAuthenticated ?? false;
  if (!isAuthenticated) return null;
  return <ResumableMatch />;
}

function ResumableMatch() {
  const matches = useMyMatches(1);
  const match = matches.data?.active.find((item) => item.resumable);
  if (!match) return null;

  const teams = teamIdentities(match.teams);
  const { completedChallenges, totalChallenges } = match.progress;

  return (
    <section
      dir="rtl"
      data-testid="resume-match-card"
      className="relative z-10 mx-auto mb-10 w-full max-w-3xl px-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[hsl(var(--brand-gold)/.45)] bg-white px-5 py-4 shadow-[0_14px_36px_-26px_hsl(var(--brand-navy)/.5)]">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[hsl(var(--brand-navy)/.62)]">
            عندك مباراة ما خلصت
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {teams.map((team, index) => (
              <span key={team.id} className="flex items-center gap-1.5">
                {index > 0 && (
                  <span className="text-muted-foreground px-1 text-xs font-black">
                    ×
                  </span>
                )}
                <span className={`text-lg font-black ${team.identity.text}`}>
                  {team.name}
                </span>
                <span className="akwaan-numeral text-lg font-black text-[hsl(var(--brand-navy))]">
                  {team.displayScore}
                </span>
              </span>
            ))}
          </div>
          {totalChallenges > 0 && (
            <p className="akwaan-numeral text-muted-foreground mt-1 text-sm font-bold">
              {completedChallenges}/{totalChallenges} تحديات
            </p>
          )}
        </div>
        <Button
          asChild
          size="lg"
          className="gap-2 rounded-full bg-[hsl(var(--brand-navy))] px-7 font-black text-white"
        >
          <Link href={`/matches/${match.liveSessionId}`}>
            كمّل المباراة
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  );
}
