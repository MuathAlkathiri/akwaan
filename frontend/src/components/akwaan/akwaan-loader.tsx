"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { FacePlanet } from "./state-card";

/**
 * The one branded loading presentation, for a whole screen with nothing yet to
 * show (initial Match hydration, Resume, the Match-creation orchestration).
 *
 * A lavender planet with a happy face, a dashed orbit and one gold star going
 * round it, inside the same lavender sticker card as the error states — so
 * waiting and failing are visibly one family. The line under it is the
 * caller's, in the first person plural: «نجهّز مباراتكم».
 *
 * It is a status region, not a spinner: `role="status"` with the title as the
 * announced text. Under reduced motion everything stops and the still picture
 * and the words still say it.
 */
export function AkwaanLoader({
  label,
  line,
  className,
}: {
  /** e.g. «نجهّز المباراة» — what is being prepared, in the caller's words. */
  label?: string;
  /** One quieter line under the title. */
  line?: string;
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
        "flex min-h-[45vh] flex-col items-center justify-center",
        className,
      )}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-[26px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-lavender px-8 py-9 text-center text-[hsl(var(--brand-navy))] shadow-[6px_7px_0_hsl(var(--brand-navy))]">
        <div className="relative grid size-36 place-items-center">
          <span
            aria-hidden
            data-testid="akwaan-loader-orbit"
            data-motion={reduced ? "reduced" : "animated"}
            className={cn(
              "absolute inset-0 rounded-full border-2 border-dashed border-brand-dash",
              !reduced && "akwaan-orbit",
            )}
          >
            <svg
              viewBox="-12 -12 24 24"
              className="absolute left-1/2 top-0 size-6 -translate-x-1/2 -translate-y-1/2"
            >
              <path
                d="M0 -10 Q1.8 -1.8 10 0 Q1.8 1.8 0 10 Q-1.8 1.8 -10 0 Q-1.8 -1.8 0 -10Z"
                fill="hsl(var(--brand-gold))"
                stroke="hsl(var(--brand-navy))"
                strokeWidth="2"
              />
            </svg>
          </span>
          <FacePlanet
            mood="happy"
            className={cn("size-24", !reduced && "akwaan-bob")}
          />
        </div>
        {label && (
          <p className="font-display text-2xl font-black leading-snug">
            {label}
          </p>
        )}
        {line && <p className="text-base text-brand-slate">{line}</p>}
        <span aria-hidden className="flex items-center gap-1.5">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              style={{ animationDelay: `${dot * 0.2}s` }}
              className={cn(
                "size-2 rounded-full bg-[hsl(var(--brand-navy))]",
                !reduced && "akwaan-dot",
              )}
            />
          ))}
        </span>
        {!label && <span className="sr-only">جارٍ التحميل</span>}
      </div>
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
