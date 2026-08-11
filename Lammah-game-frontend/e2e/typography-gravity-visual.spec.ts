import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const HOST = process.env.E2E_HOST_EMAIL ?? "top5smoke@test.com";
const PASSWORD = process.env.E2E_HOST_PASSWORD ?? "Top5Smoke!42";
const WORLD = "كرة قدم";
const ROOT = resolve(process.cwd(), "..");
const SHOTS = resolve(process.cwd(), "e2e-screenshots", "typography-gravity");

test("typography and Gravity Stars visual journey", async ({ page, browser }) => {
  test.setTimeout(300_000);
  mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await page.goto("/");
  await expect(page.getByTestId("akwaan-starfield")).toBeVisible();
  await shot(page, "01-home-1440");

  const worldLink = page.getByRole("link", { name: /فيديو قيمز/ }).first();
  await expect(worldLink).toBeVisible();
  await page.goto((await worldLink.getAttribute("href"))!);
  await expect(page.getByTestId("match-setup-wizard")).toHaveAttribute(
    "data-step",
    "scopes",
  );
  await expect(page.getByTestId("scope-card-media").first()).toBeVisible();
  await shot(page, "02-direct-scope-selection-1440");

  await page.goto("/matches/new");
  await expect(page.getByTestId("match-setup-wizard")).toBeVisible();
  await shot(page, "03-match-setup-1440");
  await completeSetup(page);
  const sessionId = page.url().match(/\/matches\/([^/?]+)/)?.[1] ?? "";
  await expect(page.getByTestId("unified-board")).toBeVisible();
  await shot(page, "04-board-1440");

  await page.locator('[data-challenge-key="closest"][data-launchability="launchable"]').first().click();
  await expect(page.getByTestId("challenge-preflight")).toBeVisible();
  await shot(page, "05-preflight-1440");

  const code = (await page.getByTestId("preflight-join-code").innerText()).trim();
  const contexts: BrowserContext[] = [];
  const phones: Page[] = [];
  for (const [index, team] of [0, 0, 1, 1].entries()) {
    const joined = await joinPhone(browser, code, `Type ${index + 1}`, team);
    contexts.push(joined.context);
    phones.push(joined.page);
  }
  await expect(page.getByTestId("preflight-start")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("preflight-start").click();
  await expect(page.getByText("السؤال 1 من 3").first()).toBeVisible({ timeout: 60_000 });
  await shot(page, "06-closest-gameplay-1440");
  await expect(phones[0].getByTestId("akwaan-starfield")).toHaveCount(0);
  await shot(phones[0], "07-phone-gameplay-390");

  for (let round = 0; round < 3; round += 1) {
    await expect(page.getByText(`السؤال ${round + 1} من 3`).first()).toBeVisible({ timeout: 30_000 });
    const truth = runtimeTruth(sessionId);
    const answerers = await holders(phones);
    await submit(phones[answerers[0]], truth.correctValue);
    await submit(phones[answerers[1]], truth.correctValue + round + 2);
    await expect(page.getByTestId("closest-item-reveal")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("closest-next-item").click();
  }
  await expect(page.getByTestId("closest-challenge-result")).toBeVisible({ timeout: 60_000 });
  await shot(page, "08-challenge-result-1440");

  await page.setViewportSize({ width: 1920, height: 1080 });
  await shot(page, "09-challenge-result-1920");
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
  for (let occurrence = 0; occurrence < 3; occurrence += 1) {
    await page.locator(`button[aria-pressed][aria-label="${WORLD}"]`).click();
    const scopes = page.locator('button[aria-pressed="false"]:not([disabled])[aria-label]');
    for (let index = 0; index < 4; index += 1) await scopes.first().click();
    await page.getByRole("button", { name: "متابعة", exact: true }).click();
  }
  await page.getByRole("button", { name: "متابعة إلى الفريقين" }).click();
  const start = page.getByRole("button", { name: /ابدأ المباراة/ });
  await expect(start).toBeEnabled();
  await start.click();
  await page.waitForURL((url) => /^\/matches\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"), { timeout: 60_000 });
}

async function joinPhone(browser: Browser, code: string, name: string, team: number) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`/join/live-session/${code}`);
  await page.locator("input[autocomplete='nickname']").fill(name);
  await page.locator("[data-team-option]").nth(team).click();
  await page.locator('button[type="submit"]').click();
  return { context, page };
}

async function holders(phones: Page[]) {
  let answerers: number[] = [];
  await expect.poll(async () => {
    answerers = [];
    for (const [index, phone] of phones.entries()) {
      if (await phone.getByTestId("closest-answer-controls").count()) answerers.push(index);
    }
    return answerers.length;
  }, { timeout: 60_000 }).toBe(2);
  return answerers;
}

async function submit(page: Page, value: number) {
  const controls = page.getByTestId("closest-answer-controls");
  await controls.locator("input").fill(String(value));
  await controls.getByRole("button", { name: "إرسال" }).click();
}

function runtimeTruth(sessionId: string): { correctValue: number } {
  const script = `const r=db.gameplay_runtimes.findOne({sessionId:${JSON.stringify(sessionId)}}); const s=r.state.runtimeState; const items=JSON.parse(s.itemsJson); const i=Number(s.currentItemIndex); print(JSON.stringify({correctValue:items[i].correctValue}))`;
  return JSON.parse(execFileSync("docker", ["compose", "exec", "-T", "mongodb", "mongosh", "--quiet", "lammah-quiz", "--eval", script], { cwd: ROOT, encoding: "utf8" }));
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: false });
}
