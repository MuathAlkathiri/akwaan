import { corsOriginDelegate, resolveCorsOrigins } from './cors-origins';

const allow = (env: NodeJS.ProcessEnv, origin: string | undefined): boolean => {
  let allowed = false;
  corsOriginDelegate(env)(origin, (_error, result) => {
    allowed = result === true;
  });
  return allowed;
};

describe('resolveCorsOrigins', () => {
  it('keeps development localhost origins working without configuration', () => {
    expect(resolveCorsOrigins({ NODE_ENV: 'development' })).toEqual([
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ]);
  });

  it('adds configured origins alongside the development defaults', () => {
    expect(
      resolveCorsOrigins({
        NODE_ENV: 'development',
        CORS_ORIGINS: 'https://akwaan.vercel.app',
      }),
    ).toEqual([
      'https://akwaan.vercel.app',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ]);
  });

  it('never implies localhost in production', () => {
    expect(
      resolveCorsOrigins({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://akwaan.vercel.app',
      }),
    ).toEqual(['https://akwaan.vercel.app']);
  });

  it('returns an empty allowlist when production is unconfigured', () => {
    expect(resolveCorsOrigins({ NODE_ENV: 'production' })).toEqual([]);
  });

  it('tolerates spacing and trailing slashes in the configured list', () => {
    expect(
      resolveCorsOrigins({
        NODE_ENV: 'production',
        CORS_ORIGINS: ' https://a.example/ , https://b.example ,,',
      }),
    ).toEqual(['https://a.example', 'https://b.example']);
  });
});

describe('corsOriginDelegate', () => {
  const production = {
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://akwaan.vercel.app',
  };

  it('accepts the configured production origin', () => {
    expect(allow(production, 'https://akwaan.vercel.app')).toBe(true);
  });

  it('rejects an origin that is not on the allowlist', () => {
    expect(allow(production, 'https://evil.example')).toBe(false);
  });

  it('rejects a lookalike subdomain of the allowed origin', () => {
    expect(allow(production, 'https://akwaan.vercel.app.evil.example')).toBe(
      false,
    );
  });

  it('allows requests that carry no Origin header', () => {
    expect(allow(production, undefined)).toBe(true);
  });

  it('reads the environment per request rather than at import time', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
    expect(allow(env, 'https://late.example')).toBe(false);
    env.CORS_ORIGINS = 'https://late.example';
    expect(allow(env, 'https://late.example')).toBe(true);
  });
});
