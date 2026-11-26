"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { abortActiveChallenge } from "@/features/match-setup";
import { occurrenceLabel } from "@/features/match-setup";
import { useLiveSession } from "../../hooks/live-session-context";
import { MatchGameplayRenderer } from "../match-stage-router";
import { ChallengeContextStrip } from "./challenge-context-strip";
import { ChallengeStripSlotContext } from "./challenge-frame";
import { QuestionBackdrop } from "./question-backdrop";
import { localizeMatchError } from "../errors/match-errors";
import type { MatchActor } from "../types";

const SELF_FRAMED_MODES: ReadonlySet<string> = new Set([
  "marhala",
  "moving-xo",
  "top-5",
  "bomb",
  "combo",
  "odd-piece",
  "ekshifni",
  "la-tahriqha",
  "first-note",
]);

/**
 * A challenge in progress.
 *
 * The header names the position from the board projection the Match already
 * carries, so it says the same thing the tile said. The gameplay itself belongs to
 * the mechanic's own renderer, which is chosen by the runtime's mode key — this
 * component never reaches into runtime state or moves the Match along.
 */
export function UnifiedChallengeStage({ actor }: { actor: MatchActor }) {
  const { snapshot, resync, adoptSnapshot } = useLiveSession();
  const [aborting, setAborting] = useState(false);
  const [abortError, setAbortError] = useState<string>();
  const abortCommandId = useRef<string>();
  const abort = useCallback(async () => {
    if (!snapshot?.gameplay || aborting) return;
    setAborting(true);
    setAbortError(undefined);
    abortCommandId.current ??= crypto.randomUUID();
    try {
      const next = await abortActiveChallenge({
        sessionId: snapshot.sessionId,
        expectedSessionRevision: snapshot.revision,
        expectedRuntimeRevision: snapshot.gameplay.revision,
        commandId: abortCommandId.current,
      });
      abortCommandId.current = undefined;
      adoptSnapshot?.(next);
    } catch (cause) {
      setAbortError(localizeMatchError(cause).message);
      resync?.();
    } finally {
      setAborting(false);
    }
  }, [aborting, adoptSnapshot, resync, snapshot]);
  // A state, not a ref: the frame below must re-render once the slot exists.
  const [stripSlot, setStripSlot] = useState<HTMLElement | null>(null);
  const match = snapshot?.match;
  if (!snapshot || !match) return null;

  const current = match.currentChallenge;
  const position = current
    ? match.unified.board.positions.find(
        (candidate) =>
          candidate.occurrenceIndex === current.occurrenceIndex &&
          candidate.slotKey === current.slotKey,
      )
    : undefined;
  // A phone already carries its challenge and team identity in the mobile shell's
  // own header, and the two-team scoreboard belongs to the screen the whole room
  // is looking at. Repeating it here is what made a controller feel like a small
  // television, so the phone simply skips this header. Nothing else differs: the
  // same stage component, the same gameplay renderer, no second code path.
  const phone = actor === "participant";
  // The artwork is composed for a living-room screen, and a phone already holds
  // its own private controls in a shell of its own; wallpapering a handset would
  // spend bandwidth and attention on something nobody is looking at.
  const backdropUrl = phone ? undefined : current?.questionBackdropUrl;
  // These challenges draw the approved context strip themselves, with their
  // own turn chip in it; the score already sits in the Match header above.
  const selfFramed = SELF_FRAMED_MODES.has(snapshot.gameplay?.mode.key ?? "");

  return (
    <div
      className={
        phone
          ? "flex min-h-0 flex-1 flex-col"
          : `stage-center flex flex-col gap-[18px]${backdropUrl ? " relative isolate" : ""}`
      }
      data-testid="unified-challenge"
      data-challenge-surface={phone ? "phone" : "screen"}
    >
      {backdropUrl && <QuestionBackdrop url={backdropUrl} />}
      {!phone && !selfFramed && (
        <ChallengeContextStrip
          {...(current
            ? {
                eyebrow: [
                  occurrenceLabel(current.occurrenceIndex),
                  position?.worldName,
                ]
                  .filter(Boolean)
                  .join(" · "),
              }
            : {})}
          title={position?.challengeName ?? "نرجّع التحدي…"}
          // The mechanic's own progress («السؤال 1 من 3» and its dashes) is
          // portalled in here by the frame it renders below.
          aside={<div ref={setStripSlot} data-testid="challenge-strip-slot" />}
        />
      )}

      {snapshot.gameplay ? (
        <ChallengeStripSlotContext.Provider value={phone ? null : stripSlot}>
          <MatchGameplayRenderer actor={actor} />
        </ChallengeStripSlotContext.Provider>
      ) : (
        <section
          data-testid="challenge-restoring"
          className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-border bg-card p-10 text-center"
        >
          <RefreshCw
            className="size-6 animate-spin text-disabled-foreground"
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">جارٍ استعادة التحدي…</p>
          <button
            type="button"
            onClick={() => resync?.()}
            className="text-sm font-black text-primary underline underline-offset-4"
          >
            حاول الآن
          </button>
        </section>
      )}

      {actor === "controller" && (
        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={aborting || !snapshot.gameplay}
            onClick={abort}
            className="min-h-[46px] rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white px-5 text-[15px] font-bold text-[hsl(var(--brand-navy))] hover:bg-brand-lavender"
          >
            {aborting ? (
              <RefreshCw className="size-4 animate-spin" aria-hidden />
            ) : (
              <ArrowLeft className="size-4" aria-hidden />
            )}
            {aborting ? "نلغي التحدي…" : "العودة إلى اللوحة"}
          </Button>
          {abortError && (
            <p role="alert" className="text-sm font-bold text-foreground">
              {abortError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
