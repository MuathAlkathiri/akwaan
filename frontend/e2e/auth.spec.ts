import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("protects the admin area from anonymous users", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("تسجيل الدخول")).toBeVisible();
});

test("shows a safe invalid-login error", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("invalid@integration.invalid");
  await page.locator('input[type="password"]').fill("invalid-password");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});

test("prevents a standard user from opening administrator screens", async ({
  page,
}) => {
  await login(page, "user");
  await page.goto("/admin/questions");
  await expect(page).not.toHaveURL(/\/admin\/questions$/);
});

test("does not trust a cached user without a token", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() =>
    localStorage.setItem(
      "user",
      JSON.stringify({ role: "admin", email: "cached@invalid.test" }),
    ),
  );
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});

test("logs in, survives refresh, and logs out", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL ?? "admin@integration.invalid";
  const password = process.env.E2E_ADMIN_PASSWORD ?? "TestAdmin!42";

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/admin/);
  await page.reload();
  await expect(page).toHaveURL(/\/admin/);
  await page.getByRole("button", { name: /تسجيل الخروج|خروج/ }).click();
  await expect(page).toHaveURL(/\/login/);
});
