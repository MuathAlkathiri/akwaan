"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { Header } from "@/components/layout/header";
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
  const showTurnBand = match?.stage.key !== "preflight";
  const boardControlsAvailable =
    actor === "controller" && match?.stage.key === "board";
  const canScore =
    boardControlsAvailable && availableActions.includes("match:adjust-score");
  const canArmDouble =
    boardControlsAvailable && availableActions.includes("match:arm-double");
  const canSwitchTurn =
    boardControlsAvailable && availableActions.includes("match:switch-turn");

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
    <div dir="rtl" className="relative" data-testid="match-shell">
      <Header variant="match" merged hud={hud} />

      {activeTeam && activeIdentity && showTurnBand && (
        <div className="mx-auto flex w-full max-w-[92rem] items-center justify-center gap-3 px-3 pt-3 sm:px-5">
          <span className="hidden h-px flex-1 bg-gradient-to-l from-[hsl(var(--brand-gold)/.4)] to-transparent sm:block" />
          <div
            data-testid="active-team-band"
            data-team-id={activeTeam.id}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-black",
              activeIdentity.surface,
              activeIdentity.border,
              activeIdentity.text,
            )}
          >
            دور {activeTeam.name}
          </div>
          {canSwitchTurn && (
            <button
              type="button"
              aria-label="تبديل دور اختيار التحدي"
              disabled={Boolean(pendingControl)}
              className="grid size-9 place-items-center rounded-full border border-border bg-white/80 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              onClick={() =>
                void runControl("turn", () =>
                  switchUnifiedMatchTurn({
                    sessionId: snapshot!.sessionId,
                    expectedMatchRevision: match!.revision,
                  }),
                )
              }
            >
              <ArrowLeftRight className="size-4" aria-hidden />
            </button>
          )}
          <span className="hidden h-px flex-1 bg-gradient-to-r from-[hsl(var(--brand-gold)/.4)] to-transparent sm:block" />
        </div>
      )}

      <div className="mx-auto w-full max-w-[92rem] px-3 pb-10 pt-3 sm:px-5">
        {children}
      </div>
    </div>
  );
}
