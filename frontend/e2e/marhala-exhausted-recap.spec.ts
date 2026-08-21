import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * The ending where the account has simply run out of unseen questions.
 *
 * Asserted on the *running* stack against a Match that really ended that way, so
 * what is checked is the recap a room would read — not a fixture. It must not look
 * like a loss, a tie, or an error, and it must never print the runtime's words.
 */

const EMAIL = process.env.SMOKE_EMAIL ?? "marhala-smoke@local.invalid";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "SmokePass!42";
const API = process.env.SMOKE_API ?? "http://localhost:3002";
const SCRATCH = process.env.SMOKE_SCRATCH ?? "/tmp";

test("@game the content-exhausted recap reads as a product outcome", async ({ page }) => {
  const { sessionId } = JSON.parse(readFileSync(`${SCRATCH}/deplete.json`, "utf8"));
  const login = await page.request.post(`${API}/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  const session = await login.json();
  await page.addInitScript(
    ([token, user]) => {
      window.localStorage.setItem("akwaan_access_token", token as string);
      window.localStorage.setItem("akwaan_user", JSON.stringify(user));
    },
    [session.accessToken, session.user],
  );
  await page.goto(`/live-sessions/${sessionId}/screen`);

  const recap = page.getByTestId("marhala-result-recap");
  await expect(recap).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("marhala-result-exhausted")).toContainText(
    "خلصت الأسئلة الجديدة المتاحة لهذا التحدي",
  );
  await expect(recap).toContainText("لم يصل أي فريق إلى النهاية");
  await expect(recap).toContainText("لم تُمنح نقاط");
  // Not a win, not a tie, no reward — and not an error banner either.
  await expect(page.getByTestId("marhala-result-winner")).toHaveCount(0);
  await expect(recap).not.toContainText("نقطة للمباراة");
  await expect(recap.getByRole("alert")).toHaveCount(0);
  // Both final board positions are still shown.
  await expect(page.getByTestId("marhala-final-positions")).toBeVisible();

  const text = (await recap.textContent()) ?? "";
  for (const leak of ["content-exhausted", "endedBy", "winnerTeamId", "MATCH_CONTENT_EXHAUSTED_FOR_ACCOUNT", "challenge.win"]) {
    expect(text).not.toContain(leak);
  }
  console.log("recap:", text.replace(/\s+/g, " ").trim().slice(0, 260));

  // The way back to the board belongs to the host's own view, not the shared
  // screen: the screen narrates, the controller advances.
  await page.goto(`/matches/${sessionId}`);
  await expect(page.getByTestId("marhala-result-recap")).toBeVisible({ timeout: 30_000 });
  const advance = page.getByTestId("challenge-result-continue");
  await expect(advance).toBeVisible();
  await advance.click();
  await expect
    .poll(async () => page.getByTestId("unified-board").count(), { timeout: 30_000 })
    .toBeGreaterThan(0);
  console.log("returned to the board after the exhausted recap");
});
