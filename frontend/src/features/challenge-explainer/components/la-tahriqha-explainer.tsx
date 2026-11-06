"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import {
  ArrowLeftRight,
  AlertTriangle,
  Check,
  ChefHat,
  Clock3,
  Flame,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BidiText } from "@/components/akwaan/bidi-text";
import {
  PhoneFrame,
  SharedScreenFrame,
} from "@/features/how-to-play/components/device-frames";
import { ChallengeFrame } from "@/features/live-game-session/match/components/challenge-frame";
import { cn } from "@/lib/utils";
import type { LaTahriqhaTutorialScenario } from "../tutorial-scenario";
import {
  LA_TAHRIQHA_DEMO_STEPS,
  type LaTahriqhaDemoStepId,
} from "../la-tahriqha-demo-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";
import { ExplainerCaption, ExplainerControls, showsExplainerControls } from "./explainer-controls";
import type { ExplainerMode } from "./ryo-explainer";

const SELECTION_STEPS: readonly LaTahriqhaDemoStepId[] = [
  "opening",
  "three-selected",
  "risk",
  "fourth-selection",
  "fifth-selection",
  "burn-selection",
  "commit",
  "perfect-selection",
  "perfect-commit",
];

const isSelectionStep = (step: LaTahriqhaDemoStepId) =>
  SELECTION_STEPS.includes(step);

const isRevealStep = (step: LaTahriqhaDemoStepId) =>
  step === "burn-reveal" || step === "perfect-reveal";

export function LaTahriqhaExplainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: LaTahriqhaTutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const timeline = useExplainerTimeline(LA_TAHRIQHA_DEMO_STEPS, scope);
  const step = LA_TAHRIQHA_DEMO_STEPS[timeline.index];
  const selectionScene = isSelectionStep(step.id);
  const revealScene = isRevealStep(step.id);

  useEffect(() => {
    if (timeline.reducedMotion || !scope.current) return;
    const element = scope.current;
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-la-tahriqha-scene]",
        { autoAlpha: 0.75, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.34, ease: "power2.out" },
      );
      if (step.id === "burn-reveal") {
        gsap.fromTo(
          "[data-la-tahriqha-burn-emphasis]",
          {
            scale: 0.94,
            boxShadow: "0 0 0 rgba(190, 24, 93, 0)",
          },
          {
            scale: 1,
            boxShadow: "0 0 32px rgba(190, 24, 93, 0.3)",
            duration: 0.45,
            ease: "back.out(2)",
          },
        );
        gsap.fromTo(
          "[data-la-tahriqha-burn-card]",
          { x: -6 },
          {
            x: 6,
            duration: 0.08,
            repeat: 5,
            yoyo: true,
            ease: "power1.inOut",
            clearProps: "transform",
          },
        );
      }
      if (step.id === "perfect-reveal") {
        gsap.fromTo(
          "[data-la-tahriqha-perfect-emphasis]",
          {
            scale: 0.94,
            boxShadow: "0 0 0 rgba(180, 130, 20, 0)",
          },
          {
            scale: 1,
            boxShadow: "0 0 34px rgba(180, 130, 20, 0.35)",
            duration: 0.55,
            ease: "back.out(2)",
          },
        );
        gsap.fromTo(
          "[data-la-tahriqha-perfect-card]",
          { y: 8, autoAlpha: 0.35 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.32,
            stagger: 0.06,
            ease: "power2.out",
          },
        );
      }
      if (isSelectionStep(step.id)) {
        if (element.querySelector("[data-la-tahriqha-selection-card]")) {
          gsap.fromTo(
            "[data-la-tahriqha-selection-card]",
            { y: -5, scale: 0.96 },
            {
              y: 0,
              scale: 1,
              duration: 0.28,
              stagger: 0.045,
              ease: "back.out(1.4)",
            },
          );
        }
        if (element.querySelector("[data-la-tahriqha-selection-tray]")) {
          gsap.fromTo(
            "[data-la-tahriqha-selection-tray]",
            { autoAlpha: 0.35, y: 6 },
            { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" },
          );
        }
      }
    }, element);
    return () => context.revert();
  }, [step.id, timeline.reducedMotion]);

  return (
    <div
      ref={scope}
      dir="rtl"
      data-testid="la-tahriqha-explainer"
      data-demo-step={step.id}
      data-variant={compact ? "compact" : "full"}
      className={compact ? "space-y-3" : "space-y-6"}
    >
      {showsExplainerControls(mode, timeline) ? (
        <ExplainerControls
          step={timeline.index}
          total={LA_TAHRIQHA_DEMO_STEPS.length}
          caption={step.caption}
          phase={step.id === "final-score" ? "resolved" : "simulation"}
          timeline={timeline}
          compact={compact}
          stackOnNarrow
        />
      ) : (
        <ExplainerCaption caption={step.caption} compact={compact} />
      )}

      <div
        data-la-tahriqha-scene
        className={cn(
          "grid grid-cols-1 items-start gap-3",
          selectionScene
            ? "lg:grid-cols-[minmax(0,2fr)_minmax(15rem,.72fr)]"
            : revealScene
              ? "lg:grid-cols-[minmax(0,2.35fr)_minmax(12rem,.58fr)]"
              : "lg:grid-cols-1",
          compact ? "lg:gap-4" : "gap-5",
        )}
      >
        <div className={cn("order-1", selectionScene && "hidden lg:block")}>
          <LaTahriqhaBoardScene
            scenario={scenario}
            step={step.id}
            compact={compact}
          />
        </div>
        {selectionScene && (
          <SelectionContext
            scenario={scenario}
            step={step.id}
            compact={compact}
          />
        )}
        {(selectionScene || revealScene) && (
          <div
            className={cn(
              "order-2 flex min-w-0 justify-center",
              revealScene && "hidden lg:flex",
            )}
          >
            <LaTahriqhaPhoneScene
              scenario={scenario}
              step={step.id}
              compact={compact}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function LaTahriqhaBoardScene({
  scenario,
  step,
  compact,
}: {
  scenario: LaTahriqhaTutorialScenario;
  step: LaTahriqhaDemoStepId;
  compact: boolean;
}) {
  const reveal = isRevealStep(step);
  const finalScore = step === "final-score";
  const transition = step === "rotation" || step === "dish-three";
  const dishIndex =
    step === "rotation" ? 1 : step === "dish-three" || finalScore ? 2 : 0;
  const dish = scenario.dishes[dishIndex];
  const result = scenario.outcome.dishResults[dishIndex];
  const teamTwoFocus =
    step === "perfect-selection" ||
    step === "perfect-commit" ||
    step === "perfect-reveal";
  const selected =
    reveal || finalScore
      ? teamTwoFocus
        ? result.teamB.selected
        : result.teamA.selected
      : step === "opening"
        ? []
        : step === "three-selected"
          ? dish.teamASelection.slice(0, 3)
          : step === "risk"
            ? dish.teamASelection.slice(0, 3)
            : step === "fourth-selection" ||
                step === "fifth-selection" ||
                step === "burn-selection" ||
                step === "commit"
              ? dish.teamASelection
              : dish.teamBSelection;
  const revealTruth = reveal;
  const captain =
    step === "rotation"
      ? result.captains
      : scenario.outcome.dishResults[0].captains;
  const riskFocusId =
    step === "risk" || step === "fourth-selection"
      ? dish.teamASelection[3]
      : step === "fifth-selection"
        ? dish.ingredients.find((ingredient) => ingredient.id === "loomi")?.id
        : undefined;
  const decisionStep =
    step === "risk" ||
    step === "fourth-selection" ||
    step === "fifth-selection";
  const commitStep = step === "commit" || step === "perfect-commit";

  if (transition) {
    const previousResult = scenario.outcome.dishResults[dishIndex - 1];
    return (
      <SharedScreenFrame stand={!compact}>
        <ChallengeFrame
          eyebrow="لا تحرقها"
          title={
            step === "rotation"
              ? "الطبق الثاني — قائد جديد!"
              : "الطبق الثالث — انتقال سريع"
          }
          progressLabel={`الطبق ${dishIndex + 1} من 3`}
          progressValue={step === "rotation" ? 62 : 84}
          compact={compact}
        >
          <CaptainRotationTransition
            scenario={scenario}
            dishIndex={dishIndex}
            previousResult={previousResult}
            compact={compact}
            brief={step === "dish-three"}
          />
        </ChallengeFrame>
      </SharedScreenFrame>
    );
  }

  return (
    <SharedScreenFrame stand={!compact}>
      <ChallengeFrame
        eyebrow="لا تحرقها"
        title={
          finalScore
            ? "نتيجة التحدي"
            : reveal
              ? "كشف نتيجة الطبق"
              : `${dish.name} · اختيارات المكونات`
        }
        progressLabel={finalScore ? "3 أطباق" : `الطبق ${dishIndex + 1} من 3`}
        progressValue={finalScore ? 100 : reveal ? 76 : 28 + dishIndex * 28}
        compact={compact}
      >
        {finalScore ? (
          <FinalScore scenario={scenario} compact={compact} />
        ) : (
          <div
            className={cn(compact ? "space-y-2 p-0.5" : "space-y-4")}
            data-testid="la-tahriqha-tutorial-board"
          >
            <div className="grid grid-cols-2 gap-1.5 text-[0.6rem] sm:gap-2 sm:text-xs">
              <TeamStatus
                name="الفريق الأول"
                captain={captain.teamA}
                active={!teamTwoFocus}
                points={reveal ? result.teamA.points : "—"}
                compact={compact}
              />
              <TeamStatus
                name="الفريق الثاني"
                captain={captain.teamB}
                active={teamTwoFocus}
                points={reveal ? result.teamB.points : "—"}
                compact={compact}
              />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-gold/30 bg-brand-gold/10 px-2 py-1.5">
              <span className="flex items-center gap-1 font-black">
                <ChefHat className="size-3.5" aria-hidden /> قائد الطبق
              </span>
              <span className="font-black">
                {teamTwoFocus ? captain.teamB : captain.teamA}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock3 className="size-3.5" aria-hidden />
                {scenario.dishWindowSeconds}ث
              </span>
            </div>
            {decisionStep && (
              <RiskDecisionPanel step={step} compact={compact} />
            )}
            <div
              className={cn(
                "grid grid-cols-2 gap-1.5 sm:gap-2",
                decisionStep && "ring-1 ring-brand-gold/20 ring-offset-2",
              )}
              data-testid="la-tahriqha-ingredients"
            >
              {dish.ingredients.map((ingredient) => {
                const isSelected = selected.includes(ingredient.id);
                const isWrong =
                  revealTruth &&
                  !teamTwoFocus &&
                  result.teamA.wrongIds.includes(ingredient.id);
                const isCorrectReveal =
                  revealTruth &&
                  (teamTwoFocus
                    ? result.teamB.correctIds.includes(ingredient.id)
                    : result.teamA.correctIds.includes(ingredient.id));
                const riskFifth = riskFocusId === ingredient.id;
                const selectedCard = isSelectionStep(step) && isSelected;
                return (
                  <div
                    key={ingredient.id}
                    data-testid={`la-tahriqha-ingredient-${ingredient.id}`}
                    data-la-tahriqha-selection-card={
                      selectedCard || riskFifth ? "true" : undefined
                    }
                    data-la-tahriqha-burn-card={isWrong ? "true" : undefined}
                    data-la-tahriqha-perfect-card={
                      isCorrectReveal && teamTwoFocus ? "true" : undefined
                    }
                    className={cn(
                      "rounded-lg border px-2 py-2 text-center transition-colors sm:px-3 sm:py-2.5",
                      compact && "py-1.5 max-[374px]:py-1",
                      isSelected &&
                        "border-brand-gold bg-brand-gold/15 shadow-sm",
                      riskFifth &&
                        "border-2 border-dashed border-brand-gold bg-brand-gold/10 shadow-[0_0_0_3px_hsl(var(--brand-gold)/.12)]",
                      isWrong &&
                        "border-destructive bg-destructive/10 text-destructive",
                      isCorrectReveal &&
                        "border-emerald-500 bg-emerald-50 text-emerald-800",
                    )}
                  >
                    <span className="flex items-center justify-center gap-1 text-[0.67rem] font-black leading-4 sm:text-sm">
                      {isWrong ? (
                        <Flame className="size-3.5" aria-hidden />
                      ) : isCorrectReveal ? (
                        <Check className="size-3.5" aria-hidden />
                      ) : null}
                      <BidiText>{ingredient.label}</BidiText>
                    </span>
                    <span className="mt-0.5 block text-[0.54rem] font-bold text-muted-foreground">
                      {isWrong
                        ? "الدخيل"
                        : isCorrectReveal
                          ? "صحيحة"
                          : isSelected
                            ? "مختارة"
                            : riskFifth
                              ? step === "fifth-selection"
                                ? "الخامسة؟"
                                : "مخاطرة؟"
                              : "متاحة"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1.5 text-[0.6rem] font-black sm:text-xs">
              <span>{selected.length} / 5 بطاقات مختارة</span>
              <span>
                {reveal
                  ? result.teamA.burned && !teamTwoFocus
                    ? "احترق الطبق"
                    : teamTwoFocus
                      ? "طبق مثالي"
                      : "تم الكشف"
                  : "الحقيقة تظهر بعد الحسم"}
              </span>
            </div>
            {commitStep && (
              <CommitState teamTwo={teamTwoFocus} compact={compact} />
            )}
            {step === "burn-reveal" && (
              <div
                data-la-tahriqha-burn-emphasis="true"
                className={cn(
                  "rounded-xl border-2 border-destructive/50 bg-destructive/10 p-3 text-center text-destructive",
                  compact && "p-2",
                )}
              >
                <Flame className="mx-auto size-5" aria-hidden />
                <p className="mt-1 text-lg font-black">احترق الطبق!</p>
                <p className="text-base font-black">0 نقاط</p>
                <p className="mt-0.5 text-[0.65rem] font-bold">
                  مكوّن غلط واحد أسقط الاختيار كله.
                </p>
              </div>
            )}
            {step === "perfect-reveal" && (
              <div
                data-la-tahriqha-perfect-emphasis="true"
                className={cn(
                  "rounded-xl border-2 border-brand-gold/60 bg-brand-gold/10 p-3 text-center text-amber-900",
                  compact && "p-2",
                )}
              >
                <Sparkles
                  className="mx-auto size-5 text-brand-gold"
                  aria-hidden
                />
                <p className="mt-1 text-lg font-black">طبق مثالي!</p>
                <p className="text-base font-black">+7 نقاط</p>
                <p className="mt-0.5 text-[0.65rem] font-bold">
                  الخمس الصحيحة تطابق الحكم بعد الكشف.
                </p>
              </div>
            )}
          </div>
        )}
      </ChallengeFrame>
    </SharedScreenFrame>
  );
}

function RiskDecisionPanel({
  step,
  compact,
}: {
  step: LaTahriqhaDemoStepId;
  compact: boolean;
}) {
  return (
    <div
      data-testid="la-tahriqha-risk-decision"
      className={cn(
        "rounded-xl border border-brand-gold/50 bg-brand-gold/10 p-2 text-center",
        compact && "p-1.5",
      )}
    >
      <div className="mb-1 flex items-center justify-center gap-1 text-amber-900">
        <AlertTriangle className="size-3.5" aria-hidden />
        <span className="text-[0.62rem] font-black">قرار القائد</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <div
          className={cn(
            "rounded-lg border border-emerald-500/40 bg-emerald-50 px-2 py-1.5 text-emerald-800",
            step === "risk" && "ring-2 ring-emerald-400/60",
          )}
        >
          <p className="text-[0.68rem] font-black">نكتفي بـ3؟</p>
          <p className="text-[0.58rem] font-bold">3 نقاط آمنة</p>
        </div>
        <ArrowLeftRight className="size-4 text-brand-gold" aria-hidden />
        <div
          className={cn(
            "rounded-lg border border-brand-gold/60 bg-white/70 px-2 py-1.5 text-amber-900",
            step !== "risk" && "ring-2 ring-brand-gold/50",
          )}
        >
          <p className="text-[0.68rem] font-black">نخاطر عشان 7؟</p>
          <p className="text-[0.58rem] font-bold">4 = 4 · 5 = 7</p>
        </div>
      </div>
      <p className="mt-1 text-[0.58rem] font-bold text-muted-foreground">
        أي بطاقة غلط = 0 · الحقيقة بعد التثبيت
      </p>
    </div>
  );
}

function CommitState({
  teamTwo,
  compact,
}: {
  teamTwo: boolean;
  compact: boolean;
}) {
  return (
    <div
      data-testid="la-tahriqha-commit-state"
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl border border-brand-navy/20 bg-brand-navy/5 p-2 text-center",
        compact && "p-1.5",
      )}
    >
      <ShieldCheck className="size-4 text-brand-navy" aria-hidden />
      <div>
        <p className="text-sm font-black">تم التثبيت</p>
        <p className="text-[0.62rem] font-bold text-muted-foreground">
          {teamTwo
            ? "اختيار الفريق الثاني مقفول — ننتظر الحسم."
            : "اختيار القائد مقفول — ننتظر كشف الحكم."}
        </p>
      </div>
    </div>
  );
}

function CaptainRotationTransition({
  scenario,
  dishIndex,
  previousResult,
  compact,
  brief,
}: {
  scenario: LaTahriqhaTutorialScenario;
  dishIndex: number;
  previousResult: LaTahriqhaTutorialScenario["outcome"]["dishResults"][number];
  compact: boolean;
  brief: boolean;
}) {
  const result = scenario.outcome.dishResults[dishIndex];
  const previousTotals = scenario.outcome.dishResults
    .slice(0, dishIndex)
    .reduce(
      (totals, dishResult) => ({
        teamA: totals.teamA + dishResult.teamA.points,
        teamB: totals.teamB + dishResult.teamB.points,
      }),
      { teamA: 0, teamB: 0 },
    );
  return (
    <div
      data-testid={`la-tahriqha-${brief ? "dish-three" : "captain-rotation"}`}
      className={cn("space-y-3 text-center", compact && "space-y-2")}
    >
      <div className="flex items-center justify-center gap-2 sm:gap-4">
        <div className="min-w-0 flex-1 rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-[0.65rem] font-bold text-muted-foreground">
            القائد السابق
          </p>
          <p className="mt-1 truncate text-base font-black">
            {previousResult.captains.teamA} · {previousResult.captains.teamB}
          </p>
          <p className="mt-1 text-[0.62rem] font-bold text-muted-foreground">
            النقاط محفوظة
          </p>
        </div>
        <ArrowLeftRight
          className="size-6 shrink-0 text-brand-gold"
          aria-hidden
        />
        <div className="min-w-0 flex-1 rounded-xl border-2 border-brand-gold/60 bg-brand-gold/10 p-3">
          <p className="text-[0.65rem] font-bold text-amber-900">
            القائد الجديد
          </p>
          <p className="mt-1 truncate text-base font-black text-amber-950">
            {result.captains.teamA} · {result.captains.teamB}
          </p>
          <p className="mt-1 text-[0.62rem] font-bold text-amber-900">
            النقاش للجميع · التثبيت للقائد
          </p>
        </div>
      </div>
      <div className="rounded-xl border border-brand-navy/15 bg-brand-navy/5 p-2">
        <p className="text-sm font-black">
          {brief
            ? "نكمل بسرعة إلى الطبق الثالث"
            : "الطبق الثاني يبدأ بقادة جدد"}
        </p>
        <p className="mt-1 text-[0.65rem] font-bold text-muted-foreground">
          النتيجة حتى الآن: الفريق الأول {previousTotals.teamA} · الفريق الثاني{" "}
          {previousTotals.teamB}
        </p>
      </div>
    </div>
  );
}

function SelectionContext({
  scenario,
  step,
  compact,
}: {
  scenario: LaTahriqhaTutorialScenario;
  step: LaTahriqhaDemoStepId;
  compact: boolean;
}) {
  const dish = scenario.dishes[0];
  const captain =
    step === "perfect-selection" || step === "perfect-commit"
      ? scenario.outcome.dishResults[0].captains.teamB
      : scenario.outcome.dishResults[0].captains.teamA;
  const count =
    step === "three-selected"
      ? 3
      : step === "fourth-selection" ||
          step === "fifth-selection" ||
          step === "burn-selection" ||
          step === "commit"
        ? 4
        : step === "perfect-selection" || step === "perfect-commit"
          ? 5
          : 0;
  return (
    <div
      data-testid="la-tahriqha-selection-context"
      className={cn(
        "order-3 rounded-xl border border-border bg-muted/30 p-3 text-center lg:hidden",
        compact && "p-2",
      )}
    >
      <div className="flex items-center justify-center gap-2">
        <ShieldCheck className="size-4 text-brand-navy" aria-hidden />
        <p className="text-sm font-black">الشاشة المشتركة</p>
      </div>
      <p className="mt-1 text-[0.68rem] font-bold">
        {dish.name} · 8 بطاقات · الحقيقة مخفية
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[0.65rem] font-black">
        <div className="rounded-lg bg-white/70 px-2 py-1.5">
          قائد الطبق: {captain}
        </div>
        <div className="rounded-lg bg-brand-gold/10 px-2 py-1.5">
          الاختيار: {count} / 5
        </div>
      </div>
    </div>
  );
}

function LaTahriqhaPhoneScene({
  scenario,
  step,
  compact,
}: {
  scenario: LaTahriqhaTutorialScenario;
  step: LaTahriqhaDemoStepId;
  compact: boolean;
}) {
  const result = scenario.outcome.dishResults[0];
  const selectionScene = isSelectionStep(step);
  const revealScene = isRevealStep(step);
  const phoneTeamTwo =
    step === "perfect-selection" ||
    step === "perfect-commit" ||
    step === "perfect-reveal";
  const committed =
    step === "commit" ||
    step === "perfect-commit" ||
    step === "burn-reveal" ||
    step === "perfect-reveal";
  const count = phoneTeamTwo
    ? 5
    : step === "three-selected"
      ? 3
      : step === "risk"
        ? 3
        : step === "fourth-selection" ||
            step === "fifth-selection" ||
            step === "burn-selection" ||
            committed
          ? 4
          : 0;
  const candidateId =
    step === "fifth-selection"
      ? scenario.dishes[0].ingredients.find(
          (ingredient) => ingredient.id === "loomi",
        )?.id
      : undefined;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-2",
        revealScene && "opacity-75",
      )}
      data-testid="la-tahriqha-tutorial-phone-scene"
    >
      <PhoneFrame
        className={cn(
          selectionScene
            ? "w-[14rem] max-[374px]:w-[13rem] sm:w-[15rem]"
            : "w-[10rem] sm:w-[12rem]",
          compact && selectionScene && "max-w-[15rem]",
        )}
      >
        <div className="flex w-full flex-col gap-1.5 text-center max-[374px]:gap-1">
          {step === "final-score" ? (
            <>
              <Trophy
                className="mx-auto size-5 text-brand-gold max-[374px]:size-4"
                aria-hidden
              />
              <p className="text-[0.68rem] font-black leading-4 max-[374px]:text-[0.56rem] max-[374px]:leading-3">
                تحدي من 3 أطباق
              </p>
              <div className="rounded-md bg-brand-gold/10 px-1.5 py-2 text-[0.62rem] font-black max-[374px]:py-1 max-[374px]:text-[0.52rem]">
                الفريق الثاني · 14
              </div>
              <div className="rounded-md bg-muted/50 px-1.5 py-2 text-[0.62rem] font-black max-[374px]:py-1 max-[374px]:text-[0.52rem]">
                الفريق الأول · 7
              </div>
              <div className="rounded-md bg-emerald-100 px-1.5 py-1 text-[0.55rem] font-black text-emerald-800 max-[374px]:px-1 max-[374px]:py-0.5 max-[374px]:text-[0.46rem]">
                +1 Match point
              </div>
            </>
          ) : (
            <>
              <p className="text-[0.56rem] font-black text-muted-foreground">
                {phoneTeamTwo ? "الفريق الثاني" : "الفريق الأول"} · قائد الطبق
              </p>
              <div className="flex items-center justify-center gap-1 rounded-md bg-brand-gold/10 px-1.5 py-1 text-[0.56rem] font-black">
                <Clock3 className="size-3" aria-hidden />{" "}
                {committed ? "مقفول" : `${scenario.dishWindowSeconds}ث`}
              </div>
              <p className="text-[0.68rem] font-black leading-4">
                {scenario.dishes[0].name}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {scenario.dishes[0].ingredients
                  .slice(0, 8)
                  .map((ingredient, index) => (
                    <div
                      key={ingredient.id}
                      data-la-tahriqha-phone-card="true"
                      data-la-tahriqha-selection-card={
                        selectionScene && index < count ? "true" : undefined
                      }
                      className={cn(
                        "rounded-lg border px-2 py-2 text-[0.74rem] font-black leading-4",
                        index < count && "border-brand-gold bg-brand-gold/20",
                        candidateId === ingredient.id &&
                          "border-2 border-dashed border-brand-gold bg-brand-gold/10 shadow-[0_0_0_3px_hsl(var(--brand-gold)/.12)]",
                      )}
                    >
                      {ingredient.label}
                    </div>
                  ))}
              </div>
              {selectionScene && (
                <div
                  data-la-tahriqha-selection-tray="true"
                  className="rounded-lg border border-brand-navy/15 bg-brand-navy/5 px-2 py-1.5 text-[0.62rem] font-black"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>منطقة اختيار القائد</span>
                    <span>{count} / 5</span>
                  </div>
                  <div className="mt-1 flex flex-wrap justify-center gap-1">
                    {(phoneTeamTwo
                      ? scenario.dishes[0].teamBSelection
                      : scenario.dishes[0].teamASelection.slice(0, count)
                    ).map((id) => {
                      const ingredient = scenario.dishes[0].ingredients.find(
                        (item) => item.id === id,
                      );
                      return ingredient ? (
                        <span
                          key={ingredient.id}
                          className="rounded bg-white/80 px-1.5 py-0.5 text-[0.58rem]"
                        >
                          {ingredient.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
              {!selectionScene && (
                <div className="rounded-md bg-muted/50 px-1.5 py-1 text-[0.55rem] font-black">
                  {count} / 5 مختارة
                </div>
              )}
              <Button
                size="sm"
                disabled
                className="h-8 w-full text-[0.65rem] font-black"
              >
                {committed ? "تم التثبيت" : "ثبّت الطبق"}
              </Button>
              {step === "burn-reveal" && !phoneTeamTwo && (
                <div className="rounded-md bg-destructive/10 px-1.5 py-1 text-[0.54rem] font-black text-destructive">
                  <Flame className="mx-auto mb-0.5 size-3" aria-hidden /> احترق
                  · 0
                </div>
              )}
              {step === "perfect-reveal" && phoneTeamTwo && (
                <div className="rounded-md bg-emerald-100 px-1.5 py-1 text-[0.54rem] font-black text-emerald-800">
                  <Check className="mx-auto mb-0.5 size-3" aria-hidden /> طبق
                  مثالي · +7
                </div>
              )}
            </>
          )}
        </div>
      </PhoneFrame>
      {selectionScene &&
        (step === "risk" ||
          step === "fourth-selection" ||
          step === "fifth-selection") && (
          <RiskDecisionPanel step={step} compact={compact} />
        )}
      {selectionScene &&
        step !== "risk" &&
        step !== "fourth-selection" &&
        step !== "fifth-selection" && (
          <div className="w-full rounded-lg border border-border bg-muted/30 p-2 text-center">
            <p className="flex items-center justify-center gap-1 text-[0.68rem] font-black">
              <LockKeyhole className="size-3.5" aria-hidden />
              الفريق يناقش، والقائد يثبت
            </p>
            <p className="mt-0.5 text-[0.58rem] font-bold text-muted-foreground">
              {result.captains.teamA} · {result.captains.teamB}
            </p>
          </div>
        )}
    </div>
  );
}

function TeamStatus({
  name,
  captain,
  active,
  points,
  compact,
}: {
  name: string;
  captain: string;
  active: boolean;
  points: number | string;
  compact: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2 py-1.5",
        active
          ? "border-brand-gold/50 bg-brand-gold/10"
          : "border-border bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-black">{name}</span>
        <span className="akwaan-numeral text-sm font-black">{points}</span>
      </div>
      <p className="mt-0.5 text-[0.55rem] font-bold text-muted-foreground">
        {compact ? "قائد" : "قائد الطبق"}: {captain} ·{" "}
        {typeof points === "number" ? "نقاط داخلية" : "بعد الحسم"}
      </p>
    </div>
  );
}

function FinalScore({
  scenario,
  compact,
}: {
  scenario: LaTahriqhaTutorialScenario;
  compact: boolean;
}) {
  const outcome = scenario.outcome;
  return (
    <div
      className="space-y-3 text-center"
      data-testid="la-tahriqha-final-score"
    >
      <div className="rounded-xl border border-brand-gold/50 bg-brand-gold/10 p-3">
        <Trophy className="mx-auto size-6 text-brand-gold" aria-hidden />
        <p className="mt-1 text-lg font-black">الفريق الثاني يفوز بالتحدي</p>
        <p className="text-[0.68rem] font-bold text-muted-foreground">
          ثلاثة أطباق · النتيجة الداخلية قبل مصالحة المباراة
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <p className="text-[0.65rem] font-black">الفريق الأول</p>
          <p className="akwaan-numeral text-2xl font-black">
            {outcome.finalTotals["team-a"]}
          </p>
          <p className="text-[0.58rem] font-bold text-muted-foreground">
            0 + 4 + 3
          </p>
        </div>
        <div className="rounded-lg border border-brand-gold/50 bg-brand-gold/10 p-2">
          <p className="text-[0.65rem] font-black">الفريق الثاني</p>
          <p className="akwaan-numeral text-2xl font-black">
            {outcome.finalTotals["team-b"]}
          </p>
          <p className="text-[0.58rem] font-bold text-muted-foreground">
            7 + 3 + 4
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 p-2 text-emerald-800">
        <p className="text-sm font-black">
          +{outcome.matchPointDelta} Match point
        </p>
        <p className="mt-0.5 text-[0.62rem] font-bold">
          {compact
            ? "عبر المسار canonical challenge-win"
            : "تُحتسب نقطة المباراة فقط بعد نتيجة التحدي"}
        </p>
      </div>
    </div>
  );
}
