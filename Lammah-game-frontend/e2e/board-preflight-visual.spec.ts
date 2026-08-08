import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const HOST = process.env.E2E_HOST_EMAIL ?? "top5smoke@test.com";
const PASSWORD = process.env.E2E_HOST_PASSWORD ?? "Top5Smoke!42";
const WORLD = process.env.E2E_WORLD ?? "كرة قدم";
const SHOTS = resolve(process.cwd(), "e2e-screenshots", "board-preflight");
const ROOT = resolve(process.cwd(), "..");

test("Board and Preflight visual states", async ({ page, browser }) => {
  test.setTimeout(240_000);
  mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await completeSetup(page);

  await expect(page.getByTestId("unified-board")).toBeVisible({ timeout: 30_000 });
  for (let refresh = 0; refresh < 2; refresh += 1) {
    await page.reload();
    await expect(page.getByTestId("unified-board")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("تمت استعادة أحدث حالة للمباراة.")).toHaveCount(0);
    await expect(page.getByTestId("match-connection-banner")).toHaveCount(0);
  }
  await shot(page, "board-1440");
  await shot(page, "board-unavailable");
  const focusTile = page.locator('[data-launchability="launchable"]').first();
  await focusTile.focus();
  await expect(focusTile).toBeFocused();
  await shot(page, "board-active-picker");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await shot(page, "board-1920");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "board-narrow");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('[data-challenge-key="closest"][data-launchability="launchable"]').first().click();
  await expect(page.getByTestId("challenge-preflight")).toBeVisible({ timeout: 30_000 });
  await shot(page, "preflight-empty");
  await shot(page, "preflight-1440");

  const code = (await page.getByTestId("preflight-join-code").innerText()).trim();
  const contexts: BrowserContext[] = [];
  contexts.push(await joinPhone(browser, code, "Green Visual", 0));
  await expect(page.locator('[data-testid^="preflight-team-"]').filter({ hasText: "Green Visual" })).toBeVisible({ timeout: 30_000 });
  await shot(page, "preflight-partial");

  contexts.push(await joinPhone(browser, code, "Green Visual 2", 0));
  contexts.push(await joinPhone(browser, code, "Coral Visual", 1));
  contexts.push(await joinPhone(browser, code, "Coral Visual 2", 1));
  await expect(page.getByTestId("preflight-start")).toBeEnabled({ timeout: 60_000 });
  await shot(page, "preflight-ready");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await shot(page, "preflight-1920");

  const completedSession = latestCompletedBoardSession();
  if (completedSession) {
    await page.goto(`/matches/${completedSession}`);
    await expect(page.getByTestId("unified-board")).toBeVisible({ timeout: 30_000 });
    await page.setViewportSize({ width: 1440, height: 900 });
    await shot(page, "board-with-completed");
  }

  for (const context of contexts) await context.close();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(HOST);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

async function completeSetup(page: Page) {
  await page.goto("/matches/new");
  await expect(page.getByTestId("match-setup-wizard")).toBeVisible({ timeout: 30_000 });
  for (let occurrence = 0; occurrence < 3; occurrence += 1) {
    await page.locator(`button[aria-pressed][aria-label="${WORLD}"]`).click();
    const scopes = page.locator('button[aria-pressed="false"]:not([disabled])[aria-label]');
    for (let index = 0; index < 4; index += 1) await scopes.first().click();
    await page.getByRole("button", { name: "متابعة", exact: true }).click();
  }
  await page.getByRole("button", { name: "متابعة إلى الفريقين" }).click();
  const start = page.getByRole("button", { name: /ابدأ المباراة/ });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await page.waitForURL((url) => /^\/matches\/[^/]+$/.test(url.pathname), { timeout: 60_000 });
}

async function joinPhone(browser: Browser, code: string, name: string, team: number) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await context.newPage();
  await phone.goto(`/join/live-session/${code}`);
  await phone.locator("input[autocomplete='nickname']").fill(name);
  await phone.locator("[data-team-option]").nth(team).click();
  await phone.locator('button[type="submit"]').click();
  return context;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: true });
}

function latestCompletedBoardSession(): string | undefined {
  try {
    const script = 'const d=db.matches.findOne({"challengeResults.0":{$exists:true},$or:[{stage:"board"},{"stage.key":"board"}]},{liveSessionId:1},{sort:{updatedAt:-1}}); print(d?.liveSessionId||"")';
    return execFileSync("docker", ["compose", "exec", "-T", "mongodb", "mongosh", "--quiet", "lammah-quiz", "--eval", script], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim() || undefined;
  } catch {
    return undefined;
  }
}
