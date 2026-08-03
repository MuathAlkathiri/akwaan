"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";

interface Candidate {
  id: string;
  label: string;
  media?: { url?: string; altText?: string };
}

interface Assignment {
  turn: number;
  candidateId: string;
  label: string;
  actingTeamId: string;
  recipientTeamId: string;
  action: "keep" | "poison";
  timedOut: boolean;
}

interface RevealedCard {
  candidateId: string;
  label: string;
  rank: number | null;
  decoy: boolean;
  recipientTeamId: string;
  actingTeamId: string;
  action: "keep" | "poison";
}

interface Top10Result {
  internalScores: Record<string, number>;
  validCards: Record<string, number>;
  decoys: Record<string, number>;
  metrics: Record<
    string,
    {
      successfulPoison: number;
      giftedValidCard: number;
      selfKeptDecoy: number;
      selfKeptValid: number;
    }
  >;
  winnerTeamId?: string;
}

function parse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function Top10PoisonDeckPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection, nowMs } = useLiveSession();
  const round = runtime.activeRound;
  const state = runtime.modeState;
  const current = parse<Candidate | null>(
    round?.modeState.currentCardJson,
    null,
  );
  const assignments = parse<Assignment[]>(state.assignmentsJson, []);
  const revealed = parse<RevealedCard[]>(state.revealedJson, []);
  const result = parse<Top10Result | null>(state.resultJson, null);
  const deadline =
    typeof round?.modeState.deadlineAt === "string"
      ? Date.parse(round.modeState.deadlineAt)
      : undefined;
  const seconds = deadline
    ? Math.max(0, Math.ceil((deadline - nowMs) / 1000))
    : 0;
  const canAssign = runtime.availableActions.includes("mode:assign-card");
  const canReveal = runtime.availableActions.includes("mode:reveal-next");
  const teams = useMemo(
    () => new Map(snapshot?.teams.map((team) => [team.id, team.name]) ?? []),
    [snapshot?.teams],
  );

  const command = (commandType: "assign-card" | "reveal-next", payload = {}) =>
    gameplayCommand("gameplay-command", {
      roundId: round?.id,
      commandType,
      payload,
    });

  return (
    <Card dir="rtl" className="overflow-hidden border-violet-200">
      <CardHeader className="bg-gradient-to-l from-violet-100 to-background">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-violet-700">أفضل 10</p>
            <CardTitle className="mt-1 text-xl">
              {String(state.title || "خذها أو دسّها")}
            </CardTitle>
          </div>
          <Badge variant="outline">
            {round?.modeState.phase === "assigning"
              ? `البطاقة ${Number(round.modeState.turnIndex) + 1} من 14`
              : round?.modeState.phase === "revealing"
                ? "كشف النتائج"
                : "اكتمل التحدي"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {String(state.instruction || "احتفظ بالبطاقة أو أرسلها لخصمك")}
        </p>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {round?.modeState.phase === "assigning" && current && (
          <section className="mx-auto max-w-lg space-y-4 text-center">
            <div className="rounded-2xl border-2 border-violet-300 bg-background p-5 shadow-sm">
              {current.media?.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.media.url}
                  alt={current.media.altText ?? current.label}
                  className="mx-auto mb-4 h-36 w-full rounded-xl object-contain"
                />
              )}
              <p className="text-2xl font-black">{current.label}</p>
            </div>
            <div className="text-3xl font-black tabular-nums text-violet-700">
              {seconds}
            </div>
            <p className="text-sm text-muted-foreground">
              دور {teams.get(round.activeTeamId ?? "") ?? "الفريق الحالي"}
            </p>
            {canAssign ? (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  size="lg"
                  disabled={connection !== "connected"}
                  onClick={() => command("assign-card", { action: "keep" })}
                >
                  احتفظ بها
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  disabled={connection !== "connected"}
                  onClick={() => command("assign-card", { action: "poison" })}
                >
                  دسّها للخصم
                </Button>
              </div>
            ) : (
              <p className="rounded-lg bg-muted p-3 text-sm">
                بانتظار قرار الفريق الحالي…
              </p>
            )}
          </section>
        )}

        {assignments.length > 0 && round?.modeState.phase === "assigning" && (
          <section>
            <h3 className="mb-2 font-semibold">سجل البطاقات</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {assignments.slice(-6).map((assignment) => (
                <div
                  key={assignment.turn}
                  className="flex items-center justify-between rounded-lg border p-2 text-sm"
                >
                  <span>{assignment.label}</span>
                  <span className="text-muted-foreground">
                    ← {teams.get(assignment.recipientTeamId)}
                    {assignment.timedOut ? " (انتهى الوقت)" : ""}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {round?.modeState.phase !== "assigning" && (
          <section className="space-y-4">
            {result && (
              <div className="rounded-xl bg-violet-100 p-4 text-center">
                <p className="text-sm text-violet-800">النتيجة النهائية</p>
                <p className="mt-1 text-xl font-black">
                  {result.winnerTeamId
                    ? `الفائز: ${teams.get(result.winnerTeamId) ?? "الفريق الفائز"}`
                    : "تعادل — لا تُمنح نقطة المباراة"}
                </p>
                <p className="mt-2 text-sm">
                  {Object.entries(result.internalScores)
                    .map(
                      ([teamId, score]) =>
                        `${teams.get(teamId) ?? "فريق"}: ${score}`,
                    )
                    .join(" · ")}
                </p>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  {Object.entries(result.metrics).map(([teamId, metrics]) => (
                    <div
                      key={teamId}
                      className="rounded-lg bg-background/70 p-2"
                    >
                      <strong>{teams.get(teamId) ?? "فريق"}</strong>
                      <span className="mr-2">
                        دسّات ناجحة: {metrics.successfulPoison} · بطاقات صحيحة
                        مُهداة: {metrics.giftedValidCard}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">النتيجة الرسمية</h3>
                <p className="text-xs text-muted-foreground">
                  {String(state.rankingBasis)} · {String(state.sourceLabel)}
                </p>
              </div>
              {canReveal && (
                <Button
                  disabled={connection !== "connected"}
                  onClick={() => command("reveal-next")}
                >
                  اكشف البطاقة التالية
                </Button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {revealed.map((card) => (
                <div
                  key={card.candidateId}
                  className={
                    card.decoy
                      ? "rounded-xl border border-red-200 bg-red-50 p-3"
                      : "rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                  }
                >
                  <span className="ml-2 font-black">
                    {card.decoy ? "مضللة" : `#${card.rank}`}
                  </span>
                  {card.label}
                  <p className="mt-1 text-xs text-muted-foreground">
                    لدى {teams.get(card.recipientTeamId) ?? "الفريق"}
                    {card.action === "poison"
                      ? ` · أرسلها ${teams.get(card.actingTeamId) ?? "الخصم"}`
                      : " · احتفظ بها"}
                  </p>
                </div>
              ))}
            </div>
            {!revealed.length && (
              <p className="rounded-xl bg-muted p-6 text-center text-muted-foreground">
                لم تُكشف أي إجابة بعد.
              </p>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
