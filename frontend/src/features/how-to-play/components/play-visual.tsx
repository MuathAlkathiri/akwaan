"use client";

import { cn } from "@/lib/utils";
import { TeamScore } from "@/components/akwaan/team-score";
import { teamIdentity } from "@/lib/team-identity";
import { ChallengeCountdown } from "@/features/live-game-session/match/components/challenge-countdown";
import { challengeIcon } from "@/features/live-game-session/match/challenge-identity";
import { COMBO_CHALLENGE_NAME } from "@/features/live-game-session/match/combo.presentation";
import { PhoneFrame, SharedScreenFrame } from "./device-frames";

/**
 * The one still frame of a Match this page shows, used only here.
 *
 * A marketing shot of a scoreboard has to put *some* number on it, so these are
 * stated once, in one place, and are plainly a demo: a mid-Match scoreline with
 * one team a little ahead. No rule produced them, nothing reads them back, and
 * they never leave this file. Everything around them — the challenge name, its
 * icon, the team colours, the clock — comes from the registries the real Match
 * uses.
 */
const DEMO = {
  challengeKey: "combo",
  teams: [
    { name: "الفريق الأول", score: 7, slot: "1" as const, active: true },
    { name: "الفريق الثاني", score: 5, slot: "2" as const, active: false },
  ],
  remainingMs: 8_000,
};

/**
 * Step 4 — a challenge in flight, deliberately unlike Step 1.
 *
 * Step 1 shows a board at rest: a list of what a Match will contain. This shows
 * the moment inside one of those challenges — a running clock, a team on the
 * clock, live scores and phones mid-answer — so the two steps read as different
 * phases rather than the same screenshot twice.
 *
 * It is a picture, not a session: `aria-hidden` and `pointer-events-none`, no
 * socket, no snapshot, and nothing here can start, join or mutate a Match.
 */
export function PlayVisual() {
  const Icon = challengeIcon(DEMO.challengeKey);
  return (
    <div
      aria-hidden
      className="pointer-events-none mx-auto w-full max-w-md select-none"
    >
      <SharedScreenFrame stand={false}>
        <div dir="rtl" className="space-y-3 p-3 sm:p-4">
          {/* The challenge, named and on the clock. */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-selected/30 bg-selected/10 text-selected">
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black leading-tight text-foreground">
                  {COMBO_CHALLENGE_NAME}
                </span>
                <span className="block text-[0.6rem] font-bold leading-tight text-selected">
                  قيد اللعب
                </span>
              </span>
            </span>
            <ChallengeCountdown
              remainingMs={DEMO.remainingMs}
              variant="chip"
              className="scale-90"
            />
          </div>

          {/* The scoreboard, drawn by the Match's own component. */}
          <div className="grid grid-cols-2 gap-2">
            {DEMO.teams.map((team) => (
              <TeamScore
                key={team.slot}
                name={team.name}
                score={team.score}
                identity={teamIdentity(team.slot)}
                active={team.active}
                size="sm"
                label={team.active ? "دورهم الآن" : undefined}
              />
            ))}
          </div>

          {/* Answers landing: the shared screen shows that phones are deciding,
              never what any one of them chose. */}
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-lg border-2 px-2",
                  index === 1
                    ? "border-selected bg-selected-subtle"
                    : "border-border bg-card",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    index === 1
                      ? "bg-selected"
                      : "bg-[hsl(var(--brand-navy)/.14)]",
                  )}
                />
                <span
                  className={cn(
                    "h-1.5 rounded-full",
                    index === 1
                      ? "w-3/4 bg-selected/40"
                      : "w-2/3 bg-[hsl(var(--brand-navy)/.09)]",
                  )}
                />
              </span>
            ))}
          </div>
        </div>
      </SharedScreenFrame>

      {/* Phones tilted in as if held, one per team, mid-answer. */}
      <div className="mt-4 flex items-end justify-center gap-5 sm:gap-7">
        {DEMO.teams.map((team, index) => (
          <div key={team.slot} className={index === 0 ? "-rotate-6" : "rotate-6"}>
            <PhoneFrame className="w-[62px] sm:w-[70px]">
              <AnsweringPhone slot={team.slot} answered={index === 0} />
            </PhoneFrame>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A phone mid-challenge: its team, and whether this player has locked an answer. */
function AnsweringPhone({
  slot,
  answered,
}: {
  slot: "1" | "2";
  answered: boolean;
}) {
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
        <span className={cn("truncate text-[0.4rem] font-black", identity.text)}>
          {slot === "1" ? "الفريق الأول" : "الفريق الثاني"}
        </span>
      </span>

      {[0, 1].map((index) => (
        <span
          key={index}
          className={cn(
            "block h-2.5 w-full rounded-sm border",
            answered && index === 0
              ? "border-selected bg-selected-subtle"
              : "border-border bg-card",
          )}
        />
      ))}
      <span className="mt-0.5 text-[0.38rem] font-black text-muted-foreground">
        {answered ? "تم الإرسال" : "اختاروا إجابتكم"}
      </span>
    </div>
  );
}
