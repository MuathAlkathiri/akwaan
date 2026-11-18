/**
 * Express `trust proxy` from the TRUST_PROXY environment variable.
 *
 * Behind a reverse proxy (Render's edge, or Caddy/nginx on a VPS) the socket
 * address is the proxy's, so `request.ip` is the same for every player and the
 * per-IP join and reconnect limits become site-wide. Trusting the proxy makes
 * Express derive `request.ip` from `X-Forwarded-For` instead.
 *
 * Accepted values:
 * - unset or empty: not configured; Express keeps its default (trust nothing).
 * - `true` / `false`.
 * - a hop count, e.g. `1` for exactly one proxy in front of the app.
 * - an Express trust list, e.g. `loopback` or `10.0.0.0/8, 172.16.0.0/12`.
 *
 * Trusting more than the real proxies lets a client spoof its IP, so prefer a
 * hop count or the proxy's address over `true`.
 */
export type TrustProxySetting = boolean | number | string;

export function parseTrustProxy(
  raw: string | undefined,
): TrustProxySetting | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (/^true$/i.test(value)) return true;
  if (/^false$/i.test(value)) return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
