import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const HOST = process.env.E2E_HOST_EMAIL ?? "top5smoke@test.com";
const PASSWORD = process.env.E2E_HOST_PASSWORD ?? "Top5Smoke!42";
const WORLD = process.env.E2E_CLOSEST_WORLD ?? "كرة قدم";
const SHOTS = resolve(process.cwd(), "e2e-screenshots", "closest");
const ROOT = resolve(process.cwd(), "..");
const PHONE = { width: 390, height: 844 };
const NAMES = ["Green A1", "Green A2", "Coral B1", "Coral B2"] as const;
const TEAM = [0, 0, 1, 1] as const;

type RuntimeTruth = {
  sessionId: string;
  itemIndex: number;
  itemId: string;
  correctValue: number;
  phase: string;
  results: Array<Record<string, unknown>>;
};

test.describe.serial("@closest real Chromium acceptance", () => {
  test.setTimeout(600_000);
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  test("Smoke A: true challenge tie, blind projections, rotation, refresh and handoff", async ({
    page,
    browser,
  }) => {
    const contexts: BrowserContext[] = [];
    const phones: Page[] = [];
    const socketFrames: string[][] = [];
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await completeSetup(page);
    const sessionId = sessionIdOf(page);
    await openClosest(page);
    const joinCode = (await page.getByTestId("preflight-join-code").innerText()).trim();
    for (const [index, team] of TEAM.entries()) {
      const context = await browser.newContext({ viewport: PHONE });
      contexts.push(context);
      const phone = await context.newPage();
      const frames: string[] = [];
      phone.on("websocket", (socket) => {
        socket.on("framereceived", ({ payload }) => frames.push(String(payload)));
      });
      socketFrames.push(frames);
      phones.push(phone);
      await joinPhone(phone, joinCode, NAMES[index], team);
    }
    await waitForPairedPhones(page);
    await page.getByTestId("preflight-start").click();
    await expect(page.getByText("السؤال 1 من 3").first()).toBeVisible({ timeout: 60_000 });
    await shot(page, "closest-host-question");

    // Host refresh before either answer: the same item and collecting state restore.
    const firstTruth = runtimeTruth(sessionId);
    await page.reload();
    await expect(page.getByText("السؤال 1 من 3").first()).toBeVisible({ timeout: 30_000 });
    expect(runtimeTruth(sessionId).itemId).toBe(firstTruth.itemId);

    const firstHolders = await holders(phones);
    expect(firstHolders).toHaveLength(2);
    expect(firstHolders.filter((index) => index < 2)).toHaveLength(1);
    expect(firstHolders.filter((index) => index >= 2)).toHaveLength(1);
    const firstGreen = firstHolders.find((index) => index < 2)!;
    const firstCoral = firstHolders.find((index) => index >= 2)!;
    await shot(phones[firstGreen], "closest-phone-answerer");
    await shot(phones[firstGreen === 0 ? 1 : 0], "closest-phone-teammate");

    // Wrong teammate has no control and cannot trigger a mode command through UI.
    await expect(phones[firstGreen === 0 ? 1 : 0].getByTestId("closest-answer-controls")).toHaveCount(0);
    await assertBlindProjection(phones[firstCoral]);
    const opponentProjection = latestGameplayModeState(socketFrames[firstCoral]);
    expect(opponentProjection.revealedResultJson).toBeUndefined();
    expect(opponentProjection.ownSubmittedValue).toBeUndefined();
    expect(String(opponentProjection.resultsJson)).toBe("[]");
    expect(JSON.parse(String(opponentProjection.currentItemJson))).not.toHaveProperty("correctValue");

    // Round 1: Green distance 1, Coral distance 2.
    await submit(phones[firstGreen], firstTruth.correctValue - 1);
    await expect(phones[firstGreen].getByText(/تم إرسال إجابتكم/)).toBeVisible();
    await shot(page, "closest-one-team-submitted");
    await shot(phones[firstGreen], "closest-phone-after-own-submit");
    await assertBlindProjection(phones[firstCoral]);

    // Refresh submitted answerer: locked, persisted, still blind.
    await phones[firstGreen].reload();
    await expect(phones[firstGreen].getByText(/تم إرسال إجابتكم/)).toBeVisible({ timeout: 30_000 });
    await expect(phones[firstGreen].getByTestId("closest-answer-controls")).toHaveCount(0);

    await submit(phones[firstCoral], firstTruth.correctValue + 2);
    await expect(page.getByTestId("closest-item-reveal")).toBeVisible({ timeout: 30_000 });
    await shot(page, "closest-both-submitted");
    await shot(page, "closest-item-win");
    await shot(phones[firstGreen], "closest-phone-resolved");
    await expect.poll(() => latestGameplayModeState(socketFrames[firstCoral]).revealedResultJson).toBeTruthy();
    const revealedProjection = JSON.parse(String(latestGameplayModeState(socketFrames[firstCoral]).revealedResultJson));
    expect(revealedProjection).toMatchObject({
      correctValue: firstTruth.correctValue,
      distances: expect.any(Object),
      winnerTeamId: expect.any(String),
    });
    expect(runtimeTruth(sessionId).results[0]).toMatchObject({
      correctValue: firstTruth.correctValue,
      winnerTeamId: expect.any(String),
      tie: false,
    });
    await page.reload();
    await expect(page.getByTestId("closest-item-reveal")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("closest-next-item").click();
    await expect(page.getByText("السؤال 2 من 3").first()).toBeVisible({ timeout: 30_000 });
    await shot(page, "closest-round-2");
    const secondTruth = runtimeTruth(sessionId);
    await expect(phones[firstGreen].getByTestId("closest-answer-controls")).toHaveCount(0, { timeout: 30_000 });
    await expect(phones[firstCoral].getByTestId("closest-answer-controls")).toHaveCount(0, { timeout: 30_000 });
    const secondHolders = await holders(phones);
    expect(secondHolders.find((index) => index < 2)).not.toBe(firstGreen);
    expect(secondHolders.find((index) => index >= 2)).not.toBe(firstCoral);
    const secondGreen = secondHolders.find((index) => index < 2)!;
    const secondCoral = secondHolders.find((index) => index >= 2)!;
    await submit(phones[secondGreen], secondTruth.correctValue - 1);
    await submit(phones[secondCoral], secondTruth.correctValue + 1);
    await expect(page.getByText(/نفس المسافة/)).toBeVisible({ timeout: 30_000 });
    await shot(page, "closest-item-tie");
    expect(runtimeTruth(sessionId).results[1]).toMatchObject({ tie: true, winnerTeamId: null });

    await page.getByTestId("closest-next-item").click();
    await expect(page.getByText("السؤال 3 من 3").first()).toBeVisible({ timeout: 30_000 });
    await shot(page, "closest-round-3");
    const thirdTruth = runtimeTruth(sessionId);
    await expect(phones[secondGreen].getByTestId("closest-answer-controls")).toHaveCount(0, { timeout: 30_000 });
    await expect(phones[secondCoral].getByTestId("closest-answer-controls")).toHaveCount(0, { timeout: 30_000 });
    const thirdHolders = await holders(phones);
    const thirdGreen = thirdHolders.find((index) => index < 2)!;
    const thirdCoral = thirdHolders.find((index) => index >= 2)!;
    expect(thirdGreen).toBe(firstGreen);
    expect(thirdCoral).toBe(firstCoral);

    // Disconnect the assigned Green participant; server hands authority to teammate.
    const reconnectUrl = phones[thirdGreen].url();
    const reconnectSession = await phones[thirdGreen].evaluate(() =>
      Object.fromEntries(
        Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
          .filter((key): key is string => Boolean(key))
          .map((key) => [key, sessionStorage.getItem(key) ?? ""]),
      ),
    );
    await phones[thirdGreen].close();
    const replacementGreen = thirdGreen === 0 ? 1 : 0;
    await expect(phones[replacementGreen].getByTestId("closest-answer-controls")).toBeVisible({ timeout: 30_000 });
    const reconnected = await contexts[thirdGreen].newPage();
    phones[thirdGreen] = reconnected;
    await reconnected.addInitScript((entries) => {
      for (const [key, value] of Object.entries(entries)) sessionStorage.setItem(key, value);
    }, reconnectSession);
    await reconnected.goto(reconnectUrl);
    await expect(phones[thirdGreen].getByText("السؤال 3 من 3").first()).toBeVisible({ timeout: 30_000 });
    await expect(phones[thirdGreen].getByTestId("closest-answer-controls")).toHaveCount(0);
    await expect(phones[replacementGreen].getByTestId("closest-answer-controls")).toBeVisible();
    await submit(phones[replacementGreen], thirdTruth.correctValue + 5);
    await submit(phones[thirdCoral], thirdTruth.correctValue);
    await expect(page.getByTestId("closest-item-reveal")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("closest-next-item").click();
    await expect(page.getByTestId("closest-challenge-result")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/تعادل التحدي/)).toBeVisible();
    await shot(page, "closest-challenge-result-tie");
    expect(matchLedger(sessionId).filter((event) => event.reason === "challenge.win.closest")).toHaveLength(0);

    for (const context of contexts) await context.close();
  });

  test("Smoke B: 2-1 challenge winner awards exactly one Match point", async ({
    page,
    browser,
  }) => {
    const contexts: BrowserContext[] = [];
    const phones: Page[] = [];
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await completeSetup(page);
    const sessionId = sessionIdOf(page);
    await openClosest(page);
    const joinCode = (await page.getByTestId("preflight-join-code").innerText()).trim();
    for (const [index, team] of TEAM.entries()) {
      const context = await browser.newContext({ viewport: PHONE });
      contexts.push(context);
      const phone = await context.newPage();
      phones.push(phone);
      await joinPhone(phone, joinCode, `${NAMES[index]} Win`, team);
    }
    await waitForPairedPhones(page);
    await page.getByTestId("preflight-start").click();

    for (let round = 0; round < 3; round += 1) {
      await expect(page.getByText(`السؤال ${round + 1} من 3`).first()).toBeVisible({ timeout: 30_000 });
      const truth = runtimeTruth(sessionId);
      const current = await holders(phones);
      const green = current.find((index) => index < 2)!;
      const coral = current.find((index) => index >= 2)!;
      if (round < 2) {
        await submit(phones[green], truth.correctValue);
        await submit(phones[coral], truth.correctValue + 4);
      } else {
        await submit(phones[green], truth.correctValue + 4);
        await submit(phones[coral], truth.correctValue);
      }
      await expect(page.getByTestId("closest-item-reveal")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("closest-next-item").click();
    }

    await expect(page.getByTestId("closest-challenge-result")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/فاز بالتحدي/)).toBeVisible();
    await shot(page, "closest-challenge-result-win");
    const before = matchLedger(sessionId).filter((event) => event.reason === "challenge.win.closest");
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ delta: 1 });
    await page.reload();
    await expect(page.getByTestId("closest-challenge-result")).toBeVisible({ timeout: 30_000 });
    expect(matchLedger(sessionId).filter((event) => event.reason === "challenge.win.closest")).toHaveLength(1);
    await page.getByTestId("challenge-result-continue").click();
    await expect(page.getByTestId("unified-board")).toBeVisible({ timeout: 30_000 });
    await shot(page, "board-after-closest");
    expect(matchLedger(sessionId).filter((event) => event.reason === "challenge.win.closest")).toHaveLength(1);
    for (const context of contexts) await context.close();
  });

  test("focused deadline: one submitted team wins by forfeit", async ({ page, browser }) => {
    const contexts: BrowserContext[] = [];
    const phones: Page[] = [];
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await completeSetup(page);
    const sessionId = sessionIdOf(page);
    await openClosest(page);
    const joinCode = (await page.getByTestId("preflight-join-code").innerText()).trim();
    for (const [index, team] of TEAM.entries()) {
      const context = await browser.newContext({ viewport: PHONE });
      contexts.push(context);
      const phone = await context.newPage();
      phones.push(phone);
      await joinPhone(phone, joinCode, `${NAMES[index]} Deadline`, team);
    }
    await waitForPairedPhones(page);
    await page.getByTestId("preflight-start").click();
    await expect(page.getByText("السؤال 1 من 3").first()).toBeVisible({ timeout: 30_000 });
    const truth = runtimeTruth(sessionId);
    const current = await holders(phones);
    const green = current.find((index) => index < 2)!;
    await submit(phones[green], truth.correctValue + 3);
    await expect(page.getByTestId("closest-item-reveal")).toBeVisible({ timeout: 60_000 });
    const result = runtimeTruth(sessionId).results[0] as {
      answers: Record<string, number | null>;
      distances: Record<string, number | null>;
      winnerTeamId: string;
      resolutionReason: string;
    };
    const nullTeam = Object.keys(result.answers).find((teamId) => result.answers[teamId] === null)!;
    expect(result.resolutionReason).toBe("deadline");
    expect(result.distances[nullTeam]).toBeNull();
    expect(result.winnerTeamId).toBeTruthy();
    await expect(page.getByText("لم تُرسل إجابة")).toBeVisible();
    await shot(page, "closest-deadline-forfeit");
    for (const context of contexts) await context.close();
  });
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
  await page.waitForURL(
    (url) => /^\/matches\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
    { timeout: 60_000 },
  );
}

async function openClosest(page: Page) {
  const tile = page.locator('[data-challenge-key="closest"]').first();
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await tile.getByRole("button").first().click();
  await expect(page.getByTestId("challenge-preflight")).toBeVisible({ timeout: 30_000 });
}

async function joinPhone(page: Page, code: string, name: string, team: number) {
  await page.goto(`/join/live-session/${code}`);
  await page.locator("input[autocomplete='nickname']").fill(name);
  await page.locator("[data-team-option]").nth(team).click();
  await page.locator('button[type="submit"]').click();
}

async function waitForPairedPhones(page: Page) {
  const teams = page.locator('[data-testid^="preflight-team-"]');
  await expect(teams).toHaveCount(2, { timeout: 60_000 });
  for (const team of await teams.all()) {
    await expect(team.locator('[aria-label="متصل"]')).toHaveCount(2, { timeout: 60_000 });
  }
}

async function holders(phones: Page[]): Promise<number[]> {
  let values: number[] = [];
  await expect.poll(async () => {
    values = [];
    for (const [index, phone] of phones.entries()) {
      if (!phone.isClosed() && (await phone.getByTestId("closest-answer-controls").count())) values.push(index);
    }
    return values.length;
  }, { timeout: 60_000 }).toBe(2);
  return values;
}

async function submit(page: Page, value: number) {
  const controls = page.getByTestId("closest-answer-controls");
  await controls.locator("input").fill(String(value));
  await controls.getByRole("button", { name: "إرسال" }).click();
}

async function assertBlindProjection(page: Page) {
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("الإجابة الصحيحة");
  expect(body).not.toMatch(/بفارق\s+\d/);
}

function sessionIdOf(page: Page): string {
  return page.url().match(/\/matches\/([^/?]+)/)?.[1] ?? "";
}

function latestGameplayModeState(frames: string[]): Record<string, unknown> {
  for (const frame of [...frames].reverse()) {
    const start = frame.indexOf("[");
    if (start < 0) continue;
    try {
      const event = JSON.parse(frame.slice(start)) as [string, { gameplay?: { modeState?: Record<string, unknown> } }];
      if (event[0] === "live-session:snapshot" && event[1]?.gameplay?.modeState) {
        return event[1].gameplay.modeState;
      }
    } catch {
      // Engine.IO control frames and non-JSON payloads are irrelevant here.
    }
  }
  return {};
}

function runtimeTruth(sessionId: string): RuntimeTruth {
  return mongoJson(`const r=db.gameplay_runtimes.findOne({sessionId:${JSON.stringify(sessionId)}}); const s=r.state.runtimeState; const items=JSON.parse(s.itemsJson); const i=Number(s.currentItemIndex); print(JSON.stringify({sessionId:r.sessionId,itemIndex:i,itemId:items[i].id,correctValue:items[i].correctValue,phase:s.phase,results:JSON.parse(s.resultsJson||"[]")}));`);
}

function matchLedger(sessionId: string): Array<Record<string, unknown>> {
  return mongoJson(`const m=db.matches.findOne({liveSessionId:${JSON.stringify(sessionId)}}); print(JSON.stringify((m&&m.scoreEvents)||[]));`);
}

function mongoJson<T>(script: string): T {
  const output = execFileSync("docker", ["compose", "exec", "-T", "mongodb", "mongosh", "lammah-quiz", "--quiet", "--eval", script], { cwd: ROOT, encoding: "utf8" });
  return JSON.parse(output.trim()) as T;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: false });
}
