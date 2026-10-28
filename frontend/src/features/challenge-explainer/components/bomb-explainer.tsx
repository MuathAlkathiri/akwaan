"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Bomb, CheckCircle2, SkipForward, Trophy, XCircle } from "lucide-react";
import Image from "next/image";
import {
  SharedScreenFrame,
  PhoneFrame,
} from "@/features/how-to-play/components/device-frames";
import { cn } from "@/lib/utils";
import { BOMB_DEMO_STEPS } from "../bomb-demo-scenario";
import type { BombTutorialScenario } from "../tutorial-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";
import { ExplainerCaption, ExplainerControls } from "./explainer-controls";
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
  const currentQuestion = returned || skipped || stepId === "pressure" || expired
    ? scenario.returnQuestion ?? scenario.nextQuestion ?? {
        prompt: scenario.nextPrompt,
        acceptedAnswer: scenario.acceptedAnswer,
        media: undefined,
      }
    : teamBActive
      ? scenario.nextQuestion ?? {
          prompt: scenario.nextPrompt,
          acceptedAnswer: scenario.acceptedAnswer,
          media: undefined,
        }
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
  const answerForStep = typingIncorrect || incorrect
    ? "المريخ"
    : typingCorrect || correct
      ? scenario.acceptedAnswer
      : typingOpponentCorrect || opponentCorrect
        ? scenario.nextQuestion?.acceptedAnswer ?? ""
        : "";

  useEffect(() => {
    setAnswerDraft(answerForStep);
    setConfirmed(incorrect || correct || opponentCorrect);
  }, [at, answerForStep, incorrect, correct, opponentCorrect]);
  useEffect(() => {
    setMediaFailed(false);
  }, [currentQuestion.prompt]);
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

  const activeName = teamBActive ? "الفريق الثاني" : "الفريق الأول";
  const seconds = teamBActive ? teamBTime : teamATime;
  return (
    <div
      ref={scope}
      dir="rtl"
      className={cn(compact ? "space-y-2 text-sm" : "space-y-3")}
      data-testid="bomb-explainer"
    >
      {mode === "preview" ? (
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
      <SharedScreenFrame stand={!compact}>
        <div
          className={cn(
            "relative flex flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-b from-background to-destructive/10 p-2 text-center sm:gap-3 sm:p-4",
            currentQuestion.media?.type === "image"
              ? compact
                ? "min-h-[210px] min-[381px]:min-h-[220px] sm:min-h-[300px]"
                : "min-h-[260px] min-[381px]:min-h-[280px] sm:min-h-[380px]"
              : compact
                ? "min-h-[170px] min-[381px]:min-h-[180px] sm:min-h-[240px]"
                : "min-h-[180px] min-[381px]:min-h-[200px] sm:min-h-[260px]",
          )}
        >
          <div
            ref={bomb}
            className={cn(
              "grid size-16 place-items-center rounded-full border-4 shadow-xl sm:size-20",
              expired
                ? "border-muted bg-muted text-muted-foreground"
                : "border-destructive/50 bg-destructive text-destructive-foreground",
            )}
          >
            <Bomb className="size-8 sm:size-10" aria-hidden />
          </div>
          <output
            data-testid="bomb-shared-clock"
            className="akwaan-numeral text-4xl font-black tabular-nums sm:text-5xl"
            aria-label={`${seconds} ثانية`}
          >
            0:{String(seconds).padStart(2, "0")}
          </output>
          <div className="w-full max-w-2xl">
            <p className="text-xs font-black text-muted-foreground">
              القنبلة مع {activeName}
            </p>
            {currentQuestion.media?.type === "image" && !mediaFailed ? (
              <Image
                src={currentQuestion.media.url}
                alt={currentQuestion.media.altText}
                onError={() => setMediaFailed(true)}
                width={480}
                height={300}
                unoptimized
                className={cn(
                  "mx-auto mb-2 w-full rounded-xl object-contain shadow-sm sm:mb-3",
                  compact && expired
                    ? "h-20 max-w-[11rem] max-[380px]:h-16 sm:h-28 sm:max-w-[18rem]"
                    : compact
                      ? "h-28 max-w-[13rem] sm:h-40 sm:max-w-[22rem]"
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
            <p className="mt-1 text-2xl font-black leading-tight sm:text-4xl">
              {currentQuestion.prompt}
            </p>
          </div>
          {incorrect && (
            <div className="flex items-center gap-2 rounded-full bg-destructive/12 px-4 py-2 font-black text-destructive">
              <XCircle className="size-5" />
              المريخ — خاطئة، الدور مستمر
            </div>
          )}
          {correct && (
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 font-black text-emerald-700">
              <CheckCircle2 className="size-5" />
              {scenario.acceptedAnswer} — صحيحة
            </div>
          )}
          {opponentCorrect && (
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 font-black text-emerald-700">
              <CheckCircle2 className="size-5" />
              {scenario.nextQuestion?.acceptedAnswer} — صحيحة، يعود الضغط للفريق الأول
            </div>
          )}
          {returned && (
            <div className="flex items-center gap-2 rounded-full bg-brand-gold/15 px-4 py-2 font-black text-brand-gold-foreground">
              <Bomb className="size-5" />
              عاد الضغط للفريق الأول — سؤال جديد
            </div>
          )}
          {skipped && (
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-full bg-amber-500/15 px-4 py-2 font-black text-amber-800">
              <SkipForward className="size-5" />
              <span data-testid="bomb-skip-penalty">−5 ثوانٍ عقوبة التخطّي</span>
              <span>والدور مستمر</span>
            </div>
          )}
          {expired && (
            <div className="rounded-[var(--radius)] border-2 border-brand-gold bg-card p-3">
              <Trophy className="mx-auto size-6 text-brand-gold" />
              <p className="font-black">
                {scenario.outcome.winnerTeam === "team-a"
                  ? "الفريق الأول"
                  : "الفريق الثاني"} يفوز بالتحدي
              </p>
              <p className="text-xs text-muted-foreground">
                انتهى وقت {scenario.outcome.expiredTeam === "team-a" ? "الفريق الأول" : "الفريق الثاني"}؛
                نقطة المباراة تُمنح بعد حسم التحدي، لا قبل ذلك
              </p>
            </div>
          )}
        </div>
      </SharedScreenFrame>
      <div className="grid grid-cols-2 gap-2">
        {[
          {
            name: "الفريق الأول",
            active: !teamBActive && !expired,
            time: teamATime,
          },
          {
            name: "الفريق الثاني",
            active: teamBActive && !expired,
            time: teamBTime,
          },
        ].map((team) => (
          <PhoneFrame
            key={team.name}
            className={cn(
              "w-full justify-self-center",
              compact && expired
                ? "max-w-[6rem] min-[381px]:max-w-[6.5rem] sm:max-w-[6.5rem] max-[380px]:max-w-[5rem] [&>div]:aspect-[9/14] max-[380px]:[&>div]:aspect-[9/16]"
                : compact
                  ? "max-w-[7rem] min-[381px]:max-w-[7.5rem] sm:max-w-[8rem]"
                : "max-w-[8rem] min-[381px]:max-w-[9rem] sm:max-w-[12rem]",
            )}
          >
            <div
              className={cn(
                compact
                  ? "space-y-1 p-1.5 text-center sm:space-y-2 sm:p-2"
                  : "space-y-2 p-2 text-center sm:space-y-3 sm:p-3",
                team.active && "bg-destructive/5",
              )}
            >
              <p className="font-black">{team.name}</p>
              <p className="akwaan-numeral text-3xl font-black tabular-nums">
                <span data-testid={`bomb-${team.name === "الفريق الأول" ? "team-a" : "team-b"}-clock`}>
                0:{String(team.time).padStart(2, "0")}
                </span>
              </p>
              {team.active ? (
                <div className="space-y-1.5" data-testid={`bomb-phone-${team.name === "الفريق الأول" ? "a" : "b"}`}>
                  <label className="sr-only" htmlFor="bomb-phone-answer">إجابة القنبلة</label>
                  <input
                    id="bomb-phone-answer"
                    value={answerDraft}
                    onChange={(event) => {
                      setAnswerDraft(event.target.value);
                      setConfirmed(false);
                    }}
                    placeholder="اكتب إجابتك"
                    data-testid="bomb-phone-answer"
                    className="h-10 w-full rounded-md border-2 border-border bg-background px-2 py-2 text-center text-sm font-black outline-none focus:border-brand-gold sm:h-11 sm:text-base"
                  />
                  <button
                    type="button"
                    data-testid="bomb-phone-submit"
                    disabled={!answerDraft.trim() || confirmed}
                    onClick={() => setConfirmed(true)}
                    className="h-10 w-full rounded-md bg-foreground px-2 py-1 text-xs font-black text-background disabled:opacity-60 sm:h-11 sm:text-sm"
                  >
                    {confirmed ? "تم الإرسال" : "إرسال الإجابة"}
                  </button>
                  <button
                    type="button"
                    data-testid="bomb-phone-skip"
                    className="h-9 w-full rounded-md border border-border px-2 py-1 text-xs font-black sm:h-10 sm:text-sm"
                  >
                    تخطّي (-5)
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {expired && ((team.name === "الفريق الأول" && scenario.outcome.expiredTeam === "team-a") ||
                    (team.name === "الفريق الثاني" && scenario.outcome.expiredTeam === "team-b"))
                    ? "انتهى الوقت"
                    : "انتظر دورك"}
                </p>
              )}
            </div>
          </PhoneFrame>
        ))}
      </div>
    </div>
  );
}
