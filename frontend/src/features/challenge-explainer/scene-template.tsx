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

const STAGE_GAP = 14;
const STAGE_WIDTH =
  PHONE_FRAME.width + STAGE_GAP + SHARED_SCREEN_FRAME.width + STAGE_GAP + PHONE_FRAME.width;
const LABEL_ROW_HEIGHT = 42;
const STAGE_HEIGHT = SHARED_SCREEN_FRAME.height + LABEL_ROW_HEIGHT;

const DEVICES = [
  { team: "team-a", label: "جوال الفريق الأول", slot: TEAM_SLOT_ORDER[0] },
  { team: undefined, label: "الشاشة الرئيسية", slot: undefined },
  { team: "team-b", label: "جوال الفريق الثاني", slot: TEAM_SLOT_ORDER[1] },
] as const;

export function SceneTemplate({
  renderSurface,
  captions,
}: {
  renderSurface: (step: number, team?: string) => ReactNode;
  captions: readonly [string, string, string];
}) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const playing = !paused && !reduced;
  const scene = useRef<HTMLDivElement>(null);
  const stageShell = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);

  useEffect(() => {
    const shell = stageShell.current;
    if (!shell || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const available = shell.clientWidth;
      if (available > 0) {
        setFit(Math.min(1, available / STAGE_WIDTH));
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
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

  return (
    <section className={styles.template} dir="rtl" aria-label="شرح التحدي">
      <div
        className={cn(
          styles.card,
          "border-[3px] border-brand-navy bg-brand-paper shadow-[5px_6px_0_hsl(var(--brand-navy))]",
        )}
      >
        <div className={styles.metaBar}>
          <span
            data-testid="scene-demo-badge"
            className="inline-flex items-center rounded-full border-2 border-brand-navy bg-brand-lavender px-3 py-1 text-xs font-bold text-brand-navy sm:text-sm"
          >
            شرح توضيحي · مو السؤال الحقيقي
          </span>
          <span
            data-testid="scene-step-counter"
            className="inline-flex items-center rounded-full border-2 border-brand-navy bg-white px-3 py-1 text-xs font-extrabold text-brand-navy sm:text-sm"
          >
            <bdi dir="ltr" className="akwaan-numeral">
              {step + 1} / 3
            </bdi>
          </span>
        </div>

        <div
          ref={stageShell}
          className={styles.stageShell}
          style={{ height: Math.ceil(STAGE_HEIGHT * fit) }}
        >
          <div
            className={styles.stageViewport}
            style={{
              width: STAGE_WIDTH,
              height: STAGE_HEIGHT,
              transform: `translateX(-50%) scale(${fit})`,
            }}
          >
            <div className={styles.scene} ref={scene}>
              {DEVICES.map(({ team, label, slot }) => (
                <div key={team ?? "shared"} className={styles.deviceColumn}>
                  <span
                    data-testid={`scene-label-${team ?? "shared"}`}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-brand-navy bg-white px-3 py-1 text-xs font-extrabold text-brand-navy"
                  >
                    {slot && (
                      <i
                        aria-hidden
                        className={cn(
                          "size-2.5 shrink-0 rounded-full border border-brand-navy",
                          teamIdentity(slot).dot,
                        )}
                      />
                    )}
                    {label}
                  </span>
                  <ScaledSurface phone={!!team}>
                    {renderSurface(step, team)}
                  </ScaledSurface>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className={styles.caption}>{captions[step]}</p>

      <ol className={styles.timeline}>
        {STEP_NAMES.map((label, index) => (
          <li key={label} className="border-brand-dash">
            <button
              type="button"
              aria-current={step === index ? "step" : undefined}
              onClick={() => seek(index)}
            >
              {index + 1} · {label}
            </button>
          </li>
        ))}
      </ol>

      <div className={styles.controls}>
        <button type="button" aria-label="السابق" onClick={() => seek(step - 1)}>
          <ChevronRight />
        </button>
        <button
          type="button"
          aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}
          disabled={reduced}
          onClick={() => setPaused(!paused)}
        >
          {playing ? <Pause /> : <Play />}
        </button>
        <button type="button" aria-label="التالي" onClick={() => seek(step + 1)}>
          <ChevronLeft />
        </button>
        <button
          type="button"
          onClick={() => {
            setStep(0);
            setPaused(false);
          }}
        >
          <RotateCcw /> أعد الشرح
        </button>
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
