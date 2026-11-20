"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { useLiveSession } from "../hooks/live-session-context";

type Verdict = "liked" | "defect";

/**
 * What a player thought of the question they were just shown.
 *
 * It sits on the phone, at the reveal, because that is the only moment the
 * opinion exists and the phone is already in their hand. It never sits on the
 * shared screen: nobody walks to the television to rate a question.
 *
 * The two taps are deliberately unalike. Liking is one tap, instant, and
 * forgiving — the cost of a stray tap is nothing. Reporting a fault is quieter
 * and asks for a second tap to confirm, because a false report sends somebody
 * to check a question that was fine. Friction is matched to what a wrong
 * signal costs, not spread evenly for symmetry.
 *
 * Nothing here waits on the network. A tap is shown as taken the moment it
 * lands, and a failed send is swallowed: a game being played in a room full of
 * people must never stop for an opinion about a question.
 */
export function QuestionVerdict({
  contentItemId,
  className,
}: {
  contentItemId: string;
  className?: string;
}) {
  const { recordContentSignal } = useLiveSession();
  const [given, setGiven] = useState<Verdict | null>(null);
  const [confirmingDefect, setConfirmingDefect] = useState(false);

  const send = useCallback(
    (kind: Verdict) => {
      setGiven(kind);
      void recordContentSignal?.(contentItemId, kind).catch(() => {
        // Deliberately silent: see above.
      });
    },
    [contentItemId, recordContentSignal],
  );

  // The shared screen has no participant credential, so it gets no buttons.
  if (!recordContentSignal) return null;

  if (given) {
    return (
      <p
        data-testid="question-verdict-done"
        className={cn("text-sm font-bold text-muted-foreground", className)}
      >
        {given === "liked" ? "وصلنا — شكرًا" : "وصلنا، بنراجعه"}
      </p>
    );
  }

  return (
    <div
      data-testid="question-verdict"
      className={cn("flex items-center justify-center gap-2", className)}
    >
      <button
        type="button"
        data-testid="question-verdict-liked"
        onClick={() => send("liked")}
        className="rounded-full border-2 border-border bg-card px-4 py-2 text-sm font-black text-foreground active:scale-95"
      >
        عجبني
      </button>
      {confirmingDefect ? (
        <button
          type="button"
          data-testid="question-verdict-defect-confirm"
          onClick={() => send("defect")}
          className="rounded-full border-2 border-border bg-muted px-4 py-2 text-sm font-black text-muted-foreground active:scale-95"
        >
          أكيد، فيه غلط
        </button>
      ) : (
        <button
          type="button"
          data-testid="question-verdict-defect"
          onClick={() => setConfirmingDefect(true)}
          className="rounded-full px-3 py-2 text-sm font-bold text-muted-foreground underline underline-offset-4"
        >
          فيه غلط؟
        </button>
      )}
    </div>
  );
}
