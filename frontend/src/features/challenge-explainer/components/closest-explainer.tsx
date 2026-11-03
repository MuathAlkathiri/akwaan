"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import gsap from "gsap";
import { Lock, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SharedScreenFrame,
  PhoneFrame,
} from "@/features/how-to-play/components/device-frames";
import { cn } from "@/lib/utils";
import { CLOSEST_DEMO_STEPS } from "../closest-demo-scenario";
import type { ClosestTutorialScenario } from "../tutorial-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";
import { ExplainerCaption, ExplainerControls } from "./explainer-controls";
import type { ExplainerMode } from "./ryo-explainer";

const idx = Object.fromEntries(
  CLOSEST_DEMO_STEPS.map((step, index) => [step.id, index]),
) as Record<(typeof CLOSEST_DEMO_STEPS)[number]["id"], number>;

const shown = (value: number, unit?: string) =>
  `${value.toLocaleString("ar-SA")} ${unit ?? ""}`.trim();

const DEMO_SLIDER = { min: 60, max: 200, step: 5 } as const;
const seedEstimate =
  DEMO_SLIDER.min +
  Math.round(
    ((DEMO_SLIDER.min + DEMO_SLIDER.max) / 2 - DEMO_SLIDER.min) /
      DEMO_SLIDER.step,
  ) *
    DEMO_SLIDER.step;
const sliderPercent = (value: number) =>
  ((value - DEMO_SLIDER.min) / (DEMO_SLIDER.max - DEMO_SLIDER.min)) * 100;

interface DemoEstimate {
  value: number | null;
  moving: boolean;
  confirmed: boolean;
}

const unansweredEstimate = (): DemoEstimate => ({
  value: null,
  moving: false,
  confirmed: false,
});

export function ClosestExplainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: ClosestTutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const reveal = useRef<HTMLDivElement | null>(null);
  const [teamAControl, setTeamAControl] =
    useState<DemoEstimate>(unansweredEstimate);
  const [teamBControl, setTeamBControl] =
    useState<DemoEstimate>(unansweredEstimate);
  const timeline = useExplainerTimeline(CLOSEST_DEMO_STEPS, scope);
  const at = timeline.index;
  const step = CLOSEST_DEMO_STEPS[at];
  const aLocked = at >= idx["team-a-locked"];
  const bLocked = at >= idx["team-b-locked"];
  const revealed = at >= idx.reveal;
  const finished = at >= idx.outcome;
  const mobileScene =
    at === idx.question
      ? "question"
      : at <= idx["both-locked"]
        ? "answers"
        : "reveal";
  useEffect(() => {
    const locked = (value: number): DemoEstimate => ({
      value,
      moving: false,
      confirmed: true,
    });
    const setStaticState = () => {
      setTeamAControl(
        aLocked ? locked(scenario.teamAEstimate) : unansweredEstimate(),
      );
      setTeamBControl(
        bLocked ? locked(scenario.teamBEstimate) : unansweredEstimate(),
      );
    };

    if (timeline.reducedMotion || ![1, 2].includes(at)) {
      setStaticState();
      return;
    }

    const activeTeam = at === idx["team-a-locked"] ? "team-a" : "team-b";
    const target =
      activeTeam === "team-a" ? scenario.teamAEstimate : scenario.teamBEstimate;
    const update = activeTeam === "team-a" ? setTeamAControl : setTeamBControl;
    setTeamAControl(
      activeTeam === "team-a"
        ? { value: seedEstimate, moving: true, confirmed: false }
        : locked(scenario.teamAEstimate),
    );
    setTeamBControl(
      activeTeam === "team-b"
        ? { value: seedEstimate, moving: true, confirmed: false }
        : unansweredEstimate(),
    );

    const proxy = { value: seedEstimate };
    const context = gsap.context(() => {
      gsap
        .timeline()
        .to(proxy, {
          value: target,
          duration: 1.05,
          ease: "power2.inOut",
          onUpdate: () => {
            const value =
              Math.round(proxy.value / DEMO_SLIDER.step) * DEMO_SLIDER.step;
            update({ value, moving: true, confirmed: false });
          },
        })
        .to(`[data-confirm-action="${activeTeam}"]`, {
          scale: 1.05,
          duration: 0.18,
          ease: "power2.out",
          yoyo: true,
          repeat: 1,
          onStart: () =>
            update({ value: target, moving: false, confirmed: false }),
          onComplete: () => update(locked(target)),
        });
    }, scope);
    return () => context.revert();
  }, [
    aLocked,
    at,
    bLocked,
    scenario.teamAEstimate,
    scenario.teamBEstimate,
    timeline.reducedMotion,
  ]);

  useEffect(() => {
    if (!revealed || !reveal.current || timeline.reducedMotion) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-distance-marker]",
        { scale: 0, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          stagger: 0.12,
          duration: 0.45,
          ease: "back.out(1.7)",
        },
      );
    }, reveal);
    return () => context.revert();
  }, [revealed, timeline.reducedMotion]);

  useEffect(() => {
    if (
      timeline.reducedMotion ||
      typeof window === "undefined" ||
      !window.matchMedia?.("(max-width: 1023px)").matches
    ) {
      return;
    }
    const context = gsap.context(() => {
      gsap.fromTo(
        `[data-mobile-scene="${mobileScene}"]`,
        { autoAlpha: 0, y: 14 },
        { autoAlpha: 1, y: 0, duration: 0.42, ease: "power2.out" },
      );
    }, scope);
    return () => context.revert();
  }, [mobileScene, timeline.reducedMotion]);

  useEffect(() => {
    if (!finished || timeline.reducedMotion) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-winner-payoff]",
        { scale: 0.94, y: 10, boxShadow: "0 0 0 0 rgba(22, 163, 74, 0)" },
        {
          scale: 1,
          y: 0,
          boxShadow: "0 0 0 5px rgba(22, 163, 74, 0.12)",
          duration: 0.6,
          ease: "back.out(1.5)",
        },
      );
    }, scope);
    return () => context.revert();
  }, [finished, timeline.reducedMotion]);

  const min = Math.min(
    scenario.teamAEstimate,
    scenario.teamBEstimate,
    scenario.correctValue,
  );
  const max = Math.max(
    scenario.teamAEstimate,
    scenario.teamBEstimate,
    scenario.correctValue,
  );
  const pad = Math.max(10, (max - min) * 0.25);
  const position = (value: number) =>
    `${((value - (min - pad)) / (max - min + pad * 2)) * 100}%`;

  return (
    <div
      ref={scope}
      dir="rtl"
      data-testid="closest-explainer"
      data-mobile-scene={mobileScene}
      className="space-y-3"
    >
      {mode === "preview" ? (
        <ExplainerControls
          step={at}
          total={CLOSEST_DEMO_STEPS.length}
          caption={step.caption}
          phase={step.phase}
          timeline={timeline}
          compact={compact}
        />
      ) : (
        <ExplainerCaption caption={step.caption} compact={compact} />
      )}
      <div
        data-testid="closest-scene-stage"
        className={cn(
          "grid min-h-[29rem] content-start gap-3 lg:min-h-0",
          !compact && "lg:grid-cols-[1.6fr_1fr]",
        )}
      >
        <SharedScreenFrame
          stand={!compact}
          className={cn(mobileScene === "answers" ? "hidden lg:flex" : "flex")}
        >
          <div
            data-mobile-scene={
              mobileScene === "question" ? "question" : "reveal"
            }
            className="space-y-2 p-2 text-center sm:space-y-4 sm:p-4"
            data-testid="closest-shared-screen"
          >
            <p className="text-xs font-black text-muted-foreground">مين أقرب</p>
            <h3
              className={cn(
                "font-black",
                compact ? "text-lg" : "text-xl sm:text-2xl",
              )}
            >
              {scenario.prompt}
            </h3>
            {!revealed ? (
              <div className="grid grid-cols-2 gap-2">
                <LockState
                  name="الفريق الأول"
                  team="team-a"
                  locked={teamAControl.confirmed}
                  value={scenario.teamAEstimate}
                  unit={scenario.unit}
                />
                <LockState
                  name="الفريق الثاني"
                  team="team-b"
                  locked={teamBControl.confirmed}
                  value={scenario.teamBEstimate}
                  unit={scenario.unit}
                />
              </div>
            ) : (
              <div
                ref={reveal}
                className="space-y-2 sm:space-y-4"
                data-testid="closest-tutorial-reveal"
              >
                <div className="rounded-xl bg-brand-gold/15 p-2 sm:p-3">
                  <Target className="mx-auto size-5" />
                  <p className="text-xs font-bold">الإجابة الصحيحة</p>
                  <p className="akwaan-numeral text-2xl font-black sm:text-3xl">
                    {shown(scenario.correctValue, scenario.unit)}
                  </p>
                </div>
                <div
                  className="relative mx-2 h-14 sm:mx-3 sm:h-20"
                  dir="ltr"
                  aria-label="مقارنة التقديرين بالإجابة الصحيحة"
                >
                  <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-200" />
                  {[
                    {
                      id: "a",
                      value: scenario.teamAEstimate,
                      color: "bg-blue-500",
                      label: "الأول",
                      labelPosition: "bottom-0",
                    },
                    {
                      id: "truth",
                      value: scenario.correctValue,
                      color: "bg-brand-gold",
                      label: "الصحيح",
                      labelPosition: "top-0",
                    },
                    {
                      id: "b",
                      value: scenario.teamBEstimate,
                      color: "bg-rose-500",
                      label: "الثاني",
                      labelPosition: "bottom-0",
                    },
                  ].map((marker) => (
                    <span
                      key={marker.id}
                      data-distance-marker
                      className="absolute inset-y-0 -translate-x-1/2"
                      style={{ left: position(marker.value) }}
                      aria-label={`${marker.label}: ${shown(marker.value, scenario.unit)}`}
                    >
                      <span
                        className={cn(
                          "absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow",
                          marker.color,
                        )}
                      />
                      <span
                        className={cn(
                          "akwaan-numeral absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-background/95 px-1.5 py-0.5 text-[0.65rem] font-black shadow-sm",
                          marker.labelPosition,
                        )}
                      >
                        {marker.label} · {shown(marker.value, scenario.unit)}
                      </span>
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm font-black">
                  <p>
                    الأول: يبعد{" "}
                    {shown(scenario.outcome.teamADistance, scenario.unit)}
                  </p>
                  <p>
                    الثاني: يبعد{" "}
                    {shown(scenario.outcome.teamBDistance, scenario.unit)}
                  </p>
                </div>
                {finished && (
                  <div
                    data-testid="closest-tutorial-outcome"
                    data-winner-payoff
                    className="rounded-xl border border-sem-success/20 bg-sem-success/15 p-2 font-black sm:p-3"
                  >
                    <Trophy
                      className="mx-auto mb-1 size-5 text-sem-success"
                      aria-hidden
                    />
                    <p className="text-base">
                      {scenario.outcome.tie
                        ? "تعادل — لا تُضاف نقطة إلى حصيلة التحدي"
                        : `${scenario.outcome.winnerTeam === "team-a" ? "الفريق الأول" : "الفريق الثاني"} هو الأقرب`}
                    </p>
                    {!scenario.outcome.tie && (
                      <p className="mt-1 text-sm text-sem-success">
                        +1 في حصيلة التحدي الداخلية
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      بعد الأسئلة الثلاثة فقط، فائز التحدي يأخذ نقطة المباراة.
                      هذا المثال وحده لا يغيّر نتيجة المباراة.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </SharedScreenFrame>
        <div
          data-testid="closest-answer-scene"
          data-mobile-scene="answers"
          className={cn(
            "grid-cols-2 gap-2",
            mobileScene === "answers" ? "grid" : "hidden lg:grid",
          )}
        >
          <div className="col-span-2 rounded-xl border bg-muted/40 p-3 text-center lg:hidden">
            <p className="text-[0.65rem] font-black text-muted-foreground">
              مين أقرب
            </p>
            <p className="mt-1 text-base font-black leading-6">
              {scenario.prompt}
            </p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">
              يثبّت كل فريق تقديره بسرية
            </p>
          </div>
          <EstimatePhone
            name="الفريق الأول"
            team="team-a"
            unit={scenario.unit}
            estimate={teamAControl}
          />
          <EstimatePhone
            name="الفريق الثاني"
            team="team-b"
            unit={scenario.unit}
            estimate={teamBControl}
          />
        </div>
      </div>
    </div>
  );
}

function LockState({
  name,
  team,
  locked,
  value,
  unit,
}: {
  name: string;
  team: "team-a" | "team-b";
  locked: boolean;
  value: number;
  unit?: string;
}) {
  return (
    <div
      data-lock-card={team}
      className={cn(
        "rounded-xl border p-2 transition-colors",
        locked && "border-sem-success/40 bg-sem-success/10",
      )}
    >
      <p className="text-xs font-bold">{name}</p>
      <p className="font-black">{locked ? "تم التثبيت" : "يفكر…"}</p>
      <p className="text-xs text-muted-foreground">
        {locked ? shown(value, unit) : "التقدير سري"}
      </p>
    </div>
  );
}

function EstimatePhone({
  name,
  team,
  unit,
  estimate,
}: {
  name: string;
  team: "team-a" | "team-b";
  unit?: string;
  estimate: DemoEstimate;
}) {
  const displayedValue = estimate.value ?? seedEstimate;
  const progress = sliderPercent(displayedValue);

  return (
    <PhoneFrame>
      <div
        data-lock-card={team}
        data-testid={`closest-phone-${team}`}
        data-slider-moving={estimate.moving ? "true" : "false"}
        data-estimate-confirmed={estimate.confirmed ? "true" : "false"}
        className="w-full space-y-2 px-1.5 text-center"
      >
        <p className="text-xs font-black">{name}</p>
        <div className="rounded-lg bg-[#fff6df] px-2 py-2 text-[#10253f]">
          <p className="text-[0.62rem] font-bold text-[#10253f]/70">
            حرّك المؤشر ثم أكّد
          </p>
          <div className="relative pt-10">
            {estimate.value !== null && (
              <div
                data-testid={`closest-slider-value-${team}`}
                className="akwaan-numeral absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#10253f] px-2 py-1 text-[0.68rem] font-black text-white shadow-md"
                style={{ left: `${Math.min(82, Math.max(18, progress))}%` }}
              >
                {shown(estimate.value, unit)}
              </div>
            )}
            <input
              type="range"
              dir="ltr"
              tabIndex={-1}
              aria-label={`شريط تقدير ${name}`}
              aria-valuetext={
                estimate.value === null
                  ? "لم يُختَر تقدير بعد"
                  : shown(estimate.value, unit)
              }
              min={DEMO_SLIDER.min}
              max={DEMO_SLIDER.max}
              step={DEMO_SLIDER.step}
              value={displayedValue}
              readOnly
              data-testid={`closest-tutorial-slider-${team}`}
              className="closest-slider h-10 w-full pointer-events-none"
              style={
                {
                  "--closest-progress": `${progress}%`,
                } as CSSProperties
              }
            />
          </div>
          <div
            dir="ltr"
            className="akwaan-numeral flex justify-between text-[0.58rem] font-black"
          >
            <span>{shown(DEMO_SLIDER.min, unit)}</span>
            <span>{shown(DEMO_SLIDER.max, unit)}</span>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled
          data-confirm-action={team}
          className={cn(
            "h-8 w-full gap-1 px-1 text-[0.68rem] font-black disabled:opacity-100",
            estimate.confirmed
              ? "bg-sem-success text-white"
              : "bg-brand-navy text-white",
          )}
        >
          {estimate.confirmed && <Lock className="size-3.5" aria-hidden />}
          {estimate.confirmed ? (
            <>
              <span className="sm:hidden">تم التثبيت</span>
              <span className="hidden sm:inline">تم تثبيت التقدير</span>
            </>
          ) : (
            "تأكيد الإجابة"
          )}
        </Button>
      </div>
    </PhoneFrame>
  );
}
