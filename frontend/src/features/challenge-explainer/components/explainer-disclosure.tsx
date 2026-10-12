"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import gsap from "gsap";
import { ChevronDown, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "../use-explainer-timeline";

/**
 * "كيف نلعب؟" as an inline disclosure inside the challenge card.
 *
 * Collapsed is the default and the common case: a compact header, one line of
 * orientation and a single clear trigger. No gameplay surface exists while
 * collapsed — the demo is **conditionally mounted**, which is what makes the
 * hard requirements fall out for free:
 *
 * - nothing animates while collapsed, because nothing is mounted;
 * - closing unmounts, so `useExplainerTimeline`'s `gsap.context` reverts and
 *   the timeline cannot survive to leak or fire callbacks;
 * - reopening mounts a fresh component, so playback always restarts from beat
 *   one without a reset path anyone has to remember to call.
 *
 * GSAP animates the height only. React owns open/closed, and the height tween
 * is released to `auto` on completion so a resize or a late image cannot be
 * clipped by a stale fixed height.
 */
export function ExplainerDisclosure({
  title = "كيف نلعب؟",
  summary,
  openLabel = "شاهد طريقة اللعب",
  closeLabel = "إخفاء الشرح",
  children,
  className,
  testId = "explainer-disclosure",
}: {
  title?: string;
  summary?: string;
  openLabel?: string;
  closeLabel?: string;
  /** Rendered only while open. */
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Set only by a close, so focus returns to the trigger on a user-driven
  // collapse without stealing focus on first paint.
  const returnFocus = useRef(false);
  const panelId = useId();

  useEffect(() => {
    const element = panelRef.current;
    if (!element) return;

    if (reducedMotion) {
      // No height choreography at all: the panel is simply there or not.
      gsap.set(element, { height: "auto", opacity: 1, clearProps: "height" });
      return;
    }

    const context = gsap.context(() => {
      if (open) {
        gsap.fromTo(
          element,
          { height: 0, opacity: 0 },
          {
            height: "auto",
            opacity: 1,
            duration: 0.42,
            ease: "power2.out",
            overwrite: "auto",
            // Release the measured height so later reflow is never clipped.
            onComplete: () => gsap.set(element, { height: "auto" }),
          },
        );
      }
    }, element);
    return () => context.revert();
  }, [open, reducedMotion]);

  useEffect(() => {
    if (!open && returnFocus.current) {
      triggerRef.current?.focus();
      returnFocus.current = false;
    }
  }, [open]);

  const toggle = useCallback(() => {
    setOpen((previous) => {
      if (previous) returnFocus.current = true;
      return !previous;
    });
  }, []);

  return (
    <section
      data-testid={testId}
      data-open={open ? "true" : "false"}
      className={cn("border-t border-border/70 pt-3", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-black text-foreground">{title}</p>
          {summary && (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {summary}
            </p>
          )}
        </div>
        <Button
          ref={triggerRef}
          type="button"
          size="sm"
          variant={open ? "outline" : "secondary"}
          data-testid={`${testId}-trigger`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="h-10 shrink-0 gap-1.5 font-black"
        >
          {open ? (
            <ChevronDown className="size-4 rotate-180 transition-transform" aria-hidden />
          ) : (
            <PlayCircle className="size-4" aria-hidden />
          )}
          {open ? closeLabel : openLabel}
        </Button>
      </div>

      {/* `overflow-hidden` only while the height is being animated; once the
          tween releases to `auto` the panel can grow freely. */}
      <div
        id={panelId}
        ref={panelRef}
        data-testid={`${testId}-panel`}
        hidden={!open}
        className={cn(!open && "hidden", "overflow-hidden")}
      >
        {open && <div className="pt-3">{children}</div>}
      </div>
    </section>
  );
}
