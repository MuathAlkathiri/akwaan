import { expect, test } from "@playwright/test";
import { assertSafePage, login } from "./helpers";

test.describe("@admin administrator browser workflows", () => {
  test.beforeEach(async ({ page }) => login(page, "admin"));

  test("loads the dashboard and every administrator screen", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Admin Dashboard" }),
    ).toBeVisible();
    await expect(page.getByText("Users", { exact: true })).toBeVisible();

    const routes = [
      ["Dashboard", "/admin"],
      ["العوالم", "/admin/worlds"],
      ["مراجعة المحتوى", "/admin/content-engine"],
      ["المستخدمين", "/admin/subscriptions"],
    ] as const;
    for (const [label, url] of routes) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${url.split("/").join("\\/")}$`));
    }
    await expect(
      page.getByRole("heading", { name: "إدارة الاشتراكات" }),
    ).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/subscriptions$/);
    await assertSafePage(page);
  });
});
