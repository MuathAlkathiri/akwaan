import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { listenOnLoopback } from '../helpers/test-app';

/**
 * The integration harness must only ever talk to its own app.
 *
 * Supertest, handed a server that is not listening, binds `listen(0)` — every
 * address — per request and then calls `127.0.0.1:<port>`. A process holding
 * that port on 127.0.0.1 specifically can win the request. These tests
 * reproduce that with a stand-in "foreign" process and prove the harness bind
 * (127.0.0.1, OS-assigned port, once per suite) cannot be shadowed.
 *
 * No database: a one-route Nest app is enough to exercise the binding.
 */
@Controller('probe')
class ProbeController {
  @Get()
  probe() {
    return { from: 'akwaan-test-app' };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

const FOREIGN_BODY = 'foreign process';

/** A stand-in for another local program bound to 127.0.0.1 only. */
const foreignLoopbackServer = (): Promise<Server> =>
  new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.statusCode = 404;
      res.end(FOREIGN_BODY);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

const portOf = (server: Server) => (server.address() as AddressInfo).port;

const close = (server: Server) =>
  new Promise<void>((resolve) => server.close(() => resolve()));

const probeApp = async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ProbeModule],
  }).compile();
  return moduleRef.createNestApplication({ logger: false });
};

describe('integration harness HTTP binding', () => {
  let foreign: Server;
  const apps: INestApplication[] = [];

  beforeEach(async () => {
    foreign = await foreignLoopbackServer();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await close(foreign);
  });

  it('reproduces the old hazard: a wildcard bind on a port held at 127.0.0.1 is shadowed', async () => {
    const victim = createServer((_req, res) => res.end('akwaan-test-app'));
    const port = portOf(foreign);

    const bind = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      victim.once('error', (error) => resolve(error));
      victim.listen(port, () => resolve(null)); // wildcard, as listen(0) binds
    });

    if (bind) {
      // Linux refuses the overlapping bind outright, so the hazard cannot
      // arise there; macOS (where it was observed) allows it.
      expect(bind.code).toBe('EADDRINUSE');
      return;
    }
    try {
      const response = await request(`http://127.0.0.1:${port}`).get('/probe');
      // The request meant for our server is answered by the other process.
      expect(response.status).toBe(404);
      expect(response.text).toBe(FOREIGN_BODY);
    } finally {
      await close(victim);
    }
  });

  it('binds the suite server to 127.0.0.1, once, and only ever reaches it', async () => {
    const app = await probeApp();
    apps.push(app);
    await listenOnLoopback(app);
    const server = app.getHttpServer() as Server;
    const address = server.address() as AddressInfo;

    expect(address.address).toBe('127.0.0.1');
    expect(address.port).not.toBe(portOf(foreign));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(server).get('/probe').expect(200);
      expect(response.body).toEqual({ from: 'akwaan-test-app' });
    }
    // Supertest reused the listening server instead of rebinding per request.
    expect(server.address()).toEqual(address);
  });

  it('cannot take a port another process holds on 127.0.0.1', async () => {
    const intruder = createServer();
    const error = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      intruder.once('error', (failure) => resolve(failure));
      intruder.listen(portOf(foreign), '127.0.0.1', () => resolve(null));
    });
    if (!error) await close(intruder);

    // The harness binds exactly this way, so it can never share a port with a
    // loopback listener — the OS hands it a different one.
    expect(error?.code).toBe('EADDRINUSE');
  });

  it('releases its server on app.close()', async () => {
    const app = await probeApp();
    await listenOnLoopback(app);
    const server = app.getHttpServer() as Server;
    expect(server.listening).toBe(true);

    await app.close();

    expect(server.listening).toBe(false);
  });
});
