"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Check, Clock3, Lightbulb, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PhoneFrame,
  SharedScreenFrame,
} from "@/features/how-to-play/components/device-frames";
import type { OneClueTutorialScenario } from "../tutorial-scenario";
import { ONE_CLUE_DEMO_STEPS } from "../one-clue-demo-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";
import { ExplainerCaption, ExplainerControls } from "./explainer-controls";
import type { ExplainerMode } from "./ryo-explainer";

export function OneClueExplainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: OneClueTutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const timeline = useExplainerTimeline(ONE_CLUE_DEMO_STEPS, scope);
  const step = ONE_CLUE_DEMO_STEPS[timeline.index];
  const ids = ONE_CLUE_DEMO_STEPS.map((item) => item.id);
  const at = (id: string) => ids.indexOf(step.id) >= ids.indexOf(id as never);
  const final = step.id === "final";
  const reveal = step.id === "item-reveal";
  const teamAInput = step.id === "team-a-input";
  const phoneFocused =
    teamAInput || step.id === "team-a-lock" || step.id === "team-b-lock";
  const firstLocked = at("team-a-lock") && !final;
  const firstWrong = at("wrong") && !final;
  const secondLocked = at("team-b-lock") && !final;
  const visibleClues = at("third-clue")
    ? 3
    : at("second-clue")
      ? 2
      : at("first-clue")
        ? 1
        : 0;

  useEffect(() => {
    if (timeline.reducedMotion || !scope.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-one-clue-scene]",
        { autoAlpha: 0.75, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.35 },
      );
      if (step.id === "second-clue" || step.id === "third-clue") {
        gsap.fromTo(
          "[data-one-clue-points]",
          { scale: 1.35 },
          {
            scale: 1,
            duration: 0.65,
            ease: "back.out(1.8)",
          },
        );
        gsap.fromTo(
          "[data-one-clue-tradeoff]",
          { autoAlpha: 0, y: -6 },
          { autoAlpha: 1, y: 0, duration: 0.45 },
        );
      }
    }, scope);
    return () => context.revert();
  }, [step.id, timeline.reducedMotion]);

  return (
    <div
      ref={scope}
      dir="rtl"
      data-testid="one-clue-explainer"
      data-demo-step={step.id}
      className={compact ? "space-y-3" : "space-y-5"}
    >
      {mode === "preview" ? (
        <ExplainerControls
          step={timeline.index}
          total={ONE_CLUE_DEMO_STEPS.length}
          caption={step.caption}
          phase={final || reveal ? "resolved" : "simulation"}
          timeline={timeline}
          compact={compact}
          stackOnNarrow
        />
      ) : (
        <ExplainerCaption caption={step.caption} compact={compact} />
      )}

      <div
        data-one-clue-scene
        className={cn(
          "relative grid min-h-[22rem] gap-4",
          phoneFocused
            ? "place-items-center lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,.75fr)] lg:place-items-stretch"
            : "lg:grid-cols-[minmax(0,2fr)_minmax(17rem,.72fr)]",
        )}
      >
        <SharedScreenFrame
          className={cn("min-w-0", phoneFocused && "hidden lg:flex")}
          stand={!compact}
        >
          {final ? (
            <section
              data-testid="one-clue-final"
              className="flex h-full min-h-[19rem] flex-col items-center justify-center gap-4 text-center"
            >
              <p className="text-sm font-black text-muted-foreground">
                النتيجة بعد 3 أسئلة
              </p>
              <div className="flex items-end gap-8">
                <Score
                  name="الفريق الأول"
                  value={scenario.outcome.finalTotals["team-a"]}
                />
                <Score
                  name="الفريق الثاني"
                  value={scenario.outcome.finalTotals["team-b"]}
                  winner
                />
              </div>
              <p className="rounded-full bg-brand-gold/15 px-5 py-2 text-lg font-black text-brand-navy">
                الفريق الثاني يفوز · +1 نقطة مباراة
              </p>
            </section>
          ) : reveal ? (
            <section
              data-testid="one-clue-item-reveal"
              className="flex h-full min-h-[19rem] flex-col items-center justify-center gap-4 text-center"
            >
              <Check className="size-12 text-emerald-500" />
              <p className="text-sm font-black text-muted-foreground">
                الإجابة الصحيحة
              </p>
              <p className="text-4xl font-black">{scenario.acceptedAnswer}</p>
              <p className="text-xl font-black text-brand-navy">
                الفريق الثاني +3
              </p>
            </section>
          ) : (
            <section className="space-y-2 p-1 sm:space-y-3">
              <header className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-black">
                  السؤال 1 من 3
                </span>
                <span
                  data-one-clue-points
                  className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-black"
                >
                  <Clock3 className="size-4" /> 7 ثوانٍ ·{" "}
                  {visibleClues ? scenario.clues[visibleClues - 1].value : 5}{" "}
                  نقاط
                </span>
              </header>
              <h3 className="text-center text-xl font-black sm:text-2xl">
                {scenario.prompt}
              </h3>
              {(step.id === "second-clue" || step.id === "third-clue") && (
                <p
                  data-one-clue-tradeoff
                  className="mx-auto w-fit rounded-full bg-brand-gold/15 px-3 py-1 text-xs font-black text-brand-navy"
                >
                  دليل أوضح · نقاط أقل
                </p>
              )}
              <ol className="space-y-2">
                {scenario.clues.slice(0, visibleClues).map((clue) => (
                  <li
                    key={clue.order}
                    className="rounded-xl border bg-card px-3 py-2 font-black sm:px-4 sm:py-3"
                  >
                    <span className="ms-2 text-xs text-muted-foreground">
                      الدليل {clue.order}
                    </span>
                    {clue.text}
                  </li>
                ))}
                {!visibleClues && (
                  <li className="grid min-h-28 place-items-center rounded-xl border border-dashed text-muted-foreground">
                    <Lightbulb className="size-8" />
                  </li>
                )}
              </ol>
              <div className="grid grid-cols-2 gap-2">
                <TeamState
                  name="الفريق الأول"
                  locked={firstLocked}
                  wrong={firstWrong}
                />
                <TeamState name="الفريق الثاني" locked={secondLocked} />
              </div>
            </section>
          )}
        </SharedScreenFrame>

        <PhoneFrame
          className={cn(
            "lg:static lg:mx-auto lg:block lg:w-full lg:max-w-[19rem]",
            phoneFocused ? "static z-10 w-full max-w-[15rem]" : "hidden",
            (final || reveal) && "hidden lg:block",
          )}
        >
          <div className="flex min-h-[24rem] flex-col justify-center gap-3 p-3 text-center text-sm lg:text-base">
            {final ? (
              <>
                <p className="text-sm font-black text-muted-foreground">
                  نتيجة التحدي
                </p>
                <p className="text-3xl font-black text-brand-navy">
                  فوز الفريق الثاني
                </p>
              </>
            ) : secondLocked ? (
              <>
                <Lock className="mx-auto size-10 text-brand-gold" />
                <p className="font-black">
                  تم تثبيت: {scenario.secondSubmittedAnswer}
                </p>
                <p className="text-sm text-muted-foreground">
                  بانتظار انتهاء 7 ثوانٍ
                </p>
              </>
            ) : firstWrong ? (
              <>
                <X className="mx-auto size-10 text-destructive" />
                <p className="font-black">إجابة غير صحيحة</p>
                <p className="text-sm text-muted-foreground">
                  خرجتم من هذا السؤال
                </p>
              </>
            ) : firstLocked ? (
              <>
                <Lock className="mx-auto size-10 text-brand-gold" />
                <p className="font-black">
                  تم تثبيت: {scenario.firstSubmittedAnswer}
                </p>
                <p className="text-sm text-muted-foreground">
                  بانتظار انتهاء 7 ثوانٍ · إجابة واحدة فقط
                </p>
              </>
            ) : teamAInput ? (
              <>
                <p className="text-sm font-black text-muted-foreground">
                  المجيب المعيّن · الفريق الأول
                </p>
                <div className="rounded-xl border-2 px-3 py-4 text-lg font-black">
                  {scenario.firstSubmittedAnswer}
                </div>
                <div className="rounded-xl bg-primary px-3 py-3 font-black text-primary-foreground">
                  قفل الإجابة
                </div>
                <p className="text-xs text-muted-foreground">
                  الخصم لا يرى إجابتكم
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-black text-muted-foreground">
                  المجيب المعيّن
                </p>
                <div className="rounded-xl border-2 px-3 py-4 font-black">
                  اكتب إجابة فريقك
                </div>
                <div className="rounded-xl bg-primary px-3 py-3 font-black text-primary-foreground">
                  قفل الإجابة
                </div>
              </>
            )}
          </div>
        </PhoneFrame>
      </div>
    </div>
  );
}

function TeamState({
  name,
  locked = false,
  wrong = false,
}: {
  name: string;
  locked?: boolean;
  wrong?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-2 text-center sm:p-3",
        wrong && "border-destructive/50 bg-destructive/5",
      )}
    >
      <p className="font-black">{name}</p>
      <p className="mt-1 text-xs font-bold text-muted-foreground">
        {wrong ? "خطأ — خرج من السؤال" : locked ? "تم تثبيت الإجابة" : "يفكر…"}
      </p>
    </div>
  );
}

function Score({
  name,
  value,
  winner = false,
}: {
  name: string;
  value: number;
  winner?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-6 py-4",
        winner && "border-brand-gold bg-brand-gold/10",
      )}
    >
      <p className="text-sm font-black text-muted-foreground">{name}</p>
      <p className="akwaan-numeral text-4xl font-black">{value}</p>
    </div>
  );
}
