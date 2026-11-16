"use client";

import type { LiveSessionClockSnapshot } from "../model";
import { useLiveSessionClock } from "./live-session-clock-context";
import { useLiveSession } from "./live-session-context";

export function deriveRemainingMs(
  clock: LiveSessionClockSnapshot,
  snapshotServerTimestamp: string,
  nowMs: number,
  receivedAtMs: number,
): number {
  if (!clock.running) return Math.max(0, clock.remainingMs);
  const serverAtReceipt = Date.parse(snapshotServerTimestamp);
  // The server's time is its own stamp plus the time elapsed *on this phone*
  // since the stamp arrived. Only the difference of two phone readings is
  // used, so a phone clock that is wrong by any constant amount — a minute, an
  // hour, a day — cannot move the countdown. (This used to fall back to the
  // phone's own clock when it disagreed with the server by a minute or more,
  // which is exactly when that clock is known to be wrong: a fast phone showed
  // the turn as over and locked its holder out while the server clock ran.)
  if (!Number.isFinite(serverAtReceipt)) return Math.max(0, clock.remainingMs);
  const estimatedServerNow =
    serverAtReceipt + Math.max(0, nowMs - receivedAtMs);
  const startedAt = clock.startedAt ? Date.parse(clock.startedAt) : NaN;
  if (!Number.isFinite(startedAt)) return Math.max(0, clock.remainingMs);
  const remainingFromAuthoritativeStart =
    clock.allocatedMs - clock.consumedMs - (estimatedServerNow - startedAt);
  return Math.max(
    0,
    Math.min(clock.remainingMs, remainingFromAuthoritativeStart),
  );
}

export function useTeamClockDisplay(teamId: string) {
  const { snapshot, snapshotReceivedAtMs } = useLiveSession();
  const nowMs = useLiveSessionClock();
  const team = snapshot?.teams.find((candidate) => candidate.id === teamId);
  const receivedAtMs = snapshotReceivedAtMs ?? nowMs;
  const remainingMs =
    snapshot && team
      ? deriveRemainingMs(
          team.clock,
          snapshot.serverTimestamp,
          nowMs,
          receivedAtMs,
        )
      : 0;
  return {
    remainingMs,
    formatted: formatDuration(remainingMs),
    running: team?.clock.running ?? false,
    expired: remainingMs === 0,
  };
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
