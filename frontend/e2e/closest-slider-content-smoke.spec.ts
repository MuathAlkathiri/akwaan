import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Proof that a *migrated* Closest item reaches a real Match and renders the
 * slider — and that nothing but its interaction metadata changed.
 *
 * The bundle containing slider code proves nothing about content, and content
 * carrying slider metadata proves nothing about the draw. This walks the whole
 * path: launch a real Closest challenge, read back from the database which
 * ContentItem the server actually drew, and assert the phone rendered that
 * item's authored mode with that item's authored bounds.
 */

const HOST = process.env.E2E_HOST_EMAIL ?? "admin@test.com";
const PASSWORD = process.env.E2E_HOST_PASSWORD ?? "strongPassword@123";
const WORLD = process.env.E2E_CLOSEST_WORLD ?? "";
const SHOTS =
  process.env.E2E_SHOT_DIR ??
  resolve(process.cwd(), "e2e-screenshots", "closest-slider-content");
const ROOT = resolve(process.cwd(), "..");
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:3102";
const PHONE = { width: 390, height: 844 };
const NAMES = ["نورة", "ريم"] as const;
const TEAM = [0, 1] as const;

type DrawnItem = {
  sessionId: string;
  itemIndex: number;
  contentItemId: string;
  correctValue: number;
  slider: {
    mode: "numeric-range" | "between-anchors";
    min: number;
    max: number;
    step?: number;
    unit?: string;
    leftAnchor?: string;
    rightAnchor?: string;
  } | null;
};

test.describe.serial("@closest migrated content reaches a real Match", () => {
  test.setTimeout(600_000);
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  test("draws a migrated item and renders its authored slider", async ({
    page,
    browser,
  }) => {
    const contexts: BrowserContext[] = [];
    const phones: Page[] = [];
    page.on("response", async (response) => {
      if (response.status() >= 400) {
        // eslint-disable-next-line no-console
        console.log(
          `HTTP ${response.status()} ${response.url()} :: ${await response
            .text()
            .catch(() => "")}`.slice(0, 500),
        );
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await completeSetup(page);
    const sessionId = sessionIdOf(page);
    await openClosest(page);
    const joinCode = (
      await page.getByTestId("preflight-join-code").innerText()
    ).trim();
    for (const [index, team] of TEAM.entries()) {
      const context = await browser.newContext({ viewport: PHONE });
      contexts.push(context);
      const phone = await context.newPage();
      phones.push(phone);
      await joinPhone(phone, joinCode, NAMES[index], team);
    }
    await waitForPairedPhones(page);
    await page.getByTestId("preflight-start").click();
    await expect(page.getByText("السؤال 1 من 3").first()).toBeVisible({
      timeout: 60_000,
    });

    // What the server actually drew, read from the database rather than assumed.
    const drawn = drawnItem(sessionId);
    // eslint-disable-next-line no-console
    console.log(`DRAWN ${JSON.stringify(drawn)}`);
    expect(drawn.slider, "the drawn item carries authored slider metadata")
      .not.toBeNull();

    const answerer = await holder(phones);
    await shot(page, "01-shared-question");
    await shot(phones[answerer], "02-phone-slider");

    // The phone rendered *this* item's authored mode, not a generic control.
    const control = phones[answerer].getByTestId(
      `closest-${drawn.slider!.mode}-slider`,
    );
    await expect(control).toBeVisible();
    const input = phones[answerer].getByTestId("closest-estimate-slider");
    await expect(input).toHaveAttribute("min", String(drawn.slider!.min));
    await expect(input).toHaveAttribute("max", String(drawn.slider!.max));

    // Dragging is local: no command reaches the server until Confirm.
    const before = commandCount(sessionId);
    for (const value of [drawn.slider!.min, drawn.slider!.max, drawn.correctValue]) {
      await input.fill(String(value));
    }
    await shot(phones[answerer], "03-phone-dragged");
    expect(commandCount(sessionId), "dragging sent no gameplay command").toBe(
      before,
    );

    // Confirm is the submission, and the server's acceptance locks it.
    await phones[answerer]
      .getByTestId("closest-answer-controls")
      .getByRole("button", { name: /إرسال|تأكيد/ })
      .click();
    await expect(
      phones[answerer].getByTestId("closest-phone-status"),
    ).toBeVisible({ timeout: 30_000 });
    await shot(phones[answerer], "04-phone-locked");

    // Pre-resolution the shared screen shows no estimate.
    const sharedBody = await page.locator("body").innerText();
    expect(sharedBody).not.toContain("الإجابة الصحيحة");
    await shot(page, "05-shared-before-reveal");

    // The other team answers, and the reveal presents both teams and the target.
    const other = answerer === 0 ? 1 : 0;
    const otherInput = phones[other].getByTestId("closest-estimate-slider");
    if (await otherInput.count()) await otherInput.fill(String(drawn.slider!.min));
    await phones[other]
      .getByTestId("closest-answer-controls")
      .getByRole("button", { name: /إرسال|تأكيد/ })
      .click();
    await expect(page.getByTestId("closest-item-reveal")).toBeVisible({
      timeout: 60_000,
    });
    await shot(page, "06-shared-reveal");

    // The factual answer is exactly what it was before the migration.
    expect(drawnItem(sessionId).correctValue).toBe(drawn.correctValue);

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

async function openClosest(page: Page) {
  const tile = page.locator('[data-challenge-key="closest"]').first();
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

async function holder(phones: Page[]): Promise<number> {
  let found = -1;
  await expect
    .poll(
      async () => {
        for (const [index, phone] of phones.entries()) {
          if (await phone.getByTestId("closest-answer-controls").count()) {
            found = index;
            return true;
          }
        }
        return false;
      },
      { timeout: 90_000 },
    )
    .toBe(true);
  return found;
}

function sessionIdOf(page: Page): string {
  return page.url().match(/\/matches\/([^/?]+)/)?.[1] ?? "";
}

function drawnItem(sessionId: string): DrawnItem {
  return mongoJson(
    `const r=db.gameplay_runtimes.find({sessionId:${JSON.stringify(
      sessionId,
    )}}).sort({createdAt:-1}).limit(1).toArray()[0]; const s=r.state.runtimeState; const items=JSON.parse(s.itemsJson); const i=Number(s.currentItemIndex); const it=items[i]; print(JSON.stringify({sessionId:r.sessionId,itemIndex:i,contentItemId:it.id,correctValue:it.correctValue,slider:it.slider||null}));`,
  );
}

/** How many gameplay commands this runtime has committed so far. */
function commandCount(sessionId: string): number {
  return mongoJson(
    `const r=db.gameplay_runtimes.find({sessionId:${JSON.stringify(
      sessionId,
    )}}).sort({createdAt:-1}).limit(1).toArray()[0]; print(JSON.stringify(r.revision));`,
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
