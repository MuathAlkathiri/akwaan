import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/akwaan/theme-toggle";
import {
  defaultThemeFor,
  THEME_BOOTSTRAP_SCRIPT,
  ThemeProvider,
  themeStorageKey,
  themeSurfaceFor,
} from "@/providers/theme-provider";

/**
 * Akwaan is light by default, and the two clients remember their own choices.
 *
 * Two separate rules, easy to conflate:
 *
 *  - **The default is the identity.** The warm off-white room is what the product is,
 *    not a mode, so every client starts there. Dark is an option a viewer opts into
 *    for a large screen in a dim room; it is never the first thing anyone sees.
 *  - **The preference is per-client.** A 55-inch panel across a room and a screen at
 *    arm's length are different viewing contexts, so each keeps its own choice and
 *    neither can move the other — the part a single global toggle would get wrong.
 */
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
});

afterEach(() => {
  pathname = "/";
});

describe("which client a route belongs to", () => {
  it("treats a room's display as the shared screen, whatever its width", () => {
    // A host's laptop driving the television is a shared screen; a viewport query
    // would have called it a phone in a narrow window.
    expect(themeSurfaceFor("/live-sessions/session-1/screen")).toBe("shared-screen");
    expect(themeSurfaceFor("/matches/session-1")).toBe("shared-screen");
  });

  it("treats a join route and everything else as a hand-held client", () => {
    expect(themeSurfaceFor("/join/live-session/ABC123")).toBe("phone");
    expect(themeSurfaceFor("/")).toBe("phone");
    expect(themeSurfaceFor("/admin/worlds")).toBe("phone");
  });

  it("defaults both clients to the light room", () => {
    // The warm off-white identity is the default experience on every surface. A
    // dark-first shared screen would make the product's own room the exception.
    expect(defaultThemeFor("shared-screen")).toBe("light");
    expect(defaultThemeFor("phone")).toBe("light");
  });
});

describe("the two preferences do not touch", () => {
  const renderAt = (route: string) => {
    pathname = route;
    return render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
  };

  it("starts both clients in the light room", () => {
    const shared = renderAt("/matches/session-1");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    shared.unmount();

    renderAt("/join/live-session/ABC123");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("stores a switch under that surface's key alone", async () => {
    const user = userEvent.setup();
    const shared = renderAt("/matches/session-1");
    await user.click(screen.getByTestId("theme-toggle"));

    expect(window.localStorage.getItem(themeStorageKey("shared-screen"))).toBe(
      "dark",
    );
    // The other client was not written to at all — not even to the same value.
    expect(window.localStorage.getItem(themeStorageKey("phone"))).toBeNull();
    shared.unmount();
  });

  it("leaves the other client on its own preference", async () => {
    const user = userEvent.setup();
    // The room dims its screen…
    const shared = renderAt("/matches/session-1");
    await user.click(screen.getByTestId("theme-toggle"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    shared.unmount();

    // …and a phone joining afterwards is still in the light room.
    await act(async () => {
      renderAt("/join/live-session/ABC123");
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(screen.getByTestId("theme-toggle").dataset.theme).toBe("light");
  });

  it("adopts a stored preference over the surface default", async () => {
    window.localStorage.setItem(themeStorageKey("phone"), "dark");
    await act(async () => {
      renderAt("/join/live-session/ABC123");
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("no flash before the first paint", () => {
  it("reaches the same verdict as the module on every route, and honours storage", () => {
    // The script runs as a string before any bundle is parsed, so it necessarily
    // repeats the route rule and the defaults. Rather than string-matching the copy,
    // this executes it and compares its verdict against the module's — the two
    // cannot drift apart without failing here.
    const run = new Function(THEME_BOOTSTRAP_SCRIPT);
    for (const route of [
      "/",
      "/matches/session-1",
      "/live-sessions/session-1/screen",
      "/join/live-session/ABC123",
      "/admin/worlds",
    ]) {
      window.history.pushState({}, "", route);
      document.documentElement.className = "";
      run();
      const surface = themeSurfaceFor(route);
      expect(document.documentElement.dataset.themeSurface, route).toBe(surface);
      expect(document.documentElement.classList.contains("dark"), route).toBe(
        defaultThemeFor(surface) === "dark",
      );
    }

    // And an opted-in dark preference is applied before the first paint, which is the
    // only case this script exists for: a default-light viewer never sees a flash.
    window.localStorage.setItem(themeStorageKey("shared-screen"), "dark");
    window.history.pushState({}, "", "/matches/session-1");
    document.documentElement.className = "";
    run();
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // A phone with no stored preference on the same load stays light.
    window.history.pushState({}, "", "/join/live-session/ABC123");
    document.documentElement.className = "";
    run();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("is wired into the document head, on an element that tolerates its writes", () => {
    // Reading the layout rather than trusting it: a bootstrap script that is not
    // actually mounted fails invisibly, which is the whole failure mode here.
    const layout = require("fs").readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("THEME_BOOTSTRAP_SCRIPT");
    expect(layout).toContain("<head>");
    // The script writes `class` and `data-theme-surface` onto <html> before React
    // hydrates, which is a mismatch by construction. Without this, every page load
    // logged a hydration error — observed in the browser, not in a unit test.
    expect(layout).toContain("suppressHydrationWarning");
  });
});
