import { LiveGameSessionSnapshot } from './live-game-session.snapshot';

export const LIVE_SESSION_TRANSITION_PUBLISHER = Symbol(
  'LIVE_SESSION_TRANSITION_PUBLISHER',
);

export interface LiveSessionTransitionPublisher {
  publish(
    event: string,
    snapshot: LiveGameSessionSnapshot,
    metadata?: Record<string, string | number | undefined>,
  ): void;
  publishEvent(
    sessionId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void;
}
