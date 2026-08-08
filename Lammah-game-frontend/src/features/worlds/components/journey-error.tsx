"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A failed request, said out loud.
 *
 * The player journey used to render an authorization or network failure as "no
 * content yet", which hid a real defect behind a reasonable-looking screen.
 * Anything that fails now says so and offers the one useful action.
 */
export function JourneyError({
  title,
  description,
  onRetry,
  retrying = false,
  retryLabel = "حاول مرة أخرى",
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      data-testid="journey-error"
      className="rounded-3xl border border-destructive/20 bg-card p-10 text-center shadow-[0_10px_30px_rgba(24,16,54,.05)]"
    >
      <AlertTriangle
        className="mx-auto h-8 w-8 text-destructive"
        aria-hidden="true"
      />
      <p className="mt-4 text-lg font-black text-foreground">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      )}
      {onRetry && (
        <Button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-6 rounded-[var(--radius)] font-black"
        >
          <RotateCcw className="ml-2 h-4 w-4" aria-hidden="true" />
          {retrying ? "جارٍ المحاولة..." : retryLabel}
        </Button>
      )}
    </div>
  );
}
