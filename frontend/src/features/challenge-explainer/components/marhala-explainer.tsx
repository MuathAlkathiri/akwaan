"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { AlertTriangle, Check, Flag, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PhoneFrame,
  SharedScreenFrame,
} from "@/features/how-to-play/components/device-frames";
import { ChallengeFrame } from "@/features/live-game-session/match/components/challenge-frame";
import { MarhalaBoard } from "@/features/live-game-session/match/components/marhala-board";
import { MarhalaMovementRoll } from "@/features/live-game-session/match/components/marhala-movement-roll";
import {
  MARHALA_BANDS,
  MARHALA_DIFFICULTY_LABEL,
  marhalaPossibleLandings,
  marhalaTileDestination,
  marhalaTileKind,
} from "@/features/live-game-session/match/marhala.presentation";
import { cn } from "@/lib/utils";
import type { MarhalaTutorialScenario } from "../tutorial-scenario";
import {
  MARHALA_DEMO_STEPS,
  type MarhalaDemoStepId,
} from "../marhala-demo-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";
import { ExplainerCaption, ExplainerControls, showsExplainerControls } from "./explainer-controls";
import type { ExplainerMode } from "./ryo-explainer";

const TEAMS: { id: string; name: string }[] = [
  { id: "tutorial-team-a", name: "الفريق الأول" },
  { id: "tutorial-team-b", name: "الفريق الثاني" },
] as const;

export function MarhalaExplainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: MarhalaTutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const timeline = useExplainerTimeline(MARHALA_DEMO_STEPS, scope);
  const step = MARHALA_DEMO_STEPS[timeline.index];
  const positions =
    step.id === "movement"
      ? {
          "tutorial-team-a": scenario.baseLanding,
          "tutorial-team-b": scenario.teamBPosition,
        }
      : step.id === "boost" || step.id === "pressure" || step.id === "takeaway"
        ? {
            "tutorial-team-a": scenario.finalLanding,
            "tutorial-team-b": scenario.teamBPosition,
          }
        : {
            "tutorial-team-a": scenario.teamAPosition,
            "tutorial-team-b": scenario.teamBPosition,
          };
  const showPhone = step.id === "question" || step.id === "correct";
  const showEffect = step.id === "boost";
  const boardFocused = !showPhone;

  useEffect(() => {
    if (timeline.reducedMotion || !scope.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-marhala-scene]",
        { autoAlpha: 0.72, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.36, ease: "power2.out" },
      );
      if (step.id === "movement") {
        gsap.fromTo(
          "[data-marhala-movement-emphasis]",
          { scale: 0.94 },
          { scale: 1, duration: 0.5, ease: "back.out(2)" },
        );
      }
      if (step.id === "boost") {
        gsap.fromTo(
          "[data-marhala-effect]",
          { scale: 0.88, autoAlpha: 0.6 },
          { scale: 1, autoAlpha: 1, duration: 0.55, ease: "back.out(2)" },
        );
      }
    }, scope);
    return () => context.revert();
  }, [step.id, timeline.reducedMotion]);

  return (
    <div
      ref={scope}
      dir="rtl"
      data-testid="marhala-explainer"
      data-variant={compact ? "compact" : "full"}
      data-demo-step={step.id}
      className={compact ? "space-y-3" : "space-y-6"}
    >
      {showsExplainerControls(mode, timeline) ? (
        <ExplainerControls
          step={timeline.index}
          total={MARHALA_DEMO_STEPS.length}
          caption={step.caption}
          phase={step.id === "takeaway" ? "resolved" : "simulation"}
          timeline={timeline}
          compact={compact}
          stackOnNarrow
        />
      ) : (
        <ExplainerCaption caption={step.caption} compact={compact} />
      )}

      <div
        data-marhala-scene
        className={cn(
          "grid gap-3",
          boardFocused
            ? "lg:grid-cols-[minmax(0,1.85fr)_minmax(15rem,.7fr)]"
            : "lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,.9fr)]",
          compact ? "lg:gap-4" : "gap-6",
          step.id === "takeaway" && "lg:grid-cols-1",
        )}
      >
        {showPhone ? (
          <MarhalaQuestionScene
            scenario={scenario}
            answered={step.id === "correct"}
            compact={compact}
            positions={positions}
          />
        ) : (
          <MarhalaBoardScene
            step={step.id}
            scenario={scenario}
            compact={compact}
            positions={positions}
            showEffect={showEffect}
          />
        )}

        {showPhone ? (
          <MarhalaQuestionNotes
            answered={step.id === "correct"}
            compact={compact}
          />
        ) : (
          step.id !== "takeaway" && (
            <MarhalaLegend stepId={step.id} compact={compact} />
          )
        )}
      </div>
    </div>
  );
}

function MarhalaBoardScene({
  step,
  scenario,
  compact,
  positions,
  showEffect,
}: {
  step: MarhalaDemoStepId;
  scenario: MarhalaTutorialScenario;
  compact: boolean;
  positions: Record<string, number>;
  showEffect: boolean;
}) {
  return (
    <SharedScreenFrame stand={!compact}>
      <ChallengeFrame
        eyebrow="المرحلة"
        title={
          step === "takeaway" ? "نتيجة الدور" : "سباق الوصول إلى المربع 16"
        }
        progressLabel="دور تعليمي"
        progressValue={step === "takeaway" ? 100 : 48}
        compact={compact}
      >
        <div className={cn("space-y-3", compact ? "p-0" : "space-y-4")}>
          <div
            className={cn(
              "mx-auto w-full",
              step === "takeaway"
                ? "max-w-[16rem] sm:max-w-[28rem]"
                : "max-w-[19rem] sm:max-w-[25rem] lg:max-w-[34rem]",
            )}
            data-testid="marhala-tutorial-board"
          >
            <MarhalaBoard
              teams={TEAMS}
              positions={positions}
              activeTeamId="tutorial-team-a"
              travellingTeamId={
                step === "movement" ? "tutorial-team-a" : undefined
              }
              effect={
                showEffect
                  ? { position: scenario.baseLanding, kind: "boost" }
                  : undefined
              }
              centre={
                showEffect ? (
                  <div data-marhala-effect className="space-y-1">
                    <Rocket
                      className="mx-auto size-6 text-brand-gold"
                      aria-hidden
                    />
                    <p className="text-sm font-black">
                      {scenario.baseLanding} → {scenario.finalLanding}
                    </p>
                    <p className="text-[0.65rem] font-bold text-muted-foreground">
                      دفعة
                    </p>
                  </div>
                ) : undefined
              }
              className="max-w-none"
            />
          </div>
          {step === "takeaway" ? (
            <MarhalaFinalOutcome scenario={scenario} />
          ) : (
            <MarhalaStagePanel
              stepId={step}
              scenario={scenario}
              compact={compact}
            />
          )}
        </div>
      </ChallengeFrame>
    </SharedScreenFrame>
  );
}

function MarhalaQuestionScene({
  scenario,
  answered,
  compact,
  positions,
}: {
  scenario: MarhalaTutorialScenario;
  answered: boolean;
  compact: boolean;
  positions: Record<string, number>;
}) {
  return (
    <SharedScreenFrame stand={!compact}>
      <ChallengeFrame
        eyebrow="المرحلة · إجابة الفريق الأول"
        title="أجب عن السؤال ثم تحرّك"
        progressLabel="صعب · 4–6"
        progressValue={answered ? 42 : 34}
        compact={compact}
      >
        <div
          data-testid="marhala-tutorial-question-scene"
          className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,12rem)]"
        >
          <MarhalaPhone
            scenario={scenario}
            answered={answered}
            compact={compact}
          />
          <div
            className="order-last"
            data-testid="marhala-tutorial-board-context"
          >
            <div className="mx-auto w-full max-w-[6.5rem] sm:max-w-[11rem]">
              <MarhalaBoard
                teams={TEAMS}
                positions={positions}
                activeTeamId="tutorial-team-a"
                className="max-w-none"
              />
            </div>
            <p className="mt-1 text-center text-[0.62rem] font-bold text-muted-foreground">
              الموضع الحالي · 4
            </p>
          </div>
        </div>
        <div
          className="mt-2 rounded-lg border border-brand-gold/35 bg-brand-gold/10 px-1.5 py-1.5 text-center text-[0.68rem] font-black leading-4 sm:mt-3 sm:px-2.5 sm:py-2 sm:text-xs"
          data-testid="marhala-tutorial-answer-state"
        >
          {answered
            ? "إجابة صحيحة — الحركة التالية داخل 4–6"
            : "الإجابة الصحيحة تفتح الحركة داخل النطاق المختار"}
        </div>
      </ChallengeFrame>
    </SharedScreenFrame>
  );
}

function MarhalaQuestionNotes({
  answered,
  compact,
}: {
  answered: boolean;
  compact: boolean;
}) {
  return (
    <div
      className={cn(
        "surface-card space-y-2 p-3 text-center",
        compact && "p-2.5",
      )}
      data-testid="marhala-tutorial-question-notes"
    >
      <p className="text-xs font-black">
        {answered ? "تم التحقق من الإجابة" : "السؤال على الهاتف"}
      </p>
      <p className="text-[0.68rem] font-bold text-muted-foreground">
        {answered
          ? "الآن يظهر Movement Roll"
          : "اختروا صعبًا ثم أرسلوا الإجابة"}
      </p>
      <div className="flex justify-center gap-2 text-[0.62rem] font-black">
        <span className="rounded-full bg-brand-gold/15 px-2 py-1">صعب 4–6</span>
        <span className="rounded-full bg-primary/10 px-2 py-1">
          الفريق الأول
        </span>
      </div>
    </div>
  );
}

function MarhalaStagePanel({
  stepId,
  scenario,
  compact,
}: {
  stepId: MarhalaDemoStepId;
  scenario: MarhalaTutorialScenario;
  compact: boolean;
}) {
  const band = MARHALA_BANDS.find(
    (entry) => entry.difficulty === scenario.difficulty,
  )!;
  const choices = marhalaPossibleLandings(scenario.teamAPosition, band);
  const showDifficulty = stepId === "difficulty" || stepId === "board";
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-3",
        compact ? "space-y-2" : "space-y-3",
      )}
      data-testid={
        stepId === "difficulty" ? "marhala-tutorial-difficulty" : undefined
      }
    >
      {showDifficulty ? (
        <div className="grid grid-cols-3 gap-1.5">
          {MARHALA_BANDS.map((entry) => (
            <div
              key={entry.difficulty}
              className={cn(
                "rounded-lg border px-1.5 py-2 text-center",
                entry.difficulty === scenario.difficulty &&
                  stepId === "difficulty"
                  ? "border-brand-gold bg-brand-gold/15"
                  : "border-border bg-muted/40",
              )}
            >
              <p className="text-[0.62rem] font-black">{entry.label}</p>
              <p className="akwaan-numeral text-sm font-black" dir="ltr">
                {entry.min}–{entry.max}
              </p>
            </div>
          ))}
        </div>
      ) : stepId === "roll" ? (
        <div
          data-testid="marhala-tutorial-roll"
          className="flex items-center justify-between gap-3"
        >
          <div>
            <p className="text-[0.68rem] font-bold text-muted-foreground">
              نطاق صعب · 4–6
            </p>
            <p className="text-sm font-black">الحركة المعتمدة</p>
          </div>
          <MarhalaMovementRoll
            values={[4, 5, 6]}
            result={scenario.movement}
            rolling
            reducedMotion={false}
            teamName="الفريق الأول"
          />
        </div>
      ) : stepId === "movement" ? (
        <div
          data-testid="marhala-tutorial-movement"
          className="flex items-center justify-between"
        >
          <div>
            <p className="text-[0.68rem] font-bold text-muted-foreground">
              إجابة صحيحة · صعب
            </p>
            <p className="text-sm font-black">4 → 8</p>
          </div>
          <span
            data-marhala-movement-emphasis
            className="rounded-full bg-primary px-3 py-1 text-xs font-black text-primary-foreground"
          >
            +4 مربعات
          </span>
        </div>
      ) : stepId === "boost" ? (
        <div
          data-testid="marhala-tutorial-effect"
          className="flex items-center justify-between"
        >
          <div>
            <p className="text-[0.68rem] font-bold text-muted-foreground">
              هبوط أساسي
            </p>
            <p className="text-sm font-black">المربع 8</p>
          </div>
          <span className="rounded-full bg-brand-gold/20 px-3 py-1 text-xs font-black">
            دفعة → 13
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[0.68rem] font-bold text-muted-foreground">
              الفريق الأول
            </p>
            <p className="text-sm font-black">الموضع النهائي 13</p>
          </div>
          <p className="text-xs font-bold text-muted-foreground">
            الفريق الثاني 11
          </p>
        </div>
      )}
      {stepId === "difficulty" && (
        <>
          <div
            data-testid="marhala-tutorial-landing-possibilities"
            className="flex flex-wrap justify-center gap-1.5"
          >
            {choices.map((position) => {
              const kind = marhalaTileKind(position);
              const special = kind === "boost" || kind === "trap";
              return (
                <span
                  key={position}
                  className={cn(
                    "rounded-full border px-2 py-1 text-[0.62rem] font-black",
                    special &&
                      (kind === "boost"
                        ? "border-brand-gold bg-brand-gold/15"
                        : "border-destructive/40 bg-destructive/10"),
                  )}
                >
                  <span dir="ltr">{position}</span>
                  {special && (
                    <>
                      {" · "}
                      {kind === "boost" ? "دفعة" : "فخ"} →{" "}
                      {marhalaTileDestination(position)}
                    </>
                  )}
                </span>
              );
            })}
          </div>
          <p className="text-center text-[0.68rem] font-bold text-muted-foreground">
            صعب يفتح فرصة 8 → 13، لكنه يعرّضكم أيضًا لمربعات الفخ — النتيجة لا
            تُحسم قبل الـ Roll.
          </p>
        </>
      )}
      {stepId === "pressure" && (
        <p className="text-center text-xs font-black">
          السباق مستمر — لا توجد مباراة محسومة بعد.
        </p>
      )}
      {stepId === "board" && (
        <p className="text-center text-xs font-bold text-muted-foreground">
          المربعات الخاصة لا تعمل إلا عند الهبوط عليها.
        </p>
      )}
      {stepId !== "board" &&
        stepId !== "difficulty" &&
        stepId !== "roll" &&
        stepId !== "movement" &&
        stepId !== "boost" && (
          <p className="text-center text-xs font-bold text-muted-foreground">
            {MARHALA_DIFFICULTY_LABEL[band.difficulty]} · {band.min}–{band.max}
          </p>
        )}
    </div>
  );
}

function MarhalaPhone({
  scenario,
  answered,
  compact,
}: {
  scenario: MarhalaTutorialScenario;
  answered: boolean;
  compact: boolean;
}) {
  return (
    <div className="mx-auto w-fit" data-testid="marhala-tutorial-phone">
      <PhoneFrame className={compact ? "w-[9rem] sm:w-[12rem]" : "w-48"}>
        <div
          className="w-full space-y-2 text-center"
          data-testid="marhala-tutorial-answer"
        >
          <p className="text-[0.55rem] font-black text-muted-foreground">
            صعب · 4–6
          </p>
          <p className="text-[0.68rem] font-black leading-4">
            {scenario.prompt}
          </p>
          <Input
            value={answered ? scenario.submittedAnswer : ""}
            placeholder="اكتب الإجابة"
            readOnly
            className="h-8 px-1 text-center text-[0.6rem]"
            aria-label="إجابة المثال"
          />
          <Button
            size="sm"
            disabled
            className="h-8 w-full text-[0.58rem] font-black"
          >
            إرسال الإجابة
          </Button>
          {answered && (
            <div className="rounded-md bg-emerald-100 px-1.5 py-1 text-[0.58rem] font-black text-emerald-800">
              <Check className="mx-auto mb-0.5 size-3" />
              إجابة صحيحة
            </div>
          )}
        </div>
      </PhoneFrame>
    </div>
  );
}

function MarhalaLegend({
  stepId,
  compact,
}: {
  stepId: MarhalaDemoStepId;
  compact: boolean;
}) {
  return (
    <div
      className={cn(
        "surface-card space-y-2 p-3 text-center",
        compact && "p-2.5",
      )}
    >
      <div className="flex items-center justify-center gap-2">
        <Flag className="size-4 text-brand-gold" aria-hidden />
        <p className="text-xs font-black">الوصول إلى 16 يفوز</p>
      </div>
      <p className="text-[0.68rem] font-bold text-muted-foreground">
        {stepId === "pressure"
          ? "الفريق الثاني على 11 ويضغط"
          : "الفريق الأول يختار ثم يجيب"}
      </p>
      <div className="flex justify-center gap-2 text-[0.62rem] font-black">
        <span className="rounded-full bg-brand-gold/15 px-2 py-1">دفعة</span>
        <span className="rounded-full bg-destructive/10 px-2 py-1">فخ</span>
      </div>
    </div>
  );
}

function MarhalaFinalOutcome({
  scenario,
}: {
  scenario: MarhalaTutorialScenario;
}) {
  return (
    <div data-testid="marhala-tutorial-takeaway">
      <div
        data-testid="marhala-tutorial-outcome"
        className="grid grid-cols-3 gap-1.5 sm:gap-2"
      >
        <div className="rounded-lg border border-brand-gold/45 bg-brand-gold/10 p-1.5 text-center sm:p-2.5">
          <p className="text-[0.55rem] font-black sm:text-[0.65rem]">
            الفريق الأول تقدّم
          </p>
          <p
            className="akwaan-numeral text-base font-black sm:text-lg"
            dir="ltr"
          >
            {scenario.teamAPosition} → {scenario.baseLanding} →{" "}
            {scenario.finalLanding}
          </p>
          <p className="text-[0.52rem] font-bold text-muted-foreground sm:text-[0.62rem]">
            إجابة صحيحة + دفعة
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-1.5 text-center sm:p-2.5">
          <AlertTriangle
            className="mx-auto mb-1 size-3.5 text-destructive sm:size-4"
            aria-hidden
          />
          <p className="text-[0.55rem] font-black sm:text-[0.65rem]">
            انتبهوا للفخاخ
          </p>
          <p className="text-[0.52rem] font-bold text-muted-foreground sm:text-[0.62rem]">
            الهبوط يغيّر السباق
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-1.5 text-center sm:p-2.5">
          <Flag
            className="mx-auto mb-1 size-3.5 text-brand-gold sm:size-4"
            aria-hidden
          />
          <p className="text-[0.55rem] font-black sm:text-[0.65rem]">
            الفوز عند 16
          </p>
          <p className="text-[0.52rem] font-bold text-muted-foreground sm:text-[0.62rem]">
            الفريق الثاني الآن 11
          </p>
        </div>
        <p className="col-span-3 text-center text-[0.68rem] font-black sm:text-xs">
          اختر الصعوبة، جاوب، وتقدّم… وانتبه للفخاخ!
        </p>
      </div>
    </div>
  );
}
