"use client";

import { useEffect, useRef, useState } from "react";

import {
  marhalaFramePosition,
  marhalaTurnFrames,
  type MarhalaFrame,
  type MarhalaTurn,
} from "../match/marhala.presentation";

/**
 * Replaying a committed المرحلة turn for the room.
 *
 * The backend resolves answer, roll, base landing, tile effect and final position
 * in one atomic transition — which is right, and is not changed to make an
 * animation easier. What arrives here is therefore already true: the team is
 * *already* on its final tile as far as the server is concerned.
 *
 * So this hook is strictly a way of *showing* that record in the order it happened:
 * reveal the roll, walk the tiles, hold the base landing, fire the boost or trap,
 * settle. Three properties keep it from ever mattering to correctness:
 *
 *  - it holds no gameplay state — only which tile to *draw* a token on;
 *  - it dispatches nothing, so no turn, score or question can depend on a timer;
 *  - it needs a known starting tile, and without one (a fresh mount, a reconnect
 *    mid-turn) it skips the replay and shows the authoritative position at once.
 *
 * Under `prefers-reduced-motion` the walk is skipped and the outcome is presented
 * in one step, keeping the order and the words but not the travel.
 */

export interface MarhalaReplay {
  /** The tile each team's token is drawn on, authoritative unless mid-replay. */
  positions: Record<string, number>;
  /** The roll to show, while it is being revealed and walked. */
  movement?: number;
  /** The tile reacting right now, for the board's boost/trap emphasis. */
  effect?: { position: number; kind: "boost" | "trap" };
  /** The team whose token is moving, or undefined when nothing is moving. */
  travellingTeamId?: string;
  /** True while a replay is on screen, so callers can hold a transition. */
  replaying: boolean;
}

const STEP_MS = 260;
const BASE_HOLD_MS = 420;
const EFFECT_MS = 760;
const SETTLE_MS = 520;

function frameDuration(frame: MarhalaFrame): number {
  switch (frame.kind) {
    case "reveal":
      return BASE_HOLD_MS;
    case "step":
      return STEP_MS;
    case "base":
      return BASE_HOLD_MS;
    case "effect":
      return EFFECT_MS;
    default:
      return SETTLE_MS;
  }
}

export function useMarhalaTurnReplay({
  positions,
  lastTurn,
  reducedMotion,
}: {
  /** The authoritative positions from the projection. */
  positions: Record<string, number>;
  lastTurn?: MarhalaTurn;
  reducedMotion: boolean;
}): MarhalaReplay {
  const [frames, setFrames] = useState<MarhalaFrame[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  // What was on screen before this turn arrived, which is the only honest place a
  // starting tile can come from.
  const shownPositions = useRef<Record<string, number>>(positions);
  const replayedTurn = useRef<number | undefined>(lastTurn?.turnNumber);
  const startedFrom = useRef<number>(0);

  useEffect(() => {
    const turn = lastTurn;
    if (!turn || turn.turnNumber === replayedTurn.current) return;
    const previous = shownPositions.current[turn.teamId];
    replayedTurn.current = turn.turnNumber;
    // No idea where the token was: adopt the server position rather than invent a
    // journey to it. This is the reconnect path.
    if (previous === undefined || reducedMotion) {
      setFrames([]);
      setFrameIndex(0);
      return;
    }
    const next = marhalaTurnFrames(turn, previous);
    startedFrom.current = previous;
    setFrames(next);
    setFrameIndex(0);
  }, [lastTurn, reducedMotion]);

  /**
   * Remember what was on screen — *after* the effect above has had its chance to
   * read it.
   *
   * Declaration order is load-bearing. When a resolved turn arrives, that commit
   * already carries the server's final positions, so this must not run before the
   * replay has captured the tile the room was actually looking at. Writing it
   * during render (the obvious version) overwrote the starting tile with the
   * destination and made every replay start at its own end.
   */
  useEffect(() => {
    shownPositions.current = drawnRef.current;
  });

  useEffect(() => {
    if (!frames.length) return;
    if (frameIndex >= frames.length) {
      setFrames([]);
      setFrameIndex(0);
      return;
    }
    const timer = setTimeout(
      () => setFrameIndex((current) => current + 1),
      frameDuration(frames[frameIndex]),
    );
    return () => clearTimeout(timer);
  }, [frames, frameIndex]);

  const frame = frames[frameIndex];
  const turn = lastTurn;
  const drawn = { ...positions };
  const drawnRef = useRef(drawn);
  let effect: MarhalaReplay["effect"];
  let movement: number | undefined;
  let travellingTeamId: string | undefined;

  if (frame && turn) {
    travellingTeamId = turn.teamId;
    movement = turn.movement;
    drawn[turn.teamId] = marhalaFramePosition(frame, startedFrom.current);
    if (frame.kind === "reveal") drawn[turn.teamId] = startedFrom.current;
    if (frame.kind === "effect") {
      effect = { position: frame.from, kind: frame.tile };
    }
    if (
      frame.kind === "base" &&
      (frame.tile === "boost" || frame.tile === "trap")
    ) {
      effect = { position: frame.position, kind: frame.tile };
    }
  }

  drawnRef.current = drawn;

  return {
    positions: drawn,
    ...(movement !== undefined ? { movement } : {}),
    ...(effect ? { effect } : {}),
    ...(travellingTeamId ? { travellingTeamId } : {}),
    replaying: Boolean(frame),
  };
}

/** The viewer's motion preference, watched rather than sampled once. */
export function usePrefersReducedMotion(): boolean {
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
