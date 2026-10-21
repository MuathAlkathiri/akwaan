"use client";

import { useInteractionDeadline } from "./use-interaction-deadline";
import type { GameplayRuntimeSnapshot } from "../model";

/** The mode command M2 added. The server is the only authority on it. */
export const RYO_REPLAY_ACTION = "mode:request-ryo-replay";

export interface RyoAudioReplay {
  /** The signal the shared screen plays, or undefined for a non-audio item. */
  signal?: number;
  /** Whether the server would currently accept a replay from this actor. */
  canRequest: boolean;
  /** Milliseconds left on the server's shared cooldown; 0 when clear. */
  cooldownMs: number;
}

/**
 * Read اقرأ خصمك's audio replay state out of the authoritative snapshot.
 *
 * Deliberately derived from the snapshot rather than from a socket event. M2
 * persists then publishes, with no outbox, so a replay is durably recorded even
 * when the event that announced it is lost. State survives that; an event does
 * not. Everything here therefore reads committed fields, which also makes
 * reconnect and a redelivered snapshot ordinary rather than special cases.
 *
 * Three facts come out of it:
 *
 *  - `signal` is the per-item replay counter, scoped by `audioReplayItemIndex`
 *    so a counter belonging to the previous question can never restart this
 *    one's clip. The server resets it per item; this only refuses to read it
 *    across items.
 *  - `canRequest` is the server's own answer. `availableActions` already
 *    encodes "the host, or any connected player on either team", so no actor
 *    rule is restated here — only the conditions the snapshot can see.
 *  - `cooldownMs` renders the one cooldown the server enforces, measured
 *    against server time, never the device's.
 */
export function useRyoAudioReplay(
  runtime: GameplayRuntimeSnapshot,
  options: { hasAudio: boolean; itemIndex: number; eligiblePhase: boolean },
): RyoAudioReplay {
  const round = runtime.activeRound?.modeState ?? {};
  const replayItemIndex = Number(round.audioReplayItemIndex ?? -1);
  const sameItem = replayItemIndex === options.itemIndex;
  const sequence = Number(round.audioReplaySequence ?? 0);
  const cooldownSeconds = Number(
    runtime.modeState.audioReplayCooldownSeconds ?? 0,
  );
  const replayAt = typeof round.audioReplayAt === "string"
    ? round.audioReplayAt
    : undefined;
  // Expressed as a deadline so it goes through the same server-clock alignment
  // the question countdown uses. A cooldown measured against the device clock
  // would disagree with the server on exactly the phones whose clocks are wrong.
  const cooldownEndsAt =
    sameItem && replayAt && cooldownSeconds > 0
      ? new Date(Date.parse(replayAt) + cooldownSeconds * 1000).toISOString()
      : undefined;
  const cooldownMs = useInteractionDeadline(cooldownEndsAt) ?? 0;

  return {
    // A replay belonging to another item is not this item's signal, and a
    // sequence of zero means nothing has been authorised yet.
    signal: options.hasAudio && sameItem && sequence > 0 ? sequence : undefined,
    canRequest:
      options.hasAudio &&
      options.eligiblePhase &&
      runtime.availableActions.includes(RYO_REPLAY_ACTION) &&
      cooldownMs <= 0,
    cooldownMs,
  };
}
