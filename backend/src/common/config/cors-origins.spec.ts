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

describe('allowing a preview by its shape', () => {
  const PATTERN =
    'https://akwaan-frontend-git-*-muaths-projects-b32b0e77.vercel.app';
  const env = {
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://playakwaan.com',
    CORS_ORIGIN_PATTERNS: PATTERN,
  } as unknown as NodeJS.ProcessEnv;

  const asks = (origin: string): Promise<boolean> =>
    new Promise((resolve) => {
      corsOriginDelegate(env)(origin, (_error, allow) => resolve(!!allow));
    });

  it('lets through a branch preview of this project', async () => {
    await expect(
      asks(
        'https://akwaan-frontend-git-feat-new-identity-muaths-projects-b32b0e77.vercel.app',
      ),
    ).resolves.toBe(true);
  });

  it('still lets through the named origins', async () => {
    await expect(asks('https://playakwaan.com')).resolves.toBe(true);
  });

  it('refuses a host that merely ends the same way', async () => {
    // The wildcard stands for ONE label. If it could cross a dot, anyone able
    // to register a subdomain could mint an allowed origin.
    await expect(
      asks('https://evil.attacker-git-x-muaths-projects-b32b0e77.vercel.app'),
    ).resolves.toBe(false);
  });

  it('refuses another Vercel project in the same account', async () => {
    await expect(
      asks('https://something-else-muaths-projects-b32b0e77.vercel.app'),
    ).resolves.toBe(false);
  });

  it('refuses everything when no pattern is configured', async () => {
    const bare = {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://playakwaan.com',
    } as unknown as NodeJS.ProcessEnv;
    const allowed = await new Promise<boolean>((resolve) => {
      corsOriginDelegate(bare)(
        'https://akwaan-frontend-git-x-muaths-projects-b32b0e77.vercel.app',
        (_error, allow) => resolve(!!allow),
      );
    });
    expect(allowed).toBe(false);
  });

  it('treats a dot in the pattern as a dot, not as any character', async () => {
    // Without escaping, "vercel.app" would also match "vercelXapp".
    await expect(
      asks('https://akwaan-frontend-git-x-muaths-projects-b32b0e77.vercelXapp'),
    ).resolves.toBe(false);
  });
});
