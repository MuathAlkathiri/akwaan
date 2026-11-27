"use client";

import { gsap } from "gsap";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { teamIdentity, TEAM_SLOT_ORDER } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-explainer-timeline";
import styles from "./scene.module.css";

export const STEP_NAMES = [
  "السؤال والقرار",
  "عرض الإجابة",
  "تحديد الفائز",
] as const;

export const SCENE_SCALE = 0.57;
export const SHARED_SCREEN_FRAME = {
  width: 912,
  height: 469,
  innerWidth: 1600,
  innerHeight: 823,
} as const;
export const PHONE_FRAME = {
  width: 222,
  height: 435,
  innerWidth: 390,
  innerHeight: 763,
} as const;

/**
 * The scene's own size, before it is scaled to the page.
 *
 * It is measured rather than computed: a device's label pill is wider than the
 * phone under it, and whatever the widest step's labels come to is what has to
 * fit — a guessed width clips the outer two devices.
 */
const LABEL_ROW_HEIGHT = 38;
const STAGE_WIDTH = PHONE_FRAME.width * 2 + SHARED_SCREEN_FRAME.width + 68;
const STAGE_HEIGHT = SHARED_SCREEN_FRAME.height + LABEL_ROW_HEIGHT;

/**
 * What each device is to the room, said once above it.
 *
 * The board puts the second team's phone on the right, the shared screen in the
 * middle and the first team's phone on the left, and labels every device with
 * its name and what it is doing in this step. The role text is the challenge's
 * own; `SceneTemplate` only places it.
 */
const DEVICES = [
  { team: "team-b", name: "الفريق الثاني", slot: TEAM_SLOT_ORDER[1] },
  { team: undefined, name: "الشاشة", slot: undefined },
  { team: "team-a", name: "الفريق الأول", slot: TEAM_SLOT_ORDER[0] },
] as const;

/** One step's role line for [team-a, team-b]; the screen's never changes. */
export type SceneDeviceRoles = readonly [string, string];
const SHARED_ROLE = "يشوفها الكل";

export function SceneTemplate({
  renderSurface,
  captions,
  roles,
}: {
  renderSurface: (step: number, team?: string) => ReactNode;
  captions: readonly [string, string, string];
  /** Per step, what each team's phone is doing. Absent keeps the pill to the name. */
  roles?: readonly [SceneDeviceRoles, SceneDeviceRoles, SceneDeviceRoles];
}) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const playing = !paused && !reduced;
  const scene = useRef<HTMLDivElement>(null);
  const stageShell = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [stage, setStage] = useState({
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
  });

  useEffect(() => {
    const shell = stageShell.current;
    const content = scene.current;
    if (!shell || !content || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = content.offsetWidth || STAGE_WIDTH;
      const height = content.offsetHeight || STAGE_HEIGHT;
      const available = shell.clientWidth;
      setStage((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
      if (available > 0) setFit(Math.min(1, available / width));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => setStep((value) => (value + 1) % 3),
      7000,
    );
    return () => window.clearInterval(timer);
  }, [playing, step]);

  useEffect(() => {
    if (
      reduced ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      !scene.current
    )
      return;
    const animation = gsap.fromTo(
      scene.current.children,
      { opacity: 0.7, y: 4 },
      { opacity: 1, y: 0, stagger: 0.04, duration: 0.28 },
    );
    return () => {
      animation.revert();
    };
  }, [step, reduced]);

  const seek = (value: number) => {
    setPaused(true);
    setStep((value + 3) % 3);
  };

  const roleOf = (team?: string) => {
    if (!team) return SHARED_ROLE;
    const pair = roles?.[step];
    if (!pair) return undefined;
    return team === "team-a" ? pair[0] : pair[1];
  };

  return (
    <section className={styles.template} dir="rtl" aria-label="شرح التحدي">
      <div className={styles.card}>
        <div className={styles.metaBar}>
          <span data-testid="scene-demo-badge">
            شرح توضيحي · مو السؤال الحقيقي
          </span>
          <span data-testid="scene-step-counter" className={styles.counter}>
            <bdi dir="ltr" className="akwaan-numeral">
              {step + 1} / 3
            </bdi>
          </span>
        </div>

        <div
          ref={stageShell}
          className={styles.stageShell}
          style={{ height: Math.ceil(stage.height * fit) }}
        >
          <div
            className={styles.stageViewport}
            style={{ transform: `translateX(-50%) scale(${fit})` }}
          >
            <div className={styles.scene} ref={scene}>
              {DEVICES.map(({ team, name, slot }) => {
                const role = roleOf(team);
                return (
                  <div key={team ?? "shared"} className={styles.deviceColumn}>
                    <span
                      data-testid={`scene-label-${team ?? "shared"}`}
                      className={styles.deviceLabel}
                    >
                      {slot && (
                        <i
                          aria-hidden
                          className={cn(
                            "size-3 shrink-0 rounded-full border-2 border-brand-navy",
                            teamIdentity(slot).dot,
                          )}
                        />
                      )}
                      {name}
                      {role && (
                        <span className={styles.deviceRole}>· {role}</span>
                      )}
                    </span>
                    <ScaledSurface phone={!!team}>
                      {renderSurface(step, team)}
                    </ScaledSurface>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <p className={styles.caption}>{captions[step]}</p>

      <div className={styles.stepRow}>
        <ol className={styles.timeline} data-testid="scene-timeline">
          <span aria-hidden className={styles.timelineTrack} />
          <span
            aria-hidden
            className={styles.timelineProgress}
            style={{ width: `${(step / (STEP_NAMES.length - 1)) * 66.667}%` }}
          />
          {STEP_NAMES.map((label, index) => {
            const current = index === step;
            const passed = index < step;
            return (
              <li key={label} className={styles.timelineItem}>
                <button
                  type="button"
                  aria-current={current ? "step" : undefined}
                  onClick={() => seek(index)}
                  className={styles.timelineButton}
                >
                  <span aria-hidden className={styles.timelineDotSlot}>
                    <span
                      data-state={
                        current ? "current" : passed ? "passed" : "upcoming"
                      }
                      className={cn(
                        "block rounded-full",
                        current &&
                          "size-[28px] border-4 border-brand-navy bg-brand-gold shadow-[0_0_0_5px_#F3E7CC]",
                        passed &&
                          "size-[18px] border-[3px] border-brand-navy bg-brand-navy",
                        !current &&
                          !passed &&
                          "size-[18px] border-[3px] border-brand-dash bg-white",
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      styles.timelineLabel,
                      current && "font-extrabold text-brand-navy",
                      passed && "font-semibold text-brand-navy",
                      !current && !passed && "font-semibold text-brand-slate",
                    )}
                  >
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className={styles.controls}>
          <button
            type="button"
            aria-label="السابق"
            onClick={() => seek(step - 1)}
            className={styles.controlRound}
          >
            <ChevronRight className="size-[22px]" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={playing ? "إيقاف مؤقت" : "شغّل الشرح"}
            disabled={reduced}
            onClick={() => setPaused(!paused)}
            className={styles.controlPlay}
          >
            {playing ? (
              <Pause className="size-[30px]" aria-hidden />
            ) : (
              <Play className="size-[30px]" aria-hidden />
            )}
          </button>
          <button
            type="button"
            aria-label="التالي"
            onClick={() => seek(step + 1)}
            className={styles.controlRound}
          >
            <ChevronLeft className="size-[22px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              setStep(0);
              setPaused(false);
            }}
            className={styles.controlText}
          >
            <RotateCcw className="size-4" aria-hidden />
            أعد الشرح
          </button>
        </div>
      </div>
    </section>
  );
}

function ScaledSurface({
  phone,
  children,
}: {
  phone: boolean;
  children: ReactNode;
}) {
  const frame = phone ? PHONE_FRAME : SHARED_SCREEN_FRAME;
  return (
    <div
      className={phone ? styles.phone : styles.screen}
      data-testid={phone ? "scene-phone-frame" : "scene-screen-frame"}
      style={{ width: frame.width, height: frame.height }}
      ref={(node) => {
        node?.setAttribute("inert", "");
      }}
    >
      <div
        className={phone ? styles.phoneCanvas : styles.screenCanvas}
        style={{
          width: frame.innerWidth,
          height: frame.innerHeight,
          transform: `scale(${SCENE_SCALE})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
