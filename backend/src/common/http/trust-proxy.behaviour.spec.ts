import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { clientIp } from '../../modules/auth/otp/presentation/otp.controller';
import { PublicJoinRateLimiter } from '../../modules/live-game-sessions/infrastructure/public-join-rate-limiter';
import { parseTrustProxy } from './trust-proxy';

/**
 * TRUST_PROXY behind a real HTTP hop.
 *
 * `proxy` is a minimal reverse proxy with nginx's `$proxy_add_x_forwarded_for`
 * semantics: it APPENDS the address it received the connection from to
 * whatever X-Forwarded-For the client sent. Requests go client → proxy → app
 * over real sockets, so Express sees exactly what it would behind nginx/Caddy.
 * `realClient` lets a test stand in for many players: the proxy appends that
 * value instead of its own loopback peer, as a proxy facing the internet would
 * append each player's address.
 */
async function harness(trustProxy: string | undefined) {
  const limiter = new PublicJoinRateLimiter();
  const app = express();
  const setting = parseTrustProxy(trustProxy);
  if (setting !== undefined) app.set('trust proxy', setting);
  app.get('/ip', (request, response) => {
    response.json({ ip: request.ip, otpIp: clientIp(request) });
  });
  app.post('/reconnect', (request, response) => {
    try {
      limiter.consume(`reconnect:${request.ip}`, 10);
      response.status(204).end();
    } catch {
      response.status(429).end();
    }
  });
  const appServer = http.createServer(app).listen(0, '127.0.0.1');
  await new Promise((resolve) => appServer.once('listening', resolve));
  const appPort = (appServer.address() as AddressInfo).port;

  const proxyServer = http
    .createServer((incoming, outgoing) => {
      const peer =
        (incoming.headers['x-test-real-client'] as string | undefined) ??
        incoming.socket.remoteAddress ??
        '';
      const prior = incoming.headers['x-forwarded-for'];
      const headers = { ...incoming.headers };
      delete headers['x-test-real-client'];
      headers['x-forwarded-for'] = prior ? `${String(prior)}, ${peer}` : peer;
      const upstream = http.request(
        {
          host: '127.0.0.1',
          port: appPort,
          method: incoming.method,
          path: incoming.url,
          headers,
        },
        (reply) => {
          outgoing.writeHead(reply.statusCode ?? 502, reply.headers);
          reply.pipe(outgoing);
        },
      );
      incoming.pipe(upstream);
    })
    .listen(0, '127.0.0.1');
  await new Promise((resolve) => proxyServer.once('listening', resolve));
  const proxyPort = (proxyServer.address() as AddressInfo).port;

  const call = (
    port: number,
    method: 'GET' | 'POST',
    path: string,
    headers: Record<string, string> = {},
  ) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = http.request(
        { host: '127.0.0.1', port, method, path, headers },
        (reply) => {
          let body = '';
          reply.on('data', (chunk) => (body += String(chunk)));
          reply.on('end', () =>
            resolve({ status: reply.statusCode ?? 0, body }),
          );
        },
      );
      request.on('error', reject);
      request.end();
    });

  return {
    viaProxy: (method: 'GET' | 'POST', path: string, headers = {}) =>
      call(proxyPort, method, path, headers),
    direct: (method: 'GET' | 'POST', path: string, headers = {}) =>
      call(appPort, method, path, headers),
    close: async () => {
      await new Promise((resolve) => proxyServer.close(resolve));
      await new Promise((resolve) => appServer.close(resolve));
    },
  };
}

const ipOf = (body: string) =>
  JSON.parse(body) as { ip: string; otpIp: string };

describe('TRUST_PROXY behind a reverse proxy', () => {
  it('unset: every player behind the proxy shares the proxy address (the bug)', async () => {
    const h = await harness(undefined);
    try {
      const a = ipOf(
        (
          await h.viaProxy('GET', '/ip', {
            'x-test-real-client': '203.0.113.10',
          })
        ).body,
      );
      const b = ipOf(
        (
          await h.viaProxy('GET', '/ip', {
            'x-test-real-client': '203.0.113.11',
          })
        ).body,
      );
      expect(a.ip).toBe(b.ip);
      expect(a.ip).toMatch(/127\.0\.0\.1$/);
      // Twelve different players reconnecting: the shared bucket refuses some.
      const statuses: number[] = [];
      for (let n = 0; n < 12; n += 1) {
        statuses.push(
          (
            await h.viaProxy('POST', '/reconnect', {
              'x-test-real-client': `203.0.113.${n}`,
            })
          ).status,
        );
      }
      expect(statuses.filter((status) => status === 429)).toHaveLength(2);
    } finally {
      await h.close();
    }
  });

  it('TRUST_PROXY=1: each player gets their own address and their own limit', async () => {
    const h = await harness('1');
    try {
      const statuses: number[] = [];
      for (let n = 0; n < 12; n += 1) {
        statuses.push(
          (
            await h.viaProxy('POST', '/reconnect', {
              'x-test-real-client': `203.0.113.${n}`,
            })
          ).status,
        );
      }
      expect(statuses.every((status) => status === 204)).toBe(true);
      // One player hammering is still limited.
      const same: number[] = [];
      for (let n = 0; n < 11; n += 1) {
        same.push(
          (
            await h.viaProxy('POST', '/reconnect', {
              'x-test-real-client': '198.51.100.7',
            })
          ).status,
        );
      }
      expect(same.slice(0, 10).every((status) => status === 204)).toBe(true);
      expect(same[10]).toBe(429);
    } finally {
      await h.close();
    }
  });

  it('TRUST_PROXY=1: a spoofed X-Forwarded-For from the client is ignored', async () => {
    const h = await harness('1');
    try {
      const seen = ipOf(
        (
          await h.viaProxy('GET', '/ip', {
            'x-forwarded-for': '6.6.6.6',
            'x-test-real-client': '203.0.113.50',
          })
        ).body,
      );
      expect(seen.ip).toBe('203.0.113.50');
      // OTP limiting follows the trusted address, not the forged header.
      expect(seen.otpIp).toBe('203.0.113.50');
    } finally {
      await h.close();
    }
  });

  it('TRUST_PROXY=true is unsafe: the spoofed left-most entry wins (never use it)', async () => {
    const h = await harness('true');
    try {
      const seen = ipOf(
        (
          await h.viaProxy('GET', '/ip', {
            'x-forwarded-for': '6.6.6.6',
            'x-test-real-client': '203.0.113.50',
          })
        ).body,
      );
      expect(seen.ip).toBe('6.6.6.6');
    } finally {
      await h.close();
    }
  });

  it('unset, without a proxy: the socket address is used and forged headers change nothing', async () => {
    const h = await harness(undefined);
    try {
      const seen = ipOf(
        (await h.direct('GET', '/ip', { 'x-forwarded-for': '6.6.6.6' })).body,
      );
      expect(seen.ip).toMatch(/127\.0\.0\.1$/);
    } finally {
      await h.close();
    }
  });

  it('TRUST_PROXY=1 with a client connecting directly (proxy bypassed) trusts that client', async () => {
    // Why the app port must not be reachable except through the proxy: with
    // one trusted hop, a direct client is treated as the proxy.
    const h = await harness('1');
    try {
      const seen = ipOf(
        (await h.direct('GET', '/ip', { 'x-forwarded-for': '6.6.6.6' })).body,
      );
      expect(seen.ip).toBe('6.6.6.6');
    } finally {
      await h.close();
    }
  });
});
