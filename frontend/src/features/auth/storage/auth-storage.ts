import { User } from "@/types";

export const TOKEN_KEY = "akwaan_access_token";
export const USER_KEY = "akwaan_user";

// Pre-Akwaan keys. Sessions already in a visitor's browser were written under
// these, so we read them once and migrate the value forward rather than logging
// everyone out on the rename. Safe to delete once no active session predates it.
const LEGACY_TOKEN_KEY = "lammah_access_token";
const LEGACY_USER_KEY = "lammah_user";

const browserStorage = () =>
  typeof window === "undefined" ? undefined : window.localStorage;

/** Reads `key`, falling back to `legacyKey` and promoting it to `key`. */
const readMigrating = (key: string, legacyKey: string): string | null => {
  const storage = browserStorage();
  if (!storage) return null;
  const current = storage.getItem(key);
  if (current !== null) return current;
  const legacy = storage.getItem(legacyKey);
  if (legacy === null) return null;
  storage.setItem(key, legacy);
  storage.removeItem(legacyKey);
  return legacy;
};

export const authStorage = {
  getToken: () => readMigrating(TOKEN_KEY, LEGACY_TOKEN_KEY),
  setToken: (token: string) => browserStorage()?.setItem(TOKEN_KEY, token),
  getUser: (): User | null => {
    const value = readMigrating(USER_KEY, LEGACY_USER_KEY);
    if (!value) return null;
    try {
      return JSON.parse(value) as User;
    } catch {
      browserStorage()?.removeItem(USER_KEY);
      return null;
    }
  },
  setUser: (user: User) =>
    browserStorage()?.setItem(USER_KEY, JSON.stringify(user)),
  clear: () => {
    browserStorage()?.removeItem(TOKEN_KEY);
    browserStorage()?.removeItem(USER_KEY);
    browserStorage()?.removeItem(LEGACY_TOKEN_KEY);
    browserStorage()?.removeItem(LEGACY_USER_KEY);
  },
};
