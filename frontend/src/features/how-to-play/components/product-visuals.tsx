import { CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamIdentity } from "@/lib/team-identity";
import { challengeIcon } from "@/features/live-game-session/match/challenge-identity";
import { slotStatusLabels } from "@/features/live-game-session/match/presentation";
import { COMBO_CHALLENGE_NAME } from "@/features/live-game-session/match/combo.presentation";
import { ODD_PIECE_CHALLENGE_NAME } from "@/features/live-game-session/match/odd-piece.presentation";
import { RAKKIBHA_CHALLENGE_NAME } from "@/features/live-game-session/match/rakkibha.presentation";

/**
 * The product shots the walkthrough is built from.
 *
 * Every name, icon and status word here is imported from the registry the Match
 * itself reads, so a renamed challenge or a recoloured team follows the product
 * onto this page instead of drifting away from it.
 *
 * What is deliberately absent is numbers. A marketing board carrying "340 — 280"
 * would be inventing a scoring system to decorate a mockup, so the boards below
 * show a Match's *state* — which challenge is done, which is being played — and
 * let the copy say that Akwaan keeps score.
 */

/** The two teams, in the Match's own slot order and its own colours. */
const TEAMS = [
  { name: "الفريق الأول", identity: teamIdentity("1"), active: true },
  { name: "الفريق الثاني", identity: teamIdentity("2"), active: false },
] as const;

/**
 * A board of four challenges, using the canonical Arabic names and the one icon
 * registry. `slotStatusLabels` supplies the status words verbatim.
 */
const BOARD = [
  // "أفضل 5" has no exported constant of its own; it is the signature label
  // `world-signature.ts` already gives the top-5 mechanic, kept identical here.
  { key: "top-5", name: "أفضل 5", status: "completed" as const },
  { key: "combo", name: COMBO_CHALLENGE_NAME, status: "in_progress" as const },
  { key: "rakkibha", name: RAKKIBHA_CHALLENGE_NAME, status: "available" as const },
  { key: "odd-piece", name: ODD_PIECE_CHALLENGE_NAME, status: "unavailable" as const },
] as const;

/** The team strip that sits above a board on the shared screen. */
function TeamStrip({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {TEAMS.map((team) => (
        <span
          key={team.name}
          className={cn(
            "flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-1",
            team.identity.surface,
            team.identity.border,
            team.active && cn("ring-1", team.identity.ring),
          )}
        >
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", team.identity.dot)}
          />
          <span
            className={cn(
              "truncate font-black leading-none",
              team.identity.text,
              compact ? "text-[0.5rem]" : "text-[0.6rem]",
            )}
          >
            {team.name}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The shared screen mid-Match: who is playing, and where the Match has got to.
 *
 * `detail="full"` carries the status word under each challenge; the hero uses
 * the quieter variant so the composition reads at a glance from a distance.
 */
export function BoardPreview({
  detail = "full",
}: {
  detail?: "full" | "compact";
}) {
  const compact = detail === "compact";
  return (
    <div dir="rtl" className="flex flex-col gap-2 p-3 sm:gap-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo/akwaan-primary-logo-transparent.png"
          alt=""
          width={870}
          height={310}
          className={cn("h-auto select-none", compact ? "w-12" : "w-16 sm:w-20")}
          draggable={false}
        />
        <TeamStrip compact={compact} />
      </div>

      <ul className="grid list-none grid-cols-2 gap-1.5 sm:gap-2">
        {BOARD.map(({ key, name, status }) => {
          const Icon = challengeIcon(key);
          const done = status === "completed";
          const live = status === "in_progress";
          const locked = status === "unavailable";
          return (
            <li
              key={key}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-1.5 py-1.5 sm:gap-2 sm:px-2",
                done
                  ? "border-completed/25 bg-completed-subtle"
                  : live
                    ? "border-selected/30 bg-selected/10"
                    : locked
                      ? "border-border/60 bg-muted"
                      : "border-border bg-background",
              )}
            >
              <span
                className={cn(
                  "grid shrink-0 place-items-center rounded-md border",
                  compact ? "size-5" : "size-6 sm:size-7",
                  done
                    ? "border-completed/25 bg-completed-subtle text-completed"
                    : live
                      ? "border-selected/30 bg-selected/10 text-selected"
                      : locked
                        ? "border-border/60 bg-muted text-disabled-foreground"
                        : "border-border bg-background text-primary",
                )}
              >
                {done ? (
                  <CheckCircle2 className="size-3" aria-hidden />
                ) : locked ? (
                  <Lock className="size-3" aria-hidden />
                ) : (
                  <Icon className="size-3" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate font-black leading-tight",
                    compact ? "text-[0.5rem]" : "text-[0.6rem] sm:text-[0.68rem]",
                    locked ? "text-disabled-foreground" : "text-foreground",
                  )}
                >
                  {name}
                </span>
                {!compact && (
                  <span className="block truncate text-[0.5rem] font-bold leading-tight text-muted-foreground sm:text-[0.55rem]">
                    {slotStatusLabels[status]}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * What a phone shows once it has joined: its team, and its own private prompt.
 *
 * No answer content, because there is no challenge running on a marketing page —
 * the point being made is that the phone is the player's private surface.
 */
export function PhoneScreen({ slot }: { slot: "1" | "2" }) {
  const identity = teamIdentity(slot);
  return (
    <div dir="rtl" className="flex w-full flex-col items-center gap-1">
      <span
        className={cn(
          "flex w-full items-center justify-center gap-1 rounded-md border px-1 py-0.5",
          identity.surface,
          identity.border,
        )}
      >
        <span
          aria-hidden
          className={cn("size-1 shrink-0 rounded-full", identity.dot)}
        />
        <span
          className={cn("truncate text-[0.4rem] font-black", identity.text)}
        >
          {slot === "1" ? "الفريق الأول" : "الفريق الثاني"}
        </span>
      </span>
      <span className="w-full rounded-md border border-border bg-background px-1 py-1.5 text-center text-[0.4rem] font-bold leading-tight text-muted-foreground">
        جوالك جاهز
      </span>
      <span className="h-1 w-2/3 rounded-full bg-[hsl(var(--brand-navy)/.08)]" />
      <span className="h-1 w-1/2 rounded-full bg-[hsl(var(--brand-navy)/.06)]" />
    </div>
  );
}

/**
 * A drawn QR glyph — deliberately not a real code.
 *
 * `ScannableQr` encodes a live join URL and opens a dialog; both are wrong on a
 * static page, and a scannable code here would point a phone at something that
 * is not a Match. This is the *shape* of the code the shared screen shows, so a
 * reader recognises the step without anything being scannable.
 */
export function QrGlyph({ className }: { className?: string }) {
  // A fixed, hand-picked pattern: no randomness, so the page renders identically
  // on the server and the client and never looks like a decodable code.
  const CELLS = [
    "1110111", "1000101", "1011101", "0100010", "1011101", "1000001", "1110111",
  ];
  return (
    <svg
      viewBox="0 0 7 7"
      role="img"
      aria-label="رمز الانضمام المعروض على الشاشة"
      className={cn("size-full", className)}
      shapeRendering="crispEdges"
    >
      {CELLS.flatMap((row, y) =>
        row.split("").map((cell, x) =>
          cell === "1" ? (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="1"
              height="1"
              fill="hsl(var(--brand-navy))"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
