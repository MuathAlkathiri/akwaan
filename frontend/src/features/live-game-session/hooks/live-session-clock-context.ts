"use client";

import { createContext, useContext } from "react";

/**
 * The ticking clock, kept out of the Live Session context on purpose.
 *
 * `nowMs` advances four times a second for as long as a session is open. While
 * it lived on the main context value, every tick produced a new value object
 * and so made all ~29 `useLiveSession()` consumers eligible to rerender —
 * boards, scoreboards and mechanic panels included — even though nothing about
 * the game had changed. Splitting it into its own context means a tick reaches
 * only the handful of components that actually draw time.
 *
 * This is display state and nothing more. Deadlines are server-authoritative:
 * the client renders the remaining time, and never decides that it reached
 * zero. Expiry is the server's call, through `GameplayDeadlineScheduler`.
 */
export const LiveSessionClockContext = createContext<number | null>(null);

/**
 * The current client clock, in milliseconds.
 *
 * Falls back to `Date.now()` when no provider is mounted so that a component
 * rendered outside a session — a storybook case, a unit test of presentation
 * only — still gets a sensible value instead of throwing. Inside a session the
 * provider always supplies it.
 */
export function useLiveSessionClock(): number {
  const nowMs = useContext(LiveSessionClockContext);
  return nowMs ?? Date.now();
}
