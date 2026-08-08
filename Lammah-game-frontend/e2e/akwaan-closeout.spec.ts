import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { resolve } from "path";

/**
 * The Phase 7B closeout capture.
 *
 * Plays the two implemented mechanics end to end with four real phones and
 * photographs every user-facing surface on the way through, at the viewport a
 * human would actually meet it on. The point is a set that can be *looked at*:
 * assertions here are the few that would make a screenshot lie if they broke —
 * the rest of the behaviour is covered by `top5-match.spec.ts`.
 *
 *   E2E_BASE_URL=http://localhost:3001 npx playwright test e2e/akwaan-closeout.spec.ts
 */

const HOST = process.env.E2E_HOST_EMAIL ?? "top5smoke@test.com";
const PASSWORD = process.env.E2E_HOST_PASSWORD ?? "Top5Smoke!42";
const TOP5_WORLD = process.env.E2E_TOP5_WORLD ?? "كرة قدم";
const SHOTS = resolve(process.cwd(), "e2e-screenshots");

const LAPTOP = { width: 1440, height: 900 };
const SHARED = { width: 1920, height: 1080 };
const PHONE = { width: 390, height: 844 };
/** Deliberately smaller than an iPhone 12: the narrowest phone still supported. */
const SMALL_PHONE = { width: 320, height: 658 };

const ARABIC_NAMES = ["مُعاذ", "عبدالله", "مُحَمَّد", "خالد"] as const;
const TEAM_OF_PHONE = [0, 0, 1, 1] as const;

test.describe("@closeout every user-facing Akwaan surface", () => {
  test.setTimeout(420_000);

  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  test("public entry: home, the World catalog, and setup", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await login(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("world-card").first().or(page.locator("a[href^='/worlds/']").first())).toBeVisible({ timeout: 30_000 });
    // A World still waiting for artwork states it, rather than showing a pale
    // rectangle that reads as a failed image.
    await expect(page.getByTestId("world-artwork-pending").first()).toBeVisible();
    // Arabic counted nouns agree with their numeral.
    const homeText = await page.locator("body").innerText();
    expect(homeText).not.toMatch(/\d+\s+عالم\b/);
    expect(homeText).not.toMatch(/\d+\s+نطاق\b/);
    await shoot(page, "home-laptop");

    await page.locator("a[href^='/worlds/']").first().click();
    await page.waitForURL(/\/worlds\//, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await shoot(page, "worlds-catalog-laptop");

    await page.goto("/matches/new");
    await expect(page.getByTestId("match-setup-wizard")).toBeVisible({
      timeout: 30_000,
    });
    // The ل- prefix merges with the definite article; "لـالعالم" is not Arabic.
    expect(await page.locator("body").innerText()).not.toContain("لـال");
    await shoot(page, "setup-laptop");
  });

  test("the Match: board, preflight, both mechanics, and their results", async ({
    page,
    browser,
  }) => {
    const contexts: BrowserContext[] = [];
    const phones: Page[] = [];

    await page.setViewportSize(LAPTOP);
    await login(page);
    await completeSetup(page);

    // ── Board ────────────────────────────────────────────────────────────────
    await expect(page.getByTestId("unified-board")).toBeVisible({
      timeout: 30_000,
    });
    // Three occurrences of the same World must still read as three stations.
    const stations = page.locator('[data-testid^="unified-occurrence-"]');
    await expect(stations).toHaveCount(3);
    await shoot(page, "board-laptop");
    await page.setViewportSize(SHARED);
    await shoot(page, "board-1920");
    await page.setViewportSize({ width: 1180, height: 700 });
    await shoot(page, "board-laptop-with-chrome");
    await page.setViewportSize({ width: 420, height: 900 });
    await shoot(page, "board-narrow");
    await page.setViewportSize(LAPTOP);

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
    await shoot(page, "preflight-empty");

    const joinCode = (
      await page.getByTestId("preflight-join-code").innerText()
    ).trim();

    for (const [index, team] of TEAM_OF_PHONE.entries()) {
      const context = await browser.newContext({
        viewport: index === 3 ? SMALL_PHONE : PHONE,
      });
      contexts.push(context);
      const phone = await context.newPage();
      phones.push(phone);
      if (index === 0) {
        await phone.goto(`/join/live-session/${joinCode}`);
        await expect(
          phone.locator("input[autocomplete='nickname']"),
        ).toBeVisible({ timeout: 30_000 });
        await shoot(phone, "phone-join");
      }
      await joinPhone(phone, joinCode, ARABIC_NAMES[index], team);
    }
    await waitForPairedPhones(page);
    await shoot(page, "preflight-paired");
    // The phone is told it is in, on which team — not the host's counters.
    await expect(phones[0].getByTestId("participant-preflight")).toBeVisible({
      timeout: 30_000,
    });
    await shoot(phones[0], "phone-preflight");
    await shoot(phones[3], "phone-preflight-small");

    // ── Top 5 gameplay ───────────────────────────────────────────────────────
    await page.getByTestId("preflight-start").click();
    await expect(page.getByTestId("unified-challenge")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("top5-card-counter")).toContainText("1 من 10", {
      timeout: 30_000,
    });
    for (const phone of phones) {
      await expect(phone.getByTestId("top5-panel")).toBeVisible({
        timeout: 30_000,
      });
    }
    await shoot(page, "top5-gameplay");
    const firstDecider = await holderOf(phones, "top5-decider-controls");
    await shoot(phones[firstDecider], "phone-top5");
    const firstWaiter = phones.findIndex((_, i) => i !== firstDecider);
    await shoot(phones[firstWaiter], "phone-top5-waiting");

    for (let card = 1; card <= 10; card += 1) {
      const decider = await holderOf(phones, "top5-decider-controls");
      await phones[decider]
        .getByRole("button", {
          name: card % 2 === 0 ? "دسّها للخصم" : "احتفظ بها",
        })
        .click({ timeout: 30_000 });
      if (card < 10) {
        await expect(page.getByTestId("top5-card-counter")).toContainText(
          `${card + 1} من 10`,
          { timeout: 30_000 },
        );
      }
    }

    // ── Top 5 result ─────────────────────────────────────────────────────────
    await expect(page.getByTestId("top5-winner")).toBeVisible({
      timeout: 60_000,
    });
    await shoot(page, "top5-result");
    await page.setViewportSize(SHARED);
    await shoot(page, "top5-result-1920");
    await page.setViewportSize(LAPTOP);
    await expect(phones[0].getByTestId("participant-waiting")).toBeVisible({
      timeout: 30_000,
    });
    await shoot(phones[0], "phone-result-waiting");

    // Refresh mid-result: the reveal comes back, the score does not move.
    await page.reload();
    await expect(page.getByTestId("top5-winner")).toBeVisible({
      timeout: 30_000,
    });
    await shoot(page, "top5-result-after-refresh");

    await page.getByTestId("challenge-result-continue").click();
    await expect(page.getByTestId("unified-board")).toBeVisible({
      timeout: 30_000,
    });
    await shoot(page, "board-after-one-challenge");

    // ── RYO ──────────────────────────────────────────────────────────────────
    await page
      .locator('[data-challenge-key="read-your-opponent"]')
      .first()
      .getByRole("button")
      .first()
      .click();
    await expect(page.getByTestId("preflight-start")).toBeEnabled({
      timeout: 60_000,
    });
    await page.getByTestId("preflight-start").click();
    await expect(page.getByTestId("unified-challenge")).toBeVisible({
      timeout: 30_000,
    });

    for (let item = 1; item <= 3; item += 1) {
      await expect(
        page.getByText(`السؤال ${item} من 3`).first(),
      ).toBeVisible({ timeout: 30_000 });
      const answerer = await holderOf(phones, "ryo-answer-controls");
      const decider = await holderOf(phones, "ryo-decision-controls");
      if (item === 1) {
        await shoot(page, "ryo-gameplay");
        await shoot(phones[answerer], "phone-ryo-answerer");
        await shoot(phones[decider], "phone-ryo-decider");
        const bystander = phones.findIndex(
          (_, i) => i !== answerer && i !== decider,
        );
        await shoot(phones[bystander], "phone-ryo-waiting");
      }
      await submitRyoAnswer(phones[answerer]);
      await phones[decider]
        .getByRole("button", { name: "أثق بإجابته" })
        .click({ timeout: 30_000 });
    }

    await expect(page.getByTestId("ryo-result-recap")).toBeVisible({
      timeout: 30_000,
    });
    await shoot(page, "ryo-result");
    await page.setViewportSize(SHARED);
    await shoot(page, "ryo-result-1920");
    await page.setViewportSize(LAPTOP);

    for (const context of contexts) await context.close();
  });

  test("recovery: an unknown Match never falls back to the board", async ({
    page,
  }) => {
    await page.setViewportSize(LAPTOP);
    await login(page);
    await page.goto("/matches/00000000-0000-0000-0000-000000000000");
    const recovery = page
      .getByTestId("match-host-error")
      .or(page.getByTestId("match-absent"));
    await expect(recovery).toBeVisible({ timeout: 30_000 });
    // No raw server prose, and nothing in English, on a screen in a room.
    const text = await recovery.innerText();
    expect(text).not.toMatch(/[A-Za-z]{4,}/);
    expect(page.getByTestId("unified-board")).toHaveCount(0);
    await shoot(page, "recovery");
  });

  test("the retired classic game is not routable", async ({ page }) => {
    await login(page);
    for (const path of ["/games", "/games/new", "/games/categories"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} must not resolve`).toBe(404);
      // And nothing of the old purple board rendered on the way to the 404.
      expect(await page.locator("body").innerText()).not.toContain("الستة");
    }
    await page.goto("/");
    expect(await page.getByRole("banner").innerText()).not.toContain("ألعابي");
  });
});

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: false });
}

/** The one phone currently offered a control, waited for rather than sampled. */
async function holderOf(phones: Page[], testId: string): Promise<number> {
  let holder = -1;
  await expect
    .poll(
      async () => {
        for (const [index, phone] of phones.entries()) {
          if (await phone.getByTestId(testId).count()) {
            holder = index;
            return 1;
          }
        }
        return 0;
      },
      { timeout: 60_000 },
    )
    .toBe(1);
  return holder;
}

async function submitRyoAnswer(phone: Page): Promise<void> {
  const controls = phone.getByTestId("ryo-answer-controls");
  const estimate = controls.locator("input");
  if (await estimate.count()) {
    await estimate.fill("42");
    await controls.getByRole("button").first().click({ timeout: 30_000 });
    return;
  }
  await controls.getByRole("button").first().click({ timeout: 30_000 });
}

async function joinPhone(
  phone: Page,
  joinCode: string,
  name: string,
  teamIndex: number,
): Promise<void> {
  if (!phone.url().includes(joinCode)) {
    await phone.goto(`/join/live-session/${joinCode}`);
  }
  await expect(phone.locator("input[autocomplete='nickname']")).toBeVisible({
    timeout: 30_000,
  });
  await phone.locator("input[autocomplete='nickname']").fill(name);
  await phone.locator("[data-team-option]").nth(teamIndex).click();
  await phone.locator('button[type="submit"]').click();
  await expect(phone.locator("body")).not.toContainText("استخدم الحروف", {
    timeout: 30_000,
  });
}

async function waitForPairedPhones(page: Page): Promise<void> {
  const teams = page.locator('[data-testid^="preflight-team-"]');
  await expect(teams).toHaveCount(2, { timeout: 60_000 });
  for (const team of await teams.all()) {
    await expect(team.locator('[aria-label="متصل"]')).toHaveCount(2, {
      timeout: 60_000,
    });
  }
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(HOST);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

async function completeSetup(page: Page): Promise<void> {
  await page.goto("/matches/new");
  await expect(page.getByTestId("match-setup-wizard")).toBeVisible({
    timeout: 30_000,
  });
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
  await expect(page.getByTestId("review-summary")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "متابعة إلى الفريقين" }).click();
  const start = page.getByRole("button", { name: /ابدأ المباراة/ });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await page.waitForURL(/\/matches\/[^/]+$/, { timeout: 60_000 });
}
