import { promises as dnsPromises, LookupAddress } from 'dns';
import { BlockList, isIP } from 'net';

/**
 * Where a server-side image fetch may go.
 *
 * Every fetch of an untrusted URL (a search result, a provider's redirect)
 * is a request the *server* makes on the URL's behalf, so an attacker who
 * controls the URL controls a request from inside our network. This module
 * is the one place that decides which destinations are reachable:
 *
 * - **URL rules** — https only (http only when a caller opts in), no
 *   embedded credentials, default ports only;
 * - **address rules** — loopback, private, link-local (cloud metadata),
 *   carrier-grade NAT, multicast, reserved, documentation, and the IPv6
 *   equivalents and translation prefixes are all refused;
 * - **resolution** — `guardedLookup` replaces DNS lookup *at connect time*,
 *   so the address checked is the address connected to. Checking a hostname
 *   once and letting the HTTP client resolve it again would leave a DNS
 *   rebinding window between the two.
 */

export type RemoteDestinationCode =
  | 'URL_INVALID'
  | 'URL_PROTOCOL_NOT_ALLOWED'
  | 'URL_CREDENTIALS_NOT_ALLOWED'
  | 'URL_PORT_NOT_ALLOWED'
  | 'DESTINATION_NOT_ALLOWED'
  | 'DNS_RESOLUTION_FAILED';

export class RemoteDestinationError extends Error {
  constructor(
    readonly code: RemoteDestinationCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'RemoteDestinationError';
  }
}

const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including cloud metadata endpoints
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, including broadcast
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  // IPv4-mapped (::ffff:a.b.c.d) is deliberately not listed: BlockList already
  // checks a mapped address against the IPv4 rules above, and a ::ffff:0:0/96
  // rule would also match *every* plain IPv4 address.
  ['64:ff9b::', 96], // NAT64 well-known prefix
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard-only
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4, which embeds an IPv4 address
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // deprecated site-local
  ['ff00::', 8], // multicast
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv6');
}

const BLOCKED_HOST_SUFFIXES = ['localhost', 'localdomain', 'internal', 'local'];

/** True when an IP literal is a destination an image fetch may reach. */
export function isPublicAddress(address: string): boolean {
  const unbracketed = address.replace(/^\[|\]$/g, '');
  const family = isIP(unbracketed);
  if (family === 0) return false;
  return !BLOCKED.check(unbracketed, family === 4 ? 'ipv4' : 'ipv6');
}

export interface RemoteUrlPolicy {
  allowHttp?: boolean;
}

/** Parses and checks a URL before any network activity. Returns the URL. */
export function assertAllowedRemoteUrl(
  raw: string,
  policy: RemoteUrlPolicy = {},
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RemoteDestinationError('URL_INVALID', 'URL cannot be parsed');
  }
  const protocols = policy.allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!protocols.includes(url.protocol)) {
    throw new RemoteDestinationError(
      'URL_PROTOCOL_NOT_ALLOWED',
      `${url.protocol} is not allowed`,
    );
  }
  if (url.username || url.password) {
    throw new RemoteDestinationError(
      'URL_CREDENTIALS_NOT_ALLOWED',
      'URLs with embedded credentials are not allowed',
    );
  }
  // WHATWG URL clears the port when it is the scheme default, so any port
  // left here is non-default.
  if (url.port) {
    throw new RemoteDestinationError(
      'URL_PORT_NOT_ALLOWED',
      `port ${url.port} is not allowed`,
    );
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) {
    throw new RemoteDestinationError('URL_INVALID', 'URL has no host');
  }
  if (isIP(host)) {
    if (!isPublicAddress(host)) {
      throw new RemoteDestinationError(
        'DESTINATION_NOT_ALLOWED',
        'URL points at a non-public address',
      );
    }
  } else if (
    !host.includes('.') ||
    BLOCKED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    )
  ) {
    throw new RemoteDestinationError(
      'DESTINATION_NOT_ALLOWED',
      'URL host is not a public domain name',
    );
  }
  return url;
}

export type HostResolver = (hostname: string) => Promise<LookupAddress[]>;

export const systemResolver: HostResolver = (hostname) =>
  dnsPromises.lookup(hostname, { all: true, verbatim: true });

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * A drop-in for `dns.lookup` that refuses unless *every* resolved address is
 * public. Rejecting on any private answer (rather than filtering it out)
 * means a hostname that mixes public and internal records is never trusted.
 */
export function createGuardedLookup(resolver: HostResolver = systemResolver) {
  return (
    hostname: string,
    optionsOrCallback: { all?: boolean; family?: number } | LookupCallback,
    maybeCallback?: LookupCallback,
  ): void => {
    const callback = (
      typeof optionsOrCallback === 'function'
        ? optionsOrCallback
        : maybeCallback
    ) as LookupCallback;
    const options =
      typeof optionsOrCallback === 'object' && optionsOrCallback
        ? optionsOrCallback
        : {};
    resolver(hostname)
      .then((addresses) => {
        if (!addresses.length) {
          throw new RemoteDestinationError(
            'DNS_RESOLUTION_FAILED',
            `${hostname} did not resolve`,
          );
        }
        if (!addresses.every((entry) => isPublicAddress(entry.address))) {
          throw new RemoteDestinationError(
            'DESTINATION_NOT_ALLOWED',
            `${hostname} resolves to a non-public address`,
          );
        }
        const wanted = options.family
          ? addresses.filter((entry) => entry.family === options.family)
          : addresses;
        if (!wanted.length) {
          throw new RemoteDestinationError(
            'DNS_RESOLUTION_FAILED',
            `${hostname} has no address of the requested family`,
          );
        }
        if (options.all) callback(null, wanted);
        else callback(null, wanted[0].address, wanted[0].family);
      })
      .catch((error: unknown) => {
        const wrapped =
          error instanceof RemoteDestinationError
            ? error
            : new RemoteDestinationError(
                'DNS_RESOLUTION_FAILED',
                `${hostname} could not be resolved`,
              );
        callback(wrapped as NodeJS.ErrnoException, '');
      });
  };
}
