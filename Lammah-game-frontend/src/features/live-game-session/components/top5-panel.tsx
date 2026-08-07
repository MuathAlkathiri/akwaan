"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";

interface Top5Card {
  id: string;
  label: string;
  shortLabel?: string;
  media?: { url?: string; altText?: string };
}

interface Top5OwnershipEntry {
  turn: number;
  entryId: string;
  label: string;
  actingTeamId: string;
  ownerTeamId: string;
  action: "keep" | "give";
  resolutionReason: "submitted" | "host-skipped";
}

function parse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * أفضل 5 while it is being played.
 *
 * The server names the one participant who may decide; this screen only renders
 * what it was told. The buttons appear because the runtime published
 * `mode:decide-card` for *this* actor — never because the component compared a
 * team id — and a phone without that action is shown who is deciding instead.
 * Ranks are not in the payload at all, so nothing here can leak the answer.
 */
export function Top5Panel({ runtime }: { runtime: GameplayRuntimeSnapshot }) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const round = runtime.activeRound;
  const state = runtime.modeState;
  const roundState = round?.modeState ?? {};
  const current = parse<Top5Card | null>(roundState.currentCardJson, null);
  const ownership = parse<Top5OwnershipEntry[]>(state.ownershipJson, []);
  const canDecide = runtime.availableActions.includes("mode:decide-card");
  const activeTeamId = String(roundState.activeTeamId ?? "");
  const activeParticipantId = String(roundState.activeParticipantId ?? "");
  const cardNumber = Number(roundState.cardNumber ?? 1);
  const cardCount = Number(roundState.cardCount ?? 10);

  const teams = useMemo(
    () => new Map(snapshot?.teams.map((team) => [team.id, team.name]) ?? []),
    [snapshot?.teams],
  );
  const deciderName =
    snapshot?.participants.find((person) => person.id === activeParticipantId)
      ?.displayName ?? "";
  const decide = (action: "keep" | "give") =>
    gameplayCommand("gameplay-command", {
      roundId: round?.id,
      commandType: "decide-card",
      payload: {
        action,
        ...(typeof roundState.assignmentSequence === "number"
          ? { assignmentSequence: roundState.assignmentSequence }
          : {}),
      },
    });

  return (
    <Card dir="rtl" className="overflow-hidden border-violet-200" data-testid="top5-panel">
      <CardHeader className="bg-gradient-to-l from-violet-100 to-background">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-violet-700">أفضل 5</p>
            <CardTitle className="mt-1 text-xl">
              {String(state.title || "احتفظ بها أو دسّها")}
            </CardTitle>
          </div>
          <Badge variant="outline" data-testid="top5-card-counter">
            {roundState.phase === "deciding"
              ? `البطاقة ${cardNumber} من ${cardCount}`
              : "اكتمل التحدي"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {String(state.instruction || "احتفظ بالبطاقة أو أرسلها لخصمك")}
        </p>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {roundState.phase === "deciding" && current && (
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
              <p className="text-2xl font-black" data-testid="top5-current-card">
                {current.label}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              دور {teams.get(activeTeamId) ?? "الفريق الحالي"}
            </p>

            {canDecide ? (
              <div className="space-y-3" data-testid="top5-decider-controls">
                <p className="text-base font-black text-violet-700">
                  أنت صاحب القرار
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    disabled={connection !== "connected"}
                    onClick={() => decide("keep")}
                  >
                    احتفظ بها
                  </Button>
                  <Button
                    size="lg"
                    variant="destructive"
                    disabled={connection !== "connected"}
                    onClick={() => decide("give")}
                  >
                    دسّها للخصم
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="space-y-1 rounded-lg bg-muted p-4 text-sm"
                data-testid="top5-waiting"
              >
                {deciderName ? (
                  <>
                    <p className="font-bold">ناقش البطاقة مع فريقك</p>
                    <p data-testid="top5-decider-name">
                      {deciderName} هو صاحب القرار
                    </p>
                  </>
                ) : (
                  <p>بانتظار قرار الفريق الحالي…</p>
                )}
              </div>
            )}
          </section>
        )}

        {ownership.length > 0 && (
          <section>
            <h3 className="mb-2 font-semibold">البطاقات الموزّعة</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {ownership.slice(-6).map((record) => (
                <div
                  key={record.entryId}
                  className="flex items-center justify-between rounded-lg border p-2 text-sm"
                >
                  {/* No rank and no colour: which cards were real is still unknown. */}
                  <span>{record.label}</span>
                  <span className="text-muted-foreground">
                    ← {teams.get(record.ownerTeamId)}
                    {record.resolutionReason === "host-skipped" ? " (تخطّى المضيف)" : ""}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {roundState.phase === "completed" && (
          <p
            className="rounded-xl bg-muted p-6 text-center text-muted-foreground"
            data-testid="top5-awaiting-result"
          >
            اكتملت البطاقات العشر. جارٍ عرض النتيجة…
          </p>
        )}
      </CardContent>
    </Card>
  );
}
