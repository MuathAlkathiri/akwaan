"use client";

import { useMemo, useState } from "react";
import { Check, Flame, Lock, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import {
  ChallengeContextStrip,
  TeamDot,
  useChallengeContext,
} from "../match/components/challenge-context-strip";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useMobileSurface } from "../match/components/mobile-gameplay-shell";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";
import {
  LA_TAHRIQHA_CHALLENGE_NAME,
  readLaTahriqhaView,
  type LaTahriqhaCardView,
  type LaTahriqhaRevealView,
  type LaTahriqhaView,
} from "../match/la-tahriqha.presentation";

/**
 * "لا تحرقها" — one dish, eight cards, and one person per team who may touch
 * them.
 *
 * The same component renders all three surfaces because the server already
 * decided what each of them may know: the shared screen and a teammate's phone
 * receive no team's live selections but their own, and nobody receives which
 * cards are correct until the dish resolves. So the branching here is about
 * *size and job* — a television shows the dish and the pressure, a phone shows
 * the cards a thumb can reach — never about withholding anything the projection
 * already handed over.
 *
 * The teammate's screen is deliberately not a spectator's. It carries the same
 * eight cards and their captain's live choices, because the argument in the room
 * is the team's actual contribution and it cannot happen over a blank phone.
 */

const NAVY = "border-[3px] border-[hsl(var(--brand-navy))]";
const GOLD_ACTION =
  "inline-flex min-h-[62px] items-center justify-center gap-2 rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-7 font-display text-xl font-extrabold text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))] disabled:shadow-none";

/** 3 right pays 3, 4 pays 4, and all 5 pays 7. */
function dishPoints(count: number) {
  return count >= 5 ? 7 : count;
}

/** «نقطة», «نقطتين», «3 نقاط» — never «2 نقاط». */
function pointsLabel(count: number) {
  if (count === 1) return "نقطة";
  if (count === 2) return "نقطتين";
  if (count >= 3 && count <= 10) return `${count} نقاط`;
  return `${count} نقطة`;
}

/** One card. Interactive only where the server said this actor may act. */
function IngredientCard({
  card,
  chosen,
  state,
  truth,
  pickedBy = [],
  onToggle,
  disabled,
  compact,
}: {
  card: LaTahriqhaCardView;
  chosen: boolean;
  /** What this card was to the viewing team. `undefined` while the dish is live. */
  state?: "correct" | "missed" | "burn";
  /** Post-reveal truth for the room: in the recipe, or a distractor. */
  truth?: "right" | "wrong";
  /** Dot classes of every team that put this card in its dish. */
  pickedBy?: string[];
  onToggle?: () => void;
  disabled?: boolean;
  compact: boolean;
}) {
  const body = (
    <span className="flex w-full items-center justify-between gap-2">
      {truth && (
        <span
          aria-hidden
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full border-2 border-[hsl(var(--brand-navy))]",
            truth === "right" ? "bg-brand-mint" : "bg-brand-coral",
          )}
        >
          {truth === "right" ? (
            <Check className="size-4" strokeWidth={3} />
          ) : (
            <X className="size-4" strokeWidth={3} />
          )}
        </span>
      )}
      <span className="min-w-0 flex-1 break-words text-center leading-tight">
        {card.label}
      </span>
      {pickedBy.length > 0 && (
        <span className="flex shrink-0 gap-1">
          {pickedBy.map((dot, index) => (
            <TeamDot key={index} className={dot} size={14} />
          ))}
        </span>
      )}
    </span>
  );
  const shell = cn(
    "grid w-full place-items-center rounded-2xl px-3 font-display font-extrabold text-[hsl(var(--brand-navy))]",
    NAVY,
    compact ? "min-h-[52px] text-[15px]" : "min-h-[92px] text-xl",
    truth === "right" && "bg-brand-mint-tint",
    truth === "wrong" && "bg-brand-coral-tint",
    !truth &&
      chosen &&
      "bg-[hsl(var(--brand-gold))] shadow-[3px_4px_0_hsl(var(--brand-navy))]",
    !truth && !chosen && "bg-white",
  );
  if (!onToggle) {
    return (
      <li>
        <div
          className={shell}
          data-testid={`la-tahriqha-card-${card.localId}`}
          data-chosen={String(chosen)}
          {...(state ? { "data-state": state } : {})}
        >
          {body}
        </div>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={chosen}
        className={cn(shell, "disabled:opacity-60")}
        data-testid={`la-tahriqha-card-${card.localId}`}
        data-chosen={String(chosen)}
      >
        {body}
      </button>
    </li>
  );
}

/**
 * What each team is doing, and never what it chose.
 *
 * «يختار…» and «ثبّتوا 4 مكوّنات» are the two things a team is allowed to know
 * about the other side before the reveal. The second one is the interesting one
 * — four says the opponent reached past the safe three without saying which way
 * — and it is exactly as far as this may go.
 */
function TeamPressure({
  view,
  teamName,
  playerName,
  dotOf,
  compact,
}: {
  view: LaTahriqhaView;
  teamName: (teamId: string) => string;
  playerName: (participantId: string) => string;
  dotOf: (teamId: string) => string;
  compact: boolean;
}) {
  return (
    <ul
      className={cn("flex gap-2.5", compact ? "flex-row" : "flex-col gap-3.5")}
      data-testid="la-tahriqha-pressure"
    >
      {view.teamIds.map((teamId) => {
        const status = view.teamStatus[teamId];
        const captain = view.captainParticipantIds[teamId];
        return (
          <li
            key={teamId}
            data-testid={`la-tahriqha-status-${teamId}`}
            data-locked={String(Boolean(status?.locked))}
            className={cn(
              "flex min-w-0 flex-1 justify-between rounded-[18px] bg-white",
              compact
                ? "flex-col items-center gap-0.5 border-2 border-[hsl(var(--brand-navy))] px-2.5 py-1.5 text-xs"
                : cn(NAVY, "items-center gap-2 px-4 py-3"),
            )}
          >
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "inline-flex items-center gap-2 font-display font-extrabold",
                  compact ? "text-xs" : "text-[19px]",
                )}
              >
                <TeamDot className={dotOf(teamId)} size={compact ? 10 : 16} />
                <span className="truncate">{teamName(teamId)}</span>
              </span>
              {captain && !compact && (
                <span className="text-sm text-brand-slate">
                  قائد الطبق: {playerName(captain)}
                </span>
              )}
            </span>
            <span
              className={cn(
                "shrink-0 font-bold",
                compact ? "text-xs" : "text-sm",
                status?.locked &&
                  "rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-2.5 py-0.5",
              )}
            >
              {status?.locked
                ? compact
                  ? `ثبّتوا ${status.committedCount}`
                  : `ثبّتوا ${status.committedCount} مكوّنات`
                : "يختارون…"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The challenge's own standing. Never a Match score. */
function RunningTotals({
  view,
  teamName,
  dotOf,
}: {
  view: LaTahriqhaView;
  teamName: (teamId: string) => string;
  dotOf: (teamId: string) => string;
}) {
  return (
    <ul
      className="flex flex-wrap items-center justify-center gap-2"
      data-testid="la-tahriqha-totals"
    >
      {view.teamIds.map((teamId) => (
        <li
          key={teamId}
          className="inline-flex items-center gap-2 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-3 py-1 text-sm font-bold"
          data-testid={`la-tahriqha-total-${teamId}`}
        >
          <TeamDot className={dotOf(teamId)} size={12} />
          {teamName(teamId)}
          <span className="akwaan-numeral text-lg font-bold">
            {view.totals[teamId] ?? 0}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The reveal, which is the payoff rather than a receipt.
 *
 * The eight cards above already show the recipe. Here each team gets its
 * verdict: gold for what it earned, the coral tint for a burned dish with the
 * ingredient that burned it named, because «0» on its own does not tell a room
 * what happened.
 */
function DishReveal({
  reveal,
  view,
  teamName,
  playerName,
  dotOf,
}: {
  reveal: LaTahriqhaRevealView;
  view: LaTahriqhaView;
  teamName: (teamId: string) => string;
  playerName: (participantId: string) => string;
  dotOf: (teamId: string) => string;
}) {
  const labelOf = (localId: string) =>
    view.dish?.ingredients.find((card) => card.localId === localId)?.label ??
    localId;
  return (
    <div className="flex flex-col gap-3.5">
      <div
        className={cn(
          "flex flex-col gap-1 rounded-[20px] bg-brand-lavender px-4 py-3 text-start",
          NAVY,
        )}
        data-testid="la-tahriqha-correct-recipe"
      >
        <p className="text-sm font-bold text-brand-slate">
          {reveal.dishName} · المكوّنات الصح
        </p>
        <p className="break-words font-display text-lg font-extrabold [overflow-wrap:anywhere]">
          {reveal.correctIngredientIds.map(labelOf).join(" · ")}
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {reveal.teams.map((team) => (
          <li
            key={team.teamId}
            data-testid={`la-tahriqha-reveal-${team.teamId}`}
            data-burned={String(team.burned)}
            data-perfect={String(team.perfect)}
            className={cn(
              "flex flex-col gap-1.5 rounded-[20px] px-4 py-3 text-start",
              NAVY,
              team.burned && "bg-brand-coral-tint",
              !team.burned &&
                !team.understaffed &&
                "bg-[hsl(var(--brand-gold))] shadow-[4px_5px_0_hsl(var(--brand-navy))]",
              team.understaffed && "bg-white",
            )}
          >
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              <span className="inline-flex items-center gap-2 font-display text-[19px] font-extrabold">
                <TeamDot className={dotOf(team.teamId)} />
                {teamName(team.teamId)}
              </span>
              {team.captainParticipantId && (
                <span className="text-sm">
                  قائد الطبق: {playerName(team.captainParticipantId)}
                </span>
              )}
              {team.lockReason === "deadline" && (
                <span className="text-sm">تثبّت مع نهاية الوقت</span>
              )}
            </p>
            {team.understaffed ? (
              <p className="text-base font-bold">
                ما وصلوا 3 مكوّنات، فالطبق ما انحسب.
              </p>
            ) : team.burned ? (
              <p
                className="flex flex-wrap items-center gap-2 font-display text-xl font-black"
                data-testid={`la-tahriqha-burn-${team.teamId}`}
              >
                <Flame className="size-5" aria-hidden />
                انحرق الطبق · <span className="akwaan-numeral">0</span>
                <span className="font-sans text-sm font-bold">
                  بسبب {team.wrongIds.map(labelOf).join(" و")}
                </span>
              </p>
            ) : (
              <p className="flex flex-wrap items-center gap-2 font-display text-xl font-black">
                <span>
                  <span className="akwaan-numeral">
                    {team.correctIds.length}
                  </span>{" "}
                  صح ·{" "}
                  <bdi dir="ltr" className="akwaan-numeral">
                    +{team.points}
                  </bdi>
                </span>
                {team.perfect && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white px-2.5 py-0.5 font-sans text-sm font-bold"
                    data-testid={`la-tahriqha-perfect-${team.teamId}`}
                  >
                    <Star className="size-4" aria-hidden />
                    طبق كامل
                  </span>
                )}
              </p>
            )}
            {!team.understaffed && (
              <p className="break-words text-sm [overflow-wrap:anywhere]">
                {team.selected.map(labelOf).join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-center justify-center gap-2 text-sm font-bold">
        المجموع للحين
        {view.teamIds.map((teamId) => (
          <span
            key={teamId}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white px-3 py-0.5"
          >
            <TeamDot className={dotOf(teamId)} size={12} />
            <span className="akwaan-numeral text-base">
              {reveal.totalsAfter[teamId] ?? 0}
            </span>
          </span>
        ))}
      </p>
    </div>
  );
}

export function LaTahriqhaGameplayPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const phone = useMobileSurface();
  const context = useChallengeContext();
  const view = useMemo(
    () => readLaTahriqhaView(runtime.modeState),
    [runtime.modeState],
  );
  /**
   * Presentational only. `gameplayCommand` is fire-and-forget, so there is no
   * promise to await: this closes the window in which a second tap could queue a
   * second command against the same card, and the server's next snapshot — which
   * changes `ownSelected` — is what releases it.
   */
  const [pending, setPending] = useState<string | undefined>();

  const live = connection === "connected";
  const revealed = view.phase === "revealed" || view.phase === "completed";
  const remainingMs = useInteractionDeadline(view.deadlineAt, revealed);
  const can = (action: string) =>
    runtime.availableActions.includes(`mode:${action}`);

  const teamName = (teamId: string) =>
    snapshot?.teams.find((team) => team.id === teamId)?.name ?? "الفريق";
  const playerName = (participantId: string) =>
    snapshot?.participants.find((person) => person.id === participantId)
      ?.displayName ?? "لاعب الفريق";

  const ownLocked = view.actorTeamId
    ? view.teamStatus[view.actorTeamId]?.locked === true
    : false;
  const chosen = new Set(view.ownSelected);
  const canChoose =
    view.phase === "selecting" &&
    view.isDishCaptain &&
    !ownLocked &&
    live &&
    can("select-la-tahriqha-ingredient");
  const canCommit =
    canChoose &&
    view.ownSelected.length >= view.minSelection &&
    can("lock-la-tahriqha-dish");

  const send = (
    commandType: string,
    payload: Record<string, string | number | boolean | null> = {},
  ) =>
    gameplayCommand("gameplay-command", {
      roundId: runtime.activeRound?.id,
      commandType,
      payload,
    });

  const toggle = (localId: string) => {
    if (!canChoose || pending) return;
    const removing = chosen.has(localId);
    if (!removing && view.ownSelected.length >= view.maxSelection) return;
    setPending(localId);
    send(
      removing
        ? "deselect-la-tahriqha-ingredient"
        : "select-la-tahriqha-ingredient",
      { ingredientId: localId },
    );
  };

  const commit = () => {
    if (!canCommit || pending) return;
    setPending("lock");
    send("lock-la-tahriqha-dish");
  };

  // Any authoritative move releases the guard: the set changed, the team
  // committed, or the dish moved on. A phone whose command lost a race stops
  // waiting the moment the server says so rather than sitting on a stale tap.
  const guardKey = `${view.phase}:${view.dishIndex}:${view.ownSelected.join(",")}:${String(ownLocked)}`;
  const [guardedAt, setGuardedAt] = useState(guardKey);
  if (guardedAt !== guardKey) {
    setGuardedAt(guardKey);
    if (pending) setPending(undefined);
  }

  const cardState = (
    localId: string,
  ): "correct" | "missed" | "burn" | undefined => {
    if (!revealed || !view.reveal) return undefined;
    const own = view.actorTeamId
      ? view.reveal.teams.find((team) => team.teamId === view.actorTeamId)
      : undefined;
    if (own?.wrongIds.includes(localId)) return "burn";
    if (view.reveal.correctIngredientIds.includes(localId)) return "correct";
    return "missed";
  };

  const dotOf = (teamId: string) =>
    teamIdentityOf(teamId, snapshot?.teams ?? []).dot;
  const step = `الطبق ${view.dishNumber} من ${view.dishCount}`;
  const pickedBy = (localId: string) =>
    revealed && view.reveal
      ? view.reveal.teams
          .filter((team) => team.selected.includes(localId))
          .map((team) => dotOf(team.teamId))
      : [];
  const truthOf = (localId: string) =>
    revealed && view.reveal
      ? view.reveal.correctIngredientIds.includes(localId)
        ? ("right" as const)
        : ("wrong" as const)
      : undefined;

  const cards = view.dish && (
    <ul
      className={cn(
        "grid gap-2.5",
        phone
          ? // Eight cards fit a phone without scrolling while the team is
            // choosing. Once revealed the verdict follows them, so the whole
            // screen scrolls instead of squeezing the cards behind it.
            revealed
            ? "shrink-0 grid-cols-2 gap-2"
            : "min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto"
          : "grid-cols-2 xl:grid-cols-4",
      )}
      data-testid="la-tahriqha-cards"
    >
      {view.dish.ingredients.map((card) => (
        <IngredientCard
          key={card.localId}
          card={card}
          chosen={chosen.has(card.localId)}
          compact={phone}
          pickedBy={pickedBy(card.localId)}
          {...(truthOf(card.localId) ? { truth: truthOf(card.localId) } : {})}
          {...(cardState(card.localId)
            ? { state: cardState(card.localId) }
            : {})}
          {...(canChoose
            ? {
                onToggle: () => toggle(card.localId),
                disabled:
                  Boolean(pending) ||
                  (!chosen.has(card.localId) &&
                    view.ownSelected.length >= view.maxSelection),
              }
            : {})}
        />
      ))}
    </ul>
  );

  const advance = can("advance-la-tahriqha") && (
    <button
      type="button"
      onClick={() => send("advance-la-tahriqha")}
      disabled={!live}
      className={cn(GOLD_ACTION, "self-center")}
      data-testid="la-tahriqha-advance"
    >
      {view.dishNumber === view.dishCount ? "نشوف النتيجة" : "الطبق الجاي"}
    </button>
  );

  const recap = view.phase === "completed" && view.result && (
    <section
      className="grid min-h-0 flex-1 gap-4 sm:grid-cols-2"
      data-testid="la-tahriqha-recap"
    >
      {view.teamIds.map((teamId) => (
        <div
          key={teamId}
          data-testid={`la-tahriqha-recap-${teamId}`}
          className={cn(
            "flex flex-col items-center justify-center gap-1.5 rounded-3xl p-5 text-center",
            NAVY,
            view.result?.winnerTeamId === teamId
              ? "bg-[hsl(var(--brand-gold))] shadow-[5px_6px_0_hsl(var(--brand-navy))]"
              : "bg-white",
          )}
        >
          <p className="inline-flex items-center gap-2.5 font-display text-xl font-extrabold">
            <TeamDot className={dotOf(teamId)} />
            {teamName(teamId)}
          </p>
          <p className="akwaan-numeral text-[56px] font-bold leading-none">
            {view.result?.totals[teamId] ?? 0}
          </p>
        </div>
      ))}
      {view.result.tie && (
        <p
          className="col-span-full text-center font-display text-xl font-extrabold"
          data-testid="la-tahriqha-tie"
        >
          تعادل! الفريقين خلصوا بنفس المجموع.
        </p>
      )}
    </section>
  );

  const preparing = view.phase === "preparing" && (
    <p
      className="py-8 text-center text-lg font-bold text-brand-slate"
      data-testid="la-tahriqha-preparing"
    >
      نجهّز الطبق…
    </p>
  );

  if (!phone) {
    const media = view.dish?.media;
    return (
      <section
        dir="rtl"
        data-testid="la-tahriqha-panel"
        data-phase={view.phase}
        className="flex min-h-0 flex-1 flex-col gap-[18px] text-[hsl(var(--brand-navy))]"
      >
        <ChallengeContextStrip
          {...(context.eyebrow ? { eyebrow: context.eyebrow } : {})}
          title={context.title ?? LA_TAHRIQHA_CHALLENGE_NAME}
          aside={
            <span className="inline-flex min-h-9 items-center whitespace-nowrap rounded-full bg-white px-4 text-[15px] font-bold text-[hsl(var(--brand-navy))]">
              {view.phase === "completed"
                ? "نتيجة التحدي"
                : revealed
                  ? `الكشف · ${step}`
                  : step}
            </span>
          }
        />
        {preparing}
        {view.phase === "completed" && !view.reveal && recap}
        {view.dish && view.phase !== "preparing" && (
          <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <main
              className={cn(
                "flex flex-col gap-4 rounded-[28px] bg-brand-paper p-5 shadow-[7px_8px_0_hsl(var(--brand-navy))]",
                NAVY,
              )}
            >
              {!revealed && (
                <div className="flex flex-wrap items-center gap-4">
                  {/* The dish photograph is optional content, so its absence is
                      a plainer board and never an error. */}
                  {media?.type === "image" && media.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={media.url}
                      alt={media.altText ?? view.dish.dishName}
                      data-testid="la-tahriqha-dish-image"
                      className="h-32 w-44 rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] object-cover"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h2
                      className="font-display text-[2rem] font-black leading-snug lg:text-[44px]"
                      data-testid="la-tahriqha-dish-name"
                    >
                      {view.dish.dishName}
                    </h2>
                    {view.dish.dishNote && (
                      <p className="text-lg text-brand-slate">
                        {view.dish.dishNote}
                      </p>
                    )}
                  </div>
                  {remainingMs !== undefined && view.phase === "selecting" && (
                    <ChallengeCountdown remainingMs={remainingMs} />
                  )}
                </div>
              )}
              {cards}
              {view.phase === "selecting" && (
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-bold">
                  {[3, 4, 5].map((count) => (
                    <span
                      key={count}
                      className="inline-flex items-center gap-1.5 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white px-3 py-1"
                    >
                      <span className="akwaan-numeral">{count}</span> صح ={" "}
                      {pointsLabel(dishPoints(count))}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-brand-coral-tint px-3 py-1">
                    <Flame className="size-4" aria-hidden />
                    وحدة غلط تحرق الطبق
                  </span>
                </div>
              )}
            </main>

            <aside className="flex flex-col gap-3.5">
              {view.phase === "selecting" && (
                <>
                  <TeamPressure
                    view={view}
                    teamName={teamName}
                    playerName={playerName}
                    dotOf={dotOf}
                    compact={false}
                  />
                  <p className="text-center text-sm leading-[1.7] text-brand-slate">
                    قائد الطبق يختار من {view.minSelection} إلى{" "}
                    {view.maxSelection} مكوّنات من جواله، والاختيار سرّي لين
                    الكشف.
                  </p>
                  <RunningTotals
                    view={view}
                    teamName={teamName}
                    dotOf={dotOf}
                  />
                </>
              )}
              {revealed && view.reveal && (
                <section
                  className="akwaan-rise flex flex-col gap-3.5"
                  data-testid="la-tahriqha-reveal"
                >
                  <DishReveal
                    reveal={view.reveal}
                    view={view}
                    teamName={teamName}
                    playerName={playerName}
                    dotOf={dotOf}
                  />
                  {advance}
                </section>
              )}
              {view.reveal && recap}
            </aside>
          </div>
        )}
      </section>
    );
  }

  const ownCount = view.ownSelected.length;
  return (
    <ChallengeFrame
      title={view.phase === "completed" ? "نتيجة التحدي" : step}
      progressValue={
        view.phase === "completed"
          ? 100
          : (view.dishIndex / view.dishCount) * 100
      }
      compact
      aside={
        remainingMs !== undefined && view.phase === "selecting" ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2.5 text-[hsl(var(--brand-navy))]",
          revealed && "overflow-y-auto",
        )}
        dir="rtl"
        data-testid="la-tahriqha-panel"
        data-phase={view.phase}
      >
        {preparing}

        {view.dish && view.phase !== "preparing" && (
          <>
            {!revealed && (
              <div className="shrink-0 text-center">
                <h2
                  className="font-display text-xl font-black leading-snug"
                  data-testid="la-tahriqha-dish-name"
                >
                  {view.dish.dishName}
                </h2>
                {view.dish.dishNote && (
                  <p className="text-xs text-brand-slate">
                    {view.dish.dishNote}
                  </p>
                )}
              </div>
            )}

            {/* Whose hands are on the cards, said on the phone that is not the
                captain's — that is the phone at risk of tapping and wondering
                why nothing happened. */}
            {view.phase === "selecting" && (
              <p
                className="shrink-0 text-center text-sm font-bold"
                data-testid="la-tahriqha-captain-line"
              >
                {view.isDishCaptain ? (
                  <>
                    أنت قائد الطبق. اختر من {view.minSelection} إلى{" "}
                    {view.maxSelection} مكوّنات
                  </>
                ) : (
                  <span className="text-brand-slate">
                    {playerName(
                      view.captainParticipantIds[view.actorTeamId ?? ""] ?? "",
                    )}{" "}
                    قائد هالطبق. تناقشوا معه قبل ما يثبّت
                  </span>
                )}
              </p>
            )}

            {cards}

            {view.phase === "selecting" && view.actorTeamId && (
              <p
                className="shrink-0 rounded-2xl border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-3 py-2 text-center text-sm font-bold"
                data-testid="la-tahriqha-selection-count"
              >
                اخترت <span className="akwaan-numeral">{ownCount}</span> من{" "}
                <span className="akwaan-numeral">{view.maxSelection}</span>
                {ownCount < view.minSelection
                  ? ` · أقل شي ${view.minSelection}`
                  : ` · لو كلها صح تاخذون ${dishPoints(ownCount)} · وحدة غلط = صفر`}
              </p>
            )}

            {view.phase === "selecting" && (
              <TeamPressure
                view={view}
                teamName={teamName}
                playerName={playerName}
                dotOf={dotOf}
                compact
              />
            )}

            {/* Committed, and waiting. Worded as a finished act rather than as a
                lost turn: the team did the thing the dish asked for. */}
            {view.phase === "selecting" && ownLocked && (
              <p
                className="rounded-2xl border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender p-3 text-center text-sm font-bold"
                data-testid="la-tahriqha-committed"
              >
                ثبّتوا طبقكم. ننتظر الخصم…
              </p>
            )}

            {canChoose && (
              <MobileActionArea>
                <button
                  type="button"
                  onClick={commit}
                  disabled={!canCommit || Boolean(pending)}
                  data-testid="la-tahriqha-commit"
                  className={cn(
                    GOLD_ACTION,
                    "w-full",
                    ownCount < view.minSelection && "bg-brand-lavender text-lg",
                  )}
                >
                  <Lock className="size-5" aria-hidden />
                  {ownCount < view.minSelection
                    ? `اختر ${view.minSelection} مكوّنات على الأقل`
                    : "ثبّت الطبق"}
                </button>
              </MobileActionArea>
            )}
          </>
        )}

        {revealed && view.reveal && (
          <section
            className="akwaan-rise flex flex-col gap-3"
            data-testid="la-tahriqha-reveal"
          >
            <DishReveal
              reveal={view.reveal}
              view={view}
              teamName={teamName}
              playerName={playerName}
              dotOf={dotOf}
            />
            {advance}
          </section>
        )}

        {recap}
      </div>
    </ChallengeFrame>
  );
}
