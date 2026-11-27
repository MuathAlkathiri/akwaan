import type { Request } from 'express';
import { ProxyDiagnosticsController } from './proxy-diagnostics.controller';

describe('ProxyDiagnosticsController', () => {
  it('reports what Express derived beside what the proxies sent', () => {
    const request = {
      ip: '203.0.113.9',
      ips: ['203.0.113.9'],
      app: { get: () => 1 },
      socket: { remoteAddress: '10.0.0.4' },
      headers: {
        'x-forwarded-for': '198.51.100.7, 203.0.113.9',
        'cf-connecting-ip': '198.51.100.7',
      },
    } as unknown as Request;

    expect(new ProxyDiagnosticsController().clientIp(request)).toEqual({
      ip: '203.0.113.9',
      ips: ['203.0.113.9'],
      trustProxy: 1,
      socket: '10.0.0.4',
      forwardedFor: '198.51.100.7, 203.0.113.9',
      cfConnectingIp: '198.51.100.7',
      trueClientIp: null,
    });
  });
});
