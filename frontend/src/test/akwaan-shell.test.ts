import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve } from "path";
import {
  Layout,
  hasCosmicBackground,
  isHostMatchPath,
} from "@/components/layout";
import { MATCH_SETUP_ROUTE } from "@/features/match-setup";

/**
 * The cosmic layer belongs to the Akwaan identity, not to one route.
 *
 * It used to be mounted by the Match page alone, which made the same product look
 * like two: a home and a setup wizard on flat cream, then a Match with depth
 * behind it. It is now mounted once by the shared shell, and these assertions are
 * about *where* — the standard surfaces it must cover and gameplay/admin
 * surfaces it must stay off.
 */

const SRC = resolve(process.cwd(), "src");

// The shell's own decision is under test, not its children: stub them so a
// render observes only whether the shell mounts the site header.
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/components/layout/header", () => ({
  Header: () => createElement("div", { "data-testid": "site-header" }),
}));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/akwaan/akwaan-background", () => ({
  AkwaanBackground: () => null,
}));

function renderShellAt(path: string) {
  pathname = path;
  return render(createElement(Layout, null, createElement("p", null, "page")));
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = resolve(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("the cosmic background covers the player-facing Akwaan surfaces", () => {
  it("is on player-facing brand surfaces and every Match stage", () => {
    for (const path of [
      "/",
      "/worlds/6a6e54159e10fe3b881da006",
      MATCH_SETUP_ROUTE,
      "/matches/6a6a56ee011b008767874299",
    ]) {
      expect(hasCosmicBackground(path), `${path} should carry it`).toBe(true);
    }
  });

  it("gives login its focused auth shell instead of the site background", () => {
    expect(hasCosmicBackground("/login")).toBe(false);
    // Behaviour, not source text: the shell mounts the site header on an
    // ordinary page and leaves it off login.
    const home = renderShellAt("/");
    expect(screen.getByTestId("site-header")).toBeTruthy();
    home.unmount();
    renderShellAt("/login");
    expect(screen.queryByTestId("site-header")).toBeNull();

    const authShell = readFileSync(
      resolve(SRC, "features/auth/components/auth-shell.tsx"),
      "utf8",
    );
    expect(authShell).toContain("min-h-screen");
    expect(authShell).toContain("bg-white");
    expect(authShell).toContain("pointer-events-none");
    // The new login is a card beside a panel, side by side from `lg` up and
    // stacked on a phone with the form first.
    expect(authShell).toContain("lg:flex-row");
    expect(authShell).toContain("/how-to-play");
  });

  it("stays off admin, paired phones, and live gameplay screens", () => {
    for (const path of [
      "/admin",
      "/admin/worlds",
      "/join/live-session/ABC123",
      "/live-sessions/session-1/screen",
    ]) {
      expect(hasCosmicBackground(path), `${path} should not carry it`).toBe(
        false,
      );
    }
  });

  it("removes the old animated Match starfield entirely", () => {
    const mounts = walk(SRC).filter((path) => {
      if (!/\.tsx$/.test(path) || /\.(test|spec)\.tsx$/.test(path))
        return false;
      return /<Starfield(?:\s|\/>)/.test(readFileSync(path, "utf8"));
    });
    expect(mounts).toEqual([]);
  });

  it("mounts the approved artwork once in the shared shell, not in page content", () => {
    const mounts = walk(SRC).filter((path) => {
      if (!/\.tsx$/.test(path) || /\.(test|spec)\.tsx$/.test(path))
        return false;
      if (path.endsWith("components/akwaan/akwaan-background.tsx"))
        return false;
      return /<AkwaanBackground(?:\s[^>]*)?\/>/.test(
        readFileSync(path, "utf8"),
      );
    });
    expect(mounts.map((path) => path.slice(SRC.length))).toEqual([
      "/components/layout/index.tsx",
    ]);
  });

  it("uses a fixed white environment with a drawn backdrop, no planet images", () => {
    const source = readFileSync(
      resolve(SRC, "components/akwaan/akwaan-background.tsx"),
      "utf8",
    );
    expect(source).toContain("fixed inset-0 z-0");
    expect(source).toContain("bg-white");
    // The rendered planets belonged to the retired identity. The new backdrop
    // is flat discs and sparks, drawn inline.
    expect(source).not.toContain("/brand/cosmic");
    expect(source).not.toContain(".webp");
    expect(source).not.toContain("akwaan-cosmic-bg.webp");
  });

  it("uses the canonical static background on the host Match route", () => {
    const layout = readFileSync(
      resolve(SRC, "components/layout/index.tsx"),
      "utf8",
    );
    expect(isHostMatchPath("/matches/session-1")).toBe(true);
    expect(isHostMatchPath(MATCH_SETUP_ROUTE)).toBe(false);
    expect(layout).toContain("const hasPageArtwork = hasBackground");
    expect(layout).not.toContain("Starfield");
    // The live Match renders its own header HUD from inside the session, so the
    // shell deliberately does NOT mount a Header on the host Match route.
    expect(layout).toContain("!isHostMatch");
    expect(layout).not.toContain('hasPageArtwork ? "z-[1]"');
  });

  it("keeps Match navigation in the real Header but makes it non-escapable", () => {
    const header = readFileSync(
      resolve(SRC, "components/layout/header.tsx"),
      "utf8",
    );
    // The Match uses the same shared Header component (a dedicated compact bar),
    // not a separate navbar — and that bar carries no site navigation, only the
    // brand home-link and the HUD.
    expect(header).toContain('variant?: "default" | "match"');
    expect(header).toMatch(/variant === "match"/);
    expect(header).toContain("function MatchHeaderBar");
    expect(header).toContain('aria-label="أكوان - العودة للرئيسية"');
  });

  it("keeps the sticky Header in flow before the shared Main region", () => {
    const header = readFileSync(
      resolve(SRC, "components/layout/header.tsx"),
      "utf8",
    );
    const layout = readFileSync(
      resolve(SRC, "components/layout/index.tsx"),
      "utf8",
    );
    expect(header).toContain('"sticky top-0 z-20 w-full shrink-0 bg-white"');
    expect(header).not.toContain('"fixed top-0');
    expect(header).not.toContain("backdrop-blur");
    expect(header).not.toContain("bg-white/95");
    expect(layout).toContain('"relative flex min-h-screen flex-col"');
    expect(layout).toContain('"relative z-10 flex-1"');
    expect(layout.indexOf("<Header")).toBeLessThan(layout.indexOf("<main"));
    expect(layout).toContain('data-testid="app-main"');
  });
});
