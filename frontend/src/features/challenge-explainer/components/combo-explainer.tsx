"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { AlertTriangle, Check, Lock } from "lucide-react";
import { BidiText } from "@/components/akwaan/bidi-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PhoneFrame,
  SharedScreenFrame,
} from "@/features/how-to-play/components/device-frames";
import { ChallengeFrame } from "@/features/live-game-session/match/components/challenge-frame";
import { cn } from "@/lib/utils";
import type { ComboTutorialScenario } from "../tutorial-scenario";
import { COMBO_DEMO_STEPS, type ComboDemoStepId } from "../combo-demo-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";
import { ExplainerCaption, ExplainerControls } from "./explainer-controls";
import type { ExplainerMode } from "./ryo-explainer";

const stageLabel: Record<1 | 2 | 3 | 4, string> = {
  1: "متوسط",
  2: "متوسط صعب",
  3: "صعب",
  4: "صعب جدًا",
};

const comboStageScale = "1 → متوسط · 2 → متوسط صعب · 3 → صعب · 4 → صعب جدًا";

export function ComboExplainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: ComboTutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const timeline = useExplainerTimeline(COMBO_DEMO_STEPS, scope);
  const at = timeline.index;
  const step = COMBO_DEMO_STEPS[at];
  const isOutcome = step.id === "outcome";
  const isDecision = step.id === "decision" || step.id === "continue";
  const isForcedReveal = step.id === "forced-reveal";
  const isForcedQuestion = step.id === "forced-question";
  const stageIndex =
    isForcedQuestion || isOutcome
      ? 2
      : step.id === "continue" || step.id === "second-reveal" || isForcedReveal
        ? 1
        : 0;
  const stage = scenario.stages[stageIndex];
  const points =
    step.id === "start"
      ? 0
      : step.id === "first-reveal" ||
          step.id === "decision" ||
          step.id === "continue"
        ? 1
        : step.id === "outcome"
          ? 0
          : 2;
  const revealed = step.id === "first-reveal" || step.id === "second-reveal";

  useEffect(() => {
    if (timeline.reducedMotion || !scope.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-combo-scene]",
        { autoAlpha: 0.72, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.36, ease: "power2.out" },
      );
      if (step.id === "first-reveal" || step.id === "second-reveal") {
        gsap.fromTo(
          "[data-combo-points-emphasis]",
          { scale: 0.94, boxShadow: "0 0 0 rgba(0,0,0,0)" },
          {
            scale: 1,
            boxShadow: "0 0 0.9rem rgba(255,255,255,0.28)",
            duration: 0.5,
            ease: "back.out(2)",
          },
        );
      }
      if (step.id === "decision") {
        gsap.fromTo(
          "[data-combo-risk-emphasis]",
          { y: 6, autoAlpha: 0.65 },
          { y: 0, autoAlpha: 1, duration: 0.42, ease: "power2.out" },
        );
      }
      if (step.id === "forced-reveal") {
        gsap.fromTo(
          "[data-combo-forced-interruption]",
          { x: 10, autoAlpha: 0.65 },
          { x: 0, autoAlpha: 1, duration: 0.42, ease: "power2.out" },
        );
      }
    }, scope);
    return () => context.revert();
  }, [at, step.id, timeline.reducedMotion]);

  return (
    <div
      ref={scope}
      dir="rtl"
      data-testid="combo-explainer"
      data-variant={compact ? "compact" : "full"}
      data-demo-step={step.id}
      className={compact ? "space-y-3" : "space-y-6"}
    >
      {mode === "preview" ? (
        <ExplainerControls
          step={at}
          total={COMBO_DEMO_STEPS.length}
          caption={step.caption}
          phase={step.id === "outcome" ? "resolved" : "collecting"}
          timeline={timeline}
          compact={compact}
          stackOnNarrow
        />
      ) : (
        <ExplainerCaption caption={step.caption} compact={compact} />
      )}

      <div
        data-combo-scene
        className={cn(
          "grid gap-3 lg:grid-cols-[minmax(0,1.9fr)_minmax(15rem,.75fr)]",
          compact ? "lg:gap-4" : "gap-6",
          isOutcome && "lg:grid-cols-1",
        )}
      >
        <SharedScreenFrame stand={!compact}>
          <ChallengeFrame
            eyebrow="الكومبو"
            title={isOutcome ? "نتيجة الجولة" : `السؤال ${stage.stage} من 4`}
            progressValue={(stage.stage / 4) * 100}
            compact={compact}
          >
            <div className={compact ? "space-y-3" : "space-y-5"}>
              {!isOutcome && (
                <ComboStreak
                  points={points}
                  stage={stage.stage}
                  compact={compact}
                />
              )}
              {isOutcome ? (
                <ComboOutcome answer={scenario.stages[2].correctAnswer} />
              ) : isDecision ? (
                <ComboDecision
                  points={points}
                  continued={step.id === "continue"}
                  compact={compact}
                />
              ) : (
                <ComboQuestion
                  stage={stage}
                  compact={compact}
                  revealed={revealed}
                  forced={isForcedQuestion}
                  forcedReveal={isForcedReveal}
                />
              )}
            </div>
          </ChallengeFrame>
        </SharedScreenFrame>

        {!isOutcome && (
          <div className="mx-auto w-fit sm:mx-0">
            <ComboPhone
              stage={stage}
              step={step.id}
              compact={compact}
              revealed={revealed}
              forced={isForcedQuestion}
              forcedReveal={isForcedReveal}
              decision={isDecision}
              points={points}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ComboStreak({
  points,
  stage,
  compact,
}: {
  points: number;
  stage: 1 | 2 | 3;
  compact: boolean;
}) {
  return (
    <div className="space-y-2" data-testid="combo-tutorial-streak">
      <div className="rounded-lg border border-border bg-card px-2 py-1.5 text-center">
        <p className="text-[0.58rem] font-bold text-muted-foreground">
          سُلّم الكومبو · 4 مراحل
        </p>
        <p
          className={cn(
            "text-[0.62rem] font-black leading-relaxed",
            compact && "whitespace-nowrap text-[0.54rem] leading-tight",
          )}
          data-testid="combo-stage-scale"
        >
          {comboStageScale}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-primary p-2 text-center text-primary-foreground">
          <p className="text-[0.62rem] font-bold opacity-80">
            الرصيد غير المثبّت
          </p>
          <p
            className="akwaan-numeral text-2xl font-black"
            data-combo-points-emphasis
          >
            {points}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/50 p-2 text-center">
          <p className="text-[0.62rem] font-bold text-muted-foreground">
            صعوبة السؤال
          </p>
          <p className="text-sm font-black">{stageLabel[stage]}</p>
        </div>
      </div>
    </div>
  );
}

function ComboQuestion({
  stage,
  compact,
  revealed,
  forced,
  forcedReveal,
}: {
  stage: ComboTutorialScenario["stages"][number];
  compact: boolean;
  revealed: boolean;
  forced: boolean;
  forcedReveal: boolean;
}) {
  return (
    <section
      className="space-y-3 text-center"
      data-testid="combo-tutorial-question"
    >
      {(forced || forcedReveal) && (
        <div
          className="rounded-lg bg-destructive p-2 text-xs font-black text-destructive-foreground"
          data-combo-forced-interruption={forcedReveal ? "armed" : "forced"}
        >
          {forcedReveal
            ? "كسر الكومبو انكشف — السحب محظور · شحنة واحدة للتحدي"
            : "سؤال إجباري — كمّل غصب"}
          {forcedReveal && (
            <p className="mt-1 text-[0.65rem] font-bold opacity-90">
              الفريق الثاني فعّلها · الفريق الأول أُجبر على الاستمرار
            </p>
          )}
        </div>
      )}
      <div className="rounded-xl border-2 border-border bg-card p-3">
        <p className="mb-2 text-[0.65rem] font-black text-muted-foreground">
          المرحلة {stage.stage} · {stageLabel[stage.stage]}
        </p>
        <h2
          className={cn(
            "font-black leading-snug",
            compact ? "text-base" : "text-xl",
          )}
        >
          <BidiText>{stage.prompt}</BidiText>
        </h2>
        {revealed && (
          <div
            className="mt-3 rounded-lg bg-sem-success p-2 text-sem-reveal-foreground"
            data-testid="combo-tutorial-reveal"
          >
            <p className="text-xs font-bold opacity-80">الإجابة الصحيحة</p>
            <p className="font-black">{stage.correctAnswer}</p>
            <p className="mt-1 text-xs font-bold">إجابة صحيحة · +1</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ComboDecision({
  points,
  continued,
  compact,
}: {
  points: number;
  continued: boolean;
  compact: boolean;
}) {
  return (
    <section
      className={cn("text-center", compact ? "space-y-2" : "space-y-3")}
      data-testid="combo-tutorial-decision"
    >
      <p className="text-lg font-black">إجابة صحيحة!</p>
      <div
        className="grid grid-cols-2 gap-2 text-right"
        data-combo-risk-emphasis
        data-testid="combo-risk-emphasis"
      >
        <div
          className={cn(
            "rounded-lg border border-sem-success/40 bg-sem-success/10",
            compact ? "p-1.5" : "p-2",
          )}
        >
          <p
            className={cn("font-black", compact ? "text-[0.68rem]" : "text-xs")}
          >
            ثبّت
          </p>
          <p className="mt-0.5 text-[0.62rem] font-bold text-muted-foreground">
            اسحب {points}
          </p>
          <p className="mt-0.5 text-[0.62rem] font-black text-sem-success">
            تضمن {points}
          </p>
        </div>
        <div
          className={cn(
            "rounded-lg border border-brand-gold/50 bg-brand-gold/10",
            compact ? "p-1.5" : "p-2",
          )}
        >
          <p
            className={cn("font-black", compact ? "text-[0.68rem]" : "text-xs")}
          >
            كمّل
          </p>
          <p className="mt-0.5 text-[0.62rem] font-bold text-muted-foreground">
            المتوسط يصير أصعب
          </p>
          <p className="mt-0.5 text-[0.62rem] font-black text-brand-gold">
            قد تخسر {points} إذا أخطأت
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant={continued ? "outline" : "default"} size="sm" disabled>
          اسحب {points}
        </Button>
        <Button variant={continued ? "default" : "outline"} size="sm" disabled>
          واصل الكومبو
        </Button>
      </div>
      {continued && (
        <p className="text-xs font-black text-brand-gold">
          اختار الفريق: واصل الكومبو
        </p>
      )}
    </section>
  );
}

function ComboOutcome({ answer }: { answer: string }) {
  return (
    <section
      className="rounded-xl border-2 border-sem-error/25 bg-sem-error/10 p-4 text-center"
      data-testid="combo-tutorial-outcome"
    >
      <AlertTriangle className="mx-auto size-7 text-sem-error" aria-hidden />
      <p className="mt-1 text-xl font-black">انكسر الكومبو</p>
      <p className="mt-1 text-sm font-black text-sem-error">0 نقاط مثبتة</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-right">
        <div className="rounded-lg border border-sem-error/30 bg-background/70 p-2">
          <p className="text-[0.6rem] font-bold text-muted-foreground">
            غير المثبّت
          </p>
          <p className="akwaan-numeral text-lg font-black text-sem-error">
            2 → 0
          </p>
        </div>
        <div className="rounded-lg border border-sem-success/30 bg-background/70 p-2">
          <p className="text-[0.6rem] font-bold text-muted-foreground">
            المثبت محفوظ
          </p>
          <p className="akwaan-numeral text-lg font-black text-sem-success">
            0
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs font-bold text-muted-foreground">
        ضاعت النقطتان غير المثبتتين. نقاط الكومبو لا تُضاف إلى نتيجة المباراة؛
        فائز التحدي يُحسم من جولتي الفريقين.
      </p>
      <p
        className="mt-2 rounded-lg border border-border bg-background/70 p-2 text-xs font-black"
        data-testid="combo-tutorial-score-meaning"
      >
        النتيجة الفعلية: رصيد الكومبو 0 · نتيجة المباراة دون إضافة
      </p>
      <p className="mt-2 text-xs font-black">الإجابة الصحيحة كانت: {answer}</p>
    </section>
  );
}

function ComboPhone({
  stage,
  step,
  compact,
  revealed,
  forced,
  forcedReveal,
  decision,
  points,
}: {
  stage: ComboTutorialScenario["stages"][number];
  step: ComboDemoStepId;
  compact: boolean;
  revealed: boolean;
  forced: boolean;
  forcedReveal: boolean;
  decision: boolean;
  points: number;
}) {
  const wrong = forced;
  return (
    <div className="space-y-1.5" data-testid="combo-tutorial-phone">
      <p className="text-center text-[0.65rem] font-black text-muted-foreground">
        {forcedReveal ? "الفريق الثاني · كسر الكومبو" : "الفريق الأول · يجيب"}
      </p>
      <PhoneFrame
        className={cn(
          "mx-auto w-full",
          compact ? "max-w-[145px] lg:max-w-[220px]" : "max-w-[210px]",
        )}
      >
        <div
          className={cn(
            "flex flex-col justify-center px-2 text-center",
            compact ? "min-h-[12rem] gap-1" : "min-h-[16rem] gap-2",
          )}
        >
          {decision ? (
            <>
              <p className={cn("font-black", compact ? "text-xs" : "text-sm")}>
                وش تبون تسوون؟
              </p>
              <p
                className={cn(
                  "font-bold text-muted-foreground",
                  compact ? "text-[0.58rem] leading-tight" : "text-[0.65rem]",
                )}
              >
                ثبّتوا {points} أو خاطروا بالرصيد كاملًا
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled
                className={compact ? "h-8 px-1 text-[0.62rem]" : undefined}
              >
                ثبّت
              </Button>
              <Button
                size="sm"
                disabled
                className={compact ? "h-8 px-1 text-[0.62rem]" : undefined}
              >
                كمّل
              </Button>
              {step === "continue" && (
                <p className="text-[0.62rem] font-black text-brand-gold">
                  تم اختيار كمّل
                </p>
              )}
            </>
          ) : forcedReveal ? (
            <>
              <Lock className="mx-auto size-5 text-brand-gold" aria-hidden />
              <p className="text-xs font-black">الخصم استخدم كسر الكومبو</p>
              <Button size="sm" variant="destructive" disabled>
                كمّل غصب
              </Button>
              <p className="text-[0.62rem] font-bold text-muted-foreground">
                شحنة واحدة للتحدي · لا يمكن تثبيت الرصيد
              </p>
              <p className="text-[0.62rem] font-black text-sem-error">
                الفريق الأول أُجبر على الاستمرار
              </p>
            </>
          ) : (
            <>
              {forced && (
                <p className="text-xs font-black text-sem-error">
                  ابدأ السؤال الإجباري
                </p>
              )}
              <p className="text-[0.65rem] font-bold text-muted-foreground">
                {forced
                  ? "السؤال 3 · صعب"
                  : `السؤال ${stage.stage} · ${stageLabel[stage.stage]}`}
              </p>
              <p className="text-xs font-black leading-5">
                <BidiText>{stage.prompt}</BidiText>
              </p>
              <Input
                value={revealed || wrong ? stage.submittedAnswer : ""}
                readOnly
                placeholder="اكتب الإجابة"
                className="h-10 text-center text-xs font-black"
              />
              <Button size="sm" disabled>
                {revealed ? (
                  <>
                    <Check className="size-3" aria-hidden /> إجابة صحيحة
                  </>
                ) : wrong ? (
                  "إجابة خاطئة"
                ) : (
                  "إرسال الإجابة"
                )}
              </Button>
              {wrong && (
                <p className="text-[0.62rem] font-bold text-sem-error">
                  الخطأ يكسر الرصيد كاملًا
                </p>
              )}
            </>
          )}
        </div>
      </PhoneFrame>
    </div>
  );
}
