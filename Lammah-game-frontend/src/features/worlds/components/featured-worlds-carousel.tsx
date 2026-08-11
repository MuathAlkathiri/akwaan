"use client";

import { type FocusEvent, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlayableWorld } from "../types";
import { WorldCard } from "./world-card";

function circularPosition(index: number, active: number, total: number) {
  let distance = index - active;
  if (distance > total / 2) distance -= total;
  if (distance < -total / 2) distance += total;
  return distance;
}

export function FeaturedWorldsCarousel({
  worlds,
}: {
  worlds: PlayableWorld[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const pointerStart = useRef<number>();
  const total = worlds.length;

  useEffect(() => {
    if (activeIndex >= total) setActiveIndex(0);
  }, [activeIndex, total]);

  useEffect(() => {
    if (paused || total < 2) return;
    if (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % total);
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [paused, total]);

  if (!total) return null;

  const move = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + total) % total);
  };

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
  };

  return (
    <div>
      <div
        role="region"
        aria-roledescription="عارض عوالم"
        aria-label="العوالم المختارة"
        tabIndex={0}
        data-testid="featured-worlds-carousel"
        className="relative mx-auto h-[28rem] w-full touch-pan-y overflow-hidden rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            move(-1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(1);
          }
        }}
        onPointerDown={(event) => {
          setPaused(true);
          pointerStart.current = event.clientX;
        }}
        onPointerUp={(event) => {
          if (pointerStart.current === undefined) return;
          const distance = event.clientX - pointerStart.current;
          pointerStart.current = undefined;
          if (Math.abs(distance) >= 42) move(distance > 0 ? -1 : 1);
          setPaused(false);
        }}
        onPointerCancel={() => {
          pointerStart.current = undefined;
          setPaused(false);
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {worlds.map((world, index) => {
            const position = circularPosition(index, activeIndex, total);
            if (position < -1 || position > 1) return null;
            const active = position === 0;

            return (
              <div
                key={world.id}
                data-carousel-position={position}
                className={cn(
                  "absolute w-[min(86vw,24rem)] transform-gpu transition-[transform,opacity] duration-500 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none sm:w-[23rem] lg:w-[24rem]",
                  position === -1 &&
                    "z-10 -translate-x-[78%] scale-[.87] opacity-60 sm:-translate-x-[76%] lg:-translate-x-[82%]",
                  active && "z-30 translate-x-0 scale-100 opacity-100",
                  position === 1 &&
                    "z-10 translate-x-[78%] scale-[.87] opacity-60 sm:translate-x-[76%] lg:translate-x-[82%]",
                )}
              >
                <WorldCard
                  world={world}
                  featured
                  priority={index === 0}
                  carouselActive={active}
                  onCarouselActivate={() => setActiveIndex(index)}
                  className={cn(
                    "min-h-[27rem] sm:min-h-[28rem]",
                    !active && "hover:translate-y-0 hover:opacity-100",
                  )}
                />
              </div>
            );
          })}
        </div>
      </div>

      {total > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3" dir="rtl">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => move(-1)}
            aria-label="العالم السابق"
            className="rounded-full border-border bg-card/65 shadow-sm"
          >
            <ChevronRight className="size-5" aria-hidden />
          </Button>
          <p
            data-testid="featured-world-position"
            className="min-w-16 text-center text-sm font-bold text-muted-foreground"
            aria-live="polite"
          >
            <span className="akwaan-numeral">{activeIndex + 1}</span> من{" "}
            <span className="akwaan-numeral">{total}</span>
          </p>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => move(1)}
            aria-label="العالم التالي"
            className="rounded-full border-border bg-card/65 shadow-sm"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
