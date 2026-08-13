/**
 * One allowlist for both transports. The HTTP API and the Socket.IO namespace
 * must agree on who may call them: a browser that is allowed to POST but not to
 * open a socket fails halfway through a game, which is worse than a clean
 * rejection at login.
 *
 * The list is read from the environment at call time rather than at import
 * time. `@WebSocketGateway` evaluates its options object while the module graph
 * is still being built — before `ConfigModule` has loaded `.env` — so a value
 * captured at import time would be empty in exactly the deployment we care
 * about.
 */

const DEVELOPMENT_ORIGINS = Object.freeze([
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]);

export function resolveCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const configured = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (env.NODE_ENV === 'production') {
    // No implicit localhost in production. An unset CORS_ORIGINS is a
    // misconfiguration, and defaulting to a developer machine would hide it
    // behind a confusing browser error instead of an empty allowlist.
    return configured;
  }

  return [...new Set([...configured, ...DEVELOPMENT_ORIGINS])];
}

/**
 * Socket.IO and Express both accept an origin callback. Using one keeps the
 * decision lazy and lets a same-origin or non-browser client (no `Origin`
 * header) through, which is how curl and the health checker reach the API.
 */
export function corsOriginDelegate(
  env: NodeJS.ProcessEnv = process.env,
): (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) => void {
  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const allowed = resolveCorsOrigins(env);
    callback(null, allowed.includes(origin.replace(/\/$/, '')));
  };
}
