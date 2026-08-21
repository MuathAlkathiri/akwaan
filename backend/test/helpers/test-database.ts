import { Connection, createConnection } from 'mongoose';

/**
 * The original test database URI, captured once at module load.
 *
 * With `maxWorkers: 1`, every integration suite shares one Node process and
 * one `process.env`. `createIntegrationTestApp` deliberately overrides
 * `process.env.MONGODB_URI` so each suite's NestJS app connects to its own
 * isolated database. Without a snapshot of the original base, the next suite's
 * `isolatedTestDatabaseUri` would compound the database name
 * (e.g. `_combo-lifecycle_match-api_test`) because it would read the previous
 * suite's overridden URI as the base.
 *
 * Capturing at module load — before any suite has run — freezes the base so
 * every suite computes its isolated name from the same origin, regardless of
 * what `process.env.MONGODB_URI` happens to be at call time.
 */
const BASE_TEST_URI = process.env.TEST_MONGODB_URI ?? process.env.MONGODB_URI;

export function requireSafeTestDatabaseUri(): string {
  const uri =
    BASE_TEST_URI ?? process.env.TEST_MONGODB_URI ?? process.env.MONGODB_URI;
  if (!uri) throw new Error('TEST_MONGODB_URI is required');
  const database = new URL(uri).pathname.replace(/^\//, '').split('?')[0];
  if (!database.endsWith('_test')) {
    throw new Error(
      'Refusing test database access: database name must end in _test',
    );
  }
  return uri;
}

/**
 * A suite that drops the database mid-run must not share one with a suite that
 * seeds in `beforeAll`, so it asks for its own isolated name. The `_test` guard
 * still applies.
 *
 * Always computed from `BASE_TEST_URI`, so the result is stable regardless of
 * how many suites have run before or what `process.env.MONGODB_URI` currently
 * holds.
 */
export function isolatedTestDatabaseUri(suiteName: string): string {
  const uri = new URL(requireSafeTestDatabaseUri());
  const [database, query] = uri.pathname.replace(/^\//, '').split('?');
  uri.pathname = `/${database.replace(/_test$/, '')}_${suiteName}_test`;
  if (query) uri.search = `?${query}`;
  return uri.toString();
}

export async function connectTestDatabase(
  suiteName?: string,
): Promise<Connection> {
  const uri = suiteName
    ? isolatedTestDatabaseUri(suiteName)
    : requireSafeTestDatabaseUri();
  return createConnection(uri).asPromise();
}

export async function resetTestDatabase(connection: Connection): Promise<void> {
  if (!connection.db) throw new Error('Test database is not connected');
  await connection.db.dropDatabase();
}
