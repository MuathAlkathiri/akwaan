"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { Check, MousePointer2, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChallengeFrame } from "@/features/live-game-session/match/components/challenge-frame";
import { ChallengeCountdown } from "@/features/live-game-session/match/components/challenge-countdown";
import { SharedScreenFrame } from "@/features/how-to-play/components/device-frames";
import type { ExplainerMode } from "./ryo-explainer";
import { ExplainerCaption, ExplainerControls } from "./explainer-controls";
import type { OddPieceLegacyDemoStepId } from "../odd-piece-demo-scenario";
import {
  ODD_PIECE_V1_DEMO_STEPS,
  ODD_PIECE_V2_DEMO_STEPS,
} from "../odd-piece-demo-scenario";
import type {
  OddPieceHotspotTutorialScenario,
  OddPieceLegacyTutorialScenario,
  OddPieceTutorialScenario,
} from "../tutorial-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";

export function OddPieceExplainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: OddPieceTutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  if (scenario.version === 2) {
    return (
      <OddPieceHotspotExplainer
        scenario={scenario as OddPieceHotspotTutorialScenario}
        compact={compact}
        mode={mode}
      />
    );
  }
  return (
    <OddPieceLegacyExplainer
      scenario={scenario as OddPieceLegacyTutorialScenario}
      compact={compact}
      mode={mode}
    />
  );
}

/**
 * Genuine Odd Piece V2 Single-Image Hotspot GSAP Tutorial
 */
function OddPieceHotspotExplainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: OddPieceHotspotTutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const [comparisonMode, setComparisonMode] = useState<
    "modified" | "original" | "split"
  >("modified");
  const [inspectionPhoneFocus, setInspectionPhoneFocus] = useState(false);
  const [revealPhase, setRevealPhase] = useState<
    "location" | "detail" | "result"
  >("location");
  const [phoneZoom, setPhoneZoom] = useState(1);
  const [phonePan, setPhonePan] = useState({ x: 0, y: 0 });

  const timeline = useExplainerTimeline(ODD_PIECE_V2_DEMO_STEPS, scope, {
    visibilityThreshold: 0.25,
  });
  const step = ODD_PIECE_V2_DEMO_STEPS[timeline.index];
  const isAnswerScene = [
    "claim",
    "team-1-answering",
    "team-1-wrong",
    "handoff",
    "team-2-correct",
  ].includes(step.id);
  const sceneCaption = compact
    ? ((
        {
          inspection: inspectionPhoneFocus
            ? "تكبير الهاتف متاح للفريقين قبل حجز الدور."
            : "استكشفوا الصورة نفسها قبل حجز الدور.",
          claim: "الفريق الأول حجز الفرصة.",
          "team-1-answering": "للفريق الأول 5 ثوانٍ لتحديد الموضع.",
          "team-1-wrong": "اختيار غير صحيح؛ انتقلت الفرصة.",
          handoff: "الفريق الثاني يملك 5 ثوانٍ الآن.",
          "team-2-correct": "الفريق الثاني التقط الموضع الصحيح.",
          reveal: "ظهر موضع العجلة الدخيلة بعد الحسم.",
          "three-puzzles": "الفريق الثاني +1 نقطة اللغز.",
        } as Record<string, string>
      )[step.id] ?? step.caption)
    : step.caption;

  const team1Tap = scenario.team1Tap ??
    scenario.wrongPoint ?? { x: 0.25, y: 0.72 };
  const team2Tap = scenario.team2Tap ??
    scenario.correctPoint ?? { x: 0.62, y: 0.44 };

  // GSAP animation on step change
  useEffect(() => {
    if (timeline.reducedMotion || !scope.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-odd-piece-v2-scene]",
        { autoAlpha: 0.85, y: 6 },
        { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" },
      );

      if (step.id === "inspection") {
        const pan = { x: 0, y: 0, zoom: 1 };
        gsap.to(pan, {
          duration: 1.5,
          repeat: 1,
          yoyo: true,
          onUpdate: function () {
            setPhoneZoom(pan.zoom);
            setPhonePan({ x: pan.x, y: pan.y });
          },
          zoom: 1.4,
          x: 8,
          y: -6,
        });
      } else {
        setPhoneZoom(1);
        setPhonePan({ x: 0, y: 0 });
      }

      if (step.id === "team-1-wrong") {
        gsap.fromTo(
          "[data-wrong-marker]",
          { scale: 0, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2)" },
        );
      }
      if (step.id === "team-2-correct") {
        gsap.fromTo(
          "[data-correct-marker]",
          { scale: 0, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)" },
        );
      }
      if (step.id === "reveal") {
        gsap.fromTo(
          "[data-reveal-hotspot]",
          { opacity: 0, scale: 0.95 },
          { opacity: 1, scale: 1, duration: 0.5, ease: "power2.out" },
        );
      }
    }, scope);
    return () => context.revert();
  }, [step.id, timeline.reducedMotion]);

  // The approved Reveal teaches the proof in the same order as the live
  // surface: modified image + hotspot first, then a like-for-like comparison.
  // Reduced-motion users keep the first state until they choose a comparison
  // control, rather than being moved automatically.
  useEffect(() => {
    if (step.id !== "reveal") {
      setComparisonMode(
        step.id === "three-puzzles" &&
          scenario.tutorialRevealMode !== "hotspot-detail"
          ? "split"
          : "modified",
      );
      return;
    }
    setComparisonMode("modified");
    if (
      timeline.reducedMotion ||
      scenario.tutorialRevealMode === "hotspot-detail"
    )
      return;
    const transition = gsap.delayedCall(2.2, () => setComparisonMode("split"));
    return () => {
      transition.kill();
    };
  }, [scenario.tutorialRevealMode, step.id, timeline.reducedMotion]);

  useEffect(() => {
    setInspectionPhoneFocus(false);
    if (step.id !== "inspection") return;
    if (timeline.reducedMotion) return;
    const focusTransition = gsap.delayedCall(1.35, () =>
      setInspectionPhoneFocus(true),
    );
    return () => {
      focusTransition.kill();
    };
  }, [step.id, timeline.reducedMotion]);

  useEffect(() => {
    if (step.id === "three-puzzles") {
      setRevealPhase("result");
      return;
    }
    if (step.id !== "reveal") {
      setRevealPhase("location");
      return;
    }
    setRevealPhase("location");
    if (timeline.reducedMotion) {
      setRevealPhase("detail");
      return;
    }
    const detailTransition = gsap.delayedCall(1.7, () =>
      setRevealPhase("detail"),
    );
    const resultTransition = gsap.delayedCall(3.7, () =>
      setRevealPhase("result"),
    );
    return () => {
      detailTransition.kill();
      resultTransition.kill();
    };
  }, [step.id, timeline.reducedMotion]);

  // Center of hotspot polygon
  const hotspotCenter = useMemo(() => {
    const polygon = scenario.hotspot?.polygon ?? [];
    if (polygon.length === 0) return { x: 0.6, y: 0.4 };
    const sum = polygon.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 },
    );
    return {
      x: sum.x / polygon.length,
      y: sum.y / polygon.length,
    };
  }, [scenario.hotspot]);

  const isResolved = step.id === "reveal" || step.id === "three-puzzles";
  const isInspectionPhoneFocus =
    step.id === "inspection" && inspectionPhoneFocus;
  const showSharedScreen = !isAnswerScene && !isInspectionPhoneFocus;
  const showPhoneSurface =
    !isResolved && (isAnswerScene || isInspectionPhoneFocus);
  const singleSurface = isAnswerScene || isResolved || isInspectionPhoneFocus;
  const phoneTeamLabel =
    step.id === "handoff" || step.id === "team-2-correct"
      ? "الفريق الثاني"
      : "الفريق الأول";
  const phoneHasDeadline =
    step.id === "team-1-answering" || step.id === "handoff";
  const usesOriginalComparison =
    scenario.tutorialRevealMode !== "hotspot-detail";

  return (
    <div
      ref={scope}
      dir="rtl"
      data-testid="odd-piece-explainer"
      data-demo-step={step.id}
      data-comparison-mode={comparisonMode}
      data-variant={compact ? "compact" : "full"}
      className={cn("w-full", compact ? "space-y-3" : "space-y-6")}
    >
      {mode === "preview" ? (
        <ExplainerControls
          step={timeline.index}
          total={ODD_PIECE_V2_DEMO_STEPS.length}
          caption={sceneCaption}
          phase={isResolved ? "resolved" : "simulation"}
          timeline={timeline}
          compact={compact}
          stackOnNarrow
        />
      ) : (
        <ExplainerCaption caption={sceneCaption} compact={compact} />
      )}

      <div
        data-testid="odd-piece-fixture-disclaimer"
        className="rounded-lg border border-brand-gold/30 bg-brand-gold/5 px-2.5 py-1.5 text-center text-[0.68rem] font-bold text-muted-foreground"
        role="note"
      >
        معاينة تجريبية — ليست صورة سؤال إنتاجية
      </div>

      <div
        data-odd-piece-v2-scene
        data-inspection-focus={
          isInspectionPhoneFocus
            ? "phone"
            : showSharedScreen
              ? "shared"
              : undefined
        }
        className={cn(
          "grid grid-cols-1 gap-3 lg:gap-5",
          singleSurface
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.34fr)]",
        )}
      >
        {/* Shared Screen Perspective */}
        {showSharedScreen && (
          <SharedScreenFrame className="order-1" stand={!compact}>
            <ChallengeFrame
              eyebrow="القطعة الدخيلة V2"
              title={
                step.id === "three-puzzles"
                  ? "نتيجة اللغز الأول"
                  : scenario.prompt
              }
              progressLabel="اللغز 1 من 3"
              progressValue={
                step.id === "inspection"
                  ? 15
                  : step.id === "claim"
                    ? 30
                    : step.id === "team-1-answering"
                      ? 45
                      : step.id === "team-1-wrong"
                        ? 55
                        : step.id === "handoff"
                          ? 65
                          : step.id === "team-2-correct"
                            ? 80
                            : 100
              }
              aside={
                step.id === "inspection" ? (
                  <ChallengeCountdown remainingMs={3000} />
                ) : null
              }
              compact={compact}
            >
              <div className="space-y-3" data-testid="odd-piece-v2-tutorial">
                {/* One concise scene status; the frame header carries the question. */}
                {!isResolved && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-gold/35 bg-brand-gold/10 px-3 py-1.5 text-[0.7rem] font-black">
                    <span>
                      {step.id === "inspection"
                        ? "الصورة نفسها أمام الفريقين"
                        : step.id === "claim"
                          ? "الفريق الأول حجز الدور"
                          : step.id === "team-1-answering"
                            ? "الفريق الأول يحدد الآن"
                            : step.id === "team-1-wrong"
                              ? "المحاولة الأولى ضاعت"
                              : step.id === "handoff"
                                ? "الدور الآن للفريق الثاني"
                                : "الفريق الثاني يحدد الآن"}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[0.65rem]",
                        step.id === "claim" || step.id === "team-1-answering"
                          ? "bg-brand-gold text-brand-dark"
                          : step.id === "handoff" ||
                              step.id === "team-2-correct"
                            ? "bg-brand-gold text-brand-dark"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {step.id === "inspection"
                        ? "استكشاف"
                        : step.id === "claim" || step.id === "team-1-answering"
                          ? "الفريق الأول"
                          : step.id === "team-1-wrong"
                            ? "محاولة ضائعة"
                            : step.id === "handoff"
                              ? "الفريق الثاني · 5 ثوانٍ"
                              : "إجابة صحيحة"}
                    </span>
                  </div>
                )}

                {step.id === "inspection" && (
                  <div
                    className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-background/80 px-2 py-1.5 text-center text-[0.68rem] font-black"
                    data-testid="odd-piece-v2-team-identities"
                  >
                    <span className="rounded-lg bg-brand-gold/15 px-2 py-1">
                      الفريق الأول · 0
                    </span>
                    <span className="rounded-lg bg-muted px-2 py-1">
                      الفريق الثاني · 0
                    </span>
                  </div>
                )}

                {/* The Main Single Vehicle Image Viewport */}
                {step.id !== "three-puzzles" &&
                  !(step.id === "reveal" && revealPhase === "result") && (
                    <div
                      className="relative w-full overflow-hidden rounded-xl border-2 border-border bg-black/90"
                      style={{
                        aspectRatio:
                          isResolved && compact
                            ? step.id === "reveal"
                              ? revealPhase === "detail"
                                ? "4.8"
                                : "2.4"
                              : "3.8"
                            : `${scenario.modifiedImage.width}/${scenario.modifiedImage.height}`,
                      }}
                      data-testid="odd-piece-v2-viewport"
                    >
                      {isResolved && comparisonMode === "split" ? (
                        <div className="absolute inset-0 grid grid-cols-2 gap-1 bg-background p-1">
                          <div className="relative min-w-0 overflow-hidden rounded-lg bg-black/90">
                            <img
                              src={scenario.modifiedImage.media.assets[0].url}
                              alt="الصورة المعدلة مع موضع القطعة الدخيلة"
                              className="block h-full w-full object-contain"
                              draggable={false}
                            />
                            <svg
                              className="pointer-events-none absolute inset-0 h-full w-full"
                              viewBox="0 0 1 1"
                              preserveAspectRatio="none"
                              aria-hidden="true"
                            >
                              <polygon
                                points={scenario.hotspot.polygon
                                  .map((point) => `${point.x},${point.y}`)
                                  .join(" ")}
                                fill="rgba(239, 68, 68, 0.35)"
                                stroke="rgb(239, 68, 68)"
                                strokeWidth={0.007}
                              />
                            </svg>
                            <span className="absolute bottom-1 start-1 rounded bg-rose-600/90 px-1.5 py-0.5 text-[0.6rem] font-black text-white">
                              معدّلة + موضع الحل
                            </span>
                          </div>
                          <div className="relative min-w-0 overflow-hidden rounded-lg bg-black/90">
                            <img
                              src={scenario.originalImage.media.assets[0].url}
                              alt="الصورة الأصلية قبل التعديل"
                              className="block h-full w-full object-contain"
                              draggable={false}
                            />
                            <span className="absolute bottom-1 start-1 rounded bg-brand-gold/95 px-1.5 py-0.5 text-[0.6rem] font-black text-brand-dark">
                              أصلية
                            </span>
                          </div>
                        </div>
                      ) : (
                        <img
                          src={
                            isResolved && comparisonMode === "original"
                              ? scenario.originalImage.media.assets[0].url
                              : scenario.modifiedImage.media.assets[0].url
                          }
                          alt={
                            isResolved && comparisonMode === "original"
                              ? "الصورة الأصلية"
                              : "صورة السيارة المعدلة"
                          }
                          className="absolute inset-0 block h-full w-full object-contain transition-opacity duration-300"
                          draggable={false}
                        />
                      )}

                      {/* Team 1 Wrong Tap Marker */}
                      {step.id === "team-1-wrong" && (
                        <div
                          data-wrong-marker
                          data-testid="odd-piece-v2-team-1-wrong"
                          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                          style={{
                            left: `${team1Tap.x * 100}%`,
                            top: `${team1Tap.y * 100}%`,
                          }}
                        >
                          <div className="flex size-9 items-center justify-center rounded-full bg-rose-600/90 text-white shadow-lg ring-4 ring-rose-400/50 animate-bounce">
                            <X className="size-5 stroke-[3]" />
                          </div>
                        </div>
                      )}

                      {/* Team 2 Correct Tap Marker */}
                      {step.id === "team-2-correct" && (
                        <div
                          data-correct-marker
                          data-testid="odd-piece-v2-team-2-correct"
                          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                          style={{
                            left: `${team2Tap.x * 100}%`,
                            top: `${team2Tap.y * 100}%`,
                          }}
                        >
                          <div className="flex size-9 items-center justify-center rounded-full bg-emerald-600/90 text-white shadow-lg ring-4 ring-emerald-400/50">
                            <Check className="size-5 stroke-[3]" />
                          </div>
                        </div>
                      )}

                      {/* Authoritative Reveal Overlay */}
                      {isResolved && comparisonMode === "modified" && (
                        <>
                          <svg
                            data-reveal-hotspot
                            data-testid="odd-piece-v2-hotspot"
                            className="absolute inset-0 h-full w-full pointer-events-none"
                            viewBox="0 0 1 1"
                            preserveAspectRatio="none"
                            style={{
                              filter:
                                "drop-shadow(0 0 3px rgba(251, 113, 133, 0.95)) drop-shadow(0 0 8px rgba(244, 63, 94, 0.65))",
                            }}
                          >
                            <polygon
                              points={scenario.hotspot.polygon
                                .map((p) => `${p.x},${p.y}`)
                                .join(" ")}
                              fill="none"
                              stroke="rgb(251, 113, 133)"
                              strokeWidth={0.009}
                              strokeLinejoin="round"
                              className="animate-pulse"
                            />
                          </svg>
                        </>
                      )}
                    </div>
                  )}

                {/* Reveal Controls & Comparison Toggle */}
                {isResolved &&
                  step.id === "reveal" &&
                  revealPhase !== "result" && (
                    <div
                      className={cn(compact ? "space-y-1.5" : "space-y-3")}
                      data-testid="odd-piece-v2-reveal"
                    >
                      <div
                        className={cn(
                          "flex flex-wrap items-center justify-center pt-1",
                          compact ? "gap-1" : "gap-2",
                        )}
                        data-testid="odd-piece-v2-comparison"
                      >
                        {comparisonMode !== "original" && (
                          <div
                            className="order-first basis-full rounded-lg border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-center text-[0.68rem] font-black text-rose-700 dark:text-rose-300"
                            data-testid="odd-piece-v2-hotspot-pin"
                          >
                            القطعة الدخيلة: {scenario.intruderPartLabel}
                          </div>
                        )}
                        {usesOriginalComparison ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                comparisonMode === "modified"
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => setComparisonMode("modified")}
                              className={cn(
                                "font-bold text-xs",
                                compact && "h-8 px-2 text-[0.68rem]",
                              )}
                              data-testid="odd-piece-v2-toggle-modified"
                            >
                              🔍 الصورة المعدّلة (مع تحديد القطعة)
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                comparisonMode === "original"
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => setComparisonMode("original")}
                              className="font-bold text-xs"
                              data-testid="odd-piece-v2-toggle-original"
                            >
                              ✨ الصورة الأصلية (قبل التعديل)
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                comparisonMode === "split"
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => setComparisonMode("split")}
                              className="font-bold text-xs"
                              data-testid="odd-piece-v2-toggle-split"
                            >
                              ⚖️ مقارنة متطابقة
                            </Button>
                          </>
                        ) : (
                          <div className="rounded-full bg-[hsl(var(--brand-navy))] px-3 py-1 text-[0.68rem] font-black text-white">
                            🔎 الصورة المعدّلة · تحديد الحل بعد الحسم
                          </div>
                        )}
                      </div>

                      {!usesOriginalComparison && revealPhase === "detail" && (
                        <div
                          className={cn(
                            "rounded-xl border border-brand-gold/35 bg-brand-gold/10 text-center text-xs font-bold text-foreground",
                            compact ? "p-1.5" : "p-2",
                          )}
                          data-testid="odd-piece-v2-wheel-detail"
                        >
                          <p className={cn(compact && "text-[0.7rem]")}>
                            تكبير موضع العجلة الدخيلة
                          </p>
                          <div
                            className={cn(
                              "mx-auto mt-1.5 w-full max-w-md overflow-hidden rounded-lg border border-brand-gold/40 bg-black/90",
                              compact ? "aspect-[2.1]" : "aspect-[1.5]",
                            )}
                            role="img"
                            aria-label="تفصيل مكبّر لموضع العجلة الدخيلة"
                            data-wheel-context="wheel-fender-headlight"
                            style={{
                              backgroundImage: `url(${scenario.modifiedImage.media.assets[0].url})`,
                              backgroundPosition: `${Math.min(100, hotspotCenter.x * 100 + 4)}% ${Math.min(100, hotspotCenter.y * 100 - 2)}%`,
                              backgroundRepeat: "no-repeat",
                              backgroundSize: "190% auto",
                            }}
                          />
                          <p className="mt-1 text-[0.68rem] text-muted-foreground">
                            محاكاة تعليمية؛ لا تُثبت هذه الصورة أصلاً موثّقاً
                            للعجلة.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                {((step.id === "reveal" && revealPhase === "result") ||
                  step.id === "three-puzzles") && (
                  <div
                    className={cn(
                      "mx-auto w-full max-w-2xl space-y-2 text-center",
                      compact ? "space-y-1.5" : "space-y-3",
                    )}
                    data-testid="odd-piece-v2-reveal"
                  >
                    <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/80 p-3 dark:bg-emerald-950/20 sm:p-4">
                      <p className="text-xs font-black text-muted-foreground">
                        نتيجة اللغز الأول
                      </p>
                      <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-300 sm:text-3xl">
                        الفريق الثاني +1
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm font-black">
                        <div className="rounded-xl bg-background/80 px-3 py-2">
                          الفريق الأول
                          <strong className="mt-0.5 block text-xl">0</strong>
                        </div>
                        <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/15 px-3 py-2">
                          الفريق الثاني
                          <strong className="mt-0.5 block text-xl text-emerald-700 dark:text-emerald-300">
                            1
                          </strong>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs font-bold text-muted-foreground sm:text-sm">
                      كل تحدٍّ فيه 3 ألغاز، والفريق الفائز يحصد نقطة المباراة.
                    </p>
                    <p className="text-[0.68rem] font-black text-muted-foreground">
                      {scenario.targetVehicleLabel}
                    </p>
                    <p className="text-[0.68rem] text-muted-foreground">
                      صورة تعليمية مقدّمة من المالك — لا تمثل سؤالاً إنتاجياً.
                    </p>
                  </div>
                )}
              </div>
            </ChallengeFrame>
          </SharedScreenFrame>
        )}

        {/* Phone Perspective / Live Status Panel */}
        {showPhoneSurface && (
          <aside
            className={cn(
              "mx-auto w-full max-w-[20rem] space-y-2 sm:max-w-[24rem] lg:max-w-[42rem] 2xl:max-w-[48rem]",
              isAnswerScene || isInspectionPhoneFocus ? "order-1" : "order-2",
            )}
            data-testid="odd-piece-v2-phone-perspective"
          >
            <div
              className="rounded-[1.5rem] border-[5px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-navy))] p-1.5 shadow-[0_22px_42px_-20px_hsl(var(--brand-navy)/.8)]"
              data-testid="odd-piece-v2-phone-frame"
            >
              <div
                className="relative overflow-hidden rounded-[1.1rem] bg-white"
                dir="rtl"
              >
                <span
                  aria-hidden
                  className="absolute left-1/2 top-2 z-10 h-1.5 w-12 -translate-x-1/2 rounded-full bg-[hsl(var(--brand-navy)/.18)]"
                />
                <div className="flex flex-col gap-3 p-4 pt-7 text-center sm:p-5 sm:pt-8">
                  <div className="flex items-center justify-between border-b pb-2 text-sm font-black text-muted-foreground">
                    <span>هاتف اللاعب</span>
                    <span>
                      {isInspectionPhoneFocus ? "استكشاف" : "نافذة الإجابة"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-gold/10 px-3 py-2 text-sm font-black">
                    <span>{phoneTeamLabel}</span>
                    {phoneHasDeadline ? (
                      <ChallengeCountdown
                        remainingMs={5000}
                        variant="prominent"
                      />
                    ) : (
                      <span className="rounded-full bg-background px-2 py-1 text-xs">
                        {isInspectionPhoneFocus ? "الفريقان" : "تم الحجز"}
                      </span>
                    )}
                  </div>

                  {/* Full-width simulated phone surface: the image remains readable on mobile. */}
                  <div
                    className="relative overflow-hidden rounded-lg border bg-black/80"
                    style={{
                      aspectRatio: "1.55",
                    }}
                    data-testid="odd-piece-v2-phone-viewport"
                  >
                    <div
                      className="absolute inset-0 transition-transform duration-300 ease-out"
                      style={{
                        transform: `translate(${phonePan.x}%, ${phonePan.y}%) scale(${phoneZoom})`,
                        transformOrigin: "center",
                      }}
                      data-testid="odd-piece-v2-phone-image-transform"
                    >
                      <img
                        src={scenario.modifiedImage.media.assets[0].url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      {step.id === "team-1-wrong" && (
                        <div
                          data-testid="odd-piece-v2-team-1-wrong"
                          className="absolute -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: `${team1Tap.x * 100}%`,
                            top: `${team1Tap.y * 100}%`,
                          }}
                        >
                          <X className="size-6 text-rose-500 stroke-[3]" />
                        </div>
                      )}
                      {step.id === "team-2-correct" && (
                        <div
                          data-testid="odd-piece-v2-team-2-correct"
                          className="absolute -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: `${team2Tap.x * 100}%`,
                            top: `${team2Tap.y * 100}%`,
                          }}
                        >
                          <Check className="size-6 text-emerald-500 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Phone Claim / Action Button */}
                  {step.id === "inspection" && (
                    <Button
                      size="sm"
                      className="w-full font-black text-xs h-10 gap-1.5 shadow"
                      data-testid="odd-piece-v2-phone-claim"
                    >
                      <MousePointer2 className="size-3.5" />
                      <span>جاوب (حجز الدور)</span>
                    </Button>
                  )}

                  {step.id === "claim" && (
                    <Button
                      size="sm"
                      className="w-full font-black text-xs h-10 bg-brand-gold text-brand-dark ring-2 ring-brand-gold"
                    >
                      <span>تم الحجز — الفريق الأول</span>
                    </Button>
                  )}

                  {step.id === "team-1-answering" && (
                    <div className="rounded-lg bg-brand-gold/15 p-3 text-sm font-black text-brand-gold border border-brand-gold/30">
                      اضغط على مكان القطعة الدخيلة
                    </div>
                  )}

                  {step.id === "team-1-wrong" && (
                    <div className="rounded-lg bg-destructive/15 p-2 text-xs font-black text-destructive border border-destructive/30">
                      ❌ موضع غير صحيح — ضاعت المحاولة
                    </div>
                  )}

                  {step.id === "handoff" && (
                    <div className="rounded-lg bg-brand-gold/20 p-3 text-sm font-black text-brand-dark dark:text-brand-gold border border-brand-gold/40">
                      الفريق الأول أخطأ — دور الفريق الثاني الآن
                    </div>
                  )}

                  {step.id === "team-2-correct" && (
                    <div className="rounded-lg bg-emerald-500/20 p-2 text-xs font-black text-emerald-700 dark:text-emerald-300 border border-emerald-500/40">
                      ✅ إجابة صحيحة — تم التقاط القطعة!
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ZoomIn className="size-3.5" /> تكبير وتحريك باللمس متاح
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop keeps the two-team ledger; mobile gets one concise status strip. */}
            <div
              className="hidden space-y-1.5 lg:block"
              data-testid="odd-piece-status"
            >
              <StatusTeam
                name="الفريق الأول"
                points={0}
                active={step.id === "claim" || step.id === "team-1-answering"}
                lost={step.id === "team-1-wrong"}
              />
              <StatusTeam
                name="الفريق الثاني"
                points={step.id === "team-2-correct" ? 1 : 0}
                active={step.id === "handoff"}
                winner={step.id === "team-2-correct"}
              />
            </div>
            <div className="hidden rounded-xl border border-brand-gold/35 bg-brand-gold/10 px-3 py-2 text-center text-xs font-black lg:hidden">
              {step.id === "handoff"
                ? "الفريق الثاني يملك الفرصة الآن · 5 ثوانٍ"
                : step.id === "team-1-wrong"
                  ? "الفريق الأول أخطأ · الفرصة انتقلت"
                  : step.id === "team-2-correct"
                    ? "الفريق الثاني +1 نقطة اللغز"
                    : step.id === "claim" || step.id === "team-1-answering"
                      ? "الفريق الأول يحدد الآن"
                      : "الفريقان يستكشفان الصورة"}
            </div>
          </aside>
        )}
      </div>

      {/* Media source and fixture disclosure */}
      {!compact && (
        <details className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-black text-foreground">
            عن هذه المعاينة
          </summary>
          <div
            className="mt-2 space-y-1.5 leading-relaxed"
            data-testid="odd-piece-media-credits"
          >
            <p className="font-bold text-brand-gold">{scenario.caption}</p>
            <p>
              {scenario.tutorialMediaDisclosure ??
                "هذه المعاينة تعليمية فقط وليست محتوى إنتاجياً."}
            </p>
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Backward compatibility: Legacy 4-image explainer for version 1 scenarios
 */
function OddPieceLegacyExplainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: OddPieceLegacyTutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const timeline = useExplainerTimeline(ODD_PIECE_V1_DEMO_STEPS, scope, {
    visibilityThreshold: 0.25,
  });
  const step = ODD_PIECE_V1_DEMO_STEPS[timeline.index];

  return (
    <div
      ref={scope}
      dir="rtl"
      data-testid="odd-piece-explainer"
      data-demo-step={step.id}
      data-variant={compact ? "compact" : "full"}
      className={cn("w-full", compact ? "space-y-3" : "space-y-6")}
    >
      {mode === "preview" ? (
        <ExplainerControls
          step={timeline.index}
          total={ODD_PIECE_V1_DEMO_STEPS.length}
          caption={step.caption}
          phase={
            step.id === "reveal" || step.id === "three-puzzles"
              ? "resolved"
              : "simulation"
          }
          timeline={timeline}
          compact={compact}
          stackOnNarrow
        />
      ) : (
        <ExplainerCaption caption={step.caption} compact={compact} />
      )}

      <div
        data-odd-piece-scene
        className={cn(
          "grid gap-3 lg:gap-4",
          step.id === "reveal" || step.id === "three-puzzles"
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[minmax(0,2fr)_minmax(14rem,.75fr)]",
        )}
      >
        <SharedScreenFrame stand={!compact}>
          <ChallengeFrame
            eyebrow="القطعة الدخيلة (V1 Legacy)"
            title={
              step.id === "reveal" || step.id === "three-puzzles"
                ? "كشف الحل"
                : "أي قطعة لا تنتمي؟"
            }
            progressLabel="اللغز 1 من 3"
            progressValue={
              step.id === "opening"
                ? 24
                : step.id === "reveal" || step.id === "three-puzzles"
                  ? 100
                  : 62
            }
            compact={compact}
          >
            {step.id === "reveal" || step.id === "three-puzzles" ? (
              <OddPieceLegacyReveal
                scenario={scenario}
                showReminder={step.id === "three-puzzles"}
                compact={compact}
              />
            ) : (
              <OddPieceLegacyQuestion
                scenario={scenario}
                step={step.id as OddPieceLegacyDemoStepId}
                compact={compact}
              />
            )}
          </ChallengeFrame>
        </SharedScreenFrame>
        {step.id !== "reveal" && step.id !== "three-puzzles" && (
          <aside className="space-y-2" data-testid="odd-piece-status">
            <StatusTeam
              name="الفريق الأول"
              points={0}
              active={["opening", "answer", "wrong"].includes(step.id)}
              lost={step.id === "wrong"}
            />
            <StatusTeam
              name="الفريق الثاني"
              points={step.id === "correct" ? 1 : 0}
              active={step.id === "handoff"}
              winner={step.id === "correct"}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function OddPieceLegacyQuestion({
  scenario,
}: {
  scenario: OddPieceLegacyTutorialScenario;
  step: OddPieceLegacyDemoStepId;
  compact: boolean;
}) {
  return (
    <div className="space-y-3" data-testid="odd-piece-question">
      <div className="grid grid-cols-2 gap-2" data-testid="odd-piece-grid">
        {scenario.pieces.map((piece, index) => (
          <div
            key={piece.id}
            className="rounded-lg border overflow-hidden relative aspect-video bg-black/5"
            data-testid={`odd-piece-card-${piece.id}`}
          >
            <img
              src={piece.imageUrl}
              alt={piece.altText}
              className="w-full h-full object-cover"
            />
            <span className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 rounded">
              {["أ", "ب", "ج", "د"][index]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OddPieceLegacyReveal({
  scenario,
  showReminder,
}: {
  scenario: OddPieceLegacyTutorialScenario;
  showReminder: boolean;
  compact: boolean;
}) {
  return (
    <div className="space-y-2 text-center" data-testid="odd-piece-reveal">
      <img
        src={scenario.targetReveal.imageUrl}
        alt={scenario.targetReveal.altText}
        className="max-h-56 mx-auto rounded-lg object-contain"
      />
      <p className="font-black text-sm">{scenario.targetVehicleLabel}</p>
      <p className="text-xs text-emerald-600 font-bold">
        الفريق الثاني +1 Match point
      </p>
      <p className="text-xs text-muted-foreground">
        الدخيلة: {scenario.intruderVehicleLabel}
      </p>
      {showReminder && (
        <p className="text-xs font-bold text-primary">
          3 ألغاز في التحدي الكامل
        </p>
      )}
    </div>
  );
}

function StatusTeam({
  name,
  points,
  active,
  lost,
  winner,
}: {
  name: string;
  points: number;
  active: boolean;
  lost?: boolean;
  winner?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-background p-2.5",
        active ? "border-brand-gold shadow-sm" : "border-border",
        winner && "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black">{name}</span>
        <span className="text-sm font-black">{points}</span>
      </div>
      <p
        className={cn(
          "mt-0.5 text-[0.65rem] font-bold text-muted-foreground",
          lost && "text-destructive",
          winner && "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {lost
          ? "المحاولة ضاعت"
          : winner
            ? "+1 نقطة اللغز"
            : active
              ? "الدور الآن"
              : "بانتظار الفرصة"}
      </p>
    </div>
  );
}
