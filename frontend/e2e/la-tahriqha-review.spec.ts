import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * "لا تحرقها" in a real Chromium, against the real product.
 *
 * The unit and integration tiers already hold the rules. This tier exists for
 * the things only rendering can answer: whether a captain knows they are the
 * captain, whether a teammate has anything to do, whether the opponent's
 * pressure reads as pressure rather than as noise, and whether a burn lands as
 * a burn. It drives a shared screen and four phones — a captain and a teammate
 * on each side — and photographs every moment the review has to judge.
 */

const HOST = process.env.E2E_HOST_EMAIL ?? "admin@test.com";
const PASSWORD = process.env.E2E_HOST_PASSWORD ?? "strongPassword@123";
const WORLD = process.env.E2E_LA_TAHRIQHA_WORLD ?? "";
const SHOTS =
  process.env.E2E_SHOT_DIR ??
  resolve(process.cwd(), "e2e-screenshots", "la-tahriqha");
const ROOT = resolve(process.cwd(), "..");
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:3102";
/** Team A plays on the smallest phone the product supports. */
const SMALL = { width: 360, height: 640 };
const PHONE = { width: 390, height: 844 };
const NAMES = ["نورة", "فهد", "ريم", "سالم"] as const;
const TEAM = [0, 0, 1, 1] as const;

type DishTruth = {
  sessionId: string;
  dishIndex: number;
  phase: string;
  dishName: string;
  correct: string[];
  wrong: string[];
  labels: Record<string, string>;
  results: Array<Record<string, unknown>>;
};

test.describe.serial("@la-tahriqha real Chromium product review", () => {
  test.setTimeout(900_000);
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  test("three dishes: an early resolution, a burn against a perfect dish, and a deadline commit", async ({
    page,
    browser,
  }) => {
    const contexts: BrowserContext[] = [];
    const phones: Page[] = [];
    // A failed launch renders as one Arabic toast and nothing else, which is
    // right for a player and useless for a reviewer. This surfaces the actual
    // refusal — it is how a run that stalled at the preflight turned out to be
    // MATCH_CONTENT_EXHAUSTED_FOR_ACCOUNT rather than anything about the dish.
    page.on("response", async (response) => {
      if (response.status() >= 400) {
        // eslint-disable-next-line no-console
        console.log(
          `HTTP ${response.status()} ${response.url()} :: ${await response
            .text()
            .catch(() => "")}`.slice(0, 600),
        );
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await completeSetup(page);
    const sessionId = sessionIdOf(page);
    await openLaTahriqha(page);
    await shot(page, "00-preflight");
    const joinCode = (
      await page.getByTestId("preflight-join-code").innerText()
    ).trim();
    for (const [index, team] of TEAM.entries()) {
      const context = await browser.newContext({
        viewport: team === 0 ? SMALL : PHONE,
      });
      contexts.push(context);
      const phone = await context.newPage();
      phones.push(phone);
      await joinPhone(phone, joinCode, NAMES[index], team);
    }
    await waitForPairedPhones(page);
    await page.getByTestId("preflight-start").click();

    // ---- Dish 1: three correct against four correct. ----------------------
    await expect(page.getByTestId("la-tahriqha-panel")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("الطبق 1 من 3")).toBeVisible({
      timeout: 60_000,
    });
    const one = truth(sessionId);
    await shot(page, "01-dish1-shared-screen");

    const first = await captains(phones);
    await shot(phones[first.a], "02-dish1-captain-360");
    await shot(phones[first.a === 0 ? 1 : 0], "03-dish1-teammate-360");
    await shot(phones[first.b], "04-dish1-captain-390");

    // The captain's own screen says so; the teammate's names who to argue with.
    await expect(
      phones[first.a].getByTestId("la-tahriqha-captain-line"),
    ).toContainText("أنت قائد الطبق");
    await expect(
      phones[first.a === 0 ? 1 : 0].getByTestId("la-tahriqha-captain-line"),
    ).toContainText(NAMES[first.a]);
    // A teammate has the board but not the controls.
    await expect(
      phones[first.a === 0 ? 1 : 0].getByTestId("la-tahriqha-cards"),
    ).toBeVisible();
    await expect(
      phones[first.a === 0 ? 1 : 0].getByTestId("la-tahriqha-commit"),
    ).toHaveCount(0);

    await pick(phones[first.a], one.correct.slice(0, 3));
    // Mid-selection: the count, the shut commit, and the teammate seeing the
    // very same set their captain is building.
    await shot(phones[first.a], "05-dish1-captain-three-chosen");
    await expect(
      phones[first.a === 0 ? 1 : 0].getByTestId("la-tahriqha-card-" + one.correct[0]),
    ).toHaveAttribute("data-chosen", "true", { timeout: 15_000 });
    await shot(phones[first.a === 0 ? 1 : 0], "06-dish1-teammate-sees-set");

    await commit(phones[first.a]);
    // The opponent's pressure strip: committed, and the count.
    await expect(page.getByTestId("la-tahriqha-pressure")).toContainText(
      "ثبّتوا 3 مكوّنات",
      { timeout: 20_000 },
    );
    await shot(page, "07-dish1-one-team-committed");
    await shot(phones[first.b], "08-dish1-opponent-under-pressure");
    // Pre-reveal the opponent learns the count and never an ingredient: their
    // own board marks nothing, because they have chosen nothing yet, even though
    // the other side has committed three cards.
    await expect(
      phones[first.b].locator('[data-testid^="la-tahriqha-card-"][data-chosen="true"]'),
    ).toHaveCount(0);
    await expect(
      phones[first.b].locator('[data-testid^="la-tahriqha-card-"][data-state]'),
    ).toHaveCount(0);

    await pick(phones[first.b], one.correct.slice(0, 4));
    await commit(phones[first.b]);
    await expect(page.getByTestId("la-tahriqha-reveal")).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, "09-dish1-reveal-3-vs-4");
    await shot(phones[first.a], "10-dish1-reveal-phone");
    const afterOne = truth(sessionId).results[0] as {
      teams: Array<{ points: number }>;
    };
    expect(afterOne.teams.map((team) => team.points).sort()).toEqual([3, 4]);

    // ---- Dish 2: a burn against a perfect dish. ---------------------------
    await page.getByTestId("la-tahriqha-advance").click();
    await expect(page.getByText("الطبق 2 من 3")).toBeVisible({
      timeout: 60_000,
    });
    const two = truth(sessionId);
    const second = await captains(phones);
    // The captaincy moved to the other seat on each side.
    expect(second.a).not.toBe(first.a);
    expect(second.b).not.toBe(first.b);
    await shot(page, "11-dish2-shared-screen");
    await shot(phones[second.a], "12-dish2-new-captain");

    await pick(phones[second.a], [...two.correct.slice(0, 4), two.wrong[0]]);
    await shot(phones[second.a], "13-dish2-captain-reaching-for-five");
    await commit(phones[second.a]);
    await pick(phones[second.b], two.correct);
    await commit(phones[second.b]);
    await expect(page.getByTestId("la-tahriqha-reveal")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('[data-burned="true"]')).toBeVisible();
    await expect(page.locator('[data-perfect="true"]')).toBeVisible();
    await shot(page, "14-dish2-reveal-burn-and-perfect");
    await shot(phones[second.a], "15-dish2-burned-phone");
    await shot(phones[second.b], "16-dish2-perfect-phone");

    // ---- Dish 3: nobody commits; the clock does. --------------------------
    await page.getByTestId("la-tahriqha-advance").click();
    await expect(page.getByText("الطبق 3 من 3")).toBeVisible({
      timeout: 60_000,
    });
    const three = truth(sessionId);
    const third = await captains(phones);
    await pick(phones[third.a], three.correct.slice(0, 3));
    await pick(phones[third.b], three.correct.slice(0, 2));
    await shot(page, "17-dish3-both-still-choosing");
    await shot(phones[third.b], "18-dish3-below-the-minimum");
    // Nothing is poked here. The dish's own thirty-second window is left to run
    // out and the server's scheduler is left to commit both sets on its own,
    // which is the whole point of this scenario.
    await expect(page.getByTestId("la-tahriqha-reveal")).toBeVisible({
      timeout: 120_000,
    });
    await shot(page, "19-dish3-reveal-deadline-commit");
    const afterThree = truth(sessionId).results[2] as {
      resolutionReason: string;
      teams: Array<{ points: number; lockReason: string }>;
    };
    expect(afterThree.resolutionReason).toBe("deadline");
    expect(afterThree.teams.map((team) => team.points).sort()).toEqual([0, 3]);

    // ---- The Signature's own verdict, converged once. ---------------------
    await page.getByTestId("la-tahriqha-advance").click();
    await expect(
      page.getByTestId("la-tahriqha-challenge-result"),
    ).toBeVisible({ timeout: 60_000 });
    await shot(page, "20-challenge-result");
    for (const phone of phones) await phone.close();
    for (const context of contexts) await context.close();
  });
});

async function login(page: Page) {
  const response = await page.request.post(`${API}/auth/login`, {
    data: { email: HOST, password: PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  const session = (await response.json()) as {
    accessToken: string;
    user: Record<string, unknown>;
  };
  await page.goto("/");
  await page.evaluate(({ accessToken, user }) => {
    localStorage.setItem("akwaan_access_token", accessToken);
    localStorage.setItem("akwaan_user", JSON.stringify(user));
  }, session);
}

async function completeSetup(page: Page) {
  await page.goto("/matches/new");
  await expect(page.getByTestId("match-setup-wizard")).toBeVisible({
    timeout: 60_000,
  });
  for (let occurrence = 0; occurrence < 3; occurrence += 1) {
    await page.locator(`button[aria-pressed][aria-label="${WORLD}"]`).click();
    const scopes = page.locator(
      'button[aria-pressed="false"]:not([disabled])[aria-label]',
    );
    for (let index = 0; index < 4; index += 1) await scopes.first().click();
    await page.getByRole("button", { name: "متابعة", exact: true }).click();
  }
  const toTeams = page.getByRole("button", { name: "متابعة إلى الفريقين" });
  if (await toTeams.count()) await toTeams.click();
  const start = page.getByRole("button", { name: /ابدأ المباراة/ });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await page.waitForURL(
    (url) =>
      /^\/matches\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
    { timeout: 60_000 },
  );
}

async function openLaTahriqha(page: Page) {
  const tile = page.locator('[data-challenge-key="la-tahriqha"]').first();
  await expect(tile).toBeVisible({ timeout: 60_000 });
  await tile.click();
  await expect(page.getByTestId("challenge-preflight")).toBeVisible({
    timeout: 60_000,
  });
}

async function joinPhone(page: Page, code: string, name: string, team: number) {
  await page.goto(`/join/live-session/${code}`);
  await page.locator("input[autocomplete='nickname']").fill(name);
  await page.locator("[data-team-option]").nth(team).click();
  await page.locator('button[type="submit"]').click();
}

async function waitForPairedPhones(page: Page) {
  const teams = page.locator(
    '[data-testid^="preflight-team-"]:not([data-testid^="preflight-team-status-"])',
  );
  await expect(teams).toHaveCount(2, { timeout: 90_000 });
  for (const team of await teams.all()) {
    await expect(team).toHaveAttribute("data-ready", "true", {
      timeout: 90_000,
    });
  }
}

/** The one phone per side that is holding قائد الطبق right now. */
async function captains(phones: Page[]): Promise<{ a: number; b: number }> {
  let holders: number[] = [];
  await expect
    .poll(
      async () => {
        holders = [];
        for (const [index, phone] of phones.entries()) {
          if (
            !phone.isClosed() &&
            (await phone.getByTestId("la-tahriqha-commit").count())
          )
            holders.push(index);
        }
        return holders.length;
      },
      { timeout: 90_000 },
    )
    .toBe(2);
  return {
    a: holders.find((index) => index < 2)!,
    b: holders.find((index) => index >= 2)!,
  };
}

async function pick(page: Page, ids: string[]) {
  for (const id of ids) {
    await page.getByTestId(`la-tahriqha-card-${id}`).click();
    await expect(page.getByTestId(`la-tahriqha-card-${id}`)).toHaveAttribute(
      "data-chosen",
      "true",
      { timeout: 20_000 },
    );
  }
}

async function commit(page: Page) {
  const button = page.getByTestId("la-tahriqha-commit");
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await button.click();
}

function sessionIdOf(page: Page): string {
  return page.url().match(/\/matches\/([^/?]+)/)?.[1] ?? "";
}

function truth(sessionId: string): DishTruth {
  return mongoJson(
    `const r=db.gameplay_runtimes.find({sessionId:${JSON.stringify(
      sessionId,
    )}}).sort({createdAt:-1}).limit(1).toArray()[0]; const s=r.state.runtimeState; const dishes=JSON.parse(s.dishesJson); const i=Number(s.currentDishIndex); const d=dishes[i]; const labels={}; d.ingredients.forEach(x=>{labels[x.localId]=x.label}); print(JSON.stringify({sessionId:r.sessionId,dishIndex:i,phase:s.phase,dishName:d.dishName,correct:d.ingredients.filter(x=>x.correct).map(x=>x.localId),wrong:d.ingredients.filter(x=>!x.correct).map(x=>x.localId),labels,results:JSON.parse(s.resultsJson||"[]")}));`,
  );
}

function mongoJson<T>(script: string): T {
  const output = execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "mongodb",
      "mongosh",
      "lammah-quiz",
      "--quiet",
      "--eval",
      script,
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  return JSON.parse(output.trim()) as T;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: false });
}
