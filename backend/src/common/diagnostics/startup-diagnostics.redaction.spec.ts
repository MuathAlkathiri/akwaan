import { Logger } from '@nestjs/common';
import {
  describeStartupError,
  markProcessStart,
  redactSecrets,
  traceStartupStep,
} from './startup-diagnostics';

/** Every value below is synthetic. No real credential is read or printed. */
const SECRETS = [
  'synth-user',
  'synth-pass-123',
  'cluster0.synthetic.example',
  'SynthBearerToken.abc-123',
  'U3ludGhCYXNpYw==',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'c3ludGhldGljLXBheWxvYWQ',
  'synthetic-signature',
];

const leaks = (text: string) =>
  SECRETS.filter((secret) => text.includes(secret));

describe('startup diagnostics — secret redaction', () => {
  it.each([
    [
      'mongodb:// with credentials',
      'connect failed mongodb://synth-user:synth-pass-123@cluster0.synthetic.example:27017/db?authSource=admin',
      'mongodb://<redacted>',
    ],
    [
      'mongodb+srv:// with credentials',
      'bad uri mongodb+srv://synth-user:synth-pass-123@cluster0.synthetic.example/db?retryWrites=true',
      'mongodb://<redacted>',
    ],
    [
      'credentials in another URI scheme',
      'GET https://synth-user:synth-pass-123@api.synthetic.test/health failed',
      'https://<redacted>@api.synthetic.test/health',
    ],
    [
      'Authorization header (Bearer)',
      'request failed: Authorization: Bearer SynthBearerToken.abc-123 status 401',
      'authorization: <redacted>',
    ],
    [
      'Authorization header (Basic)',
      'authorization=Basic U3ludGhCYXNpYw== rejected',
      'authorization: <redacted>',
    ],
    [
      'bare bearer token',
      'token bearer SynthBearerToken.abc-123 expired',
      'Bearer <redacted>',
    ],
    [
      'JWT',
      'invalid jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.c3ludGhldGljLXBheWxvYWQ.synthetic-signature',
      '<redacted-jwt>',
    ],
  ])('redacts %s', (_label, input, marker) => {
    const out = describeStartupError(new Error(input));
    expect(leaks(out)).toEqual([]);
    expect(out).toContain(marker);
  });

  it('leaves useful, non-secret detail intact', () => {
    expect(
      describeStartupError(new Error('connect ECONNREFUSED 127.0.0.1:27099')),
    ).toBe('Error: connect ECONNREFUSED 127.0.0.1:27099');
    const err = new Error('getaddrinfo ENOTFOUND');
    err.name = 'MongooseServerSelectionError';
    expect(describeStartupError(err)).toBe(
      'MongooseServerSelectionError: getaddrinfo ENOTFOUND',
    );
  });

  it('flattens newlines and bounds the length', () => {
    const out = describeStartupError(
      new Error(`line one\nline two\r\n\tline three ${'x'.repeat(2000)}`),
    );
    expect(out).not.toMatch(/[\r\n\t]/);
    expect(out.startsWith('Error: line one line two line three')).toBe(true);
    expect(out.length).toBeLessThanOrEqual('Error: '.length + 300);
  });

  it('never serializes a non-Error payload', () => {
    const payload = {
      uri: 'mongodb://synth-user:synth-pass-123@h/db',
      token: 'x',
    };
    const out = describeStartupError(payload);
    expect(out).toBe('object: [object Object]');
    expect(leaks(out)).toEqual([]);
    expect(
      describeStartupError('plain mongodb+srv://synth-user:synth-pass-123@h'),
    ).toBe('string: plain mongodb://<redacted>');
  });

  it('redacts on the real failure-log path too', async () => {
    const error = jest
      .spyOn(Logger, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    markProcessStart();
    await expect(
      traceStartupStep('NestFactory.create', async () => {
        throw new Error(
          'Authorization: Bearer SynthBearerToken.abc-123 mongodb+srv://synth-user:synth-pass-123@cluster0.synthetic.example',
        );
      }),
    ).rejects.toThrow();
    const logged = String(error.mock.calls[0][0]);
    expect(leaks(logged)).toEqual([]);
    expect(logged).toMatch(
      /^NestFactory\.create: failed after \d+ms — Error: /,
    );
    jest.restoreAllMocks();
  });

  it('is idempotent and safe on text without secrets', () => {
    const clean = 'no secrets here: port 3000';
    expect(redactSecrets(clean)).toBe(clean);
    const once = redactSecrets('mongodb://synth-user:synth-pass-123@h');
    expect(redactSecrets(once)).toBe(once);
  });
});
