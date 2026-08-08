"use client";

import Link from "next/link";
import Image from "next/image";
import { ExternalLink, MousePointerClick, Trophy, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { TeamScoreboard } from "@/components/akwaan/team-score";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { useLiveSession } from "../../hooks/live-session-context";
import type { MatchActor } from "../types";

/**
 * The Match's own surface.
 *
 * Not an authenticated dashboard page: no site navigation, no breadcrumb, no
 * container gutter competing with the board. One quiet bar carries the things
 * that belong to the *room* — who is playing, the score, how far through the
 * Match they are, and whether this device is still talking to the server — and
 * everything below it belongs to the game.
 *
 * The bar is deliberately short. On a shared screen the board and the gameplay
 * have to be the dominant objects in the room; a tall header would take the
 * vertical space that the reveal needs.
 */
export function MatchShell({
  actor,
  children,
}: {
  actor: MatchActor;
  children: React.ReactNode;
}) {
  const { snapshot, connection } = useLiveSession();
  const match = snapshot?.match;
  const board = match?.unified.board;
  const completed = board?.completedPositionCount ?? 0;
  const total = board?.totalPositionCount ?? 0;

  const teams = (match?.standings ??
    match?.scoring.matchTotals.map((score) => ({
      ...score,
      name:
        snapshot?.teams.find((team) => team.id === score.teamId)?.name ??
        "الفريق",
    })) ??
    []
  ).map((team) => ({
    id: team.teamId,
    name: team.name,
    score: team.displayTotal,
  }));
  const selectingTeamId =
    match?.stage.key === "board" ? match.unified.selectingTeamId : undefined;
  const selectingTeam = teams.find((team) => team.id === selectingTeamId);
  const selectingIdentity = selectingTeamId
    ? teamIdentityOf(
        selectingTeamId,
        teams.map((team) => ({ id: team.id })),
      )
    : undefined;

  return (
    <div dir="rtl" className="min-h-dvh" data-testid="match-shell">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[110rem] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-5">
          <Link
            href="/"
            aria-label="أكوان — الرئيسية"
            className="relative block h-8 w-24 shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-9 sm:w-28"
          >
            <Image
              src="/brand/lammah-logo.png"
              alt="أكوان"
              fill
              priority
              sizes="112px"
              className="object-contain"
            />
          </Link>

          <Separator orientation="vertical" className="hidden h-8 sm:block" />

          {teams.length > 0 && (
            <div className="order-3 flex w-full items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
              {/* The Match score is a count of challenge *wins*, not the sum of
                  any mechanic's internal points. Saying so once, quietly, is
                  what stops a 3-2 challenge reading as a 3-2 Match. */}
              <span className="hidden shrink-0 items-center gap-1 text-[0.7rem] font-black text-muted-foreground lg:inline-flex">
                <Trophy className="size-3.5" aria-hidden />
                تحديات مكسوبة
              </span>
              <TeamScoreboard teams={teams} size="sm" className="flex-1" />
            </div>
          )}

          {total > 0 && (
            <div className="hidden min-w-[8rem] flex-col gap-1 lg:flex">
              <p className="text-[0.7rem] font-bold text-muted-foreground">
                <span className="akwaan-numeral">
                  {completed}/{total}
                </span>{" "}
                تحديات مكتملة
              </p>
              <Progress
                value={total ? (completed / total) * 100 : 0}
                aria-label={`اكتمل ${completed} من ${total} تحديات`}
                className="h-1.5"
              />
            </div>
          )}

          {selectingTeam && selectingIdentity && (
            <p
              data-testid="selecting-team"
              className={cn(
                "order-4 flex w-full items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black sm:order-none sm:w-auto",
                selectingIdentity.surface,
                selectingIdentity.border,
                selectingIdentity.text,
              )}
            >
              <MousePointerClick className="size-3.5" aria-hidden />
              <span>{selectingTeam.name}</span>
              <span className="text-current/75">دوركم الآن — اختروا تحديًا</span>
            </p>
          )}

          <div className="ms-auto flex items-center gap-2">
            <ConnectionPill connection={connection} />
            {actor === "controller" && snapshot && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="hidden font-black sm:inline-flex"
              >
                <Link
                  href={`/live-sessions/${snapshot.sessionId}/screen`}
                  target="_blank"
                >
                  <ExternalLink className="size-4" aria-hidden />
                  الشاشة المشتركة
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[110rem] px-3 pb-16 pt-4 sm:px-5">
        {children}
      </main>
    </div>
  );
}

/**
 * Whether this device is still talking to the server.
 *
 * Reads as calm when it is, and states the problem plainly when it is not —
 * paired with an icon, because a host glancing across a room should not have to
 * distinguish two colours to know the game is still live.
 */
function ConnectionPill({ connection }: { connection: string }) {
  const connected = connection === "connected";
  return (
    <span
      data-testid="host-connection"
      data-connection={connection}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
        connected
          ? "border-success/25 bg-success-subtle text-success"
          : "border-warning/30 bg-warning-subtle text-warning",
      )}
    >
      {connected ? (
        <Wifi className="size-3.5" aria-hidden />
      ) : (
        <WifiOff className="size-3.5" aria-hidden />
      )}
      <span className="hidden sm:inline">
        {connected
          ? "متصل"
          : connection === "connecting"
            ? "جارٍ الاتصال…"
            : "الاتصال متوقف"}
      </span>
    </span>
  );
}
