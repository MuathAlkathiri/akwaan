"use client";

import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { usePublishedTutorial } from "../use-published-tutorial";
import {
  MechanicTutorialRenderer,
  supportsTutorialScenario,
} from "../tutorial-renderer";
import { tutorialScenarioKind } from "../tutorial-scenario";

/**
 * The explainer as something a host *asks for*, not something they sit through.
 *
 * The Preflight's job is to start a challenge: identity, instructions, who has
 * joined, and the button. A looping demonstration is the right answer to "how
 * does this work?" and the wrong thing to put between a host and the launch, so
 * it moves behind one small action and the default screen stays about starting.
 *
 * Radix `Dialog` is deliberate rather than a new overlay: it is the primitive
 * this app already uses — including for the join QR on this very screen — so the
 * focus trap, Escape handling, scroll lock, `aria-modal` wiring and RTL
 * positioning are the ones already shipped and tested here.
 *
 * It also unmounts its content on close, which is what makes the demo safe to
 * open mid-Preflight: closing runs `RyoExplainer`'s own `gsap.context().revert()`
 * cleanup, so no timeline, tween or observer outlives the dialog. Opening builds
 * a fresh one and the demonstration always begins at its first beat.
 */
export function MechanicTutorialDialog({
  mechanicKey,
  worldId,
  launching = false,
  disabled = false,
}: {
  /** The mechanic whose published tutorial to show. */
  mechanicKey: string;
  /** Authoritative World identity from Match preflight, when available. */
  worldId?: string;
  /** The real challenge is starting. */
  launching?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const {
    data: tutorial,
    isError,
    isLoading,
  } = usePublishedTutorial(mechanicKey, worldId);
  const supported = tutorial
    ? supportsTutorialScenario(tutorial.scenario)
    : false;
  const kind = tutorial ? tutorialScenarioKind(tutorial.scenario) : null;

  // The Match always outranks the explanation. When the host launches, the
  // stage change unmounts this whole screen anyway — closing here first makes
  // that deterministic rather than relying on teardown order, and means an
  // explanation can never be left sitting over a Match that has moved on.
  useEffect(() => {
    if (launching) setOpen(false);
  }, [launching]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Offered only when there is approved material to show. Without a
          published tutorial the Preflight keeps its authored instructions
          rather than opening an empty dialog or falling back to an unapproved
          fixture. */}
      <div className="flex shrink-0 items-center gap-2">
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="preflight-how-to-play"
            disabled={
              disabled || launching || isLoading || !tutorial || !supported
            }
            className="h-9 shrink-0 gap-1.5 font-black"
          >
            <HelpCircle className="size-4" aria-hidden />
            كيف تلعب؟
          </Button>
        </DialogTrigger>
        {isError && (
          <span className="max-w-44 text-[0.68rem] font-bold leading-4 text-destructive">
            تعذّر تحميل شرح هذا التحدي
          </span>
        )}
        {!isLoading && !isError && !tutorial && (
          <span className="max-w-52 text-[0.68rem] font-bold leading-4 text-muted-foreground">
            لا يوجد شرح منشور لهذا التحدي بعد
          </span>
        )}
      </div>
      <DialogContent
        dir="rtl"
        data-testid="explainer-dialog"
        // The tutorial is a room of its own, not a card over the Preflight.
        // Keeping this on the existing Radix portal preserves focus trapping,
        // Escape handling, scroll lock and unmount cleanup while ensuring no
        // Header, Footer or page artwork can show around the presentation.
        className="!inset-0 !top-0 !start-0 !h-[100dvh] !max-h-[100dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 flex flex-col gap-3 overflow-y-auto rounded-none bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-8"
      >
        <div
          data-testid="explainer-stage"
          className="mx-auto flex min-h-full w-full max-w-6xl flex-col"
        >
          <div
            data-testid="explainer-stage-content"
            className="my-auto flex w-full flex-col gap-3 py-4 sm:py-8"
          >
            <DialogHeader className="pe-8 text-start">
              <DialogTitle className="text-base font-black">
                {kind === "closest"
                  ? "كيف نلعب «مين أقرب»؟"
                  : kind === "bomb"
                    ? "كيف نلعب «القنبلة»؟"
                    : kind === "one-clue"
                      ? "كيف نلعب «بدليل واحد»؟"
                      : kind === "top-5"
                        ? "كيف نلعب «أفضل 5»؟"
                        : kind === "combo"
                          ? "كيف نلعب «الكومبو»؟"
                          : kind === "marhala"
                            ? "كيف نلعب «المرحلة»؟"
                            : kind === "laqatha"
                              ? "كيف نلعب «القطها»؟"
                              : kind === "first-note"
                                ? "كيف نلعب «من أول نغمة»؟"
                                : kind === "odd-piece"
                                  ? "كيف نلعب «القطعة الدخيلة»؟"
                                  : "كيف نلعب «اقرأ خصمك»؟"}
              </DialogTitle>
              <DialogDescription className="text-xs leading-5">
                {tutorial?.scenario.caption ??
                  "مثال توضيحي فقط — مو سؤال المباراة. فريق يجاوب، وفريق يقرأه."}
              </DialogDescription>
            </DialogHeader>
            {tutorial && (
              <MechanicTutorialRenderer
                scenario={tutorial.scenario}
                compact
                mode="player"
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Backwards-compatible export for existing imports. */
export const RyoExplainerDialog = MechanicTutorialDialog;
