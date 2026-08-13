import { User } from "@/types";

export const TOKEN_KEY = "lammah_access_token";
export const USER_KEY = "lammah_user";

const browserStorage = () =>
  typeof window === "undefined" ? undefined : window.localStorage;

export const authStorage = {
  getToken: () => browserStorage()?.getItem(TOKEN_KEY) ?? null,
  setToken: (token: string) => browserStorage()?.setItem(TOKEN_KEY, token),
  getUser: (): User | null => {
    const value = browserStorage()?.getItem(USER_KEY);
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
  },
};
