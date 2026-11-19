"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Bomb, CheckCircle2, SkipForward, Trophy, XCircle } from "lucide-react";
import Image from "next/image";
import {
  SharedScreenFrame,
  PhoneFrame,
  useTutorialStagePresentation,
} from "@/features/how-to-play/components/device-frames";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/api/media-url";
import { teamIdentity } from "@/lib/team-identity";
import { BOMB_DEMO_STEPS } from "../bomb-demo-scenario";
import type { BombTutorialScenario } from "../tutorial-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";
import { ExplainerCaption, ExplainerControls, showsExplainerControls } from "./explainer-controls";
import type { ExplainerMode } from "./ryo-explainer";

type BombStepId = (typeof BOMB_DEMO_STEPS)[number]["id"];

const BOMB_CLOCK_PLAN: Record<
  BombStepId,
  { teamA: [number, number]; teamB: [number, number] }
> = {
  question: { teamA: [30, 28], teamB: [30, 30] },
  "typing-incorrect": { teamA: [28, 25], teamB: [30, 30] },
  incorrect: { teamA: [25, 22], teamB: [30, 30] },
  "typing-correct": { teamA: [22, 18], teamB: [30, 30] },
  answer: { teamA: [18, 18], teamB: [30, 30] },
  pass: { teamA: [18, 18], teamB: [30, 30] },
  "typing-opponent-correct": { teamA: [18, 18], teamB: [30, 27] },
  "opponent-answer": { teamA: [18, 18], teamB: [27, 24] },
  "return-pass": { teamA: [18, 18], teamB: [24, 24] },
  // The skip starts with the explicit five-second penalty (18 → 13), then
  // continues counting down for the duration of this beat (13 → 10).
  skip: { teamA: [13, 10], teamB: [24, 24] },
  pressure: { teamA: [10, 3], teamB: [24, 24] },
  expiry: { teamA: [3, 0], teamB: [24, 24] },
};

function interpolateClock(start: number, end: number, progress: number) {
  return Math.max(0, Math.ceil(start + (end - start) * progress));
}

export function BombExplainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: BombTutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const bomb = useRef<HTMLDivElement | null>(null);
  const timeline = useExplainerTimeline(BOMB_DEMO_STEPS, scope);
  const at = timeline.index;
  const stepId = BOMB_DEMO_STEPS[at].id;
  const typingIncorrect = stepId === "typing-incorrect";
  const incorrect = stepId === "incorrect";
  const typingCorrect = stepId === "typing-correct";
  const correct = stepId === "answer";
  const typingOpponentCorrect = stepId === "typing-opponent-correct";
  const opponentCorrect = stepId === "opponent-answer";
  const returned = stepId === "return-pass";
  const skipped = stepId === "skip";
  const expired = stepId === "expiry";
  const teamBActive =
    stepId === "pass" || typingOpponentCorrect || opponentCorrect;
  const currentQuestion =
    returned || skipped || stepId === "pressure" || expired
      ? (scenario.returnQuestion ??
        scenario.nextQuestion ?? {
          prompt: scenario.nextPrompt,
          acceptedAnswer: scenario.acceptedAnswer,
          media: undefined,
        })
      : teamBActive
        ? (scenario.nextQuestion ?? {
            prompt: scenario.nextPrompt,
            acceptedAnswer: scenario.acceptedAnswer,
            media: undefined,
          })
        : {
            prompt: scenario.prompt,
            acceptedAnswer: scenario.acceptedAnswer,
            media: scenario.media,
          };
  const clockPlan = BOMB_CLOCK_PLAN[stepId as BombStepId];
  const teamATime = interpolateClock(
    clockPlan.teamA[0],
    clockPlan.teamA[1],
    timeline.stepProgress,
  );
  const teamBTime = interpolateClock(
    clockPlan.teamB[0],
    clockPlan.teamB[1],
    timeline.stepProgress,
  );
  const [answerDraft, setAnswerDraft] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const answerForStep =
    typingIncorrect || incorrect
      ? "إجابة خاطئة"
      : typingCorrect || correct
        ? scenario.acceptedAnswer
        : typingOpponentCorrect || opponentCorrect
          ? (scenario.nextQuestion?.acceptedAnswer ?? "")
          : "";

  useEffect(() => {
    setAnswerDraft(answerForStep);
    setConfirmed(incorrect || correct || opponentCorrect);
  }, [at, answerForStep, incorrect, correct, opponentCorrect]);
  useEffect(() => {
    setMediaFailed(false);
  }, [currentQuestion.prompt, currentQuestion.media?.url]);
  useEffect(() => {
    if (!bomb.current || timeline.reducedMotion) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        bomb.current,
        { scale: 0.9, rotate: -4 },
        { scale: 1.08, rotate: 4, yoyo: true, repeat: 3, duration: 0.22 },
      );
    }, scope);
    return () => ctx.revert();
  }, [at, timeline.reducedMotion]);

  const { embedded, teamNames: stageTeams } = useTutorialStagePresentation();
  const teamAName = stageTeams?.blueFull ?? "الفريق الأول";
  const teamBName = stageTeams?.redFull ?? "الفريق الثاني";
  const activeName = teamBActive ? teamBName : teamAName;
  const returnTargetText =
    teamAName === "الفريق الأول" ? "للفريق الأول" : `لـ${teamAName}`;
  const seconds = teamBActive ? teamBTime : teamATime;
  const activeTeamSlot = teamBActive ? "2" : "1";
  const activeIdentity = teamIdentity(activeTeamSlot);
  const clockPaused = correct || opponentCorrect;
  const urgentClock = !expired && !clockPaused && seconds <= 10;
  return (
    <div
      ref={scope}
      dir="rtl"
      className={cn(compact ? "space-y-2 text-sm" : "space-y-3")}
      data-testid="bomb-explainer"
    >
      {showsExplainerControls(mode, timeline) ? (
        <ExplainerControls
          step={at}
          total={BOMB_DEMO_STEPS.length}
          caption={BOMB_DEMO_STEPS[at].caption}
          phase={expired ? "resolved" : "collecting"}
          timeline={timeline}
          compact={compact}
        />
      ) : (
        <ExplainerCaption
          caption={scenario.caption ?? BOMB_DEMO_STEPS[at].caption}
          compact={compact}
        />
      )}
      <div
        className={cn(
          "grid gap-3",
          embedded && "lg:grid-cols-[1.3fr_1fr] lg:items-center",
        )}
      >
        <SharedScreenFrame stand={!compact && !embedded}>
          <div
            className={cn(
              "relative flex flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-b from-background to-destructive/10 p-2.5 text-center sm:gap-3 sm:p-4",
              currentQuestion.media?.type === "image"
                ? compact || embedded
                  ? "min-h-[205px] min-[381px]:min-h-[215px] sm:min-h-[260px]"
                  : "min-h-[260px] min-[381px]:min-h-[280px] sm:min-h-[380px]"
                : compact || embedded
                  ? "min-h-[168px] min-[381px]:min-h-[178px] sm:min-h-[225px]"
                  : "min-h-[180px] min-[381px]:min-h-[200px] sm:min-h-[260px]",
            )}
          >
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2.5">
                <div
                  ref={bomb}
                  className={cn(
                    "grid size-12 place-items-center rounded-full border-4 shadow-xl sm:size-14",
                    expired
                      ? "border-muted bg-muted text-muted-foreground"
                      : "border-destructive/50 bg-destructive text-destructive-foreground",
                  )}
                >
                  <Bomb className="size-6 sm:size-7" aria-hidden />
                </div>
                <output
                  data-testid="bomb-shared-clock"
                  className={cn(
                    "akwaan-numeral text-4xl font-black tracking-tight tabular-nums sm:text-5xl lg:text-6xl",
                    urgentClock
                      ? "text-destructive"
                      : clockPaused
                        ? "text-sem-success"
                        : "text-brand-navy",
                  )}
                  aria-label={`${seconds} ثانية`}
                >
                  0:{String(seconds).padStart(2, "0")}
                </output>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <span
                  data-testid="bomb-holder-badge"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-0.5 text-xs font-black text-foreground sm:text-sm",
                    expired
                      ? "border-border bg-muted text-muted-foreground"
                      : cn(activeIdentity.border, activeIdentity.surface),
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 rounded-full",
                      expired ? "bg-muted-foreground" : activeIdentity.dot,
                    )}
                  />
                  {expired ? `انتهى وقت ${activeName}` : `القنبلة مع ${activeName}`}
                </span>
                {clockPaused && (
                  <span className="inline-flex items-center rounded-full border border-sem-success/40 bg-sem-success/15 px-2.5 py-0.5 text-[11px] font-black text-brand-navy">
                    الساعة متوقفة
                  </span>
                )}
              </div>
            </div>
            <div className="w-full max-w-2xl">
              {currentQuestion.media?.type === "image" && !mediaFailed ? (
                <Image
                  src={
                    currentQuestion.media.url.startsWith("/uploads/")
                      ? getMediaUrl(currentQuestion.media.url)
                      : currentQuestion.media.url
                  }
                  alt={currentQuestion.media.altText}
                  onError={() => setMediaFailed(true)}
                  width={480}
                  height={300}
                  unoptimized
                  className={cn(
                    "mx-auto mb-2 w-full rounded-xl object-contain shadow-sm sm:mb-2.5",
                    (compact || embedded) && expired
                      ? "h-16 max-w-[10rem] sm:h-24 sm:max-w-[16rem]"
                      : compact || embedded
                        ? "h-24 max-w-[12rem] sm:h-32 sm:max-w-[18rem]"
                        : "h-36 max-w-[18rem] sm:h-56 sm:max-w-[28rem]",
                  )}
                />
              ) : currentQuestion.media?.type === "image" ? (
                <div
                  data-testid="bomb-media-fallback"
                  className="mx-auto mb-2 flex h-16 w-32 items-center justify-center rounded-xl border border-dashed border-border text-xs font-bold text-muted-foreground"
                >
                  تعذّر تحميل الصورة
                </div>
              ) : null}
              <p className="mt-1 font-display text-lg font-black leading-tight text-brand-navy sm:text-2xl">
                {currentQuestion.prompt}
              </p>
            </div>
            {incorrect && (
              <div className="flex items-center gap-2 rounded-full bg-destructive/12 px-3.5 py-1.5 text-xs font-black text-destructive sm:text-sm">
                <XCircle className="size-4 sm:size-5" />
                إجابة خاطئة — الدور مستمر
              </div>
            )}
            {correct && (
              <div className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-3.5 py-1.5 text-xs font-black text-emerald-700 sm:text-sm">
                <CheckCircle2 className="size-4 sm:size-5" />
                {scenario.acceptedAnswer} — صحيحة
              </div>
            )}
            {opponentCorrect && (
              <div className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-3.5 py-1.5 text-xs font-black text-emerald-700 sm:text-sm">
                <CheckCircle2 className="size-4 sm:size-5" />
                {scenario.nextQuestion?.acceptedAnswer} — صحيحة، يعود الضغط{" "}
                {returnTargetText}
              </div>
            )}
            {returned && (
              <div className="flex items-center gap-2 rounded-full bg-brand-gold/15 px-3.5 py-1.5 text-xs font-black text-brand-navy sm:text-sm">
                <Bomb className="size-4 sm:size-5" />
                عاد الضغط {returnTargetText} — سؤال جديد
              </div>
            )}
            {skipped && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-full bg-amber-500/15 px-3.5 py-1.5 text-xs font-black text-amber-800 sm:text-sm">
                <SkipForward className="size-4 sm:size-5" />
                <span data-testid="bomb-skip-penalty">
                  −5 ثوانٍ عقوبة التخطّي
                </span>
                <span>والدور مستمر</span>
              </div>
            )}
            {expired && (
              <div className="rounded-[var(--radius)] border-2 border-brand-gold bg-card p-2.5 sm:p-3">
                <Trophy className="mx-auto size-6 text-brand-gold" />
                <p className="font-black text-foreground">
                  {scenario.outcome.winnerTeam === "team-a"
                    ? teamAName
                    : teamBName}{" "}
                  يفوز بالتحدي
                </p>
                <p className="text-xs text-muted-foreground">
                  انتهى وقت{" "}
                  {scenario.outcome.expiredTeam === "team-a"
                    ? teamAName
                    : teamBName}
                  ؛ نقطة المباراة تُمنح بعد حسم التحدي، لا قبل ذلك
                </p>
              </div>
            )}
          </div>
        </SharedScreenFrame>
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          {[
            {
              id: "team-a" as const,
              phoneTestSuffix: "a" as const,
              name: teamAName,
              active: !teamBActive && !expired,
              time: teamATime,
            },
            {
              id: "team-b" as const,
              phoneTestSuffix: "b" as const,
              name: teamBName,
              active: teamBActive && !expired,
              time: teamBTime,
            },
          ].map((team) => {
            const isExpiredTeam =
              expired && scenario.outcome.expiredTeam === team.id;
            const statusLabel = team.active
              ? "القنبلة معكم"
              : isExpiredTeam
                ? "انتهى الوقت"
                : "بانتظار الدور";
            return (
              <PhoneFrame
                key={team.id}
                team={team.id}
                teamLabel={team.name}
                statusLabel={statusLabel}
                acting={team.active}
                className="w-full max-w-[185px] justify-self-center sm:max-w-[215px]"
              >
                <div
                  className={cn(
                    "w-full space-y-1.5 px-1 py-1 text-center",
                    team.active && "rounded-xl bg-destructive/5",
                  )}
                >
                  <p
                    className={cn(
                      "akwaan-numeral text-2xl font-black tabular-nums sm:text-3xl",
                      team.active && team.time <= 10
                        ? "text-destructive"
                        : "text-foreground",
                    )}
                  >
                    <span data-testid={`bomb-${team.id}-clock`}>
                      0:{String(team.time).padStart(2, "0")}
                    </span>
                  </p>
                  {((team.id === "team-a" && correct) ||
                    (team.id === "team-b" && opponentCorrect)) && (
                    <p className="inline-block rounded-full bg-sem-success/15 px-2 py-0.5 text-[10px] font-black text-brand-navy">
                      الساعة متوقفة
                    </p>
                  )}
                  {team.active && skipped && (
                    <p className="inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-900">
                      −5 ثوانٍ عقوبة
                    </p>
                  )}
                  {team.active ? (
                    <div
                      className="space-y-1.5"
                      data-testid={`bomb-phone-${team.phoneTestSuffix}`}
                    >
                      <label className="sr-only" htmlFor="bomb-phone-answer">
                        إجابة القنبلة
                      </label>
                      <input
                        id="bomb-phone-answer"
                        value={answerDraft}
                        onChange={(event) => {
                          setAnswerDraft(event.target.value);
                          setConfirmed(false);
                        }}
                        placeholder="اكتب إجابتك"
                        data-testid="bomb-phone-answer"
                        className="h-8 w-full rounded-md border-2 border-border bg-background px-1.5 py-1 text-center text-xs font-black outline-none focus:border-brand-gold sm:h-9 sm:text-sm"
                      />
                      <button
                        type="button"
                        data-testid="bomb-phone-submit"
                        disabled={!answerDraft.trim() || confirmed}
                        onClick={() => setConfirmed(true)}
                        className="h-8 w-full rounded-md bg-brand-navy px-2 py-1 text-[11px] font-black text-white disabled:opacity-60 sm:h-9 sm:text-xs"
                      >
                        {confirmed ? "تم الإرسال" : "إرسال الإجابة"}
                      </button>
                      <button
                        type="button"
                        data-testid="bomb-phone-skip"
                        className="h-7 w-full rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-black text-foreground sm:h-8 sm:text-xs"
                      >
                        تخطّي (-5)
                      </button>
                    </div>
                  ) : (
                    <p className="py-2 text-xs font-bold text-muted-foreground">
                      {isExpiredTeam ? "انتهى الوقت" : "انتظر دورك"}
                    </p>
                  )}
                </div>
              </PhoneFrame>
            );
          })}
        </div>
      </div>
    </div>
  );
}
