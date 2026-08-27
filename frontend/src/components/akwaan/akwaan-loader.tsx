"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The one branded loading presentation, for meaningful entry and recovery waits
 * (initial Match hydration, Resume, the Match-creation orchestration).
 *
 * The logo is held perfectly still — it never pulses or zooms — while two thin
 * orbits carry a small gold dot around it, the same celestial language as the
 * page background. The contextual line is always caller-supplied, so no screen
 * hardcodes another's phrase.
 *
 * It is a status region, not a spinner: `role="status"` + a polite live label so a
 * screen reader hears what is being prepared. Under reduced motion the orbits stop
 * and the loader is a still, legible mark — the words carry the meaning.
 */
export function AkwaanLoader({
  label,
  className,
}: {
  /** e.g. "نجهّز المباراة..." — what the room is waiting for, in the caller's words. */
  label?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="akwaan-loader"
      className={cn(
        "flex min-h-[45vh] flex-col items-center justify-center gap-6 text-center",
        className,
      )}
    >
      <div className="relative grid size-28 place-items-center">
        <span
          aria-hidden
          data-testid="akwaan-loader-orbit"
          data-motion={reduced ? "reduced" : "animated"}
          className={cn(
            "absolute inset-0 rounded-full border border-[hsl(var(--brand-gold)/.3)]",
            !reduced && "akwaan-orbit",
          )}
        >
          <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--brand-gold))]" />
        </span>
        <span
          aria-hidden
          className={cn(
            "absolute inset-3 rounded-full border border-[hsl(var(--brand-navy)/.12)]",
            !reduced && "akwaan-orbit-reverse",
          )}
        >
          <span className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-[hsl(var(--brand-navy)/.55)]" />
        </span>
        <span className="relative block h-11 w-[5.5rem]">
          <Image
            src="/brand/akwaan-logo.png"
            alt=""
            fill
            priority
            sizes="88px"
            className="object-contain"
          />
        </span>
      </div>
      {label && (
        <p className="text-sm font-bold text-[hsl(var(--brand-navy)/.75)]">
          {label}
        </p>
      )}
      <span className="sr-only">{label ?? "جارٍ التحميل"}</span>
    </div>
  );
}

/** Self-contained motion preference, watched so a mid-load change is honoured. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const decide = () => setReduced(query.matches);
    decide();
    query.addEventListener("change", decide);
    return () => query.removeEventListener("change", decide);
  }, []);
  return reduced;
}
