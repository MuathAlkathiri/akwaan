"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { authoredText, type AuthoredText } from "../authored-text";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";

interface ClosestItem {
  id: string;
  prompt: AuthoredText;
  media?: { url?: string; altText?: AuthoredText } | null;
}

interface ClosestResult {
  correctValue: number;
  answers: Record<string, number | null>;
  distances: Record<string, number | null>;
  winnerTeamId: string | null;
  tie: boolean;
}

function parsed<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function ClosestGameplayPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const [estimate, setEstimate] = useState("");
  const state = runtime.modeState;
  const round = runtime.activeRound;
  const item = parsed<ClosestItem | null>(state.currentItemJson, null);
  const teams = parsed<string[]>(state.teamIdsJson, []);
  const submitted = parsed<Record<string, boolean>>(
    state.submissionStatusJson,
    {},
  );
  const assigned = parsed<Record<string, string>>(
    state.assignedParticipantIdsJson,
    {},
  );
  const result = parsed<ClosestResult | null>(state.revealedResultJson, null);
  const itemIndex = Number(state.currentItemIndex ?? 0);
  const revealed = state.phase === "revealed" || state.phase === "completed";
  const remainingMs = useInteractionDeadline(
    typeof state.deadlineAt === "string" ? state.deadlineAt : undefined,
    revealed,
  );
  const actorTeamId = typeof state.actorTeamId === "string" ? state.actorTeamId : "";
  const ownSubmitted = actorTeamId ? submitted[actorTeamId] : false;
  const canAnswer =
    state.isAssignedActor === true &&
    !ownSubmitted &&
    !revealed &&
    runtime.availableActions.includes("mode:submit-estimate") &&
    connection === "connected";
  const nameOf = (id: string) =>
    snapshot?.participants.find((person) => person.id === id)?.displayName ?? "لاعب الفريق";
  const teamName = (id: string) =>
    snapshot?.teams.find((team) => team.id === id)?.name ?? "الفريق";

  // The same panel instance serves all three questions. Never carry a previous
  // estimate into the next item, even when the server advances without remounting.
  useEffect(
    () => setEstimate(""),
    [runtime.runtimeId, round?.id, item?.id, itemIndex],
  );

  const submitEstimate = () => {
    const value = Number(estimate);
    if (!estimate.trim() || !Number.isFinite(value)) return;
    gameplayCommand("gameplay-command", {
      roundId: round?.id,
      commandType: "submit-estimate",
      payload: { value },
    });
    setEstimate("");
  };

  return (
    <ChallengeFrame
      eyebrow="مين أقرب"
      title={`السؤال ${itemIndex + 1} من 3`}
      progressValue={(itemIndex / 3) * 100}
      aside={
        remainingMs !== undefined && !revealed ? (
          <Badge variant="outline" className="akwaan-numeral font-black">
            {Math.ceil(remainingMs / 1000)} ثانية
          </Badge>
        ) : null
      }
      className="mx-auto max-w-4xl"
    >
      <div className="space-y-5" dir="rtl">
        {item?.media?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.media.url}
            alt={authoredText(item.media.altText, "صورة السؤال")}
            className="mx-auto max-h-64 rounded-[var(--radius)] object-contain"
          />
        ) : null}
        <h2 className="text-center text-2xl font-black leading-snug text-foreground sm:text-4xl">
          {item ? authoredText(item.prompt) : "جارٍ تجهيز السؤال…"}
        </h2>

        {!revealed && (
          <div className="grid gap-3 sm:grid-cols-2" data-testid="closest-submission-status">
            {teams.map((teamId) => {
              const identity = teamIdentityOf(teamId, snapshot?.teams ?? []);
              return (
                <div
                  key={teamId}
                  className={cn(
                    "rounded-[var(--radius)] border p-4 text-center",
                    identity.surface,
                    identity.border,
                  )}
                >
                  <p className={cn("font-black", identity.text)}>{teamName(teamId)}</p>
                  <p className="mt-1 text-sm font-bold text-muted-foreground">
                    {submitted[teamId]
                      ? "✓ تم إرسال الإجابة"
                      : `بانتظار ${nameOf(assigned[teamId])}…`}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {canAnswer && (
          <div className="mx-auto flex max-w-sm gap-2" data-testid="closest-answer-controls">
            <Input
              key={`${runtime.runtimeId}:${round?.id ?? "round"}:${item?.id ?? itemIndex}`}
              dir="ltr"
              inputMode="decimal"
              autoComplete="off"
              value={estimate}
              onChange={(event) => setEstimate(event.target.value)}
              placeholder="اكتب تقدير فريقك"
            />
            <Button
              disabled={!estimate.trim() || !Number.isFinite(Number(estimate))}
              onClick={submitEstimate}
            >
              إرسال
            </Button>
          </div>
        )}
        {!revealed && !canAnswer && actorTeamId && (
          <p className="rounded-[var(--radius)] bg-muted p-4 text-center font-bold text-muted-foreground">
            {ownSubmitted
              ? "تم إرسال إجابتكم. بانتظار الفريق الآخر…"
              : `${nameOf(assigned[actorTeamId])} يرسل إجابة الفريق`}
          </p>
        )}

        {result && (
          <section className="akwaan-rise space-y-4 text-center" data-testid="closest-item-reveal">
            <div className="rounded-[var(--radius)] bg-primary px-5 py-4 text-primary-foreground">
              <p className="text-sm font-bold opacity-80">الإجابة الصحيحة</p>
              <p className="akwaan-numeral text-4xl font-black">{result.correctValue}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {teams.map((teamId) => {
                const identity = teamIdentityOf(teamId, snapshot?.teams ?? []);
                return (
                  <div key={teamId} className={cn("rounded-[var(--radius)] border p-4", identity.surface, identity.border)}>
                    <p className={cn("font-black", identity.text)}>{teamName(teamId)}</p>
                    <p className="akwaan-numeral mt-1 text-3xl font-black">{result.answers[teamId] ?? "—"}</p>
                    <p className="text-sm font-bold text-muted-foreground">
                      {result.distances[teamId] === null ? "لم تُرسل إجابة" : `بفارق ${result.distances[teamId]}`}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="text-xl font-black">
              {result.tie ? "نفس المسافة! الجولة تعادل" : `${teamName(result.winnerTeamId!)} كان الأقرب!`}
            </p>
            {snapshot?.match?.availableActions.includes("challenge:continue") ? null : null}
            {snapshot?.participants.some((person) => person.role === "controller") &&
              runtime.availableActions.includes("mode:advance-closest-item") ? (
                <Button
                  size="lg"
                  onClick={() =>
                    gameplayCommand("gameplay-command", {
                      roundId: round?.id,
                      commandType: "advance-closest-item",
                      payload: {},
                    })
                  }
                  data-testid="closest-next-item"
                >
                  {itemIndex === 2 ? "عرض نتيجة التحدي" : "السؤال التالي"}
                </Button>
              ) : (
                <p className="text-sm font-bold text-muted-foreground">بانتظار المضيف للمتابعة…</p>
              )}
          </section>
        )}
      </div>
    </ChallengeFrame>
  );
}
