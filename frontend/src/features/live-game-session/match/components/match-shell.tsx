"use client";

import { useState } from "react";
import { TurnSlotContext } from "./turn-slot";
import { ArrowLeftRight, Crown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { Header } from "@/components/layout/header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { setTeamCaptain } from "../../api/live-session-api";
import {
  adjustUnifiedMatchScore,
  armUnifiedMatchDouble,
  switchUnifiedMatchTurn,
} from "@/features/match-setup";
import { useLiveSession } from "../../hooks/live-session-context";
import type { MatchActor } from "../types";
import { MatchScoreHud, type HudTeam } from "./match-score-hud";

/** The Match frame: a compact header HUD (brand + live score) and the turn row. */
export function MatchShell({
  actor,
  children,
}: {
  actor?: MatchActor;
  children: React.ReactNode;
}) {
  const { snapshot, resync } = useLiveSession();
  const [pendingControl, setPendingControl] = useState<string>();
  // A place in the turn row the board fills with its own sticker.
  const [turnSlot, setTurnSlot] = useState<HTMLElement | null>(null);
  const match = snapshot?.match;
  const teams: HudTeam[] = (
    match?.standings ??
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
  const activeTeamId =
    match?.stage.key === "board"
      ? match.unified.selectingTeamId
      : (snapshot?.gameplay?.activeTeamId ??
        match?.unified.preflight?.selectingTeamId);
  const activeTeam = teams.find((team) => team.id === activeTeamId);
  const activeIdentity = activeTeamId
    ? teamIdentityOf(activeTeamId, teams)
    : undefined;
  const availableActions = match?.availableActions ?? [];
  // The preflight card carries its own compact "{team} يبدأ" chip, so the Match-wide
  // active-team band would only repeat it there. The band (and the manual-turn
  // control it hosts) stays for every other stage — its logic is untouched.
  // Nothing has a turn before the session starts, so the band would be
  // announcing one that does not exist yet over the waiting room.
  const started =
    snapshot?.status !== "waiting" && snapshot?.status !== "ready";
  const showTurnBand = started && match?.stage.key !== "preflight";
  const boardControlsAvailable =
    actor === "controller" && match?.stage.key === "board";
  const canScore =
    boardControlsAvailable && availableActions.includes("match:adjust-score");
  const canArmDouble =
    boardControlsAvailable && availableActions.includes("match:arm-double");
  const canSwitchTurn =
    boardControlsAvailable && availableActions.includes("match:switch-turn");
  const canChangeCaptain = actor === "controller" && started && Boolean(match);

  // The visible score/turn change is the confirmation of a control; only a
  // failure needs a message. So this reports errors and stays silent on success.
  const runControl = async (key: string, action: () => Promise<unknown>) => {
    if (pendingControl) return;
    setPendingControl(key);
    try {
      await action();
      resync?.();
    } catch {
      toast.error("تعذر تنفيذ الإجراء. حدّث الصفحة وحاول مرة ثانية.");
    } finally {
      setPendingControl(undefined);
    }
  };

  const hud =
    teams.length === 2 ? (
      <MatchScoreHud
        teams={teams}
        activeTeamId={activeTeamId}
        doubles={match?.doubles}
        canScore={canScore}
        canArmDouble={canArmDouble}
        pending={pendingControl}
        onScore={(teamId, delta) =>
          void runControl(`score-${delta}-${teamId}`, () =>
            adjustUnifiedMatchScore({
              sessionId: snapshot!.sessionId,
              expectedMatchRevision: match!.revision,
              teamId,
              delta,
            }),
          )
        }
        onArmDouble={(teamId) =>
          void runControl("double", () =>
            armUnifiedMatchDouble({
              sessionId: snapshot!.sessionId,
              expectedMatchRevision: match!.revision,
              teamId,
            }),
          )
        }
      />
    ) : undefined;

  return (
    <div
      dir="rtl"
      className="relative flex min-h-[100dvh] flex-col"
      data-testid="match-shell"
    >
      <Header variant="match" merged hud={hud} />

      {canChangeCaptain && (
        <div className="mx-auto flex w-full max-w-[92rem] justify-end px-3 pt-2 sm:px-5">
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label="تغيير قائد الفريق"
                className="grid size-12 place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white shadow-[3px_4px_0_hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-purple))]"
              >
                <Crown
                  className="size-6 fill-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]"
                  aria-hidden
                />
              </button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>قائد الفريق</DialogTitle>
              </DialogHeader>
              <div className="space-y-5">
                {snapshot?.teams.map((team) => {
                  const side = snapshot.participants.filter(
                    (person) =>
                      person.teamId === team.id &&
                      person.role === "team-player" &&
                      person.presence !== "removed",
                  );
                  const captainId = side.some(
                    (person) => person.id === team.captainParticipantId,
                  )
                    ? team.captainParticipantId
                    : undefined;
                  return (
                    <div key={team.id}>
                      <label
                        htmlFor={`match-captain-${team.id}`}
                        className="mb-1.5 flex items-center gap-2 text-sm font-black"
                      >
                        <span
                          className={`size-3 rounded-full ${teamIdentityOf(team.id, snapshot.teams).dot}`}
                          aria-hidden
                        />
                        {team.name} — قائد الفريق
                      </label>
                      <select
                        id={`match-captain-${team.id}`}
                        data-testid={`match-captain-${team.id}`}
                        value={captainId ?? ""}
                        disabled={Boolean(pendingControl) || side.length === 0}
                        onChange={(event) =>
                          void runControl(`captain-${team.id}`, () =>
                            setTeamCaptain(
                              snapshot.sessionId,
                              team.id,
                              event.target.value || null,
                              snapshot.revision,
                            ),
                          )
                        }
                        className="bg-background focus-visible:ring-ring h-11 w-full rounded-[12px] border px-3 text-base font-bold focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
                      >
                        <option value="">بدون قائد</option>
                        {side.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.displayName}
                            {person.id === captainId ? " — القائد الحالي" : ""}
                            {person.presence === "connected"
                              ? ""
                              : " — غير متصل"}
                          </option>
                        ))}
                      </select>
                      <p className="text-muted-foreground mt-1.5 text-xs font-bold">
                        بدون قائد = تناوب تلقائي بين لاعبي الفريق. تقدر تختار
                        لاعبًا غير متصل، وبيستلم أول ما يرجع جهازه.
                      </p>
                    </div>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {activeTeam && activeIdentity && showTurnBand && (
        <div className="mx-auto flex w-full max-w-[92rem] flex-wrap items-center justify-center gap-4 px-3 pt-4 sm:px-5">
          {/* On the board the sticker is the board's own sentence, lent this
              place; the band below is then only spoken, not shown twice. */}
          <div ref={setTurnSlot} className="contents" />
          <div
            data-testid="active-team-band"
            data-team-id={activeTeam.id}
            className={cn(
              "font-display inline-flex min-h-12 -rotate-1 items-center gap-3 rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-5 text-lg font-extrabold text-[hsl(var(--brand-navy))] shadow-[5px_6px_0_hsl(var(--brand-navy))] sm:text-2xl",
              match?.stage.key === "board" && "sr-only",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-5 shrink-0 rounded-full border-[3px] border-[hsl(var(--brand-navy))]",
                activeIdentity.dot,
              )}
            />
            دور {activeTeam.name}
          </div>
          {canSwitchTurn && (
            <button
              type="button"
              aria-label="تبديل دور اختيار التحدي"
              disabled={Boolean(pendingControl)}
              className="grid size-14 shrink-0 place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white text-[hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-purple))] disabled:opacity-40"
              onClick={() =>
                void runControl("turn", () =>
                  switchUnifiedMatchTurn({
                    sessionId: snapshot!.sessionId,
                    expectedMatchRevision: match!.revision,
                  }),
                )
              }
            >
              <ArrowLeftRight className="size-6" aria-hidden />
            </button>
          )}
        </div>
      )}

      {/* The Match owns the viewport, so this region takes whatever height the
          HUD and turn band leave behind. A full board simply grows past it; a
          transient state (hydrating, or failed) can centre itself inside it
          instead of being stranded at the top of an empty canvas. */}
      <div className="mx-auto flex w-full max-w-[92rem] flex-1 flex-col px-3 pb-10 pt-3 sm:px-5">
        <TurnSlotContext.Provider value={turnSlot}>
          {children}
        </TurnSlotContext.Provider>
      </div>
    </div>
  );
}
