import { randomUUID } from 'crypto';

export const PRESENCE_INSTANCE = Symbol('PRESENCE_INSTANCE');

/**
 * This backend process's presence identity. A new id per process, so a crash
 * or restart is a new owner and the previous process's connections can be
 * recognised as its own and expired once its lease stops.
 */
export interface PresenceInstance {
  instanceId: string;
  /** The deployed commit, when the platform provides one. */
  commit?: string;
}

export function createPresenceInstance(
  env: NodeJS.ProcessEnv = process.env,
): PresenceInstance {
  const commit = env.RENDER_GIT_COMMIT?.trim();
  return { instanceId: randomUUID(), ...(commit ? { commit } : {}) };
}
