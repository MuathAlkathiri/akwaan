import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { GuardedNodeImageTransport } from './guarded-image.transport';
import {
  assertAllowedRemoteUrl,
  createGuardedLookup,
  isPublicAddress,
  RemoteDestinationError,
} from './remote-image-destination.guard';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return (error as RemoteDestinationError).code;
  }
  return undefined;
};

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '198.18.0.1',
    '::1',
    '::',
    '[::1]',
    'fe80::1',
    'fd00::1',
    'fc00::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '64:ff9b::7f00:1',
    '2002:7f00:1::',
    '2001:db8::1',
    'not-an-ip',
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    '93.184.216.34',
    '8.8.8.8',
    '2606:4700:4700::1111',
    '172.32.0.1',
    '::ffff:8.8.8.8',
  ])('allows public %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe('assertAllowedRemoteUrl', () => {
  it('allows a public https URL', () => {
    expect(
      assertAllowedRemoteUrl('https://upload.wikimedia.org/a.jpg').hostname,
    ).toBe('upload.wikimedia.org');
  });

  it.each([
    ['plain http', 'http://example.com/a.jpg', 'URL_PROTOCOL_NOT_ALLOWED'],
    ['file', 'file:///etc/passwd', 'URL_PROTOCOL_NOT_ALLOWED'],
    ['data', 'data:image/png;base64,AAAA', 'URL_PROTOCOL_NOT_ALLOWED'],
    ['gopher', 'gopher://example.com/', 'URL_PROTOCOL_NOT_ALLOWED'],
    [
      'credentials',
      'https://user:pw@example.com/a.jpg',
      'URL_CREDENTIALS_NOT_ALLOWED',
    ],
    [
      'non-default port',
      'https://example.com:8443/a.jpg',
      'URL_PORT_NOT_ALLOWED',
    ],
    ['loopback literal', 'https://127.0.0.1/a.jpg', 'DESTINATION_NOT_ALLOWED'],
    ['decimal loopback', 'https://2130706433/a.jpg', 'DESTINATION_NOT_ALLOWED'],
    ['octal loopback', 'https://0177.0.0.1/a.jpg', 'DESTINATION_NOT_ALLOWED'],
    [
      'metadata endpoint',
      'https://169.254.169.254/latest/meta-data',
      'DESTINATION_NOT_ALLOWED',
    ],
    ['IPv6 loopback', 'https://[::1]/a.jpg', 'DESTINATION_NOT_ALLOWED'],
    [
      'mapped IPv6',
      'https://[::ffff:10.0.0.1]/a.jpg',
      'DESTINATION_NOT_ALLOWED',
    ],
    ['localhost', 'https://localhost/a.jpg', 'DESTINATION_NOT_ALLOWED'],
    [
      'localhost subdomain',
      'https://x.localhost/a.jpg',
      'DESTINATION_NOT_ALLOWED',
    ],
    [
      'internal suffix',
      'https://metadata.google.internal/a',
      'DESTINATION_NOT_ALLOWED',
    ],
    ['single label', 'https://intranet/a.jpg', 'DESTINATION_NOT_ALLOWED'],
    ['garbage', 'not a url', 'URL_INVALID'],
  ])('refuses %s', (_label, url, code) => {
    expect(codeOf(() => assertAllowedRemoteUrl(url))).toBe(code);
  });

  it('allows http only when opted in, still with default ports', () => {
    expect(
      assertAllowedRemoteUrl('http://example.com/a.jpg', { allowHttp: true })
        .protocol,
    ).toBe('http:');
    expect(
      codeOf(() =>
        assertAllowedRemoteUrl('http://example.com:8080/a.jpg', {
          allowHttp: true,
        }),
      ),
    ).toBe('URL_PORT_NOT_ALLOWED');
  });
});

describe('createGuardedLookup', () => {
  const lookupWith = (
    addresses: Array<{ address: string; family: number }> | Error,
    options: { all?: boolean; family?: number } = {},
  ) =>
    new Promise<{ error: Error | null; address: unknown; family?: number }>(
      (resolve) => {
        const lookup = createGuardedLookup(async () => {
          if (addresses instanceof Error) throw addresses;
          return addresses;
        });
        lookup('img.example.com', options, (error, address, family) =>
          resolve({ error, address, family }),
        );
      },
    );

  it('returns the address of a public host', async () => {
    await expect(
      lookupWith([{ address: '93.184.216.34', family: 4 }]),
    ).resolves.toEqual({ error: null, address: '93.184.216.34', family: 4 });
  });

  it('returns all addresses when asked', async () => {
    const addresses = [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ];
    const result = await lookupWith(addresses, { all: true });
    expect(result.address).toEqual(addresses);
  });

  it('refuses a host that resolves to a private address', async () => {
    const result = await lookupWith([{ address: '10.0.0.5', family: 4 }]);
    expect((result.error as RemoteDestinationError).code).toBe(
      'DESTINATION_NOT_ALLOWED',
    );
  });

  it('refuses a host that mixes public and private records', async () => {
    const result = await lookupWith(
      [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
      { all: true },
    );
    expect((result.error as RemoteDestinationError).code).toBe(
      'DESTINATION_NOT_ALLOWED',
    );
  });

  it('fails closed on resolver errors and empty answers', async () => {
    expect(
      (
        (await lookupWith(new Error('ENOTFOUND')))
          .error as RemoteDestinationError
      ).code,
    ).toBe('DNS_RESOLUTION_FAILED');
    expect(((await lookupWith([])).error as RemoteDestinationError).code).toBe(
      'DNS_RESOLUTION_FAILED',
    );
  });
});

describe('GuardedNodeImageTransport (local loopback server only)', () => {
  let server: Server;
  let port: number;
  let connections = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: 'https://example.com/next.png' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.alloc(32, 1));
    });
    server.on('connection', () => {
      connections += 1;
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('refuses at connect time when a hostname resolves to loopback (DNS rebinding)', async () => {
    const before = connections;
    const transport = new GuardedNodeImageTransport(
      createGuardedLookup(async () => [{ address: '127.0.0.1', family: 4 }]),
    );
    await expect(
      transport.get(new URL(`http://rebind.example.com:${port}/a.png`), {
        signal: new AbortController().signal,
        userAgent: 'test',
      }),
    ).rejects.toMatchObject({ code: 'DESTINATION_NOT_ALLOWED' });
    expect(connections).toBe(before);
  });

  it('returns redirects without following them', async () => {
    // A permissive lookup isolates the transport's own behaviour.
    const transport = new GuardedNodeImageTransport(((
      _host: string,
      options: unknown,
      callback?: (e: null, a: unknown, f?: number) => void,
    ) => {
      const cb = (typeof options === 'function' ? options : callback) as (
        e: null,
        a: unknown,
        f?: number,
      ) => void;
      if ((options as { all?: boolean })?.all) {
        cb(null, [{ address: '127.0.0.1', family: 4 }]);
      } else {
        cb(null, '127.0.0.1', 4);
      }
    }) as never);
    const response = await transport.get(
      new URL(`http://loopback.example.com:${port}/redirect`),
      { signal: new AbortController().signal, userAgent: 'test' },
    );
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('https://example.com/next.png');
    response.abort();
  });
});
