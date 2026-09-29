import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Closest Pilot Batch 01 through the real local product.
 *
 * The point is not that a slider renders — that was proven when the runtime
 * shipped. The point is whether the *authored* continua make a good estimate,
 * so this plays real Matches, reads back from the database which ContentItem
 * the server actually drew, and photographs every authored range it reaches at
 * both supported phone widths and on the shared screen.
 *
 * Nothing about selection is rigged. The two pilot Scopes are chosen in the
 * ordinary setup wizard, the other two are whatever the wizard offers, and the
 * draw is left alone — which is why this is run repeatedly and the evidence is
 * appended rather than asserted into a fixed shape.
 */

const HOST = process.env.E2E_HOST_EMAIL ?? "admin@test.com";
const PASSWORD = process.env.E2E_HOST_PASSWORD ?? "strongPassword@123";
const WORLD = process.env.E2E_CLOSEST_WORLD ?? "كرة قدم";
const PILOT_SCOPES = ["كأس العالم", "الدوري الانجليزي"];
const SHOTS =
  process.env.E2E_SHOT_DIR ?? resolve(process.cwd(), "e2e-screenshots", "closest-pilot");
const LEDGER = resolve(SHOTS, "drawn-items.jsonl");
const ROOT = resolve(process.cwd(), "..");
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:3102";
const RUN = process.env.E2E_RUN ?? "1";
const BIG = { width: 390, height: 844 };
const SMALL = { width: 360, height: 640 };

type Slider = {
  mode: "numeric-range" | "between-anchors";
  min: number;
  max: number;
  step?: number;
  unit?: string;
  leftAnchor?: string;
  rightAnchor?: string;
};
type Drawn = {
  itemIndex: number;
  contentItemId: string;
  prompt: string;
  correctValue: number;
  slider: Slider | null;
  scope: string;
};

test.describe.serial("@closest-pilot Pilot Batch 01 in a real Match", () => {
  test.setTimeout(900_000);
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  test("plays three Closest items and records every authored range it reaches", async ({
    page,
    browser,
  }) => {
    const contexts: BrowserContext[] = [];
    const phones: Page[] = [];
    page.on("response", async (response) => {
      if (response.status() >= 400)
        // eslint-disable-next-line no-console
        console.log(
          `HTTP ${response.status()} ${response.url()} :: ${await response.text().catch(() => "")}`.slice(0, 400),
        );
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await completeSetup(page);
    const sessionId = sessionIdOf(page);
    await openClosest(page);
    const joinCode = (await page.getByTestId("preflight-join-code").innerText()).trim();
    for (const [index, viewport] of [SMALL, BIG].entries()) {
      const context = await browser.newContext({ viewport });
      contexts.push(context);
      const phone = await context.newPage();
      phones.push(phone);
      await joinPhone(phone, joinCode, ["نورة", "ريم"][index], index);
    }
    await waitForPairedPhones(page);
    await page.getByTestId("preflight-start").click();

    for (let item = 0; item < 3; item += 1) {
      await expect(page.getByText(`السؤال ${item + 1} من 3`).first()).toBeVisible({
        timeout: 60_000,
      });
      const drawn = drawnItem(sessionId);
      const tag = `run${RUN}-item${item + 1}-${drawn.slider ? drawn.slider.mode : "legacy"}`;
      // eslint-disable-next-line no-console
      console.log(`DRAWN ${JSON.stringify(drawn)}`);
      appendFileSync(LEDGER, `${JSON.stringify({ run: RUN, ...drawn })}\n`, "utf8");

      const answerer = await holder(phones);
      await shot(page, `${tag}-shared`);
      // Both teams answer every item, so both phones hold controls. Photograph
      // each, which is also the only way this covers both supported widths.
      for (const [index, phone] of phones.entries())
        if (await phone.getByTestId("closest-answer-controls").count())
          await shot(phone, `${tag}-phone-${index === 0 ? "360" : "390"}`);

      if (drawn.slider) {
        // Nothing has been chosen yet: no estimate is claimed and Confirm is
        // shut, however the authored range happens to place its thumb.
        await expect(
          phones[answerer].getByTestId("closest-value-bubble"),
        ).toHaveCount(0);
        await expect(phones[answerer].getByTestId("closest-submit")).toBeDisabled();

        // The rendered control is this item's authored mode and bounds.
        await expect(
          phones[answerer].getByTestId(`closest-${drawn.slider.mode}-slider`),
        ).toBeVisible();
        const input = phones[answerer].getByTestId("closest-estimate-slider");
        await expect(input).toHaveAttribute("min", String(drawn.slider.min));
        await expect(input).toHaveAttribute("max", String(drawn.slider.max));
        if (drawn.slider.step !== undefined)
          await expect(input).toHaveAttribute("step", String(drawn.slider.step));

        // Dragging is local: the runtime revision must not move.
        const before = revision(sessionId);
        for (const value of [drawn.slider.min, drawn.slider.max, drawn.correctValue])
          await input.fill(String(value));
        await shot(phones[answerer], `${tag}-phone-dragged`);
        expect(revision(sessionId), "dragging committed no command").toBe(before);
        // Moving it is what turns the thumb into an estimate.
        await expect(
          phones[answerer].getByTestId("closest-value-bubble"),
        ).toBeVisible();
        await expect(phones[answerer].getByTestId("closest-submit")).toBeEnabled();
      }

      if (!drawn.slider) await enter(phones[answerer], drawn.correctValue);
      await submit(phones[answerer]);
      await shot(phones[answerer], `${tag}-phone-locked`);
      // Pre-resolution the shared screen must not show the target.
      expect(await page.locator("body").innerText()).not.toContain("الإجابة الصحيحة");

      const other = answerer === 0 ? 1 : 0;
      await enter(phones[other], drawn.slider ? drawn.slider.min : drawn.correctValue - 1);
      await submit(phones[other]);

      await expect(page.getByTestId("closest-item-reveal")).toBeVisible({
        timeout: 60_000,
      });
      await shot(page, `${tag}-shared-reveal`);
      // The factual answer is untouched by the migration.
      expect(drawnItem(sessionId).correctValue).toBe(drawn.correctValue);

      if (item < 2) {
        const advance = page.getByRole("button", { name: /السؤال التالي|التالي/ });
        if (await advance.count()) await advance.first().click();
      }
    }

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
  await expect(page.getByTestId("match-setup-wizard")).toBeVisible({ timeout: 60_000 });
  for (let occurrence = 0; occurrence < 3; occurrence += 1) {
    await page.locator(`button[aria-pressed][aria-label="${WORLD}"]`).click();
    // The two pilot Scopes on purpose; the rest is whatever the wizard offers,
    // so the draw still has ordinary non-pilot content to compete with.
    for (const name of PILOT_SCOPES) {
      const scope = page.locator(
        `button[aria-pressed="false"]:not([disabled])[aria-label="${name}"]`,
      );
      if (await scope.count()) await scope.first().click();
    }
    // Fill the rest by watching the wizard's own Continue button rather than by
    // counting pressed buttons: the selected World is pressed too, and earlier
    // occurrences leave their own selections pressed, so any count is wrong by a
    // different amount on every step.
    const rest = page.locator('button[aria-pressed="false"]:not([disabled])[aria-label]');
    const next = page.getByRole("button", { name: "متابعة", exact: true });
    for (let guard = 0; guard < 12; guard += 1) {
      if (await next.isEnabled()) break;
      if (!(await rest.count())) break;
      await rest.first().click();
    }
    await expect(next).toBeEnabled({ timeout: 30_000 });
    await next.click();
  }
  const toTeams = page.getByRole("button", { name: "متابعة إلى الفريقين" });
  if (await toTeams.count()) await toTeams.click();
  const start = page.getByRole("button", { name: /ابدأ المباراة/ });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await page.waitForURL(
    (url) => /^\/matches\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
    { timeout: 60_000 },
  );
}

async function openClosest(page: Page) {
  const tile = page.locator('[data-challenge-key="closest"]').first();
  await expect(tile).toBeVisible({ timeout: 60_000 });
  await tile.click();
  await expect(page.getByTestId("challenge-preflight")).toBeVisible({ timeout: 60_000 });
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
  for (const team of await teams.all())
    await expect(team).toHaveAttribute("data-ready", "true", { timeout: 90_000 });
}

async function holder(phones: Page[]): Promise<number> {
  let found = -1;
  await expect
    .poll(
      async () => {
        for (const [index, phone] of phones.entries())
          if (await phone.getByTestId("closest-answer-controls").count()) {
            found = index;
            return true;
          }
        return false;
      },
      { timeout: 90_000 },
    )
    .toBe(true);
  return found;
}

/** Writes an estimate into whichever control this item actually renders. */
async function enter(page: Page, value: number) {
  const controls = page.getByTestId("closest-answer-controls");
  if (!(await controls.count())) return;
  const slider = page.getByTestId("closest-estimate-slider");
  if (await slider.count()) {
    await slider.fill(String(value));
    return;
  }
  await controls.locator("input").first().fill(String(value));
}

async function submit(page: Page) {
  const controls = page.getByTestId("closest-answer-controls");
  if (!(await controls.count())) return;
  await controls.getByRole("button", { name: /إرسال|تأكيد/ }).click();
}

function sessionIdOf(page: Page): string {
  return page.url().match(/\/matches\/([^/?]+)/)?.[1] ?? "";
}

function drawnItem(sessionId: string): Drawn {
  return mongoJson(
    `const r=db.gameplay_runtimes.find({sessionId:${JSON.stringify(sessionId)}}).sort({createdAt:-1}).limit(1).toArray()[0];
     const s=r.state.runtimeState; const items=JSON.parse(s.itemsJson); const i=Number(s.currentItemIndex); const it=items[i];
     const doc=db.content_items.findOne({_id:ObjectId(it.id)});
     const sc=db.scopes.findOne({_id:doc.scopeId});
     print(JSON.stringify({itemIndex:i,contentItemId:it.id,prompt:doc.prompt.ar,correctValue:it.correctValue,slider:it.slider||null,scope:sc.name}));`,
  );
}

function revision(sessionId: string): number {
  return mongoJson(
    `const r=db.gameplay_runtimes.find({sessionId:${JSON.stringify(sessionId)}}).sort({createdAt:-1}).limit(1).toArray()[0]; print(JSON.stringify(r.revision));`,
  );
}

function mongoJson<T>(script: string): T {
  return JSON.parse(
    execFileSync(
      "docker",
      ["compose", "exec", "-T", "mongodb", "mongosh", "lammah-quiz", "--quiet", "--eval", script],
      { cwd: ROOT, encoding: "utf8" },
    ).trim(),
  ) as T;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: false });
}
