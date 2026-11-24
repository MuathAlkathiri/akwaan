"use client";

import { createContext, useContext } from "react";

import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { QuestionVerdict } from "../../components/question-verdict";
import { useLiveSession } from "../../hooks/live-session-context";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchStageKey } from "../types";

/**
 * The frame a player's phone plays the whole Match inside.
 *
 * A phone is a controller, not a small television. The shared screen owns the
 * spectacle — the board, the media, the scoreboard — so this frame carries only
 * what a player needs while holding it: which challenge is running, which team
 * they are on, and what the room is waiting for right now.
 *
 * Two structural rules make it safe to wrap live gameplay:
 *
 *  - **`children` render at one fixed position in the tree, always.** No status,
 *    no stage and no connection state may branch around them. The Match router
 *    underneath must keep its component identity across the whole lifecycle, or a
 *    remount would re-run fair-start readiness and re-acknowledge a presentation
 *    the server already activated. The header above them is what changes.
 *  - **It reads state, it never derives gameplay.** The status below is a label
 *    computed from the stage the server already published; nothing here can move
 *    a Match, and no mechanic's projection is touched.
 *
 * The viewport is owned with `100dvh` and the safe-area insets rather than a
 * pixel height, so a notch, a home indicator and a mobile browser's disappearing
 * chrome are all handled by the same layout instead of three special cases.
 */

/**
 * Whether this subtree is being rendered on a player's phone.
 *
 * The Match router hands every mechanic the same `runtime` and, for most of them,
 * no actor at all — so a panel cannot ask which surface it is on. It can ask
 * *which shell mounted it*, and only the participant view mounts this one. That
 * makes the answer application state (who rendered me), never a media query: a
 * narrow desktop window is still the host, and a tablet held by a player is still
 * a phone.
 *
 * Defaults to `false`, so anything rendered outside the phone shell — the host,
 * the shared screen, the legacy session panel — keeps its existing presentation
 * untouched.
 */
const MobileSurfaceContext = createContext(false);

export function useMobileSurface(): boolean {
  return useContext(MobileSurfaceContext);
}

/**
 * Which participant this phone is, for a view that must tell "my choice" from
 * "someone else's" before the server's own projection can (Bomb's holder setup).
 * Presentation only: the server still authorises every command.
 */
const MobileParticipantContext = createContext<string | undefined>(undefined);

export function useMobileParticipantId(): string | undefined {
  return useContext(MobileParticipantContext);
}

export type MobilePhase = "ready" | "action" | "waiting" | "complete";

/**
 * What the room is waiting for, in one word, from state the server already sent.
 *
 * Deliberately coarse. `SUBMITTED` and every mechanic-specific phrase stay with
 * the mechanic that owns them — a shell that tried to name them would need to
 * know each mechanic's idea of "done", which is exactly the knowledge it must not
 * hold. Mechanics keep their own wording inside the interaction region.
 */
export function mobilePhaseOf(snapshot?: LiveSessionSnapshot): MobilePhase {
  const stage = snapshot?.match?.stage.key as MatchStageKey | undefined;
  if (!stage) return "waiting";
  if (stage === "preflight") return "ready";
  // A challenge with no runtime yet is still a wait: the server has not handed
  // this phone anything to do.
  if (stage === "challenge") return snapshot?.gameplay ? "action" : "waiting";
  if (stage === "challenge_result" || stage === "match_complete") {
    return "complete";
  }
  return "waiting";
}

const PHASE_LABEL: Record<MobilePhase, string> = {
  ready: "جاهزين",
  action: "دوركم",
  waiting: "بانتظار",
  complete: "انتهى",
};

export function MobileGameplayShell({
  participantId,
  children,
}: {
  participantId?: string;
  children: React.ReactNode;
}) {
  const { snapshot } = useLiveSession();
  const phase = mobilePhaseOf(snapshot);
  const contentItemId = snapshot?.gameplay?.currentContentItemId;
  const participant = participantId
    ? snapshot?.participants.find((person) => person.id === participantId)
    : undefined;
  const team = snapshot?.teams.find((item) => item.id === participant?.teamId);
  const identity =
    team && snapshot ? teamIdentityOf(team.id, snapshot.teams) : undefined;
  const challengeName = snapshot?.match?.currentChallenge
    ? snapshot.match.unified.board.positions.find(
        (position) =>
          position.occurrenceIndex ===
            snapshot.match!.currentChallenge!.occurrenceIndex &&
          position.slotKey === snapshot.match!.currentChallenge!.slotKey,
      )
    : undefined;

  return (
    <MobileSurfaceContext.Provider value={true}>
      <MobileParticipantContext.Provider value={participantId}>
        <div
          dir="rtl"
          data-testid="mobile-gameplay-shell"
          data-mobile-phase={phase}
          className={cn(
            "flex min-h-[100dvh] flex-col bg-background text-foreground",
            // A notch, a home indicator and a browser's disappearing chrome are all
            // the same problem, solved once here rather than in every mechanic.
            "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
            "ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)]",
          )}
        >
          {/* Compact by design: one line of context, never a scoreboard. The room
          already has a screen showing the score to everyone. */}
          <header
            data-testid="mobile-shell-header"
            className="flex shrink-0 items-center justify-between gap-2 border-b-[3px] border-[hsl(var(--brand-navy))] bg-white px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[0.7rem] font-bold text-brand-slate">
                {challengeName?.worldName ?? "أكوان"}
              </p>
              <p className="truncate font-display text-[15px] font-extrabold leading-tight text-[hsl(var(--brand-navy))]">
                {challengeName?.challengeName ?? "المباراة"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {/* Reserved, stable slot for a future shared timer presentation. It
              stays empty in this phase: mechanics keep their own authoritative
              countdowns, and a second one here would be a duplicate. */}
              <span data-testid="mobile-shell-timer-slot" aria-hidden />
              <MobileStatus phase={phase} />
              {team && identity && (
                <span
                  data-testid="mobile-shell-team"
                  data-team-id={team.id}
                  className={cn(
                    // The team is a dot and a name. Never a tinted chip.
                    "inline-flex max-w-[8.5rem] items-center gap-1.5 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white px-2.5 py-1 text-[0.7rem] font-bold text-[hsl(var(--brand-navy))]",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 shrink-0 rounded-full border border-[hsl(var(--brand-navy))]",
                      identity.dot,
                    )}
                  />
                  <span className="truncate">{team.name}</span>
                </span>
              )}
            </div>
          </header>

          {/* One fixed position for the Match router. `min-h-0` lets a tall mechanic
          scroll inside this region instead of growing the page, and the region
          itself fills whatever the header leaves — which is what keeps a neutral
          state centred rather than stranded at the top. */}
          <div
            data-testid="mobile-shell-main"
            className={cn(
              "flex min-h-0 flex-1 flex-col px-3 py-3",
              // The Match router renders its own `<main>` in here, and it is a block.
              // Stretching it from this side keeps the flex chain intact all the way
              // down to a neutral state — without editing the router, and without a
              // second landmark competing with the one it already owns.
              "[&>main]:flex [&>main]:min-h-0 [&>main]:flex-1 [&>main]:flex-col",
            )}
          >
            {children}
          </div>

          {/* One control for every mechanic.
          It lived in the ريو panel alone, so nine challenges out of ten never
          offered it and the owner never saw it in a real game. It belongs here,
          beside the router rather than inside any one panel, so a mechanic
          added later gets it without anyone remembering to.
          Quiet on purpose: no prompt, no modal, no interruption. A player who
          wants to say something finds it; a player who does not never notices
          it. It appears only while an authored question is actually on screen. */}
          {contentItemId && (
            <div className="shrink-0 px-3 pb-2">
              <QuestionVerdict contentItemId={contentItemId} />
            </div>
          )}
        </div>
      </MobileParticipantContext.Provider>
    </MobileSurfaceContext.Provider>
  );
}

/** The lifecycle word, as a small chip. Never colour alone — it reads as text. */
export function MobileStatus({ phase }: { phase: MobilePhase }) {
  return (
    <span
      data-testid="mobile-shell-status"
      data-phase={phase}
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border-2 border-[hsl(var(--brand-navy))] px-2.5 py-1 text-[0.7rem] font-bold text-[hsl(var(--brand-navy))]",
        phase === "action" ? "bg-[hsl(var(--brand-gold))]" : "bg-brand-wash",
      )}
    >
      {PHASE_LABEL[phase]}
    </span>
  );
}
