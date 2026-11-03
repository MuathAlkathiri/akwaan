"use client";

import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { Check, Hand, ListOrdered, Send, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BidiText } from "@/components/akwaan/bidi-text";
import { ChallengeFrame } from "@/features/live-game-session/match/components/challenge-frame";
import {
  PhoneFrame,
  SharedScreenFrame,
} from "@/features/how-to-play/components/device-frames";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { TOP5_DEMO_STEPS, type Top5DemoStep } from "../top5-demo-scenario";
import type {
  Top5TutorialEntry,
  Top5TutorialScenario,
} from "../tutorial-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";
import { ExplainerCaption, ExplainerControls } from "./explainer-controls";
import type { ExplainerMode } from "./ryo-explainer";

const teamIds = ["team-a", "team-b"] as const;
const teamNames = {
  "team-a": "الفريق الأول",
  "team-b": "الفريق الثاني",
} as const;
const demoTeams = [
  { id: "tutorial-answering", name: teamNames["team-a"] },
  { id: "tutorial-opposing", name: teamNames["team-b"] },
] as const;
const teamIdentity = (team: "team-a" | "team-b") =>
  teamIdentityOf(
    team === "team-a" ? "tutorial-answering" : "tutorial-opposing",
    demoTeams,
  );

function activeTeamFor(scenario: Top5TutorialScenario, cardIndex: number) {
  const first = scenario.startingTeam;
  return cardIndex % 2 === 0 ? first : first === "team-a" ? "team-b" : "team-a";
}

function ownerFor(actingTeam: "team-a" | "team-b", action: "keep" | "give") {
  return action === "keep"
    ? actingTeam
    : actingTeam === "team-a"
      ? "team-b"
      : "team-a";
}

function cardIndexFor(step: Top5DemoStep) {
  if (step.cardIndex !== undefined) return step.cardIndex;
  return 0;
}

function decidedCountFor(step: Top5DemoStep) {
  if (step.id === "keep-decision") return 0;
  if (step.id === "keep-owned") return 1;
  if (step.id === "give-decision") return 1;
  return step.phase === "ownership" ? 2 : 10;
}

function actionCopy(action: "keep" | "give") {
  return action === "keep" ? "خلّها" : "عطها للخصم";
}

export function Top5Explainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: Top5TutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const reveal = useRef<HTMLDivElement | null>(null);
  // The Top 5 scene is intentionally taller than a phone viewport so the
  // ownership rail and both team phones remain readable. Require only a
  // quarter of the scene to be visible before autoplay; fully off-screen
  // scenes are still suspended by the shared timeline hook.
  const timeline = useExplainerTimeline(TOP5_DEMO_STEPS, scope, {
    visibilityThreshold: 0.25,
  });
  const at = timeline.index;
  const step = TOP5_DEMO_STEPS[at] ?? TOP5_DEMO_STEPS[0];
  const cardIndex = cardIndexFor(step);
  const isDecision = step.phase === "decision";
  const isOwnership = step.phase === "ownership";
  const isSimulation = step.phase === "simulation";
  const isReveal = step.phase === "resolved";
  const isOutcome = step.id === "outcome";
  const activeTeam = activeTeamFor(scenario, cardIndex);
  const card = scenario.entries[cardIndex] ?? scenario.entries[0];
  const action = scenario.decisions[cardIndex]?.action ?? "keep";
  const owner = ownerFor(activeTeam, action);
  const decidedCount = decidedCountFor(step);
  const ownership = useMemo(
    () =>
      scenario.decisions.map((decision, index) => {
        const acting = activeTeamFor(scenario, index);
        return {
          entry: scenario.entries[index],
          acting,
          action: decision.action,
          owner: ownerFor(acting, decision.action),
        };
      }),
    [scenario],
  );
  const visibleOwnership = ownership.slice(0, decidedCount);
  const visibleRevealEntries =
    step.id === "reveal-ranked"
      ? scenario.entries.filter((entry) => entry.rank !== null)
      : scenario.entries;

  useEffect(() => {
    if (!scope.current || timeline.reducedMotion) return;
    const context = gsap.context(() => {
      if (isDecision) {
        const selected = scope.current?.querySelector(
          "[data-top5-action-selected]",
        );
        if (selected) {
          gsap.fromTo(
            selected,
            { scale: 0.92, boxShadow: "0 0 0 0 rgba(0,0,0,0)" },
            {
              scale: 1.06,
              boxShadow: "0 0 0 5px rgba(245, 196, 81, .35)",
              duration: 0.3,
              yoyo: true,
              repeat: 1,
              ease: "power2.out",
            },
          );
        }
      }
      if (isOwnership) {
        const moving = scope.current?.querySelector(
          "[data-top5-ownership-moving]",
        );
        if (moving) {
          gsap.fromTo(
            moving,
            { x: activeTeam === "team-a" ? -18 : 18, autoAlpha: 0.35 },
            { x: 0, autoAlpha: 1, duration: 0.45, ease: "back.out(1.4)" },
          );
        }
      }
      if (isSimulation) {
        gsap.fromTo(
          "[data-top5-simulation-card]",
          { autoAlpha: 0.55, y: 4 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.35,
            stagger: 0.08,
            ease: "power2.out",
          },
        );
      }
    }, scope);
    return () => context.revert();
  }, [
    activeTeam,
    isDecision,
    isOwnership,
    isSimulation,
    step.id,
    timeline.reducedMotion,
  ]);

  useEffect(() => {
    if (!isReveal || timeline.reducedMotion || !reveal.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-top5-reveal-row]",
        { autoAlpha: 0, y: 8 },
        {
          autoAlpha: 1,
          y: 0,
          stagger: 0.08,
          duration: 0.35,
          ease: "power2.out",
        },
      );
    }, reveal);
    return () => context.revert();
  }, [isReveal, timeline.reducedMotion, step.id]);

  return (
    <div
      ref={scope}
      dir="rtl"
      data-testid="top5-explainer"
      data-variant={compact ? "compact" : "full"}
      className={compact ? "space-y-3" : "space-y-6"}
    >
      {mode === "preview" ? (
        <ExplainerControls
          step={at}
          total={TOP5_DEMO_STEPS.length}
          caption={step.caption}
          phase={step.phase}
          timeline={timeline}
          compact={compact}
          stackOnNarrow
        />
      ) : (
        <ExplainerCaption caption={step.caption} compact={compact} />
      )}

      <div
        className={cn(
          "grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:gap-6",
          compact && "gap-3",
          isOutcome && "lg:grid-cols-1",
        )}
      >
        {isOutcome ? (
          <FinalResultScene scenario={scenario} />
        ) : (
          <>
            <SharedScreenFrame stand={!compact}>
              <ChallengeFrame
                title={scenario.title}
                progressValue={(decidedCount / 10) * 100}
                compact={compact}
                className={compact ? "w-full" : "mx-auto w-full max-w-3xl"}
              >
                <div className={compact ? "space-y-3" : "space-y-5"}>
                  <div className="rounded-xl border-2 border-border bg-card p-3 text-center sm:p-5">
                    <div className="mb-2 flex items-center justify-center gap-2 text-xs font-black text-muted-foreground">
                      <ListOrdered className="size-4" aria-hidden />
                      {scenario.rankingBasis}
                    </div>
                    <h2
                      className={cn(
                        "font-black leading-snug text-foreground",
                        compact ? "text-lg" : "text-xl sm:text-2xl",
                      )}
                    >
                      <BidiText>{scenario.prompt}</BidiText>
                    </h2>
                    <p className="mt-2 text-xs font-bold text-muted-foreground">
                      {isReveal
                        ? step.id === "reveal-ranked"
                          ? "كشف أفضل 5"
                          : "كشف الفخاخ والنتيجة"
                        : `البطاقة ${cardIndex + 1} من 10`}
                    </p>
                  </div>

                  {!isReveal && !isSimulation ? (
                    <>
                      <div
                        className={cn(
                          "rounded-xl bg-brand-gold/15 text-center",
                          compact ? "p-3" : "p-4",
                          isOwnership && "border-2 border-sem-success/30",
                        )}
                        data-testid="top5-current-card"
                        data-top5-ownership-moving={
                          isOwnership ? true : undefined
                        }
                      >
                        <p className="text-xs font-black text-muted-foreground">
                          {isOwnership ? "تم اعتماد القرار" : "البطاقة الحالية"}
                        </p>
                        <p
                          className={cn(
                            "mt-1 font-black text-foreground",
                            compact ? "text-2xl" : "text-2xl sm:text-3xl",
                          )}
                        >
                          {card?.label}
                        </p>
                        {isOwnership ? (
                          <p
                            className="mt-2 text-sm font-black text-sem-success"
                            data-testid="top5-current-owner"
                          >
                            انتقلت إلى {teamNames[owner]}
                          </p>
                        ) : (
                          <p className="mt-2 text-xs font-bold text-muted-foreground">
                            الرتبة مخفية حتى الكشف النهائي
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-black">
                        {teamIds.map((team) => (
                          <div
                            key={team}
                            className={cn(
                              "rounded-lg border-2 p-2 text-center",
                              teamIdentity(team).border,
                              team === activeTeam
                                ? teamIdentity(team).surface
                                : "bg-muted/40",
                            )}
                          >
                            {teamNames[team]}
                            {team === activeTeam
                              ? isOwnership
                                ? " · القرار اعتمد"
                                : " · صاحب القرار"
                              : " · ينتظر"}
                          </div>
                        ))}
                      </div>
                      {visibleOwnership.length > 0 && (
                        <OwnershipRail
                          ownership={visibleOwnership}
                          compact={compact}
                        />
                      )}
                    </>
                  ) : isSimulation ? (
                    <SimulationSummary
                      ownership={ownership.slice(2)}
                      compact={compact}
                    />
                  ) : (
                    <div
                      ref={reveal}
                      data-testid="top5-reveal"
                      className="space-y-3"
                    >
                      <div className="grid gap-2 sm:grid-cols-2">
                        <RevealGroup
                          title="أفضل 5"
                          entries={visibleRevealEntries.filter(
                            (entry) => entry.rank !== null,
                          )}
                          ownership={ownership}
                        />
                        {(step.id !== "reveal-ranked" || isOutcome) && (
                          <RevealGroup
                            title="الفخاخ"
                            entries={visibleRevealEntries.filter(
                              (entry) => entry.rank === null,
                            )}
                            ownership={ownership}
                          />
                        )}
                      </div>
                      {step.id === "reveal-ranked" && (
                        <p className="rounded-lg bg-muted/60 p-2 text-center text-xs font-bold text-muted-foreground">
                          الفخاخ ما زالت مخفية — لا تُحتسب قبل الكشف الكامل.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </ChallengeFrame>
            </SharedScreenFrame>

            <div
              className={cn(
                "grid grid-cols-2 gap-2 self-start sm:gap-3",
                compact && "mx-auto w-full max-w-[22rem]",
              )}
              data-testid="top5-phones"
            >
              {teamIds.map((team) => (
                <Top5Phone
                  key={team}
                  team={team}
                  active={team === activeTeam && !isReveal}
                  card={card}
                  action={action}
                  owner={owner}
                  phase={step.phase}
                  selected={isDecision}
                  isReveal={isReveal}
                  isSimulation={isSimulation}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FinalResultScene({ scenario }: { scenario: Top5TutorialScenario }) {
  const firstTeamScore = scenario.outcome.top5Counts["team-a"];
  const secondTeamScore = scenario.outcome.top5Counts["team-b"];

  return (
    <section
      data-testid="top5-final-result"
      className="mx-auto w-full max-w-2xl rounded-2xl border-4 border-brand-navy bg-card p-3 text-center shadow-xl sm:p-5 lg:max-w-4xl"
    >
      <div
        data-testid="top5-outcome"
        className="rounded-xl border-2 border-sem-success/30 bg-sem-success/10 p-3 sm:p-4"
      >
        <Trophy
          className="mx-auto size-7 text-sem-success sm:size-8"
          aria-hidden
        />
        <p className="mt-1 text-xs font-black text-muted-foreground">
          النتيجة النهائية · أفضل 5 فقط
        </p>
        <p
          data-testid="top5-final-score"
          className="akwaan-numeral my-2 text-4xl font-black tracking-widest text-foreground sm:text-5xl"
          dir="ltr"
        >
          {firstTeamScore} – {secondTeamScore}
        </p>

        <div className="mx-auto grid max-w-md grid-cols-2 gap-2 text-xs font-black sm:text-sm">
          <div
            className={cn(
              "rounded-lg border-2 px-2 py-2",
              teamIdentity("team-a").border,
              teamIdentity("team-a").surface,
              teamIdentity("team-a").text,
            )}
          >
            {teamNames["team-a"]} · {firstTeamScore}
          </div>
          <div
            className={cn(
              "rounded-lg border-2 px-2 py-2",
              teamIdentity("team-b").border,
              teamIdentity("team-b").surface,
              teamIdentity("team-b").text,
            )}
          >
            {teamNames["team-b"]} · {secondTeamScore}
          </div>
        </div>

        <p className="mt-3 text-lg font-black sm:text-xl">
          {teamNames[scenario.outcome.winnerTeam]} يفوز بالتحدي
        </p>
        <p className="mt-1 text-base font-black text-sem-success sm:text-lg">
          +{scenario.outcome.matchPointDelta} نقطة في المباراة
        </p>
        <p className="mt-2 text-xs font-bold text-muted-foreground">
          الفخاخ لا تُحتسب؛ الفوز بالتحدي هو الذي يمنح نقطة المباراة.
        </p>
      </div>
    </section>
  );
}

function OwnershipRail({
  ownership,
  compact,
}: {
  ownership: Array<{
    entry: Top5TutorialEntry;
    owner: "team-a" | "team-b";
    action: "keep" | "give";
  }>;
  compact: boolean;
}) {
  return (
    <div
      data-testid="top5-ownership-rail"
      className={cn(
        "grid grid-cols-2 gap-2 rounded-xl border-2 border-border bg-card",
        compact ? "p-2" : "p-3",
      )}
    >
      {teamIds.map((team) => {
        const cards = ownership.filter((record) => record.owner === team);
        return (
          <div key={team} className="space-y-1">
            <p
              className={cn(
                "text-center text-xs font-black",
                teamIdentity(team).text,
              )}
            >
              {teamNames[team]} · {cards.length}
            </p>
            <div className="flex min-h-8 flex-wrap justify-center gap-1">
              {cards.length ? (
                cards.map((record) => (
                  <span
                    key={record.entry.id}
                    className="rounded-md bg-muted/70 px-1.5 py-1 text-[0.65rem] font-black"
                  >
                    {record.entry.label}
                  </span>
                ))
              ) : (
                <span className="text-[0.65rem] font-bold text-muted-foreground">
                  لا بطاقات بعد
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SimulationSummary({
  ownership,
  compact,
}: {
  ownership: Array<{
    entry: Top5TutorialEntry;
    acting: "team-a" | "team-b";
    owner: "team-a" | "team-b";
    action: "keep" | "give";
  }>;
  compact: boolean;
}) {
  return (
    <div
      data-testid="top5-fast-forward"
      className={cn(
        "rounded-xl border-2 border-brand-gold/40 bg-brand-gold/10",
        compact ? "space-y-2 p-3" : "space-y-3 p-4",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black">محاكاة سريعة</p>
          <p className="text-xs font-bold text-muted-foreground">
            8 قرارات متبقية — 10 بطاقات مكتملة
          </p>
        </div>
        <Send className="size-5 text-brand-gold" aria-hidden />
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {ownership.map((record) => (
          <div
            key={record.entry.id}
            data-top5-simulation-card
            className="rounded-lg border bg-card px-2 py-1.5 text-center"
          >
            <p className="truncate text-[0.65rem] font-black">
              {record.entry.label}
            </p>
            <p className="mt-0.5 text-[0.58rem] font-bold text-muted-foreground">
              {record.action === "keep" ? "خلّاه" : "عطاه"} ·{" "}
              {teamNames[record.owner]}
            </p>
          </div>
        ))}
      </div>
      <p className="text-center text-[0.68rem] font-black text-muted-foreground">
        الرتب كلها مخفية حتى الكشف النهائي
      </p>
    </div>
  );
}

function RevealGroup({
  title,
  entries,
  ownership,
}: {
  title: string;
  entries: Top5TutorialEntry[];
  ownership: Array<{
    entry: Top5TutorialEntry;
    owner: "team-a" | "team-b";
    action: "keep" | "give";
  }>;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-black">{title}</h3>
      <ul className="space-y-1.5">
        {entries.map((entry) => {
          const record = ownership.find((item) => item.entry.id === entry.id);
          const note = record
            ? entry.rank === 1 && record.action === "keep"
              ? "احتفاظ موفق"
              : entry.rank === null && record.action === "keep"
                ? "احتفاظ بفخ"
                : entry.rank !== null && record.action === "give"
                  ? "دسّ بطاقة رابحة"
                  : null
            : null;
          return (
            <li
              key={entry.id}
              data-top5-reveal-row
              className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-2.5 py-2 text-xs font-black"
            >
              <span className="min-w-0 truncate">
                {entry.rank ? `${entry.rank}. ` : ""}
                {entry.label}
                {note && (
                  <span className="mr-1 text-[0.62rem] font-bold text-muted-foreground">
                    ({note})
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "shrink-0",
                  record?.owner === "team-a"
                    ? "text-blue-700"
                    : "text-rose-700",
                )}
              >
                {record ? teamNames[record.owner] : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Top5Phone({
  team,
  active,
  card,
  action,
  owner,
  phase,
  selected,
  isReveal,
  isSimulation,
}: {
  team: "team-a" | "team-b";
  active: boolean;
  card: Top5TutorialEntry;
  action: "keep" | "give";
  owner: "team-a" | "team-b";
  phase: "decision" | "ownership" | "simulation" | "resolved";
  selected: boolean;
  isReveal: boolean;
  isSimulation: boolean;
}) {
  const identity = teamIdentity(team);
  const isOwner = phase === "ownership" && team === owner;
  return (
    <div className="space-y-1.5" data-testid={`top5-phone-${team}`}>
      <p
        className={cn(
          "rounded-lg border-2 px-1.5 py-1 text-center text-[0.65rem] font-black",
          identity.border,
          identity.surface,
          identity.text,
        )}
      >
        {teamNames[team]} {active ? "· صاحب القرار" : "· ينتظر"}
      </p>
      <PhoneFrame className="mx-auto w-full max-w-[190px]">
        <div className="flex min-h-[16rem] flex-col justify-center gap-2 text-center">
          <p className="text-[0.65rem] font-black text-muted-foreground">
            أفضل 5
          </p>
          {isReveal ? (
            <div className="rounded-lg bg-sem-success/10 p-2">
              <p className="text-xs font-black">انكشف الترتيب والملكية</p>
              <p className="mt-1 text-[0.7rem] font-bold">
                راجعوا ما كسبه كل فريق
              </p>
            </div>
          ) : isSimulation ? (
            <div
              className="rounded-lg bg-brand-gold/15 p-2"
              data-testid="top5-phone-fast-forward"
            >
              <p className="text-xs font-black">تجري 8 قرارات بسرعة</p>
              <p className="mt-1 text-[0.65rem] font-bold">
                الملكية محفوظة — الرتب مخفية
              </p>
            </div>
          ) : phase === "ownership" && isOwner ? (
            <div
              className="rounded-lg bg-sem-success/10 p-2"
              data-top5-ownership-confirmed
            >
              <Check className="mx-auto size-4 text-sem-success" aria-hidden />
              <p className="mt-1 text-xs font-black">وصلت البطاقة لفريقكم</p>
              <p className="mt-1 text-[0.65rem] font-bold">{card.label}</p>
            </div>
          ) : active ? (
            <>
              <p className="rounded-lg bg-brand-gold/15 p-2 text-sm font-black">
                {card.label}
              </p>
              <p className="text-[0.62rem] font-bold text-muted-foreground">
                قراركم الآن: لا رتبة قبل الكشف
              </p>
              <div className="grid gap-1.5">
                <Button
                  size="sm"
                  disabled
                  aria-pressed={selected && action === "keep"}
                  data-top5-action="keep"
                  data-testid="top5-action-keep"
                  data-top5-action-selected={
                    selected && action === "keep" ? true : undefined
                  }
                  className={cn(
                    "h-9 gap-1 px-1 text-[0.65rem] font-black disabled:opacity-100",
                    selected && action === "keep"
                      ? "bg-sem-success text-white"
                      : "bg-brand-navy text-white",
                  )}
                >
                  <Hand className="size-3" aria-hidden /> خلّها
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  aria-pressed={selected && action === "give"}
                  data-top5-action="give"
                  data-testid="top5-action-give"
                  data-top5-action-selected={
                    selected && action === "give" ? true : undefined
                  }
                  className={cn(
                    "h-9 gap-1 px-1 text-[0.65rem] font-black disabled:opacity-100",
                    selected &&
                      action === "give" &&
                      "border-brand-gold bg-brand-gold/30 text-foreground",
                  )}
                >
                  <Send className="size-3" aria-hidden /> عطها للخصم
                </Button>
              </div>
              {selected && (
                <p
                  className="rounded-md bg-muted/60 px-1 py-1 text-[0.6rem] font-black"
                  data-testid="top5-decision-confirmation"
                >
                  تم الاختيار: {actionCopy(action)}
                </p>
              )}
            </>
          ) : (
            <div className="rounded-lg bg-muted/60 p-2 text-xs font-bold text-muted-foreground">
              بانتظار قرار الفريق الآخر…
            </div>
          )}
        </div>
      </PhoneFrame>
    </div>
  );
}
