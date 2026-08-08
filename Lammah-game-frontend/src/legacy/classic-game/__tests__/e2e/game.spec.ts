/**
 * Retired with the classic game.
 *
 * Lives outside `e2e/` (Playwright's `testDir`) so it does not run against the
 * current application — the routes it drives no longer exist. Kept because it is
 * the behavioural record of the classic board, and would be the starting point
 * if Classic returns as its own mode.
 */
import { expect, test } from "@playwright/test";
import { assertSafePage, login } from "../../../../../e2e/helpers";

const categoryNames = ["علوم", "رياضة", "تاريخ", "أفلام", "ألعاب", "جغرافيا"];

async function selectCategories(page: import("@playwright/test").Page) {
  await page.goto("/");
  for (const name of categoryNames)
    await page.getByRole("button", { name }).click();
  await page.getByRole("button", { name: "ابدأ اللعبة", exact: true }).click();
  await expect(page).toHaveURL(/\/games\/new\?categories=/);
}

test.describe("@game complete browser game lifecycle", () => {
  test("creates a game, reveals, awards, skips, and preserves state", async ({
    page,
  }) => {
    await login(page, "user");
    await selectCategories(page);
    await page
      .getByPlaceholder("أدخل اسم اللعبة")
      .fill(`لعبة متصفح ${Date.now()}`);
    await page.getByPlaceholder("مثال: الفريق الأحمر").fill("فريق البطيخ");
    await page.getByPlaceholder("مثال: الفريق الأزرق").fill("فريق الليمون");
    await page.getByRole("button", { name: "ابدأ اللعبة" }).click();
    await expect(page).toHaveURL(/\/games\/[a-f0-9]{24}$/);
    await expect(page.getByText("فريق البطيخ", { exact: true })).toBeVisible();
    await expect(page.getByText("فريق الليمون", { exact: true })).toBeVisible();
    await expect(page.getByTestId("current-turn")).toBeVisible();

    const scienceQuestions = page.getByRole("button", { name: "علوم 200" });
    await expect(scienceQuestions).toHaveCount(2);
    await scienceQuestions.first().click();
    await expect(
      page.getByRole("button", { name: "اكشف الإجابة" }),
    ).toBeVisible();
    await expect(page.getByText("الإجابة:", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "اكشف الإجابة" }).click();
    await expect(page.getByText("الإجابة:", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "فريق البطيخ يحصل على النقاط" })
      .click();
    await expect(page.getByTestId("team-a-score")).toContainText("200");

    const sportsQuestions = page.getByRole("button", { name: "رياضة 200" });
    await expect(sportsQuestions).toHaveCount(2);
    await sportsQuestions.first().click();
    await page.getByRole("button", { name: "اكشف الإجابة" }).click();
    await page.getByRole("button", { name: "تخطي" }).click();
    await page.reload();
    await expect(page.getByTestId("team-a-score")).toContainText("200");
    await expect(scienceQuestions.first()).toBeDisabled();
    await expect(sportsQuestions.first()).toBeDisabled();
    await assertSafePage(page);
  });

  test("redirects anonymous users from game creation", async ({ page }) => {
    await page.goto("/games/new");
    await expect(page).toHaveURL(/\/login/);
  });
});
