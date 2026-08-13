"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The lightly cosmic layer, on a warm off-white room.
 *
 * A dark starfield does not survive being inverted — bright dots on cream read as
 * dust. So this is the opposite: sparse, slightly darker warm motes that drift,
 * and lean gently toward the pointer. On this background it reads as depth rather
 * than as noise, which is the only version worth keeping.
 *
 * Deliberately an *experience* component, not something baked into a Card or the
 * body background: it is mounted once by the shell, sits behind everything at
 * very low contrast, and never covers World artwork — the artwork is opaque and
 * paints over it.
 *
 * It stops entirely under `prefers-reduced-motion`, and falls back to a static
 * paint when there is no canvas, no pointer, or the device is small enough that
 * an rAF loop is not worth the battery.
 */

/**
 * Sparser and fainter than when this sat on the Match route alone.
 *
 * It now covers home, the World catalog and setup too — screens with far more
 * text and more cards than a board — so the density that read as depth behind a
 * Match reads as dust behind a paragraph. Fewer motes, lower ceiling.
 */
const STAR_COUNT = 34;
/** Kept far below the text contrast floor: this must never fight a paragraph. */
const MAX_ALPHA = 0.1;
const POINTER_PULL = 26;

interface Mote {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  driftX: number;
  driftY: number;
}

export function Starfield({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // Motion, a pointer, and a screen big enough to be a shared screen. A phone
    // sitting on this for a whole Match should not be running a render loop.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(pointer: fine)");
    const wide = window.matchMedia("(min-width: 768px)");
    const decide = () =>
      setAnimate(!reduced.matches && fine.matches && wide.matches);
    decide();
    for (const query of [reduced, fine, wide]) {
      query.addEventListener("change", decide);
    }
    return () => {
      for (const query of [reduced, fine, wide]) {
        query.removeEventListener("change", decide);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!animate || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let height = 0;
    let motes: Mote[] = [];
    let frame = 0;
    const pointer = { x: -1, y: -1 };

    const seed = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      motes = Array.from({ length: STAR_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.7 + Math.random() * 1.5,
        alpha: 0.03 + Math.random() * MAX_ALPHA,
        driftX: (Math.random() - 0.5) * 0.06,
        driftY: (Math.random() - 0.5) * 0.06,
      }));
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      for (const mote of motes) {
        mote.x = (mote.x + mote.driftX + width) % width;
        mote.y = (mote.y + mote.driftY + height) % height;

        // Gravity: a mote leans toward the pointer, more the closer it is. Small
        // enough to notice only when you move, which is the delightful version.
        let x = mote.x;
        let y = mote.y;
        if (pointer.x >= 0) {
          const dx = pointer.x - mote.x;
          const dy = pointer.y - mote.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 1 && distance < 220) {
            const pull = (1 - distance / 220) ** 2 * POINTER_PULL;
            x += (dx / distance) * pull;
            y += (dy / distance) * pull;
          }
        }
        context.beginPath();
        context.arc(x, y, mote.radius, 0, Math.PI * 2);
        context.fillStyle = `hsl(219 45% 16% / ${mote.alpha})`;
        context.fill();
      }
      frame = window.requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
    };
    const onPointerLeave = () => {
      pointer.x = -1;
      pointer.y = -1;
    };

    seed();
    frame = window.requestAnimationFrame(draw);
    const observer = new ResizeObserver(seed);
    observer.observe(canvas);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [animate]);

  return (
    <div
      aria-hidden
      data-testid="akwaan-starfield"
      data-animated={animate ? "true" : "false"}
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 overflow-hidden",
        className,
      )}
    >
      {animate ? (
        <canvas ref={canvasRef} className="size-full" />
      ) : (
        // The static fallback: the same idea, painted once, costing nothing.
        <div className="size-full bg-[radial-gradient(circle_at_18%_12%,hsl(219_45%_16%/0.04),transparent_22rem),radial-gradient(circle_at_82%_68%,hsl(219_45%_16%/0.03),transparent_26rem)]" />
      )}
    </div>
  );
}
