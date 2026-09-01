"use client";

import { useMemo } from "react";
import { Hand, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { teamIdentityOf } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
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
 *
 * The same component serves the shared screen and a phone: the card is the object
 * everyone is looking at, and only the controls differ.
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
  const completed = roundState.phase === "completed";

  const teams = useMemo(
    () => new Map(snapshot?.teams.map((team) => [team.id, team.name]) ?? []),
    [snapshot?.teams],
  );
  const activeIdentity = teamIdentityOf(activeTeamId, snapshot?.teams ?? []);
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
    <ChallengeFrame
      eyebrow="أفضل 5"
      title={String(state.title || "احتفظ بها أو دسّها")}
      progressLabel={
        completed ? "اكتمل التحدي" : `البطاقة ${cardNumber} من ${cardCount}`
      }
      progressValue={completed ? 100 : ((cardNumber - 1) / cardCount) * 100}
      aside={
        !completed && (
          <span
            data-testid="top5-active-team"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black",
              activeIdentity.surface,
              activeIdentity.border,
              activeIdentity.text,
            )}
          >
            <span
              aria-hidden
              className={cn("size-2 rounded-full", activeIdentity.dot)}
            />
            دور {teams.get(activeTeamId) ?? "الفريق"}
          </span>
        )
      }
      className="mx-auto max-w-3xl"
    >
      <div className="space-y-5" data-testid="top5-panel">
        {/* The card counter lives in the frame header; this testid keeps the
            browser smoke addressing one stable element. */}
        <span data-testid="top5-card-counter" className="sr-only">
          {completed ? "اكتمل التحدي" : `البطاقة ${cardNumber} من ${cardCount}`}
        </span>

        {!completed && current && (
          <section className="space-y-5 text-center">
            <div className="akwaan-rise rounded-[var(--radius)] border-2 border-border bg-background p-4 shadow-[inset_0_1px_0_hsl(var(--card))] sm:p-6">
              {current.media?.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.media.url}
                  alt={current.media.altText ?? current.label}
                  className="mx-auto mb-4 h-36 w-full rounded-[var(--radius)] object-contain"
                />
              )}
              <p
                className="[overflow-wrap:anywhere] text-2xl font-black leading-tight text-foreground sm:text-3xl md:text-4xl"
                data-testid="top5-current-card"
              >
                {current.label}
              </p>
            </div>

            {canDecide ? (
              <div className="space-y-3" data-testid="top5-decider-controls">
                <p className="text-base font-black text-foreground">
                  أنت صاحب القرار
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    disabled={connection !== "connected"}
                    onClick={() => decide("keep")}
                    className="h-14 text-base font-black"
                  >
                    <Hand className="size-5" aria-hidden />
                    احتفظ بها
                  </Button>
                  <Button
                    size="lg"
                    variant="destructive"
                    disabled={connection !== "connected"}
                    onClick={() => decide("give")}
                    className="h-14 text-base font-black"
                  >
                    <Send className="size-5" aria-hidden />
                    دسّها للخصم
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="space-y-1 rounded-[var(--radius)] bg-muted p-4 text-sm"
                data-testid="top5-waiting"
              >
                {deciderName ? (
                  <>
                    <p className="font-black text-foreground">
                      ناقش البطاقة مع فريقك
                    </p>
                    <p
                      className="font-bold text-muted-foreground"
                      data-testid="top5-decider-name"
                    >
                      {deciderName} هو صاحب القرار
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    بانتظار قرار الفريق الحالي…
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {ownership.length > 0 && !completed && (
          <section>
            <h3 className="mb-2 text-xs font-black text-muted-foreground">
              البطاقات الموزّعة
            </h3>
            <ul className="grid list-none gap-1.5 sm:grid-cols-2">
              {ownership.slice(-6).map((record) => {
                const identity = teamIdentityOf(
                  record.ownerTeamId,
                  snapshot?.teams ?? [],
                );
                return (
                  <li
                    key={record.entryId}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-bold",
                      identity.surface,
                      identity.border,
                    )}
                  >
                    {/* No rank and no correctness: which cards were real is
                        still unknown to everyone, including this screen. */}
                    <span className="truncate text-foreground/85">
                      {record.label}
                    </span>
                    <span
                      className={cn("shrink-0 font-black", identity.text)}
                    >
                      {teams.get(record.ownerTeamId)}
                      {record.resolutionReason === "host-skipped"
                        ? " · تخطّى المضيف"
                        : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {completed && (
          <p
            className="rounded-[var(--radius)] bg-muted p-6 text-center text-sm font-bold text-muted-foreground"
            data-testid="top5-awaiting-result"
          >
            اكتملت البطاقات العشر. جارٍ عرض النتيجة…
          </p>
        )}
      </div>
    </ChallengeFrame>
  );
}
