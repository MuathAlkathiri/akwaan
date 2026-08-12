"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";

/**
 * Two clients, two independent theme preferences, one codebase.
 *
 * **Akwaan is light by default, everywhere.** The warm off-white room is the product's
 * identity, not a mode: it is what the World artwork was chosen against and what the
 * brand reads as. Both clients therefore start light, and dark is an explicit
 * preference a viewer opts into — a glare-reducing option for a large screen in a dim
 * room, never the first thing anyone sees.
 *
 * What stays split is the *preference*, not the default. The shared screen and the
 * phone are different viewing contexts — a 55-inch panel across a room versus a screen
 * at arm's length — so each remembers its own choice, and dimming the television does
 * not dim everyone's phone.
 *
 * Which surface a client is depends on the route it is on, not on a viewport query —
 * a host's laptop driving the TV is a shared screen at any width, and a phone on the
 * join route is a phone even in landscape.
 */
export type ThemeSurface = "shared-screen" | "phone";
export type ThemePreference = "light" | "dark";

/** One key per surface. This is what makes the two preferences independent. */
export const THEME_STORAGE_PREFIX = "akwaan:theme:";

/** Routes that drive a room's display. Everything else is held in a hand. */
const SHARED_SCREEN_ROUTES = [/^\/live-sessions\/[^/]+\/screen/, /^\/matches\//];

export function themeSurfaceFor(pathname: string): ThemeSurface {
  return SHARED_SCREEN_ROUTES.some((route) => route.test(pathname))
    ? "shared-screen"
    : "phone";
}

/**
 * Light, for both clients.
 *
 * Takes the surface because the *preference* is per-surface and a caller has to name
 * which one it is asking about — not because the two answers differ. If a future
 * default ever diverges, this is the one place it would.
 */
export function defaultThemeFor(_surface: ThemeSurface): ThemePreference {
  return "light";
}

export function themeStorageKey(surface: ThemeSurface): string {
  return `${THEME_STORAGE_PREFIX}${surface}`;
}

function readStoredTheme(surface: ThemeSurface): ThemePreference | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(themeStorageKey(surface));
    return stored === "light" || stored === "dark" ? stored : undefined;
  } catch {
    // A storage-denied browser simply takes the surface's default every time.
    return undefined;
  }
}

interface ThemeContextValue {
  surface: ThemeSurface;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const surface = themeSurfaceFor(pathname);
  // Starts at the surface default so the server and the first client render agree;
  // the stored preference is adopted in the effect below, which is also what the
  // inline script in the document head has already applied to avoid a flash.
  const [preferences, setPreferences] = useState<
    Partial<Record<ThemeSurface, ThemePreference>>
  >({});

  useEffect(() => {
    const stored = readStoredTheme(surface);
    if (stored) setPreferences((current) => ({ ...current, [surface]: stored }));
  }, [surface]);

  const theme = preferences[surface] ?? defaultThemeFor(surface);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.themeSurface = surface;
  }, [surface, theme]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setPreferences((current) => ({ ...current, [surface]: next }));
      try {
        window.localStorage.setItem(themeStorageKey(surface), next);
      } catch {
        // The preference still applies for this session.
      }
    },
    [surface],
  );

  const value = useMemo(
    () => ({
      surface,
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [surface, theme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * This client's theme.
 *
 * Falls back to the phone default outside a provider rather than throwing: the
 * provider is mounted once at the root of the app, so the only trees without one are
 * components rendered in isolation — and a theme switch is not worth taking a whole
 * screen down over. The fallback is inert, so nothing silently half-works either.
 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  return (
    value ?? {
      surface: "phone",
      theme: defaultThemeFor("phone"),
      setTheme: () => {},
      toggleTheme: () => {},
    }
  );
}

/**
 * The stored preference, applied before the first paint.
 *
 * Only matters for a viewer who has opted into dark: without this their screen paints
 * the light room first and then flips, which on a large panel in a dim room is the
 * glare they chose dark to avoid. A default-light viewer sees the light room from the
 * first frame either way.
 *
 * Deliberately duplicates the route rule above rather than importing it: this runs as
 * a string in the document head, before any bundle is parsed. The duplication is
 * pinned by `src/test/theme-independence.test.tsx`, which executes this script and
 * compares its verdict against the module's.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{
var p=location.pathname;
var s=(/^\\/live-sessions\\/[^/]+\\/screen/.test(p)||/^\\/matches\\//.test(p))?'shared-screen':'phone';
var t=localStorage.getItem('${THEME_STORAGE_PREFIX}'+s);
document.documentElement.classList.toggle('dark',t==='dark');
document.documentElement.dataset.themeSurface=s;
}catch(e){}})();`;
