"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  createElement,
} from "react";
import type { GameplayRuntimeSnapshot } from "../model";

/**
 * Two different waits wear the same snapshot, and only one of them is a screen
 * opening.
 *
 * While a presentation is prepared the server replaces `modeState` wholesale
 * with `{ awaitingPresentation: true }` — no board, no positions, no prompt —
 * because none of it may reach a client before activation. On a cold open there
 * is nothing on screen yet, so a loader is the honest thing to show. On a
 * recurring transition the stage is already up: the room just answered a
 * question and is about to get the next one, and tearing the board down and
 * rebuilding it reads as the app restarting.
 *
 * Between those, the difference is not a guess. The server projects a
 * `generation` on the surface only for a recurring presentation, and this hook
 * keeps the last runtime that actually carried playable content so the stage has
 * something authoritative to keep drawing. That retained runtime is the state
 * the room was already looking at — nothing here invents a position, a movement
 * or a question, and the prepared question is not in it to leak.
 *
 * It owns no gameplay. The canonical session snapshot stays the source of
 * truth; this only decides which already-received truth the stage renders while
 * the next one is on its way.
 */
export interface RecurringQuestionTransition {
  /** Opening for the first time — nothing to keep, so a full loader is honest. */
  isColdPreparing: boolean;
  /** A prepared generation replacing the question inside a stage already up. */
  isRecurringPreparing: boolean;
  /** Whether the mechanic's stage should stay rendered through the wait. */
  keepStageMounted: boolean;
  /** True while no playable content exists for the generation being prepared. */
  waitingForNextGeneration: boolean;
  /**
   * The runtime the stage should draw from: the live one normally, the retained
   * one while a recurring generation is being prepared.
   */
  stageRuntime?: GameplayRuntimeSnapshot;
}

const isAwaiting = (gameplay: GameplayRuntimeSnapshot | undefined): boolean =>
  (gameplay?.modeState as { awaitingPresentation?: boolean } | undefined)
    ?.awaitingPresentation === true;

export function useRecurringQuestionTransition(
  gameplay: GameplayRuntimeSnapshot | undefined,
  options: {
    /**
     * Whether this mechanic's view can render its stage without playable
     * content. A view that cannot must keep falling back to the loader, or the
     * wait would show it the *previous* question's controls.
     */
    stageSurvivesTransition?: boolean;
  } = {},
): RecurringQuestionTransition {
  const awaiting = isAwaiting(gameplay);
  const retained = useRef<GameplayRuntimeSnapshot | undefined>(undefined);

  // Recorded after commit, never during render, so a render that first sees the
  // wait still reads the runtime from the render before it.
  useEffect(() => {
    if (!gameplay) {
      retained.current = undefined;
      return;
    }
    if (retained.current && retained.current.runtimeId !== gameplay.runtimeId) {
      // A different challenge entirely. Its stage is not ours to keep.
      retained.current = undefined;
    }
    if (!isAwaiting(gameplay)) retained.current = gameplay;
  }, [gameplay]);

  const held =
    retained.current &&
    gameplay &&
    retained.current.runtimeId === gameplay.runtimeId &&
    retained.current.mode.key === gameplay.mode.key
      ? retained.current
      : undefined;

  // The server marks a recurring presentation with a generation; an initial
  // fair-start carries none. A generation with nothing retained is still a cold
  // open — a phone that joined mid-match has no stage to preserve.
  const recurring =
    awaiting &&
    gameplay?.presentationSurface?.generation !== undefined &&
    held !== undefined;
  const keepStageMounted =
    recurring && options.stageSurvivesTransition === true;

  return {
    isColdPreparing: awaiting && !keepStageMounted,
    isRecurringPreparing: recurring,
    keepStageMounted,
    waitingForNextGeneration: awaiting,
    ...(keepStageMounted ? { stageRuntime: held } : {}),
    ...(!awaiting && gameplay ? { stageRuntime: gameplay } : {}),
  };
}

/**
 * Whether the question region should show its waiting state.
 *
 * Passed by context rather than through eleven panel signatures: the stage a
 * mechanic renders is unchanged, and only the region that holds the question
 * needs to know it is between two of them.
 */
const WaitingForNextQuestion = createContext(false);

export function WaitingForNextQuestionProvider({
  waiting,
  children,
}: {
  waiting: boolean;
  children: ReactNode;
}) {
  return createElement(
    WaitingForNextQuestion.Provider,
    { value: waiting },
    children,
  );
}

export function useWaitingForNextQuestion(): boolean {
  return useContext(WaitingForNextQuestion);
}
