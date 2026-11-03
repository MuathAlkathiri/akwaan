"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import {
  Check,
  Clock3,
  Headphones,
  Lock,
  Music2,
  ShieldAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PhoneFrame,
  SharedScreenFrame,
} from "@/features/how-to-play/components/device-frames";
import { ChallengeFrame } from "@/features/live-game-session/match/components/challenge-frame";
import { cn } from "@/lib/utils";
import type { FirstNoteTutorialScenario } from "../tutorial-scenario";
import {
  FIRST_NOTE_DEMO_STEPS,
  type FirstNoteDemoStepId,
} from "../first-note-demo-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";
import { ExplainerCaption, ExplainerControls } from "./explainer-controls";
import type { ExplainerMode } from "./ryo-explainer";

const auctionReward = (seconds: number) =>
  seconds <= 3 ? 3 : seconds <= 7 ? 2 : 1;

export function FirstNoteExplainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: FirstNoteTutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const timeline = useExplainerTimeline(FIRST_NOTE_DEMO_STEPS, scope);
  const step = FIRST_NOTE_DEMO_STEPS[timeline.index];
  const boardStep = !["wrong", "steal", "correct"].includes(step.id);
  const playback = step.id === "playback";
  const playbackComplete = step.id === "playback-complete";

  useEffect(() => {
    if (timeline.reducedMotion || !scope.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-first-note-scene]",
        { autoAlpha: 0.72, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.36, ease: "power2.out" },
      );
      if (step.id === "bid-3") {
        gsap.fromTo(
          "[data-first-note-final-bid]",
          { scale: 0.9 },
          { scale: 1, duration: 0.5, ease: "back.out(2)" },
        );
      }
      if (playback) {
        gsap.fromTo(
          "[data-first-note-progress]",
          { scaleX: 0 },
          { scaleX: 1, duration: 3, ease: "none", transformOrigin: "right" },
        );
        gsap.fromTo(
          "[data-first-note-waveform-bar]",
          { scaleY: 0.35 },
          {
            scaleY: 1,
            duration: 0.45,
            stagger: 0.08,
            repeat: 5,
            yoyo: true,
            ease: "sine.inOut",
            transformOrigin: "center",
          },
        );
      }
    }, scope);
    return () => context.revert();
  }, [playback, step.id, timeline.reducedMotion]);

  return (
    <div
      ref={scope}
      dir="rtl"
      data-testid="first-note-explainer"
      data-demo-step={step.id}
      data-variant={compact ? "compact" : "full"}
      className={compact ? "space-y-3" : "space-y-6"}
    >
      {mode === "preview" ? (
        <ExplainerControls
          step={timeline.index}
          total={FIRST_NOTE_DEMO_STEPS.length}
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
        data-first-note-scene
        className={cn(
          "grid gap-3",
          boardStep
            ? "lg:grid-cols-[minmax(0,2.5fr)_minmax(15rem,.7fr)]"
            : "lg:grid-cols-[minmax(0,1.6fr)_minmax(15rem,.8fr)]",
          compact ? "lg:gap-4" : "gap-6",
        )}
      >
        {boardStep ? (
          <FirstNoteBoardScene
            scenario={scenario}
            step={step.id}
            compact={compact}
            playback={playback || playbackComplete}
            playbackComplete={playbackComplete}
          />
        ) : (
          <FirstNotePhoneScene
            scenario={scenario}
            step={step.id}
            compact={compact}
          />
        )}
        <FirstNoteNotes scenario={scenario} step={step.id} compact={compact} />
      </div>
    </div>
  );
}

function FirstNoteBoardScene({
  scenario,
  step,
  compact,
  playback,
  playbackComplete,
}: {
  scenario: FirstNoteTutorialScenario;
  step: FirstNoteDemoStepId;
  compact: boolean;
  playback: boolean;
  playbackComplete: boolean;
}) {
  const reveal = step === "reveal";
  const bids =
    step === "opening"
      ? []
      : scenario.bids.slice(0, step === "bid-8" ? 1 : step === "bid-5" ? 2 : 3);
  return (
    <SharedScreenFrame
      stand={!compact}
      className={!compact ? "lg:min-w-0" : undefined}
    >
      <ChallengeFrame
        eyebrow="من أول نغمة"
        title={
          reveal ? "كشف الأغنية" : playback ? "المقطع المشترك" : "مزاد الثواني"
        }
        progressLabel="الأغنية 1 من 3"
        progressValue={
          reveal ? 100 : playbackComplete ? 82 : playback ? 72 : 34
        }
        compact={compact}
        className={!compact ? "w-full" : undefined}
      >
        <div
          className={compact ? "space-y-3" : "space-y-4 lg:space-y-5"}
          data-testid="first-note-board-scene"
        >
          {reveal ? (
            <FirstNoteReveal scenario={scenario} />
          ) : (
            <>
              <section
                className="rounded-lg border border-brand-gold/40 bg-brand-gold/10 p-3 text-center"
                data-testid="first-note-context-clue"
              >
                <p className="text-[0.62rem] font-black text-muted-foreground">
                  {scenario.clueLabel ?? "دليل سياقي"}
                </p>
                <p className="mt-1 text-sm font-black leading-5">
                  {scenario.contextualClue}
                </p>
              </section>
              {playback && !playbackComplete ? (
                <FirstNotePlayback scenario={scenario} />
              ) : playbackComplete ? (
                <FirstNotePlayback scenario={scenario} completed />
              ) : (
                <section
                  className={cn(
                    "space-y-3 rounded-2xl border-2 border-brand-gold/35 bg-brand-gold/5 p-3 text-center sm:p-5",
                    !compact && "lg:p-6",
                  )}
                  data-testid="first-note-auction-board"
                >
                  <div className="flex items-center justify-between gap-2">
                    <TeamBadge
                      name="الفريق الأول"
                      tone="gold"
                      active={
                        step === "bid-8" ||
                        step === "bid-3" ||
                        step === "auction-won"
                      }
                    />
                    <Music2 className="size-4 text-brand-gold" aria-hidden />
                    <TeamBadge
                      name="الفريق الثاني"
                      tone="blue"
                      active={step === "bid-5"}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black text-muted-foreground">
                      {step === "auction-won"
                        ? "الفريق صاحب أقل مزايدة يأخذ أولوية الإجابة"
                        : "كل نزول يشتري مخاطرة أكبر ومكافأة محتملة مختلفة"}
                    </p>
                    <p
                      className={cn(
                        "font-black",
                        compact ? "text-base" : "text-xl sm:text-2xl",
                      )}
                    >
                      {step === "auction-won"
                        ? "الأولوية للفريق الأول"
                        : "المزايدة الحالية"}
                    </p>
                  </div>
                  <div
                    className="grid grid-cols-3 gap-2 sm:gap-3"
                    data-testid="first-note-bid-history"
                  >
                    {bids.length ? (
                      bids.map((bid, index) => (
                        <div
                          key={`${bid.team}-${bid.seconds}`}
                          className={cn(
                            "rounded-xl border-2 px-2 py-3 text-center",
                            bid.team === "team-a"
                              ? "border-brand-gold/50 bg-brand-gold/10"
                              : "border-primary/30 bg-primary/5",
                            bid.seconds === 3 &&
                              "border-brand-gold bg-brand-gold/20 shadow-[0_0_0_3px_hsl(var(--brand-gold)/.16)]",
                          )}
                          data-first-note-final-bid={
                            bid.seconds === 3 ? "true" : undefined
                          }
                        >
                          <p className="text-[0.62rem] font-black text-muted-foreground">
                            {bid.team === "team-a"
                              ? "الفريق الأول"
                              : "الفريق الثاني"}
                          </p>
                          <strong
                            className={cn(
                              "akwaan-numeral font-black leading-none",
                              compact ? "text-2xl" : "text-3xl sm:text-5xl",
                            )}
                          >
                            {bid.seconds}
                          </strong>
                          <p className="mt-1 text-[0.58rem] font-black sm:text-xs">
                            ثوانٍ
                          </p>
                          <p className="mt-2 text-[0.55rem] font-bold text-muted-foreground sm:text-[0.65rem]">
                            مكافأة محتملة · {auctionReward(bid.seconds)}
                          </p>
                          {index < bids.length - 1 && (
                            <span className="sr-only">ثم نزول</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="col-span-3 rounded-lg border border-dashed px-4 py-3 text-sm font-black text-muted-foreground">
                        المزايدة تبدأ بعد الدليل
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-border bg-background/80 px-3 py-2 text-center text-xs font-black sm:text-sm">
                    {step === "auction-won"
                      ? "الفريق الثاني توقف عن النزول · أولوية الإجابة للفريق الأول"
                      : step === "opening"
                        ? "الفريقان يقدّران كم ثانية تكفي"
                        : "كل رقم أقل يرفع المخاطرة ويقرّب المكافأة من 3 نقاط"}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </ChallengeFrame>
    </SharedScreenFrame>
  );
}

function FirstNotePlayback({
  scenario,
  completed = false,
}: {
  scenario: FirstNoteTutorialScenario;
  completed?: boolean;
}) {
  const bars = [0.38, 0.7, 1, 0.55, 0.82, 0.46, 0.9, 0.62, 0.35];
  return (
    <section
      className={cn(
        "space-y-3 rounded-2xl border-2 p-3 text-center sm:p-5",
        completed
          ? "border-sem-success/40 bg-sem-success/10"
          : "border-primary/30 bg-primary/5",
      )}
      data-testid="first-note-playback"
      data-clip-seconds={scenario.outcome.finalBidSeconds}
      data-playback-complete={completed ? "true" : "false"}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-primary/10 px-2 py-1 text-[0.62rem] font-black">
          {completed ? "اكتمل المقطع" : "استماع مشترك"}
        </span>
        <Headphones className="size-5 text-primary" aria-hidden />
        <p className="text-sm font-black sm:text-base">3 ثوانٍ فقط</p>
      </div>
      <div
        className="flex h-12 items-center justify-center gap-1 rounded-lg border border-primary/20 bg-background/70 px-3"
        data-testid="first-note-waveform"
        aria-label="موجة بصرية لمحاكاة مدة الاستماع"
      >
        {bars.map((height, index) => (
          <span
            key={index}
            data-first-note-waveform-bar
            className={cn(
              "w-1.5 rounded-full bg-primary transition-colors sm:w-2",
              completed && "bg-sem-success",
            )}
            style={{ height: `${Math.round(height * 28) + 8}px` }}
          />
        ))}
      </div>
      <div
        className="relative h-3 overflow-hidden rounded-full bg-muted"
        dir="ltr"
      >
        <div
          className="absolute inset-y-0 end-0 w-full origin-right scale-x-0 rounded-full bg-primary"
          data-first-note-progress
          style={completed ? { transform: "scaleX(1)" } : undefined}
        />
      </div>
      <div
        className="flex items-center justify-between text-[0.65rem] font-black text-muted-foreground"
        dir="ltr"
      >
        <span>{completed ? "انتهى" : "0:03"}</span>
        <span>{completed ? "3 ثوانٍ" : "0:00"}</span>
      </div>
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-[0.65rem] font-bold">
        <Lock className="size-3.5" aria-hidden />
        الجميع يسمع نفس المدة · لا توجد نسخة أطول للفريق الآخر
      </div>
      <p className="text-[0.62rem] font-bold text-muted-foreground">
        محاكاة مدة الاستماع — لا يوجد ملف صوتي داخل الشرح.
      </p>
    </section>
  );
}

function FirstNotePhoneScene({
  scenario,
  step,
  compact,
}: {
  scenario: FirstNoteTutorialScenario;
  step: FirstNoteDemoStepId;
  compact: boolean;
}) {
  const steal = step === "steal" || step === "correct";
  const correct = step === "correct";
  return (
    <SharedScreenFrame stand={!compact}>
      <ChallengeFrame
        eyebrow={steal ? "الفريق الثاني" : "الفريق الأول"}
        title={
          correct
            ? "إجابة السرقة صحيحة"
            : steal
              ? "فرصة سرقة واحدة"
              : "الإجابة الأولى"
        }
        progressLabel="3 ثوانٍ"
        progressValue={correct ? 92 : steal ? 78 : 60}
        compact={compact}
      >
        <FirstNoteStealHandoff step={step} />
        <div
          className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,13rem)]"
          data-testid="first-note-phone-scene"
        >
          <div className="mx-auto w-fit" data-testid="first-note-phone">
            <PhoneFrame className="w-[10.8rem] sm:w-[12rem]">
              <div className="space-y-2 text-center">
                <p className="text-[0.62rem] font-black text-muted-foreground">
                  {steal ? "الفريق الثاني" : "الفريق الأول"}
                </p>
                <div className="flex items-center justify-center gap-1 rounded-md bg-brand-gold/10 px-2 py-1 text-[0.62rem] font-black">
                  <Clock3 className="size-3" aria-hidden /> 03.0 ثوانٍ
                </div>
                <Input
                  value={
                    steal
                      ? scenario.stealSubmittedAnswer
                      : scenario.firstSubmittedAnswer
                  }
                  readOnly
                  placeholder="اسم الأغنية"
                  className="h-9 px-1 text-center text-xs"
                  data-testid="first-note-answer-input"
                />
                <Button
                  size="sm"
                  disabled
                  className="h-8 w-full text-[0.62rem] font-black"
                >
                  {correct
                    ? "إجابة صحيحة"
                    : steal
                      ? "إرسال السرقة"
                      : "إرسال الإجابة"}
                </Button>
                {correct ? (
                  <div
                    className="rounded-md bg-emerald-100 px-2 py-1 text-[0.62rem] font-black text-emerald-800"
                    data-testid="first-note-steal-success"
                  >
                    <Check className="mx-auto mb-0.5 size-3" />
                    +1 للفريق الثاني
                  </div>
                ) : (
                  <div
                    className="rounded-md bg-destructive/10 px-2 py-1 text-[0.62rem] font-black text-destructive"
                    data-testid="first-note-wrong"
                  >
                    إجابة خاطئة · فرصة واحدة للفريق الثاني
                  </div>
                )}
              </div>
            </PhoneFrame>
          </div>
          <div
            className="order-last rounded-lg border border-border bg-muted/30 p-2 text-center"
            data-testid="first-note-answer-context"
          >
            {correct ? (
              <>
                <Check
                  className="mx-auto size-4 text-emerald-600"
                  aria-hidden
                />
                <p className="mt-1 text-xs font-black">سرقة ناجحة</p>
                <p className="text-[0.62rem] font-bold text-muted-foreground">
                  نقطة واحدة فقط
                </p>
              </>
            ) : steal ? (
              <>
                <ShieldAlert
                  className="mx-auto size-4 text-brand-gold"
                  aria-hidden
                />
                <p className="mt-1 text-xs font-black">المقطع لم يتغير</p>
                <p className="text-[0.62rem] font-bold text-muted-foreground">
                  3 ثوانٍ · محاولة واحدة
                </p>
              </>
            ) : (
              <>
                <X className="mx-auto size-4 text-destructive" aria-hidden />
                <p className="mt-1 text-xs font-black">الفريق الأول أخطأ</p>
                <p className="text-[0.62rem] font-bold text-muted-foreground">
                  الفريق الثاني يستلم السرقة
                </p>
              </>
            )}
          </div>
        </div>
      </ChallengeFrame>
    </SharedScreenFrame>
  );
}

function FirstNoteStealHandoff({ step }: { step: FirstNoteDemoStepId }) {
  if (step !== "wrong" && step !== "steal" && step !== "correct") return null;
  const correct = step === "correct";
  const active = step === "steal";
  return (
    <section
      className={cn(
        "rounded-xl border-2 p-3 text-center",
        correct
          ? "border-sem-success/40 bg-sem-success/10"
          : active
            ? "border-brand-gold/60 bg-brand-gold/10"
            : "border-destructive/35 bg-destructive/5",
      )}
      data-testid="first-note-steal-handoff"
      data-steal-state={correct ? "success" : active ? "active" : "opened"}
    >
      <p className="text-sm font-black">
        {correct
          ? "الفريق الثاني نجح في السرقة"
          : active
            ? "دور الفريق الثاني الآن · سرقة واحدة"
            : "أولوية الفريق الأول انتهت بعد الإجابة الخاطئة"}
      </p>
      <p className="mt-1 text-[0.68rem] font-bold text-muted-foreground">
        {correct
          ? "+1 نقطة فقط — لا توجد محاولة ثانية"
          : active
            ? "نفس مدة المقطع: 3 ثوانٍ · محاولة واحدة فقط"
            : "الفريق الثاني يحصل على فرصة سرقة واحدة، بلا تمديد للمقطع"}
      </p>
    </section>
  );
}

function FirstNoteReveal({
  scenario,
}: {
  scenario: FirstNoteTutorialScenario;
}) {
  return (
    <section className="space-y-2 text-center" data-testid="first-note-reveal">
      <div className="rounded-xl border border-brand-gold/50 bg-brand-gold/10 p-3">
        <p className="text-[0.65rem] font-black text-muted-foreground">
          الأغنية
        </p>
        <p className="text-2xl font-black">{scenario.title}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-brand-gold/50 bg-brand-gold/10 p-2">
          <Check className="mx-auto size-4 text-brand-gold" aria-hidden />
          <p className="text-xs font-black">الفريق الثاني</p>
          <p className="text-[0.65rem] font-bold text-muted-foreground">
            سرقة ناجحة · +1 نقطة
          </p>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2">
          <X className="mx-auto size-4 text-destructive" aria-hidden />
          <p className="text-xs font-black">الفريق الأول</p>
          <p className="text-[0.65rem] font-bold text-muted-foreground">
            إجابة خاطئة · 0
          </p>
        </div>
      </div>
      <p className="text-xs font-black">
        إجابة صحيحة من 3 ثوانٍ كانت ستمنح 3 نقاط.
      </p>
      <p className="text-xs font-bold text-muted-foreground">
        هذه نتيجة أغنية واحدة؛ التحدي يضم 3 أغنيات.
      </p>
    </section>
  );
}

function FirstNoteNotes({
  scenario,
  step,
  compact,
}: {
  scenario: FirstNoteTutorialScenario;
  step: FirstNoteDemoStepId;
  compact: boolean;
}) {
  return (
    <div
      className={cn(
        "surface-card space-y-2 p-3 text-center",
        compact && "p-2.5",
      )}
      data-testid="first-note-notes"
    >
      <p className="text-xs font-black">
        {step === "playback" || step === "steal"
          ? "المقطع العام هو نفسه للجميع"
          : "مزاد موسيقي، لا اختبار اختيارات"}
      </p>
      <p className="text-[0.68rem] font-bold text-muted-foreground">
        {step === "reveal"
          ? "من أول نغمة = 3 أغنيات في التحدي."
          : `المزايدة النهائية ${scenario.outcome.finalBidSeconds} ثوانٍ · السرقة الناجحة +1.`}
      </p>
      <div className="flex justify-center gap-2 text-[0.62rem] font-black">
        <span className="rounded-full bg-brand-gold/15 px-2 py-1">
          8 ↓ 5 ↓ 3
        </span>
        <span className="rounded-full bg-primary/10 px-2 py-1">نصي حر</span>
      </div>
    </div>
  );
}

function TeamBadge({
  name,
  tone,
  active,
}: {
  name: string;
  tone: "gold" | "blue";
  active: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-[0.62rem] font-black",
        tone === "gold" ? "bg-brand-gold/15" : "bg-primary/10",
        active && "ring-2 ring-brand-gold/50",
      )}
    >
      {name}
    </span>
  );
}
