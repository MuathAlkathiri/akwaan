"use client";

import { useLiveSessionClock } from "./live-session-clock-context";
import { useLiveSession } from "./live-session-context";

export function useInteractionDeadline(
  deadlineAt?: string,
  terminal = false,
): number | undefined {
  const { snapshot, snapshotReceivedAtMs } = useLiveSession();
  const nowMs = useLiveSessionClock();
  if (!deadlineAt || terminal || !snapshot) return undefined;
  const serverAtReceipt =
    new Date(snapshot.serverTimestamp).getTime() +
    Math.max(0, nowMs - (snapshotReceivedAtMs ?? nowMs));
  return Math.max(0, new Date(deadlineAt).getTime() - serverAtReceipt);
}
