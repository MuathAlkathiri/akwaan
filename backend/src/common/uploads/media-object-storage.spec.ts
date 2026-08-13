import { ConfigService } from '@nestjs/config';
import {
  DisabledMediaObjectStorage,
  createMediaObjectStorage,
  normalizeKey,
} from './media-object-storage';

const configOf = (values: Record<string, string>): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const FULL_R2 = {
  R2_ACCOUNT_ID: 'account',
  R2_BUCKET: 'akwaan-media',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  MEDIA_PUBLIC_BASE_URL: 'https://media.akwaan.example',
};

describe('normalizeKey', () => {
  it.each([
    ['/uploads/questions/images/a.webp', 'questions/images/a.webp'],
    ['uploads/questions/images/a.webp', 'questions/images/a.webp'],
    ['/questions/images/a.webp', 'questions/images/a.webp'],
    ['questions/images/a.webp', 'questions/images/a.webp'],
    ['questions\\images\\a.webp', 'questions/images/a.webp'],
  ])('maps %s to the bucket key %s', (input, expected) => {
    expect(normalizeKey(input)).toBe(expected);
  });
});

describe('createMediaObjectStorage', () => {
  it('stays disabled when nothing is configured, so local dev is unchanged', () => {
    const storage = createMediaObjectStorage(configOf({}));
    expect(storage.enabled).toBe(false);
    expect(storage.publicUrl('questions/images/a.webp')).toBeUndefined();
  });

  it.each([
    'R2_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_ACCOUNT_ID',
  ])('refuses to half-enable when %s is missing', (missing) => {
    const values: Record<string, string> = { ...FULL_R2 };
    delete values[missing];
    expect(createMediaObjectStorage(configOf(values)).enabled).toBe(false);
  });

  it('enables mirroring once every credential is present', () => {
    const storage = createMediaObjectStorage(configOf(FULL_R2));
    expect(storage.enabled).toBe(true);
  });

  it('builds a public URL from the key the database already stores', () => {
    const storage = createMediaObjectStorage(configOf(FULL_R2));
    expect(
      storage.publicUrl(normalizeKey('/uploads/music/snippets/a.mp3')),
    ).toBe('https://media.akwaan.example/music/snippets/a.mp3');
  });

  it('omits the public URL when no media base is configured', () => {
    const values: Record<string, string> = { ...FULL_R2 };
    delete values.MEDIA_PUBLIC_BASE_URL;
    expect(
      createMediaObjectStorage(configOf(values)).publicUrl('music/a.mp3'),
    ).toBeUndefined();
  });

  it('accepts an explicit endpoint instead of an account id', () => {
    const values: Record<string, string> = { ...FULL_R2 };
    delete values.R2_ACCOUNT_ID;
    values.R2_ENDPOINT = 'https://account.r2.cloudflarestorage.com';
    expect(createMediaObjectStorage(configOf(values)).enabled).toBe(true);
  });
});

describe('DisabledMediaObjectStorage', () => {
  it('accepts writes as no-ops so callers need no branching', async () => {
    const storage = new DisabledMediaObjectStorage();
    await expect(storage.put()).resolves.toBeUndefined();
    await expect(storage.remove()).resolves.toBeUndefined();
  });
});
