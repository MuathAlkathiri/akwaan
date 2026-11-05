"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Check, Clock3, Lock, ShieldAlert, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BidiText } from "@/components/akwaan/bidi-text";
import {
  PhoneFrame,
  SharedScreenFrame,
} from "@/features/how-to-play/components/device-frames";
import { ChallengeFrame } from "@/features/live-game-session/match/components/challenge-frame";
import { cn } from "@/lib/utils";
import type { LaqathaTutorialScenario } from "../tutorial-scenario";
import {
  LAQATHA_DEMO_STEPS,
  type LaqathaDemoStepId,
} from "../laqatha-demo-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";
import { ExplainerCaption, ExplainerControls, showsExplainerControls } from "./explainer-controls";
import type { ExplainerMode } from "./ryo-explainer";

export function LaqathaExplainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: LaqathaTutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const timeline = useExplainerTimeline(LAQATHA_DEMO_STEPS, scope);
  const step = LAQATHA_DEMO_STEPS[timeline.index];
  const boardStep =
    step.id === "opening" ||
    step.id === "clue-1" ||
    step.id === "clue-2" ||
    step.id === "continue" ||
    step.id === "reveal";
  const revealedCount =
    step.id === "opening"
      ? 0
      : step.id === "clue-1" ||
          step.id === "claim" ||
          step.id === "locked" ||
          step.id === "wrong"
        ? 1
        : step.id === "clue-2"
          ? 2
          : 3;

  useEffect(() => {
    if (timeline.reducedMotion || !scope.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-laqatha-scene]",
        { autoAlpha: 0.72, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.36, ease: "power2.out" },
      );
      if (step.id === "claim")
        gsap.fromTo(
          "[data-laqatha-claim-emphasis]",
          { scale: 0.92 },
          { scale: 1, duration: 0.5, ease: "back.out(2)" },
        );
      if (step.id === "wrong")
        gsap.fromTo(
          "[data-laqatha-wrong-emphasis]",
          { x: 8, autoAlpha: 0.6 },
          { x: 0, autoAlpha: 1, duration: 0.42, ease: "power2.out" },
        );
    }, scope);
    return () => context.revert();
  }, [step.id, timeline.reducedMotion]);

  return (
    <div
      ref={scope}
      dir="rtl"
      data-testid="laqatha-explainer"
      data-demo-step={step.id}
      data-variant={compact ? "compact" : "full"}
      className={compact ? "space-y-3" : "space-y-6"}
    >
      {showsExplainerControls(mode, timeline) ? (
        <ExplainerControls
          step={timeline.index}
          total={LAQATHA_DEMO_STEPS.length}
          caption={step.caption}
          phase={step.id === "reveal" ? "resolved" : "simulation"}
          timeline={timeline}
          compact={compact}
          stackOnNarrow
        />
      ) : (
        <ExplainerCaption caption={step.caption} compact={compact} />
      )}
      <div
        data-laqatha-scene
        className={cn(
          "grid gap-3",
          boardStep
            ? "lg:grid-cols-[minmax(0,2.3fr)_minmax(12rem,.55fr)]"
            : "lg:grid-cols-[minmax(0,1.9fr)_minmax(14rem,.65fr)]",
          compact ? "lg:gap-4" : "gap-6",
          step.id === "reveal" && "lg:grid-cols-1",
        )}
      >
        {boardStep ? (
          <LaqathaBoardScene
            scenario={scenario}
            step={step.id}
            revealedCount={revealedCount}
            compact={compact}
          />
        ) : (
          <LaqathaPhoneScene
            scenario={scenario}
            step={step.id}
            compact={compact}
          />
        )}
        {boardStep ? (
          <LaqathaRaceNotes
            scenario={scenario}
            step={step.id}
            compact={compact}
          />
        ) : (
          <LaqathaPhoneNotes step={step.id} compact={compact} />
        )}
      </div>
    </div>
  );
}

function LaqathaBoardScene({
  scenario,
  step,
  revealedCount,
  compact,
}: {
  scenario: LaqathaTutorialScenario;
  step: LaqathaDemoStepId;
  revealedCount: number;
  compact: boolean;
}) {
  const reveal = step === "reveal";
  return (
    <SharedScreenFrame stand={!compact}>
      <ChallengeFrame
        eyebrow="القطها"
        title={reveal ? "كشف الفيلم" : "سباق التعرف على الفيلم"}
        progressLabel="الفيلم 1 من 3"
        progressValue={reveal ? 100 : 34}
        compact={compact}
      >
        <div className="space-y-3" data-testid="laqatha-tutorial-board-scene">
          {!reveal && (
            <div className="flex items-center justify-between gap-2">
              <TeamBadge name="الفريق الأول" tone="gold" />
              <div
                className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3 py-1 text-center"
                data-testid="laqatha-tutorial-reward"
              >
                <span className="text-[0.62rem] font-bold text-muted-foreground">
                  المكافأة الآن
                </span>
                <strong className="akwaan-numeral ms-1 text-xl font-black">
                  {revealedCount ? scenario.clues[revealedCount - 1]?.value : 5}
                </strong>
              </div>
              <TeamBadge name="الفريق الثاني" tone="blue" />
            </div>
          )}
          {step === "continue" && (
            <div
              className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-center text-xs font-black"
              data-testid="laqatha-tutorial-team2-reactivated"
            >
              الدور للفريق الثاني · يكمل من الدليل 3
            </div>
          )}
          {reveal ? (
            <LaqathaReveal scenario={scenario} />
          ) : (
            <ol className="space-y-2" data-testid="laqatha-tutorial-clues">
              {scenario.clues.slice(0, revealedCount).map((clue) => (
                <li
                  key={clue.order}
                  className={cn(
                    "rounded-lg border p-2.5",
                    clue.order === revealedCount &&
                      "border-brand-gold bg-brand-gold/10",
                  )}
                  data-testid={`laqatha-tutorial-clue-${clue.order}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[0.62rem] font-black text-muted-foreground">
                      الدليل {clue.order}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.62rem] font-black">
                      {clue.value} نقاط
                    </span>
                  </div>
                  <BidiText className="mt-1 text-sm font-black leading-5">
                    {clue.text}
                  </BidiText>
                </li>
              ))}
            </ol>
          )}
          {!reveal && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-[0.65rem] font-bold text-muted-foreground">
              <Clock3 className="size-3.5" aria-hidden />
              دليل جديد كل 3 ثوانٍ · لا توجد اختيارات متعددة
            </div>
          )}
        </div>
      </ChallengeFrame>
    </SharedScreenFrame>
  );
}

function LaqathaPhoneScene({
  scenario,
  step,
  compact,
}: {
  scenario: LaqathaTutorialScenario;
  step: LaqathaDemoStepId;
  compact: boolean;
}) {
  const locked = step === "locked";
  const wrong = step === "wrong";
  const correct = step === "correct";
  return (
    <SharedScreenFrame stand={!compact}>
      <ChallengeFrame
        eyebrow={correct ? "الفريق الثاني" : "الفريق الأول"}
        title={
          locked
            ? "نافذة الإجابة"
            : wrong
              ? "المحاولة لم تنجح"
              : correct
                ? "الفريق الثاني يجيب"
                : "جاوب قبل أن تقل المكافأة"
        }
        progressLabel={locked ? "5 ثوانٍ" : "فيلم 1 من 3"}
        progressValue={locked ? 64 : correct ? 88 : 52}
        compact={compact}
      >
        <div
          data-testid="laqatha-tutorial-phone-scene"
          className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,12rem)]"
        >
          <LaqathaClaimStrip step={step} />
          <div className="mx-auto w-fit" data-testid="laqatha-tutorial-phone">
            <PhoneFrame className="w-[10.8rem] sm:w-[12rem]">
              <div className="space-y-2 text-center">
                <p className="text-[0.62rem] font-black text-muted-foreground">
                  {correct ? "الفريق الثاني" : "الفريق الأول"}
                </p>
                {locked || wrong || correct ? (
                  <>
                    <div className="flex items-center justify-center gap-1 rounded-md bg-brand-gold/10 px-2 py-1 text-[0.62rem] font-black">
                      <Clock3 className="size-3" aria-hidden />
                      {locked ? "05.0" : wrong ? "انتهت" : "تم الإرسال"}
                    </div>
                    <Input
                      value={
                        correct
                          ? scenario.secondSubmittedAnswer
                          : wrong
                            ? scenario.firstSubmittedAnswer
                            : ""
                      }
                      placeholder="اسم الفيلم"
                      readOnly
                      className="h-9 px-1 text-center text-xs"
                      data-testid="laqatha-tutorial-free-text"
                    />
                    <Button
                      size="sm"
                      disabled
                      className="h-8 w-full text-[0.62rem] font-black"
                    >
                      {correct
                        ? "إجابة صحيحة"
                        : wrong
                          ? "إجابة خاطئة"
                          : "إرسال"}
                    </Button>
                    {wrong && (
                      <div
                        className="rounded-md bg-destructive/10 px-2 py-1 text-[0.62rem] font-black text-destructive"
                        data-testid="laqatha-tutorial-wrong"
                      >
                        تم استبعاد الفريق الأول
                      </div>
                    )}
                    {correct && (
                      <div
                        className="rounded-md bg-emerald-100 px-2 py-1 text-[0.62rem] font-black text-emerald-800"
                        data-testid="laqatha-tutorial-correct"
                      >
                        <Check className="mx-auto mb-0.5 size-3" />
                        +3 للفريق الثاني
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-black leading-5">
                      {scenario.prompt}
                    </p>
                    <Button
                      size="lg"
                      disabled
                      className="h-14 w-full text-lg font-black"
                      data-testid="laqatha-tutorial-claim"
                    >
                      جاوب
                    </Button>
                  </>
                )}
              </div>
            </PhoneFrame>
          </div>
          <div
            data-testid="laqatha-tutorial-phone-context"
            className="order-last rounded-lg border border-border bg-muted/30 p-2 text-center"
          >
            {step === "claim" ? (
              <>
                <Lock className="mx-auto size-4 text-brand-gold" aria-hidden />
                <p
                  className="mt-1 text-xs font-black"
                  data-laqatha-claim-emphasis
                >
                  الدليل 2 متجمّد
                </p>
                <p className="text-[0.62rem] font-bold text-muted-foreground">
                  المكافأة مثبتة عند 4
                </p>
              </>
            ) : locked ? (
              <>
                <Lock className="mx-auto size-4 text-brand-gold" aria-hidden />
                <p className="mt-1 text-xs font-black">
                  الفريق الثاني مقفول مؤقتًا
                </p>
                <p className="text-[0.62rem] font-bold text-muted-foreground">
                  المكافأة ثابتة عند 4
                </p>
              </>
            ) : wrong ? (
              <div data-laqatha-wrong-emphasis>
                <X className="mx-auto size-4 text-destructive" aria-hidden />
                <p className="mt-1 text-xs font-black">
                  محاولة الفريق الأول انتهت
                </p>
                <p className="text-[0.62rem] font-bold text-muted-foreground">
                  الفريق الثاني يستأنف
                </p>
              </div>
            ) : correct ? (
              <>
                <Check
                  className="mx-auto size-4 text-success"
                  aria-hidden
                />
                <p className="mt-1 text-xs font-black">إجابة نصية صحيحة</p>
                <p className="text-[0.62rem] font-bold text-muted-foreground">
                  الدليل 3 · +3 نقاط
                </p>
              </>
            ) : (
              <>
                <Sparkles
                  className="mx-auto size-4 text-brand-gold"
                  aria-hidden
                />
                <p className="mt-1 text-xs font-black">
                  أول فريق يضغط جاوب يحجز نافذة الكتابة
                </p>
              </>
            )}
          </div>
        </div>
      </ChallengeFrame>
    </SharedScreenFrame>
  );
}

function LaqathaClaimStrip({ step }: { step: LaqathaDemoStepId }) {
  const teamOneOwnsWindow = step === "claim" || step === "locked";
  const teamTwoOwnsWindow = step === "correct";
  return (
    <div
      className="order-first col-span-full grid grid-cols-2 gap-2"
      data-testid="laqatha-tutorial-team-status"
    >
      <div
        className={cn(
          "rounded-lg border px-2 py-1.5 text-center",
          teamOneOwnsWindow
            ? "border-brand-gold/50 bg-brand-gold/10"
            : "border-border bg-muted/30",
        )}
        data-laqatha-claim-emphasis={teamOneOwnsWindow ? "active" : undefined}
      >
        <p className="text-[0.62rem] font-black">الفريق الأول</p>
        <p className="text-[0.58rem] font-bold text-muted-foreground">
          {step === "wrong"
            ? "محاولة منتهية"
            : teamOneOwnsWindow
              ? "حجز الإجابة · 4 نقاط"
              : "جاهز للسباق"}
        </p>
      </div>
      <div
        className={cn(
          "rounded-lg border px-2 py-1.5 text-center",
          teamTwoOwnsWindow
            ? "border-primary/40 bg-primary/10"
            : "border-border bg-muted/30",
        )}
      >
        <p className="text-[0.62rem] font-black">الفريق الثاني</p>
        <p className="text-[0.58rem] font-bold text-muted-foreground">
          {teamOneOwnsWindow
            ? "مقفول مؤقتًا"
            : teamTwoOwnsWindow
              ? "الدور لكم · +3"
              : step === "wrong"
                ? "يستأنف من الدليل التالي"
                : "جاهز للسباق"}
        </p>
      </div>
    </div>
  );
}

function LaqathaReveal({ scenario }: { scenario: LaqathaTutorialScenario }) {
  return (
    <section
      data-testid="laqatha-tutorial-reveal"
      className="space-y-2 text-center"
    >
      <div className="rounded-xl border border-brand-gold/50 bg-brand-gold/10 p-3">
        <p className="text-[0.65rem] font-black text-muted-foreground">
          الفيلم
        </p>
        <p className="text-2xl font-black">{scenario.title}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-brand-gold/50 bg-brand-gold/10 p-2">
          <Check className="mx-auto size-4 text-brand-gold" aria-hidden />
          <p className="text-xs font-black">الفريق الثاني · الفائز</p>
          <p className="text-[0.65rem] font-bold text-muted-foreground">
            أجاب عند الدليل 3 · +3 نقاط
          </p>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2">
          <ShieldAlert
            className="mx-auto size-4 text-destructive"
            aria-hidden
          />
          <p className="text-xs font-black">الفريق الأول</p>
          <p className="text-[0.65rem] font-bold text-muted-foreground">
            محاولة خاطئة · 0 نقاط
          </p>
        </div>
      </div>
      <p className="text-xs font-black">
        هذه نتيجة فيلم واحد؛ التحدي يضم 3 أفلام.
      </p>
    </section>
  );
}

function TeamBadge({ name, tone }: { name: string; tone: "gold" | "blue" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-[0.62rem] font-black",
        tone === "gold" ? "bg-brand-gold/15" : "bg-primary/10",
      )}
    >
      {name}
    </span>
  );
}

function LaqathaRaceNotes({
  scenario,
  step,
  compact,
}: {
  scenario: LaqathaTutorialScenario;
  step: LaqathaDemoStepId;
  compact: boolean;
}) {
  return (
    <div
      className={cn(
        "surface-card space-y-2 p-3 text-center",
        compact && "p-2.5",
      )}
      data-testid="laqatha-tutorial-race-notes"
    >
      <p className="text-xs font-black">
        {step === "reveal"
          ? "النتيجة لا تنهي المباراة"
          : "فريقان · نفس الدليل · نفس التوقيت"}
      </p>
      <p className="text-[0.68rem] font-bold text-muted-foreground">
        {step === "clue-2"
          ? "الانتظار أعطى معلومة أكثر، لكنه خفّض المكافأة 5 → 4."
          : step === "continue"
            ? "لا يُعاد الزمن بعد فشل الخصم؛ يكمل الفريق الثاني من الدليل التالي."
            : `القطها = ${scenario.outcome.questionCount} أسئلة أفلام في التحدي.`}
      </p>
      <div className="flex justify-center gap-2 text-[0.62rem] font-black">
        <span className="rounded-full bg-brand-gold/15 px-2 py-1">
          5 → 4 → 3
        </span>
        <span className="rounded-full bg-primary/10 px-2 py-1">نصي حر</span>
      </div>
    </div>
  );
}

function LaqathaPhoneNotes({
  step,
  compact,
}: {
  step: LaqathaDemoStepId;
  compact: boolean;
}) {
  return (
    <div
      className={cn(
        "surface-card space-y-2 p-3 text-center",
        compact && "p-2.5",
      )}
      data-testid="laqatha-tutorial-phone-notes"
    >
      <p className="text-xs font-black">
        {step === "locked"
          ? "النافذة لا تعني نجاحًا"
          : step === "wrong"
            ? "الخطأ يستهلك محاولة هذا الفريق"
            : step === "correct"
              ? "الإجابة الأولى الصحيحة هي المعتمدة"
              : "زر جاوب يسبق الكتابة"}
      </p>
      <p className="text-[0.68rem] font-bold text-muted-foreground">
        {step === "locked"
          ? "5 ثوانٍ للكتابة، والفريق الآخر ينتظر."
          : "لا توجد اختيارات متعددة؛ الاسم يُكتب كنص حر."}
      </p>
      <div className="flex justify-center gap-2 text-[0.62rem] font-black">
        <span className="rounded-full bg-brand-gold/15 px-2 py-1">5 ثوانٍ</span>
        <span className="rounded-full bg-destructive/10 px-2 py-1">
          محاولة واحدة
        </span>
      </div>
    </div>
  );
}
