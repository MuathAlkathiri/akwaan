"use client";

import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BOMB_DEMO_STEPS } from "../bomb-demo-scenario";
import { CLOSEST_DEMO_STEPS } from "../closest-demo-scenario";
import { COMBO_DEMO_STEPS } from "../combo-demo-scenario";
import { EKSHIFNI_DEMO_STEPS } from "../ekshifni-demo-scenario";
import { FIRST_NOTE_DEMO_STEPS } from "../first-note-demo-scenario";
import { LAQATHA_DEMO_STEPS } from "../laqatha-demo-scenario";
import { LA_TAHRIQHA_DEMO_STEPS } from "../la-tahriqha-demo-scenario";
import { MARHALA_DEMO_STEPS } from "../marhala-demo-scenario";
import {
  ODD_PIECE_V1_DEMO_STEPS,
  ODD_PIECE_V2_DEMO_STEPS,
} from "../odd-piece-demo-scenario";
import { ONE_CLUE_DEMO_STEPS } from "../one-clue-demo-scenario";
import { RYO_DEMO_STEPS } from "../ryo-demo-scenario";
import { TOP5_DEMO_STEPS } from "../top5-demo-scenario";
import type { TutorialScenario } from "../tutorial-scenario";
import { tutorialScenarioKind } from "../tutorial-scenario";
import {
  MechanicTutorialRenderer,
  supportsTutorialScenario,
} from "../tutorial-renderer";
import {
  ExplainerTimelineSelectionProvider,
  type ExplainerTimelineControls,
} from "../use-explainer-timeline";
import { usePublishedTutorial } from "../use-published-tutorial";

type TutorialKind = ReturnType<typeof tutorialScenarioKind>;
type Scene = { caption: string };
type TutorialView = "full" | "screen" | "phones";

export interface InlineMechanicTutorialProps {
  mechanicKey: string;
  worldId?: string;
  challengeName: string;
  description?: string;
  launching?: boolean;
  embedded?: boolean;
}

const STEP_SCENES: Record<TutorialKind, readonly number[]> = {
  ryo: [0, 1, 2, 3, 4],
  closest: [0, 1, 3, 5],
  bomb: [0, 2, 5, 9, 11],
  "one-clue": [0, 1, 3, 6, 9],
  "top-5": [0, 2, 4, 5, 7],
  combo: [0, 2, 3, 5, 7],
  marhala: [0, 2, 4, 6, 8],
  laqatha: [0, 2, 4, 6, 8],
  "first-note": [0, 1, 4, 6, 9],
  "la-tahriqha": [0, 2, 5, 8, 11, 14],
  ekshifni: [0, 2, 4, 6, 8, 10],
  "odd-piece": [0, 2, 4, 6, 8],
};

const STEP_LABELS: Record<TutorialKind, readonly string[]> = {
  ryo: ["السؤال", "الإجابة", "قرار الخصم", "الكشف", "النتيجة"],
  closest: ["السؤال", "تقديرات الفريقين", "الكشف", "النتيجة"],
  bomb: [
    "بداية القنبلة",
    "إجابة صحيحة",
    "انتقال القنبلة",
    "تخطي السؤال",
    "انتهاء الوقت",
  ],
  "one-clue": [
    "بداية التحدي",
    "الكشف التدريجي",
    "قفل الإجابة",
    "استمرار اللعب",
    "النتيجة",
  ],
  "top-5": [
    "اختيار البطاقة",
    "قرار الفريق",
    "الملكية",
    "كشف الترتيب",
    "النقاط",
  ],
  combo: [
    "بداية الكومبو",
    "قرار المخاطرة",
    "السؤال التالي",
    "كسر الكومبو",
    "النتيجة",
  ],
  marhala: ["اللوحة", "اختيار الصعوبة", "السؤال", "الحركة", "أثر المربع"],
  laqatha: ["البداية", "الكشف", "المطالبة", "تبديل الدور", "النتيجة"],
  "first-note": [
    "بداية المزاد",
    "المزايدة",
    "الفوز بالمقطع",
    "الإجابة",
    "الكشف",
  ],
  "la-tahriqha": [
    "اختيار البطاقات",
    "المخاطرة",
    "الحرق",
    "الكشف",
    "النتيجة",
    "الدور التالي",
  ],
  ekshifni: [
    "الصورة المحجوبة",
    "نافذة الكشف",
    "الإجابة",
    "تبديل المبادرة",
    "الكشف الكامل",
    "النتيجة",
  ],
  "odd-piece": ["الفحص", "المطالبة", "إجابة الفريق", "تبديل الدور", "الكشف"],
};

function scenesFor(scenario: TutorialScenario): readonly Scene[] {
  const kind = tutorialScenarioKind(scenario);
  if (kind === "bomb") return BOMB_DEMO_STEPS;
  if (kind === "closest") return CLOSEST_DEMO_STEPS;
  if (kind === "combo") return COMBO_DEMO_STEPS;
  if (kind === "ekshifni") return EKSHIFNI_DEMO_STEPS;
  if (kind === "first-note") return FIRST_NOTE_DEMO_STEPS;
  if (kind === "la-tahriqha") return LA_TAHRIQHA_DEMO_STEPS;
  if (kind === "laqatha") return LAQATHA_DEMO_STEPS;
  if (kind === "marhala") return MARHALA_DEMO_STEPS;
  if (kind === "odd-piece") {
    return scenario.version === 2
      ? ODD_PIECE_V2_DEMO_STEPS
      : ODD_PIECE_V1_DEMO_STEPS;
  }
  if (kind === "one-clue") return ONE_CLUE_DEMO_STEPS;
  if (kind === "top-5") return TOP5_DEMO_STEPS;
  return RYO_DEMO_STEPS;
}

function inlineSteps(scenario: TutorialScenario) {
  const kind = tutorialScenarioKind(scenario);
  const scenes = scenesFor(scenario);
  const labels = STEP_LABELS[kind];
  return STEP_SCENES[kind]
    .filter((sceneIndex) => scenes[sceneIndex])
    .map((sceneIndex, index) => ({
      sceneIndex,
      label: labels[index] ?? `المشهد ${index + 1}`,
      caption: scenes[sceneIndex].caption,
    }));
}

function fallbackMessage({
  isError,
  supported,
  hasTutorial,
}: {
  isError: boolean;
  supported: boolean;
  hasTutorial: boolean;
}) {
  if (isError) return "تعذّر تحميل الشرح التوضيحي الآن.";
  if (hasTutorial && !supported) {
    return "هذا التحدي لديه شرح منشور بصيغة غير مدعومة على هذه الشاشة.";
  }
  return "لا يوجد شرح منشور لهذا التحدي بعد.";
}

export function InlineMechanicTutorial({
  mechanicKey,
  worldId,
  challengeName,
  description,
  launching = false,
  embedded = false,
}: InlineMechanicTutorialProps) {
  const {
    data: tutorial,
    isError,
    isLoading,
  } = usePublishedTutorial(mechanicKey, worldId);
  const supported = Boolean(
    tutorial && supportsTutorialScenario(tutorial.scenario),
  );
  const steps = useMemo(
    () => (tutorial && supported ? inlineSteps(tutorial.scenario) : []),
    [supported, tutorial],
  );
  const [activeStep, setActiveStep] = useState(0);
  const stageStripRef = useRef<HTMLElement>(null);
  const [timelineControls, setTimelineControls] =
    useState<ExplainerTimelineControls | null>(null);
  const [tutorialView, setTutorialView] = useState<TutorialView>("screen");
  const [phonePerspective, setPhonePerspective] = useState<
    "answering" | "opposing"
  >("answering");
  const current = steps[Math.min(activeStep, Math.max(steps.length - 1, 0))];

  useEffect(() => {
    const strip = stageStripRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const active = strip.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    );
    if (!active) return;
    const bounds = strip.getBoundingClientRect();
    const tab = active.getBoundingClientRect();
    const offset =
      tab.left < bounds.left
        ? tab.left - bounds.left
        : tab.right > bounds.right
          ? tab.right - bounds.right
          : 0;
    if (offset) strip.scrollBy({ left: offset, behavior: "auto" });
  }, [activeStep, steps.length]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(min-width: 1024px)");
    const syncView = () => setTutorialView(media.matches ? "full" : "screen");
    syncView();
    media.addEventListener("change", syncView);
    return () => media.removeEventListener("change", syncView);
  }, []);

  const selectStep = useCallback(
    (index: number) => {
      setActiveStep(
        Math.min(Math.max(index, 0), Math.max(steps.length - 1, 0)),
      );
    },
    [steps.length],
  );

  const selectScene = useCallback(
    (sceneIndex: number) => {
      if (!steps.length) return;
      let nearest = 0;
      steps.forEach((step, index) => {
        if (
          Math.abs(step.sceneIndex - sceneIndex) <
          Math.abs(steps[nearest].sceneIndex - sceneIndex)
        ) {
          nearest = index;
        }
      });
      setActiveStep(nearest);
    },
    [steps],
  );

  const rendererViewClass =
    tutorialView === "screen"
      ? "[&_[data-tutorial-surface='phone']]:hidden"
      : tutorialView === "phones"
        ? "[&_[data-tutorial-surface='shared']]:hidden"
        : "";

  return (
    <section
      data-testid="preflight-inline-tutorial"
      data-launching={launching ? "true" : "false"}
      data-tutorial-view={tutorialView}
      aria-busy={isLoading}
      className={[
        "min-w-0 overflow-hidden transition-opacity duration-base ease-akwaan",
        embedded ? "" : "surface-card p-3 sm:p-4",
        launching ? "pointer-events-none opacity-45" : "",
      ].join(" ")}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        {!embedded && (
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-black leading-tight text-foreground">
              {challengeName}
            </h2>
          </div>
        )}
        <span className="shrink-0 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-bold text-muted-foreground">
          تجربة توضيحية · ليست مباراة فعلية
        </span>
      </header>

      {isLoading ? (
        <div
          data-testid="preflight-inline-tutorial-loading"
          className="mt-4 rounded-[var(--radius)] bg-muted/50 p-6 text-center text-sm font-bold text-muted-foreground"
        >
          نجهّز المثال التوضيحي…
        </div>
      ) : !tutorial || !supported ? (
        <div
          data-testid="preflight-inline-tutorial-fallback"
          className="mt-4 space-y-2 rounded-[var(--radius)] border border-border bg-muted/35 p-4"
        >
          <p className="text-sm font-black text-foreground">
            {fallbackMessage({
              isError,
              supported,
              hasTutorial: Boolean(tutorial),
            })}
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            {description ||
              `هذا شرح مختصر لتحدي «${challengeName}». ستظهر التعليمات المعتمدة عند بدء التحدي.`}
          </p>
        </div>
      ) : current ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {!timelineControls?.reducedMotion && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="preflight-inline-tutorial-play"
                data-playing={timelineControls?.playing ? "true" : "false"}
                aria-label={
                  timelineControls?.playing ? "إيقاف الشرح" : "تشغيل الشرح"
                }
                disabled={!timelineControls}
                onClick={() => timelineControls?.toggle()}
                className="gap-1.5 font-black"
              >
                {timelineControls?.playing ? (
                  <Pause className="size-3.5" aria-hidden />
                ) : (
                  <Play className="size-3.5" aria-hidden />
                )}
                <span className="hidden sm:inline">
                  {timelineControls?.playing ? "إيقاف" : "تشغيل"}
                </span>
              </Button>
            )}
            {!timelineControls?.reducedMotion && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="preflight-inline-tutorial-skip"
                aria-label="تخطّي إلى النتيجة"
                disabled={!timelineControls}
                onClick={() => timelineControls?.skip()}
                className="gap-1.5 font-black"
              >
                <SkipForward className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">تخطّي</span>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="preflight-inline-tutorial-replay"
              disabled={!timelineControls}
              onClick={() => timelineControls?.replay()}
              className="gap-1.5 font-black"
            >
              <RotateCcw className="size-4" aria-hidden />
              من البداية
            </Button>
          </div>
          <div
            data-testid="preflight-inline-tutorial-view-switcher"
            className="mt-3 space-y-1.5 lg:hidden"
          >
            <p className="text-xs font-bold text-muted-foreground">
              اختر العرض التوضيحي
            </p>
            <div
              role="tablist"
              aria-label="عرض الشرح التوضيحي"
              className="grid grid-cols-2 gap-1.5"
            >
              {(
                [
                  ["screen", "شاشة المباراة المشتركة"],
                  ["phones", "جوالات اللاعبين"],
                ] as const
              ).map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={tutorialView === view}
                  onClick={() => setTutorialView(view)}
                  className={[
                    "min-w-0 rounded-xl border px-2 py-2 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    tutorialView === view
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tutorialView === "phones" &&
            tutorialScenarioKind(tutorial.scenario) === "ryo" && (
              <div
                role="group"
                aria-label="فريق العرض التوضيحي"
                className="mt-3 flex gap-1.5 lg:hidden"
              >
                {(
                  [
                    ["answering", "الفريق الأول"],
                    ["opposing", "الفريق الثاني"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={phonePerspective === value}
                    onClick={() => setPhonePerspective(value)}
                    className={[
                      "flex-1 rounded-xl border px-3 py-2 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      phonePerspective === value
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

          <p
            data-testid="preflight-inline-tutorial-caption"
            aria-live="polite"
            className="sr-only"
          >
            {current.caption}
          </p>

          <div
            id="preflight-inline-tutorial-panel"
            role="tabpanel"
            aria-labelledby={`preflight-inline-tutorial-step-${activeStep}`}
            className="mt-3 min-w-0 rounded-2xl bg-muted/35 p-3 sm:p-5"
          >
            {tutorialView === "phones" &&
              tutorialScenarioKind(tutorial.scenario) === "ryo" && (
                <p
                  data-testid="preflight-phone-question"
                  className="mb-3 text-center text-sm font-bold leading-6 text-foreground"
                >
                  {tutorial.scenario.prompt}
                </p>
              )}
            <ExplainerTimelineSelectionProvider
              selectedIndex={current.sceneIndex}
              onSelect={selectScene}
              autoPlay={false}
              onControlsReady={setTimelineControls}
            >
              <div
                className={[
                  "min-w-0 [&_[data-testid='explainer-caption']]:hidden [&_[data-testid='explainer-controls']]:hidden lg:[&_[data-testid='explainer-devices']]:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)] lg:[&_[data-testid='explainer-devices']]:items-center lg:[&_[data-testid='explainer-device-shared']]:col-start-2 lg:[&_[data-testid='explainer-device-shared']]:row-start-1 lg:[&_[data-testid='explainer-device-phones']]:contents lg:[&_[data-phone-role='answering']]:col-start-1 lg:[&_[data-phone-role='answering']]:row-start-1 lg:[&_[data-phone-role='opposing']]:col-start-3 lg:[&_[data-phone-role='opposing']]:row-start-1",
                  "lg:[&_[data-phone-role]_[data-tutorial-surface='phone']>div]:aspect-[9/21]",
                  rendererViewClass,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <MechanicTutorialRenderer
                  scenario={tutorial.scenario}
                  compact={tutorialView !== "full"}
                  mode="player"
                  showRyoPhonePrompt={tutorialView !== "full"}
                  ryoPhonePerspective={
                    tutorialView === "phones" ? phonePerspective : undefined
                  }
                />
              </div>
            </ExplainerTimelineSelectionProvider>
          </div>

          <nav
            ref={stageStripRef}
            aria-label="خطوات الشرح التوضيحي"
            role="tablist"
            className="mt-4 flex min-w-0 gap-1.5 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0"
          >
            {steps.map((step, index) => (
              <button
                key={`${step.sceneIndex}-${step.label}`}
                id={`preflight-inline-tutorial-step-${index}`}
                type="button"
                role="tab"
                aria-selected={activeStep === index}
                aria-controls="preflight-inline-tutorial-panel"
                tabIndex={activeStep === index ? 0 : -1}
                onClick={() => selectStep(index)}
                onKeyDown={(event) => {
                  let next: number | undefined;
                  if (event.key === "ArrowLeft")
                    next = (index + 1) % steps.length;
                  if (event.key === "ArrowRight")
                    next = (index - 1 + steps.length) % steps.length;
                  if (event.key === "Home") next = 0;
                  if (event.key === "End") next = steps.length - 1;
                  if (next === undefined) return;
                  event.preventDefault();
                  selectStep(next);
                  const target =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      "[role=tab]",
                    )[next];
                  target?.focus();
                }}
                className={[
                  "min-w-[6.5rem] shrink-0 rounded-xl border px-2 py-2 text-center text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-w-0",
                  activeStep === index
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                ].join(" ")}
              >
                <span className="akwaan-numeral me-1">{index + 1}</span>
                <span className="break-words">{step.label}</span>
              </button>
            ))}
          </nav>
        </>
      ) : null}
    </section>
  );
}
