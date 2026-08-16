import {
  LiveGameSessionState,
  LiveSessionParticipantState,
} from '../domain/live-game-session';

/**
 * The persisted shape of a live session's state: everything except presence.
 *
 * Both writers of the session document — the repository and the gameplay
 * transaction — go through this, which is what makes the guarantee structural
 * rather than a convention. An aggregate save cannot revert a newer connection
 * because it no longer writes the fields a connection lives in; there is
 * nothing to get the ordering of.
 */
export function toPersistedState(
  state: LiveGameSessionState,
): LiveGameSessionState {
  return {
    ...state,
    participants: state.participants.map(stripPresence),
  };
}

/** Named so the omission is a decision on the page, not a spread that lost them. */
const PRESENCE_FIELDS = [
  'connected',
  'connectedDeviceCount',
  'lastSeenAt',
] as const;

function stripPresence(
  participant: LiveSessionParticipantState,
): LiveSessionParticipantState {
  const durable: Record<string, unknown> = { ...participant };
  for (const field of PRESENCE_FIELDS) delete durable[field];
  return durable as unknown as LiveSessionParticipantState;
}
