"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChallengeFrame,
  ChallengeProgress,
} from "../match/components/challenge-frame";
import {
  ChallengeContextStrip,
  TeamDot,
  useChallengeContext,
} from "../match/components/challenge-context-strip";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useMobileSurface } from "../match/components/mobile-gameplay-shell";
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
  // Which surface is rendering this, from the shell that mounted it. The shared
  // screen reads `false` and keeps exactly the presentation it had.
  const phone = useMobileSurface();
  const context = useChallengeContext();
  // Presentational only. `gameplayCommand` is fire-and-forget, so there is no
  // in-flight promise: this closes the window in which a decider could tap
  // احتفظ and then دسّها and emit two commands for one card.
  const [deciding, setDeciding] = useState<"keep" | "give" | undefined>();
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
  const deciderName =
    snapshot?.participants.find((person) => person.id === activeParticipantId)
      ?.displayName ?? "";

  // A new card — or the server taking the decision away — releases the guard.
  // The turn moving on is the authoritative acknowledgement that this decision
  // landed; nothing local decides that it did.
  useEffect(() => {
    setDeciding(undefined);
  }, [runtime.runtimeId, round?.id, cardNumber, canDecide]);

  const decide = (action: "keep" | "give") => {
    if (deciding) return;
    setDeciding(action);
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
  };

  const title = String(state.title || "توب 5");
  const stageTeams = (snapshot?.teams ?? []).filter((team) => team.active);
  const cardsOf = (teamId: string) =>
    ownership.filter((record) => record.ownerTeamId === teamId);
  const counter = completed
    ? "اكتمل التحدي"
    : `البطاقة ${cardNumber} من ${cardCount}`;

  // The two ways to play a card. Keep is the gold one: it is the move a team
  // makes for itself. Neither is dressed as dangerous.
  const decisions = canDecide && (
    <>
      <button
        type="button"
        disabled={connection !== "connected" || Boolean(deciding)}
        onClick={() => decide("keep")}
        data-testid="top5-keep"
        className={cn(DECISION, "bg-[hsl(var(--brand-gold))]")}
      >
        <span className="font-display text-2xl font-black">احتفظ فيها</span>
        <span className="text-sm leading-relaxed">
          تحسها من التوب 5؟ خلها عندكم
        </span>
      </button>
      <button
        type="button"
        disabled={connection !== "connected" || Boolean(deciding)}
        onClick={() => decide("give")}
        data-testid="top5-give"
        className={cn(DECISION, "bg-white")}
      >
        <span className="font-display text-2xl font-black">أعطها للخصم</span>
        <span className="text-sm leading-relaxed">تحسها فخ؟ ارمها عليهم</span>
      </button>
    </>
  );

  if (phone) {
    const ownTeamId = canDecide ? activeTeamId : undefined;
    return (
      <ChallengeFrame
        compact
        progressLabel={counter}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          className="flex min-h-0 flex-1 flex-col gap-3.5"
          data-testid="top5-panel"
        >
          <span data-testid="top5-card-counter" className="sr-only">
            {counter}
          </span>
          {/* The topic, for the whole challenge: every card is judged against it. */}
          <p className="rounded-[14px] bg-[hsl(var(--brand-navy))] px-3.5 py-2.5 text-center text-[15px] font-bold leading-relaxed text-white">
            {title}
          </p>

          {!completed && current && (
            <>
              <div className="akwaan-rise flex flex-1 flex-col items-center justify-center">
                <p
                  data-testid="top5-current-card"
                  className="-rotate-2 rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-lavender px-7 py-5 text-center font-display text-3xl font-black [overflow-wrap:anywhere] shadow-[4px_5px_0_hsl(var(--brand-navy))]"
                >
                  {current.label}
                </p>
              </div>
              {canDecide ? (
                <MobileActionArea>
                  {/* The primitive stays a place, not a component that knows
                      about decisions: the mechanic labels its own region. */}
                  <div
                    data-testid="top5-decider-controls"
                    className="contents"
                  />
                  {deciding && (
                    <p
                      role="status"
                      className="text-center text-sm font-bold text-brand-plum"
                    >
                      نرسل قراركم…
                    </p>
                  )}
                  <div className="flex flex-col gap-3">{decisions}</div>
                  {ownTeamId && (
                    <p className="text-center text-[13px] text-brand-slate">
                      عندكم{" "}
                      <span className="akwaan-numeral">
                        {cardsOf(ownTeamId).length}
                      </span>{" "}
                      · عند الخصم{" "}
                      <span className="akwaan-numeral">
                        {ownership.length - cardsOf(ownTeamId).length}
                      </span>
                    </p>
                  )}
                </MobileActionArea>
              ) : (
                <div
                  data-testid="top5-waiting"
                  className="flex shrink-0 flex-col items-center gap-1 rounded-[18px] bg-brand-lavender p-4 text-center text-base"
                >
                  {deciderName ? (
                    <>
                      <p className="font-bold">ناقش البطاقة مع فريقك</p>
                      <p
                        className="font-semibold text-brand-plum"
                        data-testid="top5-decider-name"
                      >
                        {deciderName} هو صاحب القرار
                      </p>
                    </>
                  ) : (
                    <p className="font-semibold text-brand-plum">
                      ننتظر قرار الفريق الثاني…
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {completed && (
            <p
              className="rounded-[18px] border-[3px] border-dashed border-brand-dash bg-white p-6 text-center text-lg font-bold text-brand-plum"
              data-testid="top5-awaiting-result"
            >
              خلصت البطاقات. شوفوا الكشف على الشاشة.
            </p>
          )}
        </div>
      </ChallengeFrame>
    );
  }

  return (
    <section
      dir="rtl"
      data-testid="top5-panel"
      className="flex flex-col gap-[18px] text-[hsl(var(--brand-navy))]"
    >
      <span data-testid="top5-card-counter" className="sr-only">
        {counter}
      </span>
      {/* The topic stays in the strip for the whole challenge. */}
      <ChallengeContextStrip
        eyebrow={[context.eyebrow, "توب 5"].filter(Boolean).join(" · ")}
        title={title}
        aside={
          completed ? (
            <span className="inline-flex min-h-9 items-center rounded-full bg-white px-4 text-[15px] font-bold text-[hsl(var(--brand-navy))]">
              اكتمل التحدي
            </span>
          ) : (
            <span
              data-testid="top5-active-team"
              className="inline-flex min-h-[44px] items-center gap-2.5 whitespace-nowrap rounded-full border-2 border-white bg-[hsl(var(--brand-gold))] px-[18px] text-lg font-extrabold text-[hsl(var(--brand-navy))]"
            >
              <TeamDot
                className={
                  teamIdentityOf(activeTeamId, snapshot?.teams ?? []).dot
                }
              />
              دور {teams.get(activeTeamId) ?? "الفريق"}
            </span>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)_minmax(0,340px)]">
        {stageTeams.map((team, index) => {
          const cards = cardsOf(team.id);
          const empty = Math.max(0, 5 - cards.length);
          return (
            <aside
              key={team.id}
              data-testid={`top5-team-cards-${team.id}`}
              className={cn(
                "flex flex-col gap-3 rounded-[24px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper p-[18px]",
                // First team beside the card on one side, second on the other.
                index === 0 ? "lg:order-1" : "lg:order-3",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-2 font-display text-xl font-extrabold lg:text-[22px]">
                  <TeamDot
                    className={
                      teamIdentityOf(team.id, snapshot?.teams ?? []).dot
                    }
                  />
                  {team.name}
                </span>
                <span className="shrink-0 text-base font-bold text-brand-slate">
                  {cardsLabel(cards.length)}
                </span>
              </div>
              <ul className="flex list-none flex-col gap-2">
                {cards.map((record) => (
                  <li
                    key={record.entryId}
                    className="flex min-h-[52px] items-center rounded-[14px] border-[3px] border-[hsl(var(--brand-navy))] bg-white px-4 text-xl font-bold [overflow-wrap:anywhere]"
                  >
                    {record.label}
                  </li>
                ))}
                {Array.from({ length: empty }, (_, slot) => (
                  <li
                    key={`empty-${slot}`}
                    aria-hidden
                    className="min-h-[52px] rounded-[14px] border-2 border-dashed border-brand-dash"
                  />
                ))}
              </ul>
              <span className="mt-auto text-sm leading-relaxed text-brand-slate">
                ما أحد يعرف أي بطاقة من التوب 5 إلا وقت الكشف.
              </span>
            </aside>
          );
        })}

        <main className="flex min-h-[420px] flex-col items-center justify-center gap-[18px] rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-lavender p-6 text-center shadow-[7px_8px_0_hsl(var(--brand-navy))] lg:order-2">
          {completed ? (
            <p
              className="font-display text-3xl font-extrabold"
              data-testid="top5-awaiting-result"
            >
              خلصت البطاقات العشر. نجهّز الكشف…
            </p>
          ) : (
            current && (
              <>
                <ChallengeProgress label={counter} className="flex-col gap-2" />
                {current.media?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={current.media.url}
                    alt={current.media.altText ?? current.label}
                    className="h-36 w-full rounded-[18px] object-contain"
                  />
                )}
                {/* The entity name and nothing else. Rank, metric, cutoff and
                    evidence are not in this payload at all — the roadmap
                    contract keeps them hidden until the challenge resolves. */}
                <p
                  data-testid="top5-current-card"
                  className="-rotate-2 rounded-[26px] border-4 border-[hsl(var(--brand-navy))] bg-white px-10 py-8 font-display text-4xl font-black [overflow-wrap:anywhere] shadow-[8px_9px_0_hsl(var(--brand-navy))] lg:min-w-[420px] lg:text-[56px] lg:leading-snug"
                >
                  {current.label}
                </p>
                <p className="text-xl font-bold lg:text-[22px]">
                  يحتفظون فيها ولا يعطونها للخصم؟
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <span className={HINT}>احتفظ = تحسها من التوب 5</span>
                  <span className={HINT}>أعطِ = تحسها فخ</span>
                </div>
                {canDecide && (
                  <div
                    className="grid w-full max-w-xl grid-cols-2 gap-3"
                    data-testid="top5-decider-controls"
                  >
                    {decisions}
                  </div>
                )}
              </>
            )
          )}
        </main>
      </div>

      {!completed && !canDecide && (
        <p
          data-testid="top5-waiting"
          className="text-[17px] font-semibold text-brand-slate"
        >
          {deciderName ? (
            <span data-testid="top5-decider-name">
              القرار عند {deciderName}…
            </span>
          ) : (
            "ننتظر قرار الفريق…"
          )}
        </p>
      )}
    </section>
  );
}

const DECISION =
  "flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] px-4 py-3 text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5 disabled:opacity-60";

const HINT =
  "inline-flex min-h-10 items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white px-4 text-base font-bold";

/** «بطاقة», «بطاقتين», «3 بطاقات». */
function cardsLabel(count: number) {
  if (count === 0) return "0 بطاقات";
  if (count === 1) return "بطاقة";
  if (count === 2) return "بطاقتين";
  return `${count} بطاقات`;
}
