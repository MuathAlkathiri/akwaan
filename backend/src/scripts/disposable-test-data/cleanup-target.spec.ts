import {
  databaseInUri,
  isTestWorldSlug,
  parseCleanupArgs,
  TEST_CHALLENGE_TYPE_SLUG_PATTERN,
  AUTOMATED_TEST_EMAIL_PATTERN,
} from './cleanup-target';

const LOCAL = 'mongodb://localhost:27017/lammah-quiz?replicaSet=rs0';
const env = (uri?: string) => (uri ? { CLEANUP_MONGODB_URI: uri } : {});
const base = [
  '--environment=local',
  '--database=lammah-quiz',
  '--categories=gameplay-history',
];

describe('parseCleanupArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseCleanupArgs(base, env(LOCAL))).toMatchObject({
      execute: false,
      environment: 'local',
      database: 'lammah-quiz',
      categories: ['gameplay-history'],
    });
  });

  it('never reads the application MONGODB_URI', () => {
    expect(() => parseCleanupArgs(base, { MONGODB_URI: LOCAL })).toThrow(
      /CLEANUP_MONGODB_URI/,
    );
  });

  it('requires an explicit environment and database', () => {
    expect(() =>
      parseCleanupArgs(
        ['--database=lammah-quiz', '--categories=gameplay-history'],
        env(LOCAL),
      ),
    ).toThrow(/--environment/);
    expect(() =>
      parseCleanupArgs(
        ['--environment=local', '--categories=gameplay-history'],
        env(LOCAL),
      ),
    ).toThrow(/--database/);
  });

  it('refuses a database name that differs from the URI', () => {
    expect(() =>
      parseCleanupArgs(
        [
          '--environment=local',
          '--database=Akwaan-prd',
          '--categories=gameplay-history',
        ],
        env(LOCAL),
      ),
    ).toThrow(/does not match/);
  });

  it('requires known categories', () => {
    expect(() =>
      parseCleanupArgs(
        ['--environment=local', '--database=lammah-quiz'],
        env(LOCAL),
      ),
    ).toThrow(/--categories/);
    expect(() =>
      parseCleanupArgs(
        [
          '--environment=local',
          '--database=lammah-quiz',
          '--categories=everything',
        ],
        env(LOCAL),
      ),
    ).toThrow(/Unknown category/);
  });

  it('needs the database re-typed and a backup reference to execute', () => {
    expect(() => parseCleanupArgs([...base, '--execute'], env(LOCAL))).toThrow(
      /confirm-database/,
    );
    expect(() =>
      parseCleanupArgs(
        [...base, '--execute', '--confirm-database=lammah-quiz'],
        env(LOCAL),
      ),
    ).toThrow(/backup-reference/);
    expect(
      parseCleanupArgs(
        [
          ...base,
          '--execute',
          '--confirm-database=lammah-quiz',
          '--backup-reference=dump-2026-11-18',
        ],
        env(LOCAL),
      ),
    ).toMatchObject({ execute: true, backupReference: 'dump-2026-11-18' });
  });

  it('allows a production dry run but never a production execution', () => {
    const prod =
      'mongodb+srv://u:p@cluster.example.net/lammah-quiz?retryWrites=true';
    const args = [
      '--environment=production',
      '--database=lammah-quiz',
      '--categories=gameplay-history',
    ];
    expect(parseCleanupArgs(args, env(prod)).execute).toBe(false);
    expect(() =>
      parseCleanupArgs(
        [
          ...args,
          '--execute',
          '--confirm-database=lammah-quiz',
          '--backup-reference=x',
        ],
        env(prod),
      ),
    ).toThrow(/never deletes in production/);
  });
});

describe('selection patterns', () => {
  it('reads the database from standard and SRV URIs', () => {
    expect(databaseInUri(LOCAL)).toBe('lammah-quiz');
    expect(databaseInUri('mongodb+srv://h.example.net/Akwaan-prd')).toBe(
      'Akwaan-prd',
    );
    expect(databaseInUri('mongodb://localhost:27017/')).toBeNull();
  });

  it('matches smoke Worlds but never the real Football World slug "test"', () => {
    expect(isTestWorldSlug('smoke-world-smoke-12')).toBe(true);
    expect(isTestWorldSlug('closest-world-closest-smoke-3')).toBe(true);
    expect(isTestWorldSlug('la-tahriqha-qa-7')).toBe(true);
    expect(isTestWorldSlug('test')).toBe(false);
    expect(isTestWorldSlug('anime')).toBe(false);
  });

  it('matches only generated filler mechanics and automated accounts', () => {
    expect(
      TEST_CHALLENGE_TYPE_SLUG_PATTERN.test('smoke-filler-a-smoke-4'),
    ).toBe(true);
    expect(
      TEST_CHALLENGE_TYPE_SLUG_PATTERN.test('closest-filler-c-closest-smoke-1'),
    ).toBe(true);
    expect(TEST_CHALLENGE_TYPE_SLUG_PATTERN.test('bomb')).toBe(false);
    expect(AUTOMATED_TEST_EMAIL_PATTERN.test('smoke-1@local.invalid')).toBe(
      true,
    );
    expect(AUTOMATED_TEST_EMAIL_PATTERN.test('someone@gmail.com')).toBe(false);
    expect(AUTOMATED_TEST_EMAIL_PATTERN.test('test@test.com')).toBe(false);
  });
});
