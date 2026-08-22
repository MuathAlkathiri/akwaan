"use client";

import Link from "next/link";
import Image from "next/image";
import { MousePointerClick, Wifi, WifiOff } from "lucide-react";
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
  children,
}: {
  // `actor` remains part of the contract (callers pass it), but the header no
  // longer branches on it since the controller-only shared-screen link was
  // removed. Accepted and intentionally unbound.
  actor?: MatchActor;
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
  /**
   * Whose turn it is, wherever the Match currently is.
   *
   * The board's selecting team while a position is being chosen, and the acting team
   * once a challenge is running. Players ask this question constantly and it used to
   * be answered by 12px of grey text.
   */
  const activeTeamId =
    match?.stage.key === "board"
      ? match.unified.selectingTeamId
      : (snapshot?.gameplay?.activeTeamId ??
        match?.unified.preflight?.selectingTeamId);
  const activeTeam = teams.find((team) => team.id === activeTeamId);
  const activeIdentity = activeTeamId
    ? teamIdentityOf(
        activeTeamId,
        teams.map((team) => ({ id: team.id })),
      )
    : undefined;
  const activeLabel =
    match?.stage.key === "board" ? "دوركم الحين — اختاروا تحدي" : "دوركم الحين";

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
              src="/brand/akwaan-logo.png"
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
                  any mechanic's internal points. */}
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

          <div className="ms-auto flex items-center gap-2">
            <ConnectionPill connection={connection} />
          </div>
        </div>

        {/**
         * Whose turn it is, in that team's own colour, at a size that carries.
         *
         * A *bounded band* under the bar rather than a tint on the page: tinting the
         * whole background degrades body-text contrast and fights the full-surface
         * reveal, and the point here is only to make turn ownership unmissable from
         * three metres. Colour plus the team's name plus an icon — never colour
         * alone — and it animates in so a change of turn is noticed rather than
         * discovered.
         */}
        {activeTeam && activeIdentity && (
          <div
            data-testid="active-team-band"
            data-team-id={activeTeam.id}
            className={cn(
              "flex items-center justify-center gap-3 border-t-2 px-3 py-2 transition-colors duration-base ease-akwaan",
              activeIdentity.surface,
              activeIdentity.border,
              activeIdentity.text,
            )}
          >
            <MousePointerClick className="size-5 shrink-0" aria-hidden />
            <span className="truncate text-xl font-black leading-tight sm:text-2xl">
              {activeTeam.name}
            </span>
            <span className="hidden text-sm font-bold opacity-80 sm:inline">
              {activeLabel}
            </span>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-[110rem] px-3 pb-16 pt-4 sm:px-5">
        {children}
      </main>
    </div>
  );
}

/**
 * Whether this device is still talking to the game.
 *
 * Three states, and the colour escalates with how much the room needs to care:
 * neutral while connected, amber while reconnecting, red once the connection is gone.
 * Each pairs the colour with an icon and a word, so the state never depends on
 * resolving a hue from across a room.
 *
 * Connected is deliberately *calm* rather than green. Not because green is forbidden
 * on a persistent status — it is not — but because "working normally" is not news, and
 * a pill that shouts for the whole match stops being read by the time it matters. The
 * failure states are the ones that earn colour.
 */
function ConnectionPill({ connection }: { connection: string }) {
  const state =
    connection === "connected"
      ? "connected"
      : connection === "connecting"
        ? "connecting"
        : "lost";
  const presentation = {
    // Calm, not green. Nothing is wrong, and nothing needs the room's attention.
    connected: {
      className: "border-border bg-muted text-muted-foreground",
      label: "متصل",
      Icon: Wifi,
    },
    // Amber: probably fine in a second, worth knowing about if it is not.
    connecting: {
      className: "border-warning/30 bg-warning-subtle text-warning",
      label: "جارٍ الاتصال…",
      Icon: WifiOff,
    },
    // Red: the game is not live. This is the state the pill exists for.
    lost: {
      className: "border-destructive/35 bg-destructive/10 text-destructive",
      label: "الاتصال متوقف",
      Icon: WifiOff,
    },
  }[state];
  const Icon = presentation.Icon;

  return (
    <span
      data-testid="host-connection"
      data-connection={connection}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
        presentation.className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {/* The word is always rendered for assistive tech; only its display is
          responsive, so the state is never icon-only to a screen reader. */}
      <span className="sr-only sm:not-sr-only">{presentation.label}</span>
    </span>
  );
}
