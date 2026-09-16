"use client";

import { useMemo, useState } from "react";
import { Flame, Lock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useMobileSurface } from "../match/components/mobile-gameplay-shell";
import {
  ResolutionOutcome,
  ResolutionReveal,
} from "../match/components/resolution-reveal";
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

/** One card. Interactive only where the server said this actor may act. */
function IngredientCard({
  card,
  chosen,
  state,
  onToggle,
  disabled,
  compact,
}: {
  card: LaTahriqhaCardView;
  chosen: boolean;
  /** Post-reveal truth. `undefined` while the dish is still live. */
  state?: "correct" | "missed" | "burn";
  onToggle?: () => void;
  disabled?: boolean;
  compact: boolean;
}) {
  const body = (
    <span className="flex w-full items-center justify-center gap-1.5 text-center leading-tight">
      {state === "burn" && <Flame className="size-4 shrink-0" aria-hidden />}
      <span className="min-w-0 break-words">{card.label}</span>
    </span>
  );
  const shell = cn(
    "grid w-full place-items-center rounded-[var(--radius)] border-2 px-2 font-black transition-colors",
    compact ? "min-h-[3.25rem] text-sm" : "min-h-20 text-lg",
    state === "correct" && "border-emerald-500 bg-emerald-500/15 text-foreground",
    state === "burn" && "border-destructive bg-destructive/15 text-foreground",
    state === "missed" && "border-border/50 bg-muted/40 text-muted-foreground",
    !state && chosen && "border-brand-gold bg-brand-gold/20 text-foreground",
    !state && !chosen && "border-border bg-card text-foreground",
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
 * The pressure strip: what each team is doing, and never what it chose.
 *
 * "لسّه يختارون" and "ثبّتوا 4 مكوّنات" are the two things a team is allowed to
 * know about the other side before the reveal. The second one is the interesting
 * one — four says the opponent reached past the safe three without saying which
 * way — and it is exactly as far as this may go.
 */
function TeamPressure({
  view,
  teamName,
  playerName,
  compact,
}: {
  view: LaTahriqhaView;
  teamName: (teamId: string) => string;
  playerName: (participantId: string) => string;
  compact: boolean;
}) {
  const { teams } = useLiveSession().snapshot ?? { teams: [] };
  if (compact) {
    return (
      <ul
        className="flex items-center justify-center gap-2 text-xs"
        data-testid="la-tahriqha-pressure"
      >
        {view.teamIds.map((teamId) => {
          const identity = teamIdentityOf(teamId, teams ?? []);
          const status = view.teamStatus[teamId];
          return (
            <li
              key={teamId}
              data-testid={`la-tahriqha-status-${teamId}`}
              data-locked={String(Boolean(status?.locked))}
              className={cn(
                "min-w-0 flex-1 truncate rounded-full border px-2 py-1 text-center font-bold",
                identity.surface,
                identity.border,
              )}
            >
              <span className={identity.text}>{teamName(teamId)}</span>
              <span className="text-muted-foreground">
                {status?.locked
                  ? ` · ثبّتوا ${status.committedCount}`
                  : " · يختارون"}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul
      className={cn("grid gap-2", compact ? "grid-cols-2" : "sm:grid-cols-2")}
      data-testid="la-tahriqha-pressure"
    >
      {view.teamIds.map((teamId) => {
        const identity = teamIdentityOf(teamId, teams ?? []);
        const status = view.teamStatus[teamId];
        const captain = view.captainParticipantIds[teamId];
        return (
          <li
            key={teamId}
            data-testid={`la-tahriqha-status-${teamId}`}
            data-locked={String(Boolean(status?.locked))}
            className={cn(
              "rounded-[var(--radius)] border p-3 text-center",
              identity.surface,
              identity.border,
            )}
          >
            <p
              className={cn(
                "font-black",
                identity.text,
                compact ? "text-xs" : "text-base",
              )}
            >
              {teamName(teamId)}
            </p>
            {captain && (
              <p className="mt-0.5 text-xs font-bold text-muted-foreground">
                قائد الطبق: {playerName(captain)}
              </p>
            )}
            <p
              className={cn(
                "mt-1 font-bold",
                compact ? "text-xs" : "text-sm",
                status?.locked ? "text-brand-gold" : "text-muted-foreground",
              )}
            >
              {status?.locked
                ? `ثبّتوا ${status.committedCount} مكوّنات`
                : "لسّه يختارون…"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** The internal Signature standing. Never a Match score. */
function RunningTotals({
  view,
  teamName,
  compact,
}: {
  view: LaTahriqhaView;
  teamName: (teamId: string) => string;
  compact: boolean;
}) {
  return (
    <ul
      className="flex items-center justify-center gap-3"
      data-testid="la-tahriqha-totals"
    >
      {view.teamIds.map((teamId) => (
        <li
          key={teamId}
          className="flex items-center gap-1.5"
          data-testid={`la-tahriqha-total-${teamId}`}
        >
          <span
            className={cn(
              "font-bold text-muted-foreground",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {teamName(teamId)}
          </span>
          <span
            className={cn(
              "akwaan-numeral font-black text-foreground",
              compact ? "text-base" : "text-2xl",
            )}
          >
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
 * Every dish shows the same four things in the same order: the recipe that was
 * actually right, what each team committed, what that cost or paid, and where
 * the Signature now stands. A burn is named as a burn and a perfect dish is
 * named as one, because "0" and "7" on their own do not tell a room what
 * happened to it.
 */
function DishReveal({
  reveal,
  view,
  teamName,
  playerName,
  compact,
}: {
  reveal: LaTahriqhaRevealView;
  view: LaTahriqhaView;
  teamName: (teamId: string) => string;
  playerName: (participantId: string) => string;
  compact: boolean;
}) {
  const labelOf = (localId: string) =>
    view.dish?.ingredients.find((card) => card.localId === localId)?.label ??
    localId;
  return (
    <ResolutionReveal title={reveal.dishName} compact={compact}>
      <div className="space-y-1" data-testid="la-tahriqha-correct-recipe">
        <p className="text-sm font-bold text-muted-foreground">
          مكوّنات الطبق الصحيحة
        </p>
        <p className="break-words text-base font-black [overflow-wrap:anywhere] sm:text-xl">
          {reveal.correctIngredientIds.map(labelOf).join(" · ")}
        </p>
      </div>
      <ul className="space-y-3">
        {reveal.teams.map((team) => (
          <li
            key={team.teamId}
            data-testid={`la-tahriqha-reveal-${team.teamId}`}
            data-burned={String(team.burned)}
            data-perfect={String(team.perfect)}
            className={cn(
              "space-y-1 rounded-[var(--radius)] border p-3",
              team.burned && "border-destructive/60 bg-destructive/10",
              team.perfect && "border-brand-gold bg-brand-gold/10",
              !team.burned && !team.perfect && "border-border",
            )}
          >
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted-foreground">
              <span className="font-black text-foreground">
                {teamName(team.teamId)}
              </span>
              {team.captainParticipantId && (
                <span>قائد الطبق: {playerName(team.captainParticipantId)}</span>
              )}
              {team.lockReason === "deadline" && <span>ثُبّت مع نهاية الوقت</span>}
            </p>
            {team.understaffed ? (
              <p className="text-base font-black text-foreground">
                ما وصلوا لثلاثة مكوّنات — الطبق ما احتُسب.
              </p>
            ) : (
              <p className="break-words text-base font-black [overflow-wrap:anywhere]">
                {team.selected.map((id) => (
                  <span
                    key={id}
                    className={cn(
                      "me-2 inline-block",
                      team.wrongIds.includes(id)
                        ? "text-destructive line-through"
                        : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {labelOf(id)}
                  </span>
                ))}
              </p>
            )}
            <p className="flex items-center gap-2 text-base font-black">
              {team.burned && (
                <span
                  className="flex items-center gap-1 text-destructive"
                  data-testid={`la-tahriqha-burn-${team.teamId}`}
                >
                  <Flame className="size-5" aria-hidden />
                  احترقت
                </span>
              )}
              {team.perfect && (
                <span
                  className="flex items-center gap-1 text-brand-gold"
                  data-testid={`la-tahriqha-perfect-${team.teamId}`}
                >
                  <Star className="size-5" aria-hidden />
                  طبق مثالي
                </span>
              )}
              <span className="akwaan-numeral text-xl text-foreground">
                +{team.points}
              </span>
            </p>
          </li>
        ))}
      </ul>
      <ResolutionOutcome>
        {view.teamIds
          .map((teamId) => `${teamName(teamId)} ${reveal.totalsAfter[teamId] ?? 0}`)
          .join("  ·  ")}
      </ResolutionOutcome>
    </ResolutionReveal>
  );
}

export function LaTahriqhaGameplayPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const phone = useMobileSurface();
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

  return (
    <ChallengeFrame
      {...(phone ? {} : { eyebrow: LA_TAHRIQHA_CHALLENGE_NAME })}
      title={
        view.phase === "completed"
          ? "نتيجة التحدي"
          : `الطبق ${view.dishNumber} من ${view.dishCount}`
      }
      progressValue={
        view.phase === "completed"
          ? 100
          : (view.dishIndex / view.dishCount) * 100
      }
      compact={phone}
      aside={
        remainingMs !== undefined && view.phase === "selecting" ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className={phone ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-4xl"}
    >
      <div
        className={phone ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-5"}
        dir="rtl"
        data-testid="la-tahriqha-panel"
        data-phase={view.phase}
      >
        {view.phase === "preparing" && (
          <p
            className="py-8 text-center text-base font-black text-muted-foreground"
            data-testid="la-tahriqha-preparing"
          >
            جارٍ تجهيز الطبق…
          </p>
        )}

        {view.dish && view.phase !== "preparing" && (
          <>
            {!revealed && (
            <div className={cn("space-y-1 text-center", phone && "shrink-0")}>
              <h2
                className={cn(
                  "font-black leading-snug text-foreground",
                  phone ? "text-lg" : "text-[2rem] sm:text-[2.5rem]",
                )}
                data-testid="la-tahriqha-dish-name"
              >
                {view.dish.dishName}
              </h2>
              {view.dish.dishNote && (
                <p
                  className={cn(
                    "font-bold text-muted-foreground",
                    phone ? "text-xs" : "text-base",
                  )}
                >
                  {view.dish.dishNote}
                </p>
              )}
            </div>
            )}

            {/* The dish photograph belongs to the room's screen. It is optional
                content, so its absence is a plainer board and never an error. */}
            {!phone &&
              view.dish.media?.type === "image" &&
              view.dish.media.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={view.dish.media.url}
                  alt={view.dish.media.altText ?? view.dish.dishName}
                  data-testid="la-tahriqha-dish-image"
                  className="mx-auto max-h-48 rounded-[var(--radius)] object-contain"
                />
              )}

            {/* Whose hands are on the cards, said on the phone that is not the
                captain's — that is the phone at risk of tapping and wondering
                why nothing happened. */}
            {phone && view.phase === "selecting" && (
              <p
                className="shrink-0 text-center text-sm font-black"
                data-testid="la-tahriqha-captain-line"
              >
                {view.isDishCaptain ? (
                  <span className="text-brand-gold">
                    أنت قائد الطبق — اختر من {view.minSelection} إلى{" "}
                    {view.maxSelection} مكوّنات
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {playerName(
                      view.captainParticipantIds[view.actorTeamId ?? ""] ?? "",
                    )}{" "}
                    قائد هذا الطبق — ناقشوه قبل ما يثبّت
                  </span>
                )}
              </p>
            )}

            <ul
              className={cn(
                "grid gap-2",
                phone
                  ? "min-h-0 flex-1 grid-cols-2 content-start overflow-y-auto"
                  : "grid-cols-4",
              )}
              data-testid="la-tahriqha-cards"
            >
              {view.dish.ingredients.map((card) => (
                <IngredientCard
                  key={card.localId}
                  card={card}
                  chosen={chosen.has(card.localId)}
                  compact={phone || revealed}
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

            {view.phase === "selecting" && view.actorTeamId && (
              <p
                className="shrink-0 text-center text-sm font-black"
                data-testid="la-tahriqha-selection-count"
              >
                <span className="akwaan-numeral text-foreground">
                  {view.ownSelected.length}
                </span>
                <span className="text-muted-foreground"> من </span>
                <span className="akwaan-numeral text-foreground">
                  {view.maxSelection}
                </span>
                {view.ownSelected.length < view.minSelection && (
                  <span className="text-muted-foreground">
                    {" "}
                    — الحد الأدنى {view.minSelection}
                  </span>
                )}
              </p>
            )}

            {view.phase === "selecting" && (
              <TeamPressure
                view={view}
                teamName={teamName}
                playerName={playerName}
                compact={phone}
              />
            )}

            {/* Committed, and waiting. Worded as a finished act rather than as a
                lost turn: the team did the thing the dish asked for. */}
            {view.phase === "selecting" && ownLocked && (
              <p
                className="rounded-[var(--radius)] border border-border bg-muted/50 p-3 text-center text-sm font-bold text-muted-foreground"
                data-testid="la-tahriqha-committed"
              >
                ثبّتّم طبقكم. ننتظر الفريق الثاني…
              </p>
            )}

            {canChoose && (
              <MobileActionArea>
                <Button
                  size="lg"
                  onClick={commit}
                  disabled={!canCommit || Boolean(pending)}
                  data-testid="la-tahriqha-commit"
                  className="h-14 w-full gap-2 text-base font-black"
                >
                  <Lock className="size-5" aria-hidden />
                  {view.ownSelected.length < view.minSelection
                    ? `اختاروا ${view.minSelection} مكوّنات على الأقل`
                    : "ثبّتوا الطبق"}
                </Button>
              </MobileActionArea>
            )}
          </>
        )}

        {revealed && view.reveal && (
          <section className="akwaan-rise space-y-3" data-testid="la-tahriqha-reveal">
            <DishReveal
              reveal={view.reveal}
              view={view}
              teamName={teamName}
              playerName={playerName}
              compact={phone}
            />
            {can("advance-la-tahriqha") && (
              <div className="text-center">
                <Button
                  size="lg"
                  onClick={() => send("advance-la-tahriqha")}
                  disabled={!live}
                  data-testid="la-tahriqha-advance"
                >
                  {view.dishNumber === view.dishCount
                    ? "عرض النتيجة"
                    : "الطبق التالي"}
                </Button>
              </div>
            )}
          </section>
        )}

        {!phone && view.phase === "selecting" && (
          <RunningTotals view={view} teamName={teamName} compact={phone} />
        )}

        {view.phase === "completed" && view.result && (
          <section
            className="grid gap-3 sm:grid-cols-2"
            data-testid="la-tahriqha-recap"
          >
            {view.teamIds.map((teamId) => (
              <div
                key={teamId}
                data-testid={`la-tahriqha-recap-${teamId}`}
                className={cn(
                  "rounded-[var(--radius)] border p-5 text-center",
                  view.result?.winnerTeamId === teamId &&
                    "border-4 border-brand-gold",
                )}
              >
                <p className="font-bold">{teamName(teamId)}</p>
                <p className="akwaan-numeral text-3xl font-black">
                  {view.result?.totals[teamId] ?? 0}
                </p>
              </div>
            ))}
            {view.result.tie && (
              <p
                className="col-span-full text-center text-base font-black text-muted-foreground"
                data-testid="la-tahriqha-tie"
              >
                تعادل — الطبقان الثلاثة انتهوا بنفس المجموع.
              </p>
            )}
          </section>
        )}
      </div>
    </ChallengeFrame>
  );
}
