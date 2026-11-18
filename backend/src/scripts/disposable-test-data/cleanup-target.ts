/**
 * Target and safety rules for the disposable test-data cleanup.
 *
 * Kept free of I/O so every refusal is unit-tested. The rules:
 * - The operator must name the environment AND the database explicitly. There
 *   is no default, so a missing flag can never fall through to Production.
 * - The database named on the command line must be the one in the URI.
 * - Dry run is the default. Deleting needs `--execute`, the database name typed
 *   again in `--confirm-database`, and a recorded backup reference.
 * - Production may be inventoried (dry run) but this tool never deletes there:
 *   Production execution needs its own, separately authorised manifest.
 */

export const CLEANUP_ENVIRONMENTS = [
  'local',
  'development',
  'test',
  'staging',
  'production',
] as const;
export type CleanupEnvironment = (typeof CLEANUP_ENVIRONMENTS)[number];

export const CLEANUP_CATEGORIES = [
  'gameplay-history',
  'legacy-history',
  'expired-caches',
  'test-catalogue',
  'test-users',
] as const;
export type CleanupCategory = (typeof CLEANUP_CATEGORIES)[number];

export interface CleanupTarget {
  uri: string;
  environment: CleanupEnvironment;
  database: string;
  categories: CleanupCategory[];
  execute: boolean;
  backupReference: string | null;
  reportPath: string | null;
}

export class CleanupTargetError extends Error {}

export function parseCleanupArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): CleanupTarget {
  const flags = new Map<string, string | true>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      throw new CleanupTargetError(`Unexpected argument "${arg}"`);
    }
    const [key, ...rest] = arg.slice(2).split('=');
    flags.set(key, rest.length ? rest.join('=') : true);
  }
  const text = (key: string): string | null => {
    const value = flags.get(key);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };

  const uri = env.CLEANUP_MONGODB_URI?.trim();
  if (!uri) {
    throw new CleanupTargetError(
      'Set CLEANUP_MONGODB_URI explicitly. MONGODB_URI is deliberately not read, so the app configuration can never be picked up by accident.',
    );
  }
  const environment = text('environment');
  if (!environment || !CLEANUP_ENVIRONMENTS.includes(environment as never)) {
    throw new CleanupTargetError(
      `--environment is required: one of ${CLEANUP_ENVIRONMENTS.join(', ')}`,
    );
  }
  const database = text('database');
  if (!database) {
    throw new CleanupTargetError('--database is required');
  }
  const uriDatabase = databaseInUri(uri);
  if (uriDatabase !== database) {
    throw new CleanupTargetError(
      `--database "${database}" does not match the database in the URI ("${uriDatabase ?? 'none'}")`,
    );
  }

  const categoryList = text('categories');
  const categories = (
    categoryList ? categoryList.split(',').map((value) => value.trim()) : []
  ).filter(Boolean);
  if (!categories.length) {
    throw new CleanupTargetError(
      `--categories is required: a comma-separated subset of ${CLEANUP_CATEGORIES.join(', ')}`,
    );
  }
  for (const category of categories) {
    if (!CLEANUP_CATEGORIES.includes(category as never)) {
      throw new CleanupTargetError(`Unknown category "${category}"`);
    }
  }

  const execute = flags.get('execute') === true;
  const backupReference = text('backup-reference');
  if (execute) {
    if (environment === 'production') {
      throw new CleanupTargetError(
        'This tool never deletes in production. Produce a dry-run manifest and get it separately authorised.',
      );
    }
    if (text('confirm-database') !== database) {
      throw new CleanupTargetError(
        '--execute needs --confirm-database=<the same database name>',
      );
    }
    if (!backupReference) {
      throw new CleanupTargetError(
        '--execute needs --backup-reference=<where the verified backup is>',
      );
    }
  }

  return {
    uri,
    environment: environment as CleanupEnvironment,
    database,
    categories: categories as CleanupCategory[],
    execute,
    backupReference,
    reportPath: text('report'),
  };
}

/** The database path segment of a MongoDB URI, without options. */
export function databaseInUri(uri: string): string | null {
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/.exec(uri);
  const name = match?.[1] ? decodeURIComponent(match[1]) : '';
  return name || null;
}

/**
 * Worlds created by automated smoke and QA runs. Deliberately exact patterns:
 * the real Football World's slug is literally `test`, so nothing may match on
 * the word "test".
 */
export const TEST_WORLD_SLUG_PATTERNS: readonly RegExp[] = [
  /^smoke-world-smoke-\d+$/,
  /^closest-world-closest-smoke-\d+$/,
  /^la-tahriqha-qa-\d+$/,
];

/** Filler mechanics created by the same smoke runs. */
export const TEST_CHALLENGE_TYPE_SLUG_PATTERN =
  /^(smoke|closest)-filler-[abc]-(closest-)?smoke-\d+$/;

/** Accounts created by automated runs only. Manual QA accounts need a PO decision. */
export const AUTOMATED_TEST_EMAIL_PATTERN =
  /@(local\.invalid|local\.test|test\.local|example\.invalid)$/i;

export function isTestWorldSlug(slug: string): boolean {
  return TEST_WORLD_SLUG_PATTERNS.some((pattern) => pattern.test(slug));
}
