"use client";

import type { LiveSessionClockSnapshot } from "../model";
import { useLiveSession } from "./live-session-context";

export function deriveRemainingMs(
  clock: LiveSessionClockSnapshot,
  snapshotServerTimestamp: string,
  nowMs: number,
  receivedAtMs: number,
): number {
  if (!clock.running) return Math.max(0, clock.remainingMs);
  const serverAtReceipt = Date.parse(snapshotServerTimestamp);
  const estimatedServerNow =
    Number.isFinite(serverAtReceipt) &&
    Math.abs(receivedAtMs - serverAtReceipt) < 60_000
      ? serverAtReceipt + (nowMs - receivedAtMs)
      : nowMs;
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
  const { snapshot, nowMs, snapshotReceivedAtMs } = useLiveSession();
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
