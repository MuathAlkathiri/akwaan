/**
 * Owner-scoped presence connection ids.
 *
 * A presence entry is stored as `<instanceId>:<socketId>` so the backend
 * instance that owns the socket is recorded with it. socket.io v4 ids and the
 * instance ids used here never contain `:`, so the separator is unambiguous.
 * An entry without it was written by a pre-ownership (legacy) backend and has
 * no recorded owner.
 */
export const PRESENCE_OWNER_SEPARATOR = ':';

export interface ParsedPresenceConnection {
  /** The owning backend instance, or null for a legacy (unowned) entry. */
  owner: string | null;
  /** The raw socket.io connection id, as gameplay and readiness know it. */
  socketId: string;
}

export function ownedConnectionId(owner: string, socketId: string): string {
  if (!owner || owner.includes(PRESENCE_OWNER_SEPARATOR)) {
    throw new Error('Presence owner id must be non-empty and contain no ":"');
  }
  if (!socketId || socketId.includes(PRESENCE_OWNER_SEPARATOR)) {
    throw new Error('Socket id must be non-empty and contain no ":"');
  }
  return `${owner}${PRESENCE_OWNER_SEPARATOR}${socketId}`;
}

export function parsePresenceConnection(
  entry: string,
): ParsedPresenceConnection {
  const at = entry.indexOf(PRESENCE_OWNER_SEPARATOR);
  if (at <= 0) return { owner: null, socketId: entry };
  return { owner: entry.slice(0, at), socketId: entry.slice(at + 1) };
}
