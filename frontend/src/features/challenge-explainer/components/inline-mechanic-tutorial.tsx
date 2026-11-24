"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RYO_DECISION_PRESENTATION } from "@/features/live-game-session/match/ryo-decision.presentation";
import { TutorialStagePresentationProvider } from "@/features/how-to-play/components/device-frames";
import { teamIdentity, type TeamSlot } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { BOMB_DEMO_STEPS } from "../bomb-demo-scenario";
import { CLOSEST_DEMO_STEPS } from "../closest-demo-scenario";
import { COMBO_DEMO_STEPS } from "../combo-demo-scenario";
import { EKSHIFNI_DEMO_STEPS } from "../ekshifni-demo-scenario";
import { FIRST_NOTE_DEMO_STEPS } from "../first-note-demo-scenario";
import { LA_TAHRIQHA_DEMO_STEPS } from "../la-tahriqha-demo-scenario";
import { LAQATHA_DEMO_STEPS } from "../laqatha-demo-scenario";
import { MARHALA_DEMO_STEPS } from "../marhala-demo-scenario";
import {
  ODD_PIECE_V2_DEMO_STEPS,
} from "../odd-piece-demo-scenario";
import { ONE_CLUE_DEMO_STEPS } from "../one-clue-demo-scenario";
import { RYO_DEMO_STEPS } from "../ryo-demo-scenario";
import { TOP5_DEMO_STEPS } from "../top5-demo-scenario";
import {
  MechanicTutorialRenderer,
  supportsTutorialScenario,
} from "../tutorial-renderer";
import {
  toPresentationDecision,
  type RyoTutorialScenario,
  type TutorialScenario,
  tutorialScenarioKind,
} from "../tutorial-scenario";
import {
  ExplainerTimelineSelectionProvider,
  type ExplainerTimelineControls,
  useExplainerTimeline,
} from "../use-explainer-timeline";
import { usePublishedTutorial } from "../use-published-tutorial";

type TutorialKind = ReturnType<typeof tutorialScenarioKind>;
type Scene = { caption: string };

export interface TutorialTeamLabel {
  teamId?: string;
  teamName: string;
  slot?: TeamSlot;
}

export interface InlineMechanicTutorialProps {
  mechanicKey: string;
  worldId?: string;
  challengeName: string;
  description?: string;
  launching?: boolean;
  repeatEncounter?: boolean;
  teams?: readonly TutorialTeamLabel[];
}

const STEP_SCENES: Record<TutorialKind, readonly number[]> = {
  ryo: [0, 1, 2, 3, 4],
  closest: [0, 1, 4, 5],
  bomb: [0, 4, 5, 9, 11],
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

const RYO_V6_STEPS = [
  { id: "question", label: "السؤال والإجابة", holdSeconds: 6.9 },
  { id: "decision", label: "قرار الخصم", holdSeconds: 6.6 },
  { id: "locked", label: "تثبيت القرار", holdSeconds: 4.9 },
  { id: "reveal", label: "الكشف والنتيجة", holdSeconds: 3.5 },
] as const;

const INTRO_AUTO_ADVANCE_MS = 3300;
const TIMER_CIRCUMFERENCE = 163;

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
  if (kind === "odd-piece") return ODD_PIECE_V2_DEMO_STEPS;
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

function resolveDisplayTeams(teams?: readonly TutorialTeamLabel[]) {
  const slot1 =
    teams?.find((team) => team.slot === "1") ?? teams?.[0] ?? undefined;
  const slot2 =
    teams?.find((team) => team.slot === "2") ?? teams?.[1] ?? undefined;
  const blueShort = slot1?.teamName?.trim() || "الأزرق";
  const redShort = slot2?.teamName?.trim() || "الأحمر";
  return {
    blueShort,
    blueFull: slot1?.teamName?.trim() || "الفريق الأزرق",
    redShort,
    redFull: slot2?.teamName?.trim() || "الفريق الأحمر",
  };
}

/**
 * Unified preflight mechanic explainer.
 *
 * Uses Akwaan's approved V6 navy TV bezel + demonstration strip, compact
 * repeat-encounter recap, and timeline rail across all mechanics:
 * - For `read-your-opponent` (`kind === "ryo"`), renders the integrated
 *   dual-iPhone stage inside one shared surface (Slot 2 / Red right, shared
 *   question center, Slot 1 / Blue left) across 4 instructional stages plus an
 *   intro card, driven by the canonical `useExplainerTimeline` GSAP hook.
 * - For all other mechanics, preserves `MechanicTutorialRenderer` and each
 *   mechanic's native stage count inside the shared TV stage.
 */
export function InlineMechanicTutorial({
  mechanicKey,
  worldId,
  challengeName,
  description,
  launching = false,
  repeatEncounter = false,
  teams,
}: InlineMechanicTutorialProps) {
  const {
    data: tutorial,
    isError,
    isLoading,
  } = usePublishedTutorial(mechanicKey, worldId);
  const supported = Boolean(
    tutorial && supportsTutorialScenario(tutorial.scenario),
  );
  const kind = tutorial ? tutorialScenarioKind(tutorial.scenario) : null;
  const isRyo = kind === "ryo";

  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(
    null,
  );
  const showFullTutorial = expandedOverride ?? !repeatEncounter;

  useEffect(() => {
    setExpandedOverride(null);
  }, [mechanicKey, worldId, repeatEncounter]);

  const teamNames = useMemo(() => resolveDisplayTeams(teams), [teams]);

  return (
    <section
      data-testid="preflight-inline-tutorial"
      data-launching={launching ? "true" : "false"}
      data-tutorial-kind={kind ?? "none"}
      aria-busy={isLoading}
      className={cn(
        "min-w-0 transition-opacity duration-base ease-akwaan",
        launching && "pointer-events-none opacity-45",
      )}
    >
      {isLoading ? (
        <div
          data-testid="preflight-inline-tutorial-loading"
          className="rounded-[20px] bg-brand-navy p-4 text-center text-sm font-bold text-white/80"
        >
          نجهّز المثال التوضيحي…
        </div>
      ) : !tutorial || !supported ? (
        <div
          data-testid="preflight-inline-tutorial-fallback"
          className="surface-card space-y-2 p-4"
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
      ) : !showFullTutorial ? (
        <RepeatEncounterRecap
          challengeName={challengeName}
          description={description}
          kind={kind}
          isRyo={isRyo}
          blueShort={teamNames.blueShort}
          redShort={teamNames.redShort}
          onExpand={() => setExpandedOverride(true)}
        />
      ) : isRyo ? (
        <V6RyoIntegratedSection
          scenario={tutorial.scenario as RyoTutorialScenario}
          challengeName={challengeName}
          launching={launching}
          repeatEncounter={repeatEncounter}
          autoStartFromExpand={expandedOverride === true}
          teamNames={teamNames}
        />
      ) : (
        <GenericV6TutorialSection
          scenario={tutorial.scenario}
          challengeName={challengeName}
          launching={launching}
          repeatEncounter={repeatEncounter}
          autoStartFromExpand={expandedOverride === true}
          teamNames={teamNames}
        />
      )}
    </section>
  );
}

function RepeatEncounterRecap({
  challengeName,
  description,
  kind,
  isRyo,
  blueShort,
  redShort,
  onExpand,
}: {
  challengeName: string;
  description?: string;
  kind: TutorialKind | null;
  isRyo: boolean;
  blueShort: string;
  redShort: string;
  onExpand: () => void;
}) {
  const stealLabel = RYO_DECISION_PRESENTATION.steal.revealLabel;
  const trustLabel = RYO_DECISION_PRESENTATION.trust.revealLabel;

  const recapChips = isRyo
    ? [
        `① ${blueShort} يجاوب`,
        `② ${redShort} يقرر «${stealLabel}» أو «${trustLabel}»`,
        "③ القرارين يقفلون ثم تنكشف النتيجة",
      ]
    : kind === "closest"
      ? [
          `① ${blueShort} و${redShort} يقدّران الرقم بسرية`,
          "② يُقفل التقديران ثم ينكشف الرقم الصحيح",
          "③ الأقرب يكسب جولة داخلية نحو نقطة المباراة",
        ]
      : kind === "bomb"
        ? [
            "① ساعة مستمرة لكل فريق مع حامل القنبلة",
            "② الإجابة الصحيحة تنقل القنبلة بدون تصفير الوقت",
            "③ التخطي يخصم 5 ثوانٍ وانتهاء الوقت يحسم التحدي",
          ]
        : kind === "top-5"
          ? [
              "① 10 بطاقات مخفية الرتبة (5 صحيحة و5 فخاخ)",
              "② صاحب الدور يختار «خلّها» أو «عطها للخصم»",
              "③ تنكشف الرتب في النهاية وتُحتسب بطاقات أفضل 5 فقط",
            ]
          : null;

  return (
    <div
      data-testid="preflight-inline-tutorial-recap"
      className="rounded-[18px] border border-border bg-card p-4 shadow-[0_18px_40px_-24px_hsl(var(--brand-navy)/0.28)] sm:p-[22px]"
    >
      <h2 className="flex items-center gap-2.5 font-display text-lg font-bold text-foreground sm:text-xl">
        <RotateCcw className="size-5 shrink-0 text-brand-navy" aria-hidden />
        <span>تذكرون {challengeName}؟</span>
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        سبق لكم لعبه في هالمباراة، فبنختصر عليكم الشرح.
      </p>
      {recapChips ? (
        <div className="my-3.5 flex flex-wrap gap-2">
          {recapChips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : description ? (
        <p className="my-3 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold leading-6 text-foreground">
          {description}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="preflight-inline-tutorial-expand"
          onClick={onExpand}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[11px] border-2 border-brand-navy bg-brand-gold px-4 py-2 text-sm font-bold text-brand-navy shadow-[0_4px_0_hsl(var(--brand-navy))] transition-transform active:translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Play className="size-4 fill-current" aria-hidden />
          شغّل الشرح مرة ثانية
        </button>
        <span className="text-xs font-medium text-muted-foreground">
          تقدرون تبدأون على طول إذا كلكم جاهزين.
        </span>
      </div>
    </div>
  );
}

function V6RyoIntegratedSection({
  scenario,
  challengeName,
  launching,
  repeatEncounter,
  autoStartFromExpand,
  teamNames,
}: {
  scenario: RyoTutorialScenario;
  challengeName: string;
  launching: boolean;
  repeatEncounter: boolean;
  autoStartFromExpand: boolean;
  teamNames: ReturnType<typeof resolveDisplayTeams>;
}) {
  // -1 represents the V6 intro card before the 4 numbered stages (0..3).
  const [activeStep, setActiveStep] = useState<number>(() =>
    autoStartFromExpand ? 0 : -1,
  );
  const [timelineControls, setTimelineControls] =
    useState<ExplainerTimelineControls | null>(null);
  const userInteractedRef = useRef(autoStartFromExpand);
  const pendingExpandPlayRef = useRef(autoStartFromExpand);

  const decisionKey = toPresentationDecision(scenario.opposingDecision);
  const chosenDecisionLabel =
    RYO_DECISION_PRESENTATION[decisionKey].revealLabel;
  const stealLabel = RYO_DECISION_PRESENTATION.steal.revealLabel;
  const trustLabel = RYO_DECISION_PRESENTATION.trust.revealLabel;

  const captions = useMemo(
    () => [
      `السؤال على التلفزيون، و${teamNames.blueShort} يختار الإجابة من جواله. ${teamNames.redShort} ينتظر — ما يشوف اختياره.`,
      `بعد تثبيت الإجابة، ${teamNames.redShort} يختار «${stealLabel}» أو «${trustLabel}» من جواله، بدون معرفة الإجابة.`,
      "كل فريق ثبت قراره. شوف علامة القفل في الجوالين — ما فيه تغيير بعد كذا.",
      "الاختيارات تنكشف مع بعض، وتظهر النتيجة على التلفزيون وجوالي الفريقين.",
    ],
    [stealLabel, teamNames.blueShort, teamNames.redShort, trustLabel],
  );

  // Respect first-encounter auto-advance (~3.3s on intro) while never
  // auto-playing when prefers-reduced-motion is active or launch is pending.
  useEffect(() => {
    if (
      activeStep !== -1 ||
      repeatEncounter ||
      autoStartFromExpand ||
      launching ||
      userInteractedRef.current ||
      !timelineControls ||
      timelineControls.reducedMotion
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (userInteractedRef.current) return;
      setActiveStep(0);
      if (!timelineControls.playing) {
        timelineControls.toggle();
      }
    }, INTRO_AUTO_ADVANCE_MS);

    return () => window.clearTimeout(timer);
  }, [activeStep, autoStartFromExpand, launching, repeatEncounter, timelineControls]);

  // If reopened explicitly via "شغّل الشرح مرة ثانية", start playback cleanly once GSAP controls mount.
  useEffect(() => {
    if (!pendingExpandPlayRef.current || !timelineControls) return;
    pendingExpandPlayRef.current = false;
    if (!timelineControls.reducedMotion && !timelineControls.playing) {
      timelineControls.toggle();
    }
  }, [timelineControls]);

  const handleTimelineSelect = useCallback((sceneIndex: number) => {
    // Only follow GSAP beat updates once past the intro card so a t=0 mount
    // update never dismisses the intro card before the timer or user action.
    setActiveStep((current) => (current < 0 ? current : sceneIndex));
  }, []);

  const selectStep = useCallback(
    (nextStep: number) => {
      userInteractedRef.current = true;
      const clamped = Math.min(Math.max(nextStep, -1), RYO_V6_STEPS.length - 1);
      setActiveStep(clamped);
      if (clamped < 0) {
        if (timelineControls?.playing) {
          timelineControls.toggle();
        }
        timelineControls?.goTo(0);
      } else {
        timelineControls?.goTo(clamped);
      }
    },
    [timelineControls],
  );

  const startFromIntro = useCallback(() => {
    userInteractedRef.current = true;
    setActiveStep(0);
    if (
      timelineControls &&
      !timelineControls.reducedMotion &&
      !timelineControls.playing
    ) {
      timelineControls.toggle();
    }
  }, [timelineControls]);

  const handleTogglePlay = useCallback(() => {
    userInteractedRef.current = true;
    if (activeStep < 0) {
      startFromIntro();
      return;
    }
    timelineControls?.toggle();
  }, [activeStep, startFromIntro, timelineControls]);

  const handleReplay = useCallback(() => {
    userInteractedRef.current = true;
    setActiveStep(-1);
    if (timelineControls?.playing) {
      timelineControls.toggle();
    }
    timelineControls?.goTo(0);
  }, [timelineControls]);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const next = Math.min(RYO_V6_STEPS.length - 1, index + 1);
        selectStep(next);
        document
          .getElementById(`preflight-inline-tutorial-step-${next}`)
          ?.focus();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        const prev = Math.max(0, index - 1);
        selectStep(prev);
        document
          .getElementById(`preflight-inline-tutorial-step-${prev}`)
          ?.focus();
      }
    },
    [selectStep],
  );

  const progressRatio =
    activeStep <= 0 ? 0 : activeStep / (RYO_V6_STEPS.length - 1);
  // Span between the center of the first dot and the center of the last dot.
  const progressPercent = `${progressRatio * ((RYO_V6_STEPS.length - 1) / RYO_V6_STEPS.length) * 100}%`;
  const captionText =
    activeStep < 0
      ? "هذا مجرد شرح لطريقة اللعب — ما راح تظهر أسئلة التحدي الحقيقي هنا."
      : captions[activeStep] ?? "";
  const reducedMotion = timelineControls?.reducedMotion ?? false;
  const playing = timelineControls?.playing ?? false;

  return (
    <div className="v6-ryo-tutorial">
      <style>{`
        @media (min-width: 761px) and (max-height: 900px) {
          .v6-ryo-tutorial .v6-tv-bezel { padding: 14px 18px; }
          .v6-ryo-tutorial .v6-sim-surface { padding-block: 14px; }
          .v6-ryo-tutorial .v6-iphone-shell { height: 258px; }
          .v6-ryo-tutorial .v6-center-stage { min-height: 258px; }
        }
        @media (min-width: 761px) and (max-height: 770px) {
          .v6-ryo-tutorial .v6-tv-bezel { padding: 12px 14px; }
          .v6-ryo-tutorial .v6-sim-surface { padding-block: 11px; gap: 8px; }
          .v6-ryo-tutorial .v6-iphone-shell { height: 236px; border-radius: 23px; }
          .v6-ryo-tutorial .v6-center-stage { min-height: 236px; gap: 7px; }
        }
      `}</style>

      <ExplainerTimelineSelectionProvider
        selectedIndex={Math.max(0, activeStep)}
        onSelect={handleTimelineSelect}
        autoPlay={false}
        onControlsReady={setTimelineControls}
      >
        <div
          id="preflight-inline-tutorial-panel"
          role="tabpanel"
          aria-labelledby={
            activeStep >= 0
              ? `preflight-inline-tutorial-step-${activeStep}`
              : undefined
          }
        >
          <V6RyoIntegratedStage
            scenario={scenario}
            challengeName={challengeName}
            activeStep={activeStep}
            launching={launching}
            teamNames={teamNames}
            chosenDecisionLabel={chosenDecisionLabel}
            onStartIntro={startFromIntro}
          />
        </div>
      </ExplainerTimelineSelectionProvider>

      <p
        data-testid="preflight-inline-tutorial-caption"
        aria-live="polite"
        className="mt-2.5 grid min-h-[44px] place-items-center px-1 text-center text-sm font-semibold leading-relaxed text-foreground sm:text-[15px]"
      >
        {captionText}
      </p>

      {/* V6 Step Timeline Rail */}
      <div className="relative mt-1 px-2 sm:px-4">
        <div
          role="tablist"
          aria-label="خطوات الشرح التوضيحي"
          className="relative grid grid-cols-4 gap-1"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute top-[14px] right-[12.5%] left-[12.5%] h-[3px] rounded-full bg-border"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-[14px] right-[12.5%] z-[1] h-[3px] rounded-full bg-brand-gold transition-[width] duration-base"
            style={{ width: progressPercent }}
          />
          {RYO_V6_STEPS.map((step, index) => {
            const isCurrent = activeStep === index;
            const isDone = activeStep > index;
            return (
              <button
                key={step.id}
                id={`preflight-inline-tutorial-step-${index}`}
                type="button"
                role="tab"
                aria-selected={isCurrent}
                aria-current={isCurrent ? "step" : undefined}
                aria-controls="preflight-inline-tutorial-panel"
                aria-label={`انتقل إلى خطوة ${index + 1}: ${step.label}`}
                tabIndex={
                  activeStep < 0
                    ? index === 0
                      ? 0
                      : -1
                    : isCurrent
                      ? 0
                      : -1
                }
                onClick={() => selectStep(index)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={cn(
                  "relative z-[2] flex min-h-[44px] flex-col items-center gap-2 border-0 bg-transparent px-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isCurrent
                    ? "font-bold text-brand-navy"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "rounded-full transition-all duration-200",
                    isCurrent
                      ? "mt-[5px] size-5 border-[3px] border-brand-navy bg-brand-gold shadow-[0_0_0_4px_hsl(var(--brand-gold)/0.3)]"
                      : isDone
                        ? "mt-[9px] size-[13px] border-2 border-brand-gold bg-brand-gold"
                        : "mt-[9px] size-[13px] border-2 border-border bg-card",
                  )}
                />
                <span className="hidden max-w-full truncate sm:block">
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 min-h-[18px] text-center text-xs font-bold text-foreground sm:hidden">
          {activeStep < 0
            ? "ابدأ الشرح"
            : `الآن: ${RYO_V6_STEPS[activeStep].label}`}
        </p>
      </div>

      {/* V6 Transport Controls */}
      <div className="relative mt-1.5 flex min-h-[60px] items-center justify-center gap-3.5">
        <button
          type="button"
          data-testid="preflight-inline-tutorial-prev"
          aria-label="الخطوة السابقة"
          title="الخطوة السابقة"
          disabled={activeStep < 0 || !timelineControls}
          onClick={() => selectStep(activeStep - 1)}
          className="grid size-[52px] place-items-center rounded-full border-[3px] border-brand-navy bg-white text-brand-navy transition-colors hover:bg-muted disabled:border-border disabled:text-disabled-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>

        {!reducedMotion && (
          <button
            type="button"
            data-testid="preflight-inline-tutorial-play"
            data-playing={playing ? "true" : "false"}
            aria-label={playing ? "إيقاف الشرح مؤقتًا" : "تشغيل الشرح"}
            title="تشغيل أو إيقاف"
            disabled={!timelineControls}
            onClick={handleTogglePlay}
            className="grid size-[68px] place-items-center rounded-full border-[3px] border-brand-navy bg-brand-gold text-brand-navy shadow-[4px_5px_0_hsl(var(--brand-navy))] transition-transform active:translate-y-0.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {playing ? (
              <Pause className="size-6 fill-current" aria-hidden />
            ) : (
              <Play className="size-6 fill-current" aria-hidden />
            )}
          </button>
        )}

        <button
          type="button"
          data-testid="preflight-inline-tutorial-next"
          aria-label="الخطوة التالية"
          title="الخطوة التالية"
          disabled={activeStep >= RYO_V6_STEPS.length - 1 || !timelineControls}
          onClick={() => selectStep(activeStep + 1)}
          className="grid size-[52px] place-items-center rounded-full border-[3px] border-brand-navy bg-white text-brand-navy transition-colors hover:bg-muted disabled:border-border disabled:text-disabled-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>

        <button
          type="button"
          data-testid="preflight-inline-tutorial-replay"
          disabled={!timelineControls}
          onClick={handleReplay}
          className="inline-flex min-h-[44px] items-center gap-1 px-2 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground sm:absolute sm:left-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          أعد الشرح
        </button>
      </div>
    </div>
  );
}

function V6RyoIntegratedStage({
  scenario,
  challengeName,
  activeStep,
  launching,
  teamNames,
  chosenDecisionLabel,
  onStartIntro,
}: {
  scenario: RyoTutorialScenario;
  challengeName: string;
  activeStep: number;
  launching: boolean;
  teamNames: ReturnType<typeof resolveDisplayTeams>;
  chosenDecisionLabel: string;
  onStartIntro: () => void;
}) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const controls = useExplainerTimeline(RYO_V6_STEPS, scopeRef, {
    stopped: launching,
  });

  const blueIdentity = teamIdentity("1");
  const redIdentity = teamIdentity("2");

  const decisionKey = toPresentationDecision(scenario.opposingDecision);
  const correctChoice = scenario.options.find(
    (option) => option.id === scenario.correctOptionId,
  );
  const answeredCorrectly =
    scenario.answeringSelectionOptionId === scenario.correctOptionId;
  const opposingWon = scenario.outcome.teamRole === "opposing";
  const stealLabel = RYO_DECISION_PRESENTATION.steal.revealLabel;
  const trustLabel = RYO_DECISION_PRESENTATION.trust.revealLabel;

  // Illustrative-only countdown derived strictly from GSAP beat progress (zero live server timers).
  const illustrativeSeconds =
    activeStep === 0 && controls.playing && !controls.reducedMotion
      ? Math.max(0, Math.min(10, Math.ceil(10 * (1 - controls.stepProgress))))
      : 10;
  const timerDashOffset = TIMER_CIRCUMFERENCE * (1 - illustrativeSeconds / 10);
  const timerUrgent = illustrativeSeconds <= 3;

  const positionLabel =
    activeStep < 0
      ? "بطاقة البداية"
      : `${activeStep + 1} / ${RYO_V6_STEPS.length}`;

  const outcomeSummary = useMemo(() => {
    const answerPart = answeredCorrectly
      ? `${teamNames.blueShort} جاوب صح`
      : `${teamNames.blueShort} أخطأ`;
    const winnerShort = opposingWon
      ? teamNames.redShort
      : teamNames.blueShort;
    const bonusText =
      scenario.outcome.delta > 0
        ? `+${scenario.outcome.delta} لـ${winnerShort}`
        : opposingWon
          ? `${teamNames.redShort} توقع صح`
          : `${teamNames.blueShort} كسب الجولة`;
    return `${answerPart} · ${bonusText}`;
  }, [
    answeredCorrectly,
    opposingWon,
    scenario.outcome.delta,
    teamNames.blueShort,
    teamNames.redShort,
  ]);

  return (
    <div
      ref={scopeRef}
      data-testid="ryo-explainer"
      data-variant="integrated"
      data-step={activeStep}
      className="v6-tv-bezel rounded-[26px] border-[3px] border-brand-navy bg-brand-navy p-2.5 shadow-[6px_7px_0_hsl(var(--brand-purple))] sm:p-4 lg:p-[clamp(13px,1.4vw,22px)]"
      aria-label="محاكاة الشرح: السؤال وجوالا الفريقين داخل شاشة واحدة"
    >
      <div className="mb-1.5 flex min-h-[24px] items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-bold text-white/80">
          <span
            aria-hidden
            className="size-2 rounded-full bg-white/75 ring-[3px] ring-white/15"
          />
          عرض على الشاشة المشتركة
        </div>
        <span className="hidden items-center gap-1.5 text-[10px] font-bold text-brand-gold sm:inline-flex">
          <span aria-hidden>◉</span> شاهد دور كل فريق
        </span>
      </div>

      <div className="flex flex-col overflow-hidden rounded-[13px] bg-background">
        {/* Persistent demo indicator band */}
        <div className="flex min-h-[36px] items-center justify-between gap-2 border-b-[3px] border-brand-gold bg-[hsl(239_44%_12%)] px-2.5 py-2 text-[10px] font-bold text-white sm:min-h-[40px] sm:px-4 sm:text-xs">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="text-brand-gold">
              ◉
            </span>
            شرح توضيحي · مو السؤال الحقيقي
          </span>
          <span className="akwaan-numeral whitespace-nowrap text-brand-gold">
            {positionLabel}
          </span>
        </div>

        {/* Integrated 3-column RTL simulator (Red right · Center TV · Blue left; stacked center-above-phones on mobile) */}
        <div className="v6-sim-surface grid grid-cols-2 items-center justify-items-center gap-x-2.5 gap-y-2.5 bg-[radial-gradient(ellipse_at_center,hsl(var(--card))_0%,hsl(var(--background))_75%)] px-2.5 py-3 [grid-template-areas:'center_center'_'red_blue'] md:min-h-[322px] md:grid-cols-[minmax(102px,128px)_minmax(0,1fr)_minmax(102px,128px)] md:gap-4 md:px-4 md:py-4 md:[grid-template-areas:none]">
          {/* Right Slot in RTL grid: Opposing Team (Slot 2 / Red) */}
          <IntegratedIphoneSlot
            teamLabel={teamNames.redFull}
            teamShort={teamNames.redShort}
            identity={redIdentity}
            acting={activeStep === 1}
            areaClass="[grid-area:red] md:[grid-area:auto]"
            testId="explainer-phone-opposing"
            ariaLabel={`جوال ${teamNames.redFull}`}
            status={
              activeStep < 0
                ? "جاهز للعرض"
                : activeStep === 0
                  ? "بانتظار الخصم"
                  : activeStep === 1
                    ? "دورك تقرر"
                    : activeStep === 2
                      ? "توقعك مقفل"
                      : "كشف التوقع"
            }
          >
            {activeStep < 0 ? (
              <PhoneStateBox
                tone="red"
                icon={<Clock className="size-4" aria-hidden />}
                title={`هنا يقرر ${teamNames.redShort}`}
                subtitle="شوف دوره مع الشرح"
              />
            ) : activeStep === 0 ? (
              <PhoneStateBox
                tone="red"
                icon={<Clock className="size-4" aria-hidden />}
                title={`${teamNames.blueShort} يجاوب`}
                subtitle="ما تشوف اختياره"
                testId="explainer-lock-opposing"
                dataLocked="false"
              />
            ) : activeStep === 1 ? (
              <div
                data-testid="explainer-phone-decision-controls"
                className="flex flex-col gap-1.5"
              >
                <p className="text-[10px] font-extrabold leading-snug text-foreground">
                  تثقون باختيارهم؟
                </p>
                {[
                  { key: "steal" as const, label: stealLabel },
                  { key: "trust" as const, label: trustLabel },
                ].map((choice) => {
                  const isChosen = decisionKey === choice.key;
                  return (
                    <div
                      key={choice.key}
                      className={cn(
                        "rounded-lg border px-1.5 py-1.5 text-[9px] font-bold leading-tight",
                        isChosen
                          ? "border-team-2-base bg-team-2-tint text-team-2-text shadow-[inset_2px_0_0_hsl(var(--team-2-base))]"
                          : "border-border bg-muted/40 text-foreground",
                      )}
                    >
                      {isChosen ? `✓ ${choice.label}` : choice.label}
                    </div>
                  );
                })}
                <p className="text-[8px] font-bold text-muted-foreground">
                  ✓ تم اختيار التوقع
                </p>
              </div>
            ) : activeStep === 2 ? (
              <PhoneStateBox
                tone="red"
                icon={<Lock className="size-4" aria-hidden />}
                title="ثبتّ توقعك"
                subtitle={chosenDecisionLabel}
                testId="explainer-lock-opposing"
                dataLocked="true"
              />
            ) : (
              <PhoneOutcomeBox
                won={opposingWon}
                title={opposingWon ? "توقعك صحيح!" : "خسرت الرهان"}
                subtitle={chosenDecisionLabel}
              />
            )}
          </IntegratedIphoneSlot>

          {/* Center Shared Screen */}
          <div className="[grid-area:center] flex w-full min-w-0 justify-center self-stretch border-b border-border pb-2.5 md:[grid-area:auto] md:border-b-0 md:pb-0">
            <div
              aria-live="polite"
              className="v6-center-stage flex min-h-[172px] w-full flex-col items-center justify-center gap-2.5 px-1 text-center md:min-h-[290px] md:gap-3"
            >
              {activeStep < 0 ? (
                <>
                  <span className="inline-flex rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold text-muted-foreground">
                    شرح في 4 مشاهد · أقل من دقيقة
                  </span>
                  <h2 className="font-display text-xl font-bold leading-snug text-brand-navy sm:text-2xl">
                    {challengeName}
                  </h2>
                  <p className="max-w-sm text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    سؤال واحد، وقرارين مختلفين — تابع الجوالين حول السؤال.
                  </p>
                  <button
                    type="button"
                    data-testid="preflight-inline-tutorial-intro-start"
                    aria-label="ابدأ الشرح الآن"
                    onClick={onStartIntro}
                    className="grid size-[52px] place-items-center rounded-full border-[3px] border-brand-navy bg-brand-gold text-brand-navy shadow-[0_5px_0_hsl(var(--brand-navy))] transition-transform active:translate-y-0.5 sm:size-[60px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Play className="size-6 fill-current" aria-hidden />
                  </button>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    ما راح يبدأ التحدي — هذا عرض بس
                  </span>
                </>
              ) : activeStep === 0 ? (
                <>
                  <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                    السؤال المعروض للجميع
                  </span>
                  <p className="max-w-[26ch] font-display text-base font-bold leading-relaxed text-brand-navy text-balance sm:text-lg lg:text-[22px]">
                    {scenario.prompt}
                  </p>
                  <div className="flex items-center justify-center gap-2.5">
                    <div
                      className={cn(
                        "relative grid size-[54px] shrink-0 place-items-center font-display text-xl font-bold sm:size-[61px] sm:text-[23px]",
                        timerUrgent
                          ? "text-destructive motion-safe:animate-pulse"
                          : "text-brand-navy",
                      )}
                      aria-label={`مثال عداد: ${illustrativeSeconds} ثوانٍ`}
                    >
                      <svg
                        viewBox="0 0 61 61"
                        className="absolute inset-0 size-full -rotate-90"
                        aria-hidden
                      >
                        <circle
                          cx="30.5"
                          cy="30.5"
                          r="26"
                          fill="none"
                          strokeWidth="6"
                          className="stroke-border"
                        />
                        <circle
                          cx="30.5"
                          cy="30.5"
                          r="26"
                          fill="none"
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={TIMER_CIRCUMFERENCE}
                          strokeDashoffset={timerDashOffset}
                          className={cn(
                            "transition-[stroke-dashoffset,stroke] duration-200",
                            timerUrgent
                              ? "stroke-destructive"
                              : "stroke-brand-gold",
                          )}
                        />
                      </svg>
                      <span className="akwaan-numeral relative z-10">
                        {illustrativeSeconds}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground sm:text-xs">
                      ثوانٍ للمثال · مو وقت التحدي
                    </span>
                  </div>
                </>
              ) : activeStep === 1 ? (
                <>
                  <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                    الآن دور {teamNames.redShort}
                  </span>
                  <p className="max-w-[26ch] font-display text-base font-bold leading-relaxed text-brand-navy text-balance sm:text-lg lg:text-[22px]">
                    {scenario.prompt}
                  </p>
                  <div className="border-t border-border pt-2 text-[11px] font-bold text-brand-navy">
                    {teamNames.blueShort} ثبت اختياره · {teamNames.redShort}{" "}
                    يقرر
                  </div>
                </>
              ) : activeStep === 2 ? (
                <>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-bold",
                        blueIdentity.surface,
                        blueIdentity.text,
                      )}
                    >
                      <Lock className="size-3 shrink-0" aria-hidden />
                      {teamNames.blueShort} ثبّت إجابته
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-bold",
                        redIdentity.surface,
                        redIdentity.text,
                      )}
                    >
                      <Lock className="size-3 shrink-0" aria-hidden />
                      {teamNames.redShort} ثبّت توقعه
                    </span>
                  </div>
                  <p className="font-display text-lg font-bold text-brand-navy sm:text-[22px]">
                    القرارين انقفلوا!
                  </p>
                  <span className="inline-flex rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold text-muted-foreground">
                    بانتظار كشف الاختيارين
                  </span>
                </>
              ) : (
                <div
                  data-testid="explainer-reveal"
                  className="flex flex-col items-center gap-2.5"
                >
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-4 py-1.5 font-display text-base font-bold text-success sm:text-xl">
                    ✓ انكشفت النتيجة!
                  </div>
                  <p className="font-display text-base font-bold text-brand-navy sm:text-xl">
                    الإجابة الصحيحة: {correctChoice?.label ?? "—"}
                  </p>
                  <div className="rounded-xl bg-success-subtle px-3 py-1.5 text-[11px] font-bold text-success sm:text-xs">
                    {outcomeSummary}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Left Slot in RTL grid: Answering Team (Slot 1 / Blue) */}
          <IntegratedIphoneSlot
            teamLabel={teamNames.blueFull}
            teamShort={teamNames.blueShort}
            identity={blueIdentity}
            acting={activeStep === 0}
            areaClass="[grid-area:blue] md:[grid-area:auto]"
            testId="explainer-phone-answering"
            ariaLabel={`جوال ${teamNames.blueFull}`}
            status={
              activeStep < 0
                ? "جاهز للعرض"
                : activeStep === 0
                  ? "دورك تجاوب"
                  : activeStep === 1
                    ? "بانتظار الخصم"
                    : activeStep === 2
                      ? "قرارك مقفل"
                      : "كشف الإجابة"
            }
          >
            {activeStep < 0 ? (
              <PhoneStateBox
                tone="blue"
                icon={<Clock className="size-4" aria-hidden />}
                title={`هنا يجاوب ${teamNames.blueShort}`}
                subtitle="شوف دوره مع الشرح"
              />
            ) : activeStep === 0 ? (
              <div
                data-testid="explainer-phone-answer-controls"
                className="flex flex-col gap-[3px]"
              >
                <p className="line-clamp-1 text-[8.5px] font-extrabold leading-tight text-foreground md:text-[9px]">
                  {scenario.prompt}
                </p>
                {scenario.options.map((option) => {
                  const isChosen =
                    option.id === scenario.answeringSelectionOptionId;
                  return (
                    <div
                      key={option.id}
                      data-selected={isChosen ? "true" : "false"}
                      className={cn(
                        "truncate rounded-md border px-1.5 py-[3px] text-[8.5px] font-bold leading-tight md:rounded-lg md:py-1 md:text-[9px]",
                        isChosen
                          ? "border-team-1-base bg-team-1-tint text-team-1-text shadow-[inset_2px_0_0_hsl(var(--team-1-base))]"
                          : "border-border bg-muted/40 text-foreground",
                      )}
                    >
                      {isChosen ? `✓ ${option.label}` : option.label}
                    </div>
                  );
                })}
                <p className="pt-0.5 text-[7.5px] font-bold text-muted-foreground md:text-[8px]">
                  ✓ تم اختيار الإجابة
                </p>
              </div>
            ) : activeStep === 1 ? (
              <PhoneStateBox
                tone="blue"
                icon={<Lock className="size-4" aria-hidden />}
                title="ثبتّ إجابتك"
                subtitle="ما تنكشف للخصم"
                testId="explainer-lock-answering"
                dataLocked="true"
              />
            ) : activeStep === 2 ? (
              <PhoneStateBox
                tone="blue"
                icon={<Lock className="size-4" aria-hidden />}
                title="إجابتك محفوظة"
                subtitle="بانتظار الكشف"
                testId="explainer-lock-answering"
                dataLocked="true"
              />
            ) : (
              <PhoneOutcomeBox
                won={answeredCorrectly}
                title={answeredCorrectly ? "إجابتك صحيحة!" : "إجابتك خاطئة"}
                subtitle={correctChoice?.label ?? ""}
              />
            )}
          </IntegratedIphoneSlot>
        </div>
      </div>

      {/* Subtle TV stand bar */}
      <div
        aria-hidden
        className="mx-auto mt-2.5 h-[5px] w-24 rounded-full bg-white/25"
      />
    </div>
  );
}

function IntegratedIphoneSlot({
  teamLabel,
  teamShort,
  identity,
  acting,
  areaClass,
  status,
  testId,
  ariaLabel,
  children,
}: {
  teamLabel: string;
  teamShort: string;
  identity: ReturnType<typeof teamIdentity>;
  acting: boolean;
  areaClass: string;
  status: string;
  testId: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      data-acting={acting ? "true" : "false"}
      className={cn(
        "relative z-[1] flex w-full max-w-[112px] flex-col items-center gap-1.5 md:max-w-[128px]",
        areaClass,
      )}
    >
      <div className="flex max-w-full items-center justify-center gap-1.5 text-[10px] font-extrabold text-brand-navy">
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-full", identity.dot)}
        />
        <span className="truncate">{teamLabel}</span>
      </div>

      <div
        aria-label={`${ariaLabel}: ${status}`}
        className={cn(
          "v6-iphone-shell relative box-border h-[242px] w-full rounded-[24px] border border-[#555b6b] bg-[linear-gradient(128deg,#5b6070_0%,#161821_12%,#080a10_68%,#585b66_100%)] p-[3px] transition-all duration-200 md:h-[282px] md:rounded-[27px]",
          acting
            ? "motion-safe:-translate-y-[3px] shadow-[0_0_0_2px_hsl(var(--brand-gold)),0_12px_22px_-7px_hsl(var(--brand-navy)/0.38)]"
            : "shadow-[0_10px_18px_-8px_hsl(var(--brand-navy)/0.34)]",
        )}
      >
        <span
          aria-hidden
          className="absolute -right-[3px] top-[64px] h-[20px] w-[2px] rounded bg-[#747784]"
        />
        <span
          aria-hidden
          className="absolute -left-[3px] top-[58px] h-[28px] w-[2px] rounded bg-[#8b8e9a]"
        />

        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border border-[#05060b] bg-card text-foreground md:rounded-[23px]">
          {/* Status bar + Dynamic Island */}
          <div
            dir="ltr"
            className={cn(
              "relative flex h-[19px] shrink-0 items-center justify-between px-2 pt-0.5 md:h-[22px]",
              identity.surface,
            )}
          >
            <span className="font-sans text-[8px] font-extrabold text-foreground">
              9:41
            </span>
            <span className="absolute left-1/2 top-[3.5px] flex h-[11px] w-[35px] -translate-x-1/2 items-center justify-end rounded-full bg-[#07080c] pr-1">
              <span className="size-[4px] rounded-full border border-[#222a49] bg-[#151f39]" />
            </span>
            <svg
              width="24"
              height="9"
              viewBox="0 0 27 10"
              aria-hidden
              className="text-foreground/80"
            >
              <path
                fill="currentColor"
                d="M1 9V6h3v3zM5 9V4h3v5zM9 9V2h3v7zM14 7q4-5 8 0l-4 3zM23 3h4v6h-4z"
              />
            </svg>
          </div>

          {/* Mini app bar */}
          <div
            className={cn(
              "flex shrink-0 items-center gap-1 border-b border-border/70 px-1.5 py-1",
              identity.surface,
            )}
          >
            <span className="grid size-[17px] shrink-0 place-items-center rounded-[5px] bg-brand-navy font-display text-[9px] font-extrabold text-white">
              أ
            </span>
            <div className="flex min-w-0 flex-col">
              <b className="text-[8px] leading-tight text-foreground">أكوان</b>
              <small className="truncate text-[7px] leading-tight text-muted-foreground">
                {status}
              </small>
            </div>
          </div>

          {/* Interactive demo body */}
          <div className="flex min-h-0 flex-1 flex-col justify-center bg-card px-1.5 py-1.5 text-center">
            {children}
          </div>

          {/* Footer + Home Bar */}
          <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-card px-1.5 py-1 text-[7px] font-bold text-muted-foreground">
            <span className="truncate max-w-[54px]">{teamShort}</span>
            <span className="flex items-center gap-1">
              <i className="size-[5px] rounded-full bg-success" aria-hidden />
              متصل
            </span>
          </div>
          <div
            aria-hidden
            className="grid h-[10px] shrink-0 place-items-center bg-card"
          >
            <span className="h-[3px] w-[32px] rounded-full bg-brand-navy/85" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PhoneStateBox({
  tone,
  icon,
  title,
  subtitle,
  testId,
  dataLocked,
}: {
  tone: "blue" | "red";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  testId?: string;
  dataLocked?: string;
}) {
  const iconColors =
    tone === "blue"
      ? "bg-team-1-tint text-team-1-text"
      : "bg-team-2-tint text-team-2-text";
  return (
    <div
      data-testid={testId}
      data-locked={dataLocked}
      className="flex flex-col items-center justify-center gap-1.5 px-1 py-1 text-center"
    >
      <span
        className={cn(
          "grid size-9 place-items-center rounded-xl",
          iconColors,
        )}
      >
        {icon}
      </span>
      <strong className="text-[10px] font-bold leading-snug text-foreground">
        {title}
      </strong>
      <small className="text-[8px] leading-snug text-muted-foreground">
        {subtitle}
      </small>
    </div>
  );
}

function PhoneOutcomeBox({
  won,
  title,
  subtitle,
}: {
  won: boolean;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[88px] w-full flex-col items-center justify-center gap-1.5 rounded-lg px-1.5 py-2 text-center",
        won
          ? "bg-success-subtle text-success"
          : "bg-muted text-foreground",
      )}
    >
      <span
        className={cn(
          "grid size-8 place-items-center rounded-xl",
          won ? "bg-success/15 text-success" : "bg-background text-foreground",
        )}
      >
        <Check className="size-4" aria-hidden />
      </span>
      <strong className="text-[10px] font-bold leading-snug">{title}</strong>
      {subtitle && <small className="text-[9px] font-semibold">{subtitle}</small>}
    </div>
  );
}

/**
 * Shared TV bezel + step rail for all non-RYO mechanics, preserving each
 * mechanic's own `MechanicTutorialRenderer`, stage counts, and GSAP timeline.
 */
function GenericV6TutorialSection({
  scenario,
  challengeName,
  launching,
  repeatEncounter,
  autoStartFromExpand,
  teamNames,
}: {
  scenario: TutorialScenario;
  challengeName: string;
  launching: boolean;
  repeatEncounter: boolean;
  autoStartFromExpand: boolean;
  teamNames: ReturnType<typeof resolveDisplayTeams>;
}) {
  const scenes = useMemo(() => scenesFor(scenario), [scenario]);
  const steps = useMemo(() => inlineSteps(scenario), [scenario]);
  const [introActive, setIntroActive] = useState<boolean>(
    () => !autoStartFromExpand,
  );
  const [activeScene, setActiveScene] = useState(0);
  const [timelineControls, setTimelineControls] =
    useState<ExplainerTimelineControls | null>(null);
  const [compact, setCompact] = useState(false);
  const userInteractedRef = useRef(autoStartFromExpand);
  const pendingExpandPlayRef = useRef(autoStartFromExpand);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setCompact(!media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const activeStep = useMemo(() => {
    let matched = 0;
    for (let index = 0; index < steps.length; index += 1) {
      if (steps[index].sceneIndex <= activeScene) {
        matched = index;
      } else {
        break;
      }
    }
    return matched;
  }, [activeScene, steps]);

  const current = steps[Math.min(activeStep, Math.max(steps.length - 1, 0))];

  useEffect(() => {
    if (
      !introActive ||
      repeatEncounter ||
      autoStartFromExpand ||
      launching ||
      userInteractedRef.current ||
      !timelineControls ||
      timelineControls.reducedMotion
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (userInteractedRef.current) return;
      setIntroActive(false);
      setActiveScene(0);
      if (!timelineControls.playing) {
        timelineControls.toggle();
      }
    }, INTRO_AUTO_ADVANCE_MS);

    return () => window.clearTimeout(timer);
  }, [
    autoStartFromExpand,
    introActive,
    launching,
    repeatEncounter,
    timelineControls,
  ]);

  useEffect(() => {
    if (!pendingExpandPlayRef.current || !timelineControls) return;
    pendingExpandPlayRef.current = false;
    if (!timelineControls.reducedMotion && !timelineControls.playing) {
      timelineControls.toggle();
    }
  }, [timelineControls]);

  const handleTimelineSelect = useCallback((sceneIndex: number) => {
    setActiveScene(sceneIndex);
  }, []);

  const selectStep = useCallback(
    (nextStep: number) => {
      userInteractedRef.current = true;
      if (nextStep < 0) {
        setIntroActive(true);
        setActiveScene(0);
        timelineControls?.goTo(0);
        return;
      }
      const clamped = Math.min(
        Math.max(nextStep, 0),
        Math.max(steps.length - 1, 0),
      );
      const targetScene = steps[clamped]?.sceneIndex ?? 0;
      setIntroActive(false);
      setActiveScene(targetScene);
      timelineControls?.goTo(targetScene);
    },
    [steps, timelineControls],
  );

  const startFromIntro = useCallback(() => {
    userInteractedRef.current = true;
    setIntroActive(false);
    setActiveScene(0);
    if (
      timelineControls &&
      !timelineControls.reducedMotion &&
      !timelineControls.playing
    ) {
      timelineControls.toggle();
    }
  }, [timelineControls]);

  const handleTogglePlay = useCallback(() => {
    userInteractedRef.current = true;
    if (introActive) {
      startFromIntro();
      return;
    }
    timelineControls?.toggle();
  }, [introActive, startFromIntro, timelineControls]);

  const handleReplay = useCallback(() => {
    userInteractedRef.current = true;
    setIntroActive(true);
    setActiveScene(0);
    timelineControls?.goTo(0);
  }, [timelineControls]);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const next = Math.min(steps.length - 1, index + 1);
        selectStep(next);
        document
          .getElementById(`preflight-inline-tutorial-step-${next}`)
          ?.focus();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        const prev = Math.max(0, index - 1);
        selectStep(prev);
        document
          .getElementById(`preflight-inline-tutorial-step-${prev}`)
          ?.focus();
      }
    },
    [selectStep, steps.length],
  );

  if (!current) return null;

  const progressRatio =
    introActive || steps.length <= 1 ? 0 : activeStep / (steps.length - 1);
  const progressPercent = `${progressRatio * ((steps.length - 1) / steps.length) * 100}%`;
  const reducedMotion = timelineControls?.reducedMotion ?? false;
  const playing = timelineControls?.playing ?? false;
  const activeCaption = introActive
    ? "هذا مجرد شرح لطريقة اللعب — ما راح تظهر أسئلة التحدي الحقيقي هنا."
    : scenes[activeScene]?.caption ?? current.caption;
  const positionLabel = introActive
    ? "بطاقة البداية"
    : `${activeStep + 1} / ${steps.length}`;

  return (
    <div
      data-tutorial-step={introActive ? "-1" : String(activeStep)}
      data-tutorial-scene={String(activeScene)}
    >
      <div className="v6-tv-bezel rounded-[20px] bg-brand-navy p-2.5 shadow-[0_5px_14px_hsl(var(--brand-navy)/0.16)] sm:p-4">
        <div className="mb-1.5 flex min-h-[24px] items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-bold text-white/80">
            <span
              aria-hidden
              className="size-2 rounded-full bg-white/75 ring-[3px] ring-white/15"
            />
            عرض على الشاشة المشتركة
          </div>
          <span className="hidden items-center gap-1.5 text-[10px] font-bold text-brand-gold sm:inline-flex">
            <span aria-hidden>◉</span> شاهد خطوات التحدي
          </span>
        </div>

        <div className="flex flex-col overflow-hidden rounded-[13px] bg-background">
          <div className="flex min-h-[36px] items-center justify-between gap-2 border-b-[3px] border-brand-gold bg-[hsl(239_44%_12%)] px-2.5 py-2 text-[10px] font-bold text-white sm:min-h-[40px] sm:px-4 sm:text-xs">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="text-brand-gold">
                ◉
              </span>
              شرح توضيحي · مو السؤال الحقيقي
            </span>
            <span className="akwaan-numeral whitespace-nowrap text-brand-gold">
              {positionLabel}
            </span>
          </div>

          <div
            id="preflight-inline-tutorial-panel"
            role="tabpanel"
            aria-labelledby={
              !introActive
                ? `preflight-inline-tutorial-step-${activeStep}`
                : undefined
            }
            className="relative min-w-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--card))_0%,hsl(var(--background))_75%)] p-2.5 sm:p-4"
          >
            {introActive && (
              <div
                data-testid="preflight-inline-tutorial-intro"
                className="mb-3 flex flex-col items-center justify-center gap-2 rounded-2xl border border-brand-gold/40 bg-card/95 px-3 py-3 text-center shadow-sm sm:flex-row sm:justify-between sm:px-4"
              >
                <div className="flex flex-col items-center gap-1 text-center sm:items-start sm:text-right">
                  <span className="inline-flex rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                    بطاقة البداية · شرح في {steps.length} خطوات
                  </span>
                  <h2 className="font-display text-base font-bold leading-snug text-brand-navy sm:text-lg">
                    {challengeName}
                  </h2>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="hidden text-[11px] font-bold text-muted-foreground md:inline">
                    ما راح يبدأ التحدي — هذا عرض بس
                  </span>
                  <button
                    type="button"
                    data-testid="preflight-inline-tutorial-intro-start"
                    aria-label="ابدأ الشرح الآن"
                    onClick={startFromIntro}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border-2 border-brand-navy bg-brand-gold px-3.5 text-xs font-bold text-brand-navy shadow-[0_3px_0_hsl(var(--brand-navy))] transition-transform active:translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Play className="size-4 fill-current" aria-hidden />
                    ابدأ الشرح
                  </button>
                </div>
              </div>
            )}
            <ExplainerTimelineSelectionProvider
              selectedIndex={activeScene}
              onSelect={handleTimelineSelect}
              autoPlay={false}
              onControlsReady={setTimelineControls}
            >
              <TutorialStagePresentationProvider
                embedded
                teamNames={teamNames}
              >
                <div className="min-w-0 [&_[data-testid='explainer-caption']]:hidden [&_[data-testid='explainer-controls']]:hidden">
                  <MechanicTutorialRenderer
                    scenario={scenario}
                    compact={compact || launching}
                    mode="player"
                  />
                </div>
              </TutorialStagePresentationProvider>
            </ExplainerTimelineSelectionProvider>
          </div>
        </div>
        <div
          aria-hidden
          className="mx-auto mt-2.5 h-[5px] w-24 rounded-full bg-white/25"
        />
      </div>

      <p
        data-testid="preflight-inline-tutorial-caption"
        aria-live="polite"
        className="mt-2.5 grid min-h-[44px] place-items-center px-1 text-center text-sm font-semibold leading-relaxed text-foreground sm:text-[15px]"
      >
        {activeCaption}
      </p>

      <div className="relative mt-1 px-2 sm:px-4">
        <div
          role="tablist"
          aria-label="خطوات الشرح التوضيحي"
          className="relative grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute top-[14px] h-[3px] rounded-full bg-border"
            style={{
              right: `${50 / steps.length}%`,
              left: `${50 / steps.length}%`,
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-[14px] z-[1] h-[3px] rounded-full bg-brand-gold transition-[width] duration-base"
            style={{
              right: `${50 / steps.length}%`,
              width: progressPercent,
            }}
          />
          {steps.map((step, index) => {
            const isCurrent = !introActive && activeStep === index;
            const isDone = !introActive && activeStep > index;
            return (
              <button
                key={`${step.sceneIndex}-${step.label}`}
                id={`preflight-inline-tutorial-step-${index}`}
                type="button"
                role="tab"
                aria-selected={isCurrent}
                aria-current={isCurrent ? "step" : undefined}
                aria-controls="preflight-inline-tutorial-panel"
                aria-label={`انتقل إلى خطوة ${index + 1}: ${step.label}`}
                tabIndex={
                  introActive
                    ? index === 0
                      ? 0
                      : -1
                    : isCurrent
                      ? 0
                      : -1
                }
                onClick={() => selectStep(index)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={cn(
                  "relative z-[2] flex min-h-[44px] flex-col items-center gap-2 border-0 bg-transparent px-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isCurrent
                    ? "font-bold text-brand-navy"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "rounded-full transition-all duration-200",
                    isCurrent
                      ? "mt-[5px] size-5 border-[3px] border-brand-navy bg-brand-gold shadow-[0_0_0_4px_hsl(var(--brand-gold)/0.3)]"
                      : isDone
                        ? "mt-[9px] size-[13px] border-2 border-brand-gold bg-brand-gold"
                        : "mt-[9px] size-[13px] border-2 border-border bg-card",
                  )}
                />
                <span className="hidden max-w-full truncate sm:block">
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 min-h-[18px] text-center text-xs font-bold text-foreground sm:hidden">
          {introActive ? "ابدأ الشرح" : `الآن: ${current.label}`}
        </p>
      </div>

      <div className="relative mt-1.5 flex min-h-[60px] items-center justify-center gap-3.5">
        <button
          type="button"
          data-testid="preflight-inline-tutorial-prev"
          aria-label="الخطوة السابقة"
          disabled={introActive || !timelineControls}
          onClick={() => selectStep(activeStep - 1)}
          className="grid size-[52px] place-items-center rounded-full border-[3px] border-brand-navy bg-white text-brand-navy transition-colors hover:bg-muted disabled:border-border disabled:text-disabled-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>

        {!reducedMotion && (
          <button
            type="button"
            data-testid="preflight-inline-tutorial-play"
            data-playing={playing ? "true" : "false"}
            aria-label={playing ? "إيقاف الشرح" : "تشغيل الشرح"}
            disabled={!timelineControls}
            onClick={handleTogglePlay}
            className="grid size-[68px] place-items-center rounded-full border-[3px] border-brand-navy bg-brand-gold text-brand-navy shadow-[4px_5px_0_hsl(var(--brand-navy))] transition-transform active:translate-y-0.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {playing ? (
              <Pause className="size-6 fill-current" aria-hidden />
            ) : (
              <Play className="size-6 fill-current" aria-hidden />
            )}
          </button>
        )}

        <button
          type="button"
          data-testid="preflight-inline-tutorial-next"
          aria-label="الخطوة التالية"
          disabled={
            (!introActive && activeStep >= steps.length - 1) ||
            !timelineControls
          }
          onClick={() => selectStep(introActive ? 0 : activeStep + 1)}
          className="grid size-[52px] place-items-center rounded-full border-[3px] border-brand-navy bg-white text-brand-navy transition-colors hover:bg-muted disabled:border-border disabled:text-disabled-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>

        <button
          type="button"
          data-testid="preflight-inline-tutorial-replay"
          disabled={!timelineControls}
          onClick={handleReplay}
          className="inline-flex min-h-[44px] items-center gap-1 px-2 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground sm:absolute sm:left-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          أعد الشرح
        </button>
      </div>
    </div>
  );
}
