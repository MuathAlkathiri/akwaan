import { Connection, createConnection } from 'mongoose';

export function requireSafeTestDatabaseUri(): string {
  const uri = process.env.TEST_MONGODB_URI ?? process.env.MONGODB_URI;
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
