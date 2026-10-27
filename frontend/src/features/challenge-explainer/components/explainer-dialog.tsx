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
  launching = false,
  disabled = false,
}: {
  /** The mechanic whose published tutorial to show. */
  mechanicKey: string;
  /** The real challenge is starting. */
  launching?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: tutorial } = usePublishedTutorial(mechanicKey);
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
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="preflight-how-to-play"
          disabled={disabled || launching || !tutorial || !supported}
          className="h-9 shrink-0 gap-1.5 font-black"
        >
          <HelpCircle className="size-4" aria-hidden />
          كيف تلعب؟
        </Button>
      </DialogTrigger>
      <DialogContent
        dir="rtl"
        data-testid="explainer-dialog"
        // Wide enough for the shared screen and the phone to sit side by side,
        // and capped in height so the tall mobile composition scrolls inside the
        // dialog instead of pushing the close control off the viewport.
        className="max-h-[90dvh] gap-3 overflow-y-auto p-4 sm:max-w-3xl"
      >
        <DialogHeader className="pe-8 text-start">
          <DialogTitle className="text-base font-black">
            {kind === "closest"
              ? "كيف نلعب «مين أقرب»؟"
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
      </DialogContent>
    </Dialog>
  );
}

/** Backwards-compatible export for existing imports. */
export const RyoExplainerDialog = MechanicTutorialDialog;
