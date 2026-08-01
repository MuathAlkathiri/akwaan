"use client";

import { FocusEvent, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { Category } from "@/types";
import { getEntityId } from "@/lib/utils";
import { CarouselNavigation } from "./carousel-navigation";
import { NewCategoryCarouselCard } from "./new-category-carousel-card";

function circularPosition(index: number, active: number, total: number) {
  let distance = index - active;
  if (distance > total / 2) distance -= total;
  if (distance < -total / 2) distance += total;
  return distance;
}

export function NewCategoriesCarousel({
  categories,
  selectedIds,
  onToggle,
}: {
  categories: Category[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const pointerStart = useRef<number>();
  const total = categories.length;
  const selectionFull = selectedIds.length >= 6;
  const go = (direction: -1 | 1) =>
    setActiveIndex((current) => (current + direction + total) % total);

  useEffect(() => {
    if (activeIndex >= total) setActiveIndex(0);
  }, [activeIndex, total]);

  useEffect(() => {
    if (paused || total < 2) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % total);
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [paused, total]);

  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
  }

  if (!total) return null;

  return (
    <section
      aria-labelledby="new-categories-heading"
      className="overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-[radial-gradient(circle_at_50%_30%,rgba(107,48,175,.22),transparent_28rem),rgba(255,255,255,.025)] px-3 py-5 sm:px-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={handleBlur}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black text-[#22C55E]">وصلت حديثًا</p>
          <h2 id="new-categories-heading" className="mt-1 text-3xl font-black">
            الفئات الجديدة
          </h2>
        </div>
        <Sparkles className="size-6 text-primary" aria-hidden />
      </div>

      <div
        className="relative mx-auto mt-2 h-[23rem] w-full max-w-6xl touch-pan-y overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] sm:h-[29rem] lg:h-[33rem]"
        role="region"
        aria-roledescription="عارض فئات"
        aria-label="الفئات الجديدة"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            go(-1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            go(1);
          }
        }}
        onPointerDown={(event) => {
          pointerStart.current = event.clientX;
        }}
        onPointerUp={(event) => {
          if (pointerStart.current === undefined) return;
          const distance = event.clientX - pointerStart.current;
          pointerStart.current = undefined;
          if (Math.abs(distance) >= 42) go(distance > 0 ? -1 : 1);
        }}
        onPointerCancel={() => {
          pointerStart.current = undefined;
        }}
      >
        {categories.map((category, index) => {
          const rawPosition = circularPosition(index, activeIndex, total);
          if (rawPosition < -2 || rawPosition > 2) return null;
          const id = getEntityId(category);
          return (
            <NewCategoryCarouselCard
              key={id}
              category={category}
              position={rawPosition as -2 | -1 | 0 | 1 | 2}
              active={rawPosition === 0}
              selected={selectedIds.includes(id)}
              disabled={selectionFull}
              onActivate={() => setActiveIndex(index)}
              onToggle={() => onToggle(id)}
            />
          );
        })}
      </div>
      {total > 1 && (
        <CarouselNavigation
          onPrevious={() => go(-1)}
          onNext={() => go(1)}
        />
      )}
      <p className="mt-3 text-center text-sm font-bold text-zinc-400">
        {activeIndex + 1} من {total}
      </p>
    </section>
  );
}
