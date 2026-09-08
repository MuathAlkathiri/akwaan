import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Presentation only: callers supply already-authorized server result material. */
export function ResolutionReveal({
  title,
  children,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      dir="rtl"
      aria-label={title}
      data-testid="resolution-reveal"
      className={cn(
        "min-w-0 rounded-[var(--radius)] border border-primary/20 bg-card text-card-foreground",
        compact ? "space-y-3 p-3" : "space-y-5 p-5 sm:p-6",
      )}
    >
      <h3
        className={cn(
          "break-words font-black",
          compact ? "text-lg" : "text-xl sm:text-2xl",
        )}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

export function ResolutionAnswerRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
      <div className="break-words text-xl font-black [overflow-wrap:anywhere] sm:text-2xl">
        {children}
      </div>
    </div>
  );
}

export function ResolutionOutcome({ children }: { children: ReactNode }) {
  return (
    <p className="break-words rounded-lg bg-primary/10 px-3 py-2 text-base font-bold">
      {children}
    </p>
  );
}
