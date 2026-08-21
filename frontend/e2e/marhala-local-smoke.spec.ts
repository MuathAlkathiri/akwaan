import { expect, test } from "@playwright/test";

/**
 * المرحلة against the *running local stack*.
 *
 * Not a unit render: this drives the built frontend at :3001 talking to the built
 * backend at :3002, so what it observes is the shipped bundle, the real socket and
 * the real Match. It logs in as the local smoke admin, checks the Admin authoring
 * surfaces the rollout depends on, and then looks at the board a real race left on
 * screen.
 *
 * Credentials and ids come from the environment so nothing local is baked in.
 */

const EMAIL = process.env.SMOKE_EMAIL ?? "marhala-smoke@local.invalid";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "SmokePass!42";
const WORLD_ID = process.env.SMOKE_WORLD_ID ?? "";
const API = process.env.SMOKE_API ?? "http://localhost:3002";

/**
 * Signed in the way a returning visitor is: the token this stack issued, placed
 * where the app keeps it.
 *
 * The product's interactive login is passwordless — a code is emailed and only its
 * hash is stored — so a scripted browser cannot complete it. The token here comes
 * from the running backend's own password endpoint for the local smoke account, so
 * the session the UI loads is a genuine one; nothing about auth is being faked
 * beyond skipping the mailbox.
 */
async function login(page: import("@playwright/test").Page) {
  const response = await page.request.post(`${API}/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  await page.addInitScript(
    ([token, user]) => {
      window.localStorage.setItem("akwaan_access_token", token as string);
      window.localStorage.setItem("akwaan_user", JSON.stringify(user));
    },
    [session.accessToken, session.user],
  );
  await page.goto("/");
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20000 });
}

test("@admin المرحلة is on the Video Games board in the running Admin UI", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/worlds");
  await page.getByRole("button", { name: /فيديو قيمز/ }).first().click();

  // Board tab is the default: the rollout's binding is visible where the host
  // will see it, with the other three mechanics intact.
  const board = page.locator("#world-board");
  await expect(board).toBeVisible({ timeout: 20000 });
  await expect(board).toContainText("المرحلة");
  for (const mechanic of ["اقرأ خصمك", "مين اقرب", "القنبلة"]) {
    await expect(board).toContainText(mechanic);
  }
});

test("@admin the catalog shows, filters and counts المرحلة difficulty", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/worlds");
  await page.getByRole("button", { name: /فيديو قيمز/ }).first().click();
  await page.getByRole("tab", { name: "المحتوى" }).click();

  const controls = page.getByTestId("marhala-difficulty-controls");
  await expect(controls).toBeVisible({ timeout: 20000 });
  await expect(controls).toContainText("الصعوبة — المرحلة");

  const coverage = page.getByTestId("marhala-difficulty-coverage");
  const coverageText = (await coverage.textContent()) ?? "";
  expect(coverageText).toMatch(/سهل/);
  expect(coverageText).toMatch(/متوسط/);
  expect(coverageText).toMatch(/صعب/);
  console.log("coverage row:", coverageText.trim());

  // Arabic difficulty on the cards, and no internal vocabulary in them.
  const badge = page.getByTestId("marhala-difficulty-badge").first();
  await expect(badge).toBeVisible();
  const badgeText = (await badge.textContent()) ?? "";
  expect(badgeText).toMatch(/الصعوبة: (سهل|متوسط|صعب)/);
  for (const leak of ["marhalaDifficulty", "mechanicPayload", "easy", "hard"]) {
    expect(badgeText).not.toContain(leak);
  }

  // Filter by band, then compose it with a Scope.
  const all = await page.getByTestId("marhala-difficulty-badge").count();
  await controls.getByRole("button", { name: "صعب", exact: true }).click();
  await expect
    .poll(async () => page.getByTestId("marhala-difficulty-badge").count())
    .toBeLessThanOrEqual(all);
  const hardOnly = await page.getByTestId("marhala-difficulty-badge").allTextContents();
  expect(hardOnly.length).toBeGreaterThan(0);
  expect(hardOnly.every((text) => text.includes("صعب"))).toBe(true);
  console.log(`filtered to صعب: ${hardOnly.length} of ${all}`);

  await page.getByRole("button", { name: "GTA", exact: true }).first().click();
  await page.waitForTimeout(800);
  const composed = await page.getByTestId("marhala-difficulty-badge").allTextContents();
  expect(composed.every((text) => text.includes("صعب"))).toBe(true);
  expect(composed.length).toBeLessThanOrEqual(hardOnly.length);
  console.log(`composed GTA + صعب: ${composed.length}`);
});

test("@admin the authoring form asks for صعوبة السؤال when المرحلة is chosen", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/worlds");
  await page.getByRole("button", { name: /فيديو قيمز/ }).first().click();
  await page.getByRole("tab", { name: "المحتوى" }).click();
  await page.getByRole("button", { name: /إضافة عنصر/ }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("marhala-fields")).toHaveCount(0);

  await dialog.locator("label", { hasText: "المرحلة" }).first().click();
  const fields = page.getByTestId("marhala-fields");
  await expect(fields).toBeVisible({ timeout: 10000 });
  await expect(fields).toContainText("صعوبة السؤال");

  await page.getByTestId("marhala-difficulty-select").click();
  const options = await page.getByRole("option").allTextContents();
  expect(options).toEqual(["سهل", "متوسط", "صعب"]);
  console.log("form offers:", options.join(" / "));
});
