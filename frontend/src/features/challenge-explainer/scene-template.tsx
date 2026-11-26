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
import { usePrefersReducedMotion } from "./use-explainer-timeline";
import styles from "./scene.module.css";

export const STEP_NAMES = [
  "السؤال والقرار",
  "عرض الإجابة",
  "تحديد الفائز",
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
      <div className={styles.scene} ref={scene}>
        {["team-a", undefined, "team-b"].map((team) => (
          <ScaledSurface key={team ?? "shared"} phone={!!team}>
            {renderSurface(step, team)}
          </ScaledSurface>
        ))}
      </div>
      <p className={styles.caption}>{captions[step]}</p>
      <ol className={styles.timeline}>
        {STEP_NAMES.map((label, index) => (
          <li key={label}>
            <button
              aria-current={step === index ? "step" : undefined}
              onClick={() => seek(index)}
            >
              {index + 1} · {label}
            </button>
          </li>
        ))}
      </ol>
      <div className={styles.controls}>
        <button aria-label="السابق" onClick={() => seek(step - 1)}>
          <ChevronRight />
        </button>
        <button
          aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}
          disabled={reduced}
          onClick={() => setPaused(!paused)}
        >
          {playing ? <Pause /> : <Play />}
        </button>
        <button aria-label="التالي" onClick={() => seek(step + 1)}>
          <ChevronLeft />
        </button>
        <button
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
  const shell = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const frame = shell.current,
      inner = canvas.current;
    if (!frame || !inner || typeof ResizeObserver === "undefined") return;
    const resize = () =>
      setScale(
        Math.min(
          frame.clientWidth / inner.offsetWidth,
          frame.clientHeight / Math.max(1, inner.offsetHeight),
        ),
      );
    const observer = new ResizeObserver(resize);
    observer.observe(frame);
    observer.observe(inner);
    resize();
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className={phone ? styles.phone : styles.screen}
      ref={(node) => {
        shell.current = node;
        node?.setAttribute("inert", "");
      }}
    >
      <div
        className={styles.canvas}
        ref={canvas}
        style={{
          width: phone ? 360 : 900,
          transform: `translate(50%, -50%) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
