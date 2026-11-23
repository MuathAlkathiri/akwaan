import {
  assertSafeTarget,
  databaseNameOf,
  UnsafeTargetError,
} from './seed-staging-content';

/**
 * The guard, which is the only thing between a mistyped URI and production.
 *
 * The script copies by emptying the target collection first. That is correct
 * for staging and catastrophic anywhere else, so these are the tests that
 * matter in this file — not the copying.
 */
const PROD = 'mongodb+srv://u:p@cluster.mongodb.net/akwaan?retryWrites=true';
const STAGING =
  'mongodb+srv://u:p@cluster.mongodb.net/akwaan_staging?retryWrites=true';

describe('databaseNameOf', () => {
  it('reads the name out of an SRV URI with options', () => {
    expect(databaseNameOf(PROD)).toBe('akwaan');
  });

  it('reads it out of a plain local URI', () => {
    expect(databaseNameOf('mongodb://localhost:27017/lammah-quiz')).toBe(
      'lammah-quiz',
    );
  });
});

describe('assertSafeTarget', () => {
  it('allows a staging target', () => {
    expect(() => assertSafeTarget(PROD, STAGING)).not.toThrow();
  });

  it('refuses to write to production', () => {
    expect(() => assertSafeTarget(STAGING, PROD)).toThrow(UnsafeTargetError);
  });

  it('refuses when both URIs name the same database', () => {
    // The copy empties the target first, so this would destroy the source.
    expect(() => assertSafeTarget(PROD, PROD)).toThrow(/same database/i);
  });

  it('refuses a target whose name does not say staging', () => {
    expect(() =>
      assertSafeTarget(PROD, 'mongodb+srv://u:p@c.mongodb.net/akwaan-copy'),
    ).toThrow(/must have "staging"/);
  });

  it('accepts staging however it is capitalised', () => {
    expect(() =>
      assertSafeTarget(PROD, 'mongodb+srv://u:p@c.mongodb.net/Akwaan-STAGING'),
    ).not.toThrow();
  });

  it('refuses a URI that names no database at all', () => {
    // Easy to produce by copying a connection string out of Atlas, which
    // gives you the cluster without a database path.
    expect(() =>
      assertSafeTarget(PROD, 'mongodb+srv://u:p@cluster.mongodb.net/'),
    ).toThrow(/names no database/);
  });

  it('refuses a source that names no database', () => {
    expect(() =>
      assertSafeTarget('mongodb+srv://u:p@cluster.mongodb.net/', STAGING),
    ).toThrow(/names no database/);
  });
});
