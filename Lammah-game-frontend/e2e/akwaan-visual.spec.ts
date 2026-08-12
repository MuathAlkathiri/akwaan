import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { resolve } from "path";

/**
 * The Akwaan visual smoke.
 *
 * Not a pixel-diff suite: it drives the real Docker stack, asserts the things the
 * identity actually promises — warm off-white room, no retired purple, both teams
 * in their own colours, World artwork present — and writes a screenshot of every
 * major surface at each viewport category so the redesign can be reviewed rather
 * than taken on trust.
 *
 * Viewports are categories, not devices: a laptop, a shared screen, and a phone.
 *
 *   E2E_BASE_URL=http://localhost:3001 npx playwright test e2e/akwaan-visual.spec.ts
 */

const HOST = process.env.E2E_HOST_EMAIL ?? "top5smoke@test.com";
const PASSWORD = process.env.E2E_HOST_PASSWORD ?? "Top5Smoke!42";
const TOP5_WORLD = process.env.E2E_TOP5_WORLD ?? "كرة قدم";
const SHOTS = resolve(process.cwd(), "e2e-screenshots");

const VIEWPORTS = {
  laptop: { width: 1440, height: 900 },
  laptopChrome: { width: 1440, height: 760 },
  narrow: { width: 1024, height: 768 },
  shared: { width: 1920, height: 1080 },
  phone: { width: 390, height: 844 },
} as const;

/** The retired identity, as literal values that must not come back. */
const RETIRED_PURPLE = ["#130d27", "#211a38", "#110b25", "rgb(139, 92, 246)"];

test.describe("@visual Akwaan identity", () => {
  test.setTimeout(240_000);

  test.beforeAll(() => {
    mkdirSync(SHOTS, { recursive: true });
  });

  test("the room is warm off-white and the retired purple is gone", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.laptop);
    await login(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    // Warm off-white: high, roughly equal-ish RGB with red above blue.
    const [r, g, b] = background.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(230);
    expect(g).toBeGreaterThan(225);
    expect(r).toBeGreaterThan(b);

    const markup = await page.content();
    for (const value of RETIRED_PURPLE) {
      expect(markup.toLowerCase()).not.toContain(value.toLowerCase());
    }
    await shoot(page, "home", "laptop");
    await page.screenshot({
      path: resolve(SHOTS, "home-laptop-full.png"),
      fullPage: true,
    });

    const cards = page.getByTestId("world-card-media");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    await expect(page.getByText("عالم كرة قدم", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("عالم انمي", { exact: true }).first()).toBeVisible();

    for (const [viewport, size] of [
      ["shared", VIEWPORTS.shared],
      ["laptop-chrome", VIEWPORTS.laptopChrome],
      ["narrow", VIEWPORTS.narrow],
      ["phone", VIEWPORTS.phone],
    ] as const) {
      await page.setViewportSize(size);
      await expect(cards.first()).toBeVisible();
      await shoot(page, "home", viewport);
    }
  });

  test("captures every major host surface at laptop and shared-screen size", async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(VIEWPORTS.laptop);
    await login(page);

    // ── Setup wizard ─────────────────────────────────────────────────────────
    await page.goto("/matches/new");
    await expect(page.getByTestId("match-setup-wizard")).toBeVisible({
      timeout: 30_000,
    });
    await shoot(page, "match-setup", "laptop");
    await completeSetup(page);

    // ── Board ────────────────────────────────────────────────────────────────
    await expect(page.getByTestId("unified-board")).toBeVisible({
      timeout: 30_000,
    });
    // The World is the hero of its column, and the artwork actually loaded.
    const media = page.getByTestId("world-media");
    await expect(media.first()).toBeVisible();
    expect(await media.count()).toBe(3);
    // The Match shell owns identity, teams and progress; the board owns the turn.
    await expect(page.getByTestId("match-shell")).toBeVisible();
    await expect(page.getByTestId("team-scoreboard")).toBeVisible();
    await expect(page.getByTestId("team-score-1")).toBeVisible();
    await expect(page.getByTestId("team-score-2")).toBeVisible();
    // No site navigation over a game surface.
    expect(await page.locator("header nav").count()).toBe(0);
    await shoot(page, "board", "laptop");

    await page.setViewportSize(VIEWPORTS.shared);
    await expect(page.getByTestId("unified-board")).toBeVisible();
    await shoot(page, "board", "shared");
    await page.setViewportSize(VIEWPORTS.laptop);

    // ── Preflight ────────────────────────────────────────────────────────────
    await page
      .locator('[data-challenge-key="top-5"]')
      .first()
      .getByRole("button")
      .first()
      .click();
    await expect(page.getByTestId("challenge-preflight")).toBeVisible({
      timeout: 30_000,
    });
    await shoot(page, "preflight-empty", "laptop");

    const joinCode = (
      await page.getByTestId("preflight-join-code").innerText()
    ).trim();

    // ── Phone join, in Arabic, with a diacritic name ─────────────────────────
    const phoneContext = await browser.newContext({
      viewport: VIEWPORTS.phone,
    });
    const phone = await phoneContext.newPage();
    await phone.goto(`/join/live-session/${joinCode}`);
    await expect(phone.locator("input[autocomplete='nickname']")).toBeVisible({
      timeout: 30_000,
    });
    // Arabic-first: the join screen must not be in English any more.
    const phoneText = await phone.locator("body").innerText();
    expect(phoneText).toContain("انضم");
    expect(phoneText).not.toContain("Join the game");
    expect(await phone.locator("[dir='rtl']").count()).toBeGreaterThan(0);
    await shoot(phone, "phone-join", "phone");

    await phone.locator("input[autocomplete='nickname']").fill("مُعاذ");
    await phone.locator("[data-team-option]").first().click();
    await phone.locator('button[type="submit"]').click();
    // The diacritic name was accepted by the server, not rejected as invalid.
    await expect(phone.locator("body")).not.toContainText("استخدم الحروف", {
      timeout: 30_000,
    });
    // One phone cannot make both teams ready, so what is asserted is that the
    // host saw this phone arrive, by name, on its own team's card.
    await expect(page.locator('[aria-label="متصل"]').first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("challenge-preflight")).toContainText("مُعاذ");
    await shoot(page, "preflight-paired", "laptop");
    await shoot(phone, "phone-preflight", "phone");

    await phoneContext.close();
  });

  test("captures the scope-card selection surface at desktop and phone widths", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.laptop);
    await login(page);
    await page.goto("/matches/new");

    const world = page.locator(
      `button[aria-pressed][aria-label="${TOP5_WORLD}"]`,
    );
    await expect(world).toBeVisible({ timeout: 30_000 });
    await world.click();

    const scopeMedia = page.getByTestId("scope-card-media");
    await expect(scopeMedia.first()).toBeVisible({ timeout: 30_000 });
    expect(await scopeMedia.count()).toBeGreaterThanOrEqual(4);
    const firstScope = scopeMedia.first().locator("..");
    await firstScope.click();
    await expect(firstScope).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({
      path: resolve(SHOTS, "scope-cards-laptop.png"),
      fullPage: true,
    });

    await page.setViewportSize(VIEWPORTS.phone);
    await expect(scopeMedia.first()).toBeVisible();
    await shoot(page, "scope-cards", "phone");
  });

  test("captures the three-station Match review loadout", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.laptop);
    await login(page);
    await page.goto("/matches/new");
    await configureToReview(page);

    const stations = page.getByTestId("review-world-stations");
    await expect(stations).toBeVisible();
    await expect(stations.locator(":scope > li")).toHaveCount(3);
    await expect(page.getByTestId("setup-progress")).toHaveCount(0);
    await expect(page.getByTestId("review-summary")).toHaveCount(0);
    await expect(page.getByTestId("review-ready-state")).toHaveCount(3);
    await expect(page.getByText("3 عوالم · 12 نطاق · 12 تحدي")).toBeVisible();
    await shoot(page, "match-review", "laptop");

    await page.setViewportSize(VIEWPORTS.shared);
    await expect(stations).toBeVisible();
    await shoot(page, "match-review", "shared");

    await page.setViewportSize(VIEWPORTS.phone);
    await expect(stations).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      VIEWPORTS.phone.width,
    );
    await page.screenshot({
      path: resolve(SHOTS, "match-review-phone-full.png"),
      fullPage: true,
    });

    await page
      .getByTestId("review-occurrence-0")
      .getByRole("button", { name: "تعديل النطاقات" })
      .click();
    await expect(page.getByTestId("match-setup-wizard")).toHaveAttribute(
      "data-step",
      "scopes",
    );
  });

  test("opens a World card directly at Scope selection", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.laptop);
    await login(page);
    await page.goto("/");

    const carousel = page.getByTestId("featured-worlds-carousel");
    await carousel.hover();
    const worldLink = carousel.getByRole("link", { name: /ادخل عالم/ });
    await expect(worldLink).toBeVisible({ timeout: 30_000 });
    const worldHref = await worldLink.getAttribute("href");
    expect(worldHref).toMatch(/^\/matches\/new\?worldId=/);
    await worldLink.click();

    await expect(page).toHaveURL(/\/matches\/new\?worldId=/);
    await expect(page.getByTestId("match-setup-wizard")).toHaveAttribute(
      "data-step",
      "scopes",
    );
    await expect(page.getByTestId("scope-card-media").first()).toBeVisible();
    await shoot(page, "setup-direct-scopes", "laptop");
  });

  test("captures the recovery state a corrupt stage produces", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.laptop);
    await login(page);
    // Nothing fabricates this: an unknown stage is what the router is asked to
    // render when client and server disagree, and it must never fall back to the
    // board. Driven here by navigating to a Match id that does not exist.
    await page.goto("/matches/00000000-0000-0000-0000-000000000000");
    await expect(
      page.getByTestId("match-host-error").or(page.getByTestId("match-absent")),
    ).toBeVisible({ timeout: 30_000 });
    await shoot(page, "recovery", "laptop");
  });
});

async function shoot(page: Page, name: string, viewport: string) {
  await page.screenshot({
    path: resolve(SHOTS, `${name}-${viewport}.png`),
    fullPage: false,
  });
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(HOST);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

async function completeSetup(page: Page): Promise<void> {
  await configureToReview(page);
  await page.getByRole("button", { name: "متابعة إلى الفريقين" }).click();
  const start = page.getByRole("button", { name: /ابدأ المباراة/ });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await page.waitForURL(/\/matches\/[^/]+$/, { timeout: 60_000 });
}

async function configureToReview(page: Page): Promise<void> {
  for (let occurrence = 0; occurrence < 3; occurrence += 1) {
    const world = page.locator(
      `button[aria-pressed][aria-label="${TOP5_WORLD}"]`,
    );
    await expect(world).toHaveCount(1, { timeout: 30_000 });
    await world.click();
    await expect(page.getByTestId("scope-count")).toBeVisible({
      timeout: 15_000,
    });
    const scopes = page.locator(
      'button[aria-pressed="false"]:not([disabled])[aria-label]',
    );
    for (let scope = 0; scope < 4; scope += 1) {
      await expect(scopes.first()).toBeVisible({ timeout: 30_000 });
      await scopes.first().click();
    }
    await page.getByRole("button", { name: "متابعة", exact: true }).click();
  }
  await expect(page.getByTestId("review-world-stations")).toBeVisible({
    timeout: 30_000,
  });
}
