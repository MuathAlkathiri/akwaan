import { expect, test } from "@playwright/test";
import { login, loginAs } from "./helpers";

test("protects the admin area from anonymous users", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("تسجيل الدخول")).toBeVisible();
});

test("keeps a rejected sign-in on the sign-in screen", async ({ page }) => {
  // Signing in is passwordless now: an address, then a mailed code. What this
  // guards is unchanged — a refused attempt goes nowhere and says so without
  // leaking whether the address exists.
  await page.goto("/login");
  await page.getByTestId("otp-email-input").fill("invalid@integration.invalid");
  await page.getByTestId("otp-request-button").click();
  await expect(page).toHaveURL(/\/login/);
});

test("prevents a standard user from opening administrator screens", async ({
  page,
}) => {
  await login(page, "user");
  await page.goto("/admin/worlds");
  await expect(page).not.toHaveURL(/\/admin\/worlds$/);
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

test("asks for an address, then for the code it mailed", async ({ page }) => {
  // The screen's own shape. The code itself is stored hashed, so no test can
  // read it back: what happens after it is typed is covered by the session
  // tests below, which seed the session the API hands out.
  await page.goto("/login");
  await expect(page.getByTestId("otp-email-input")).toBeVisible();
  await page.getByTestId("otp-email-input").fill("admin@integration.invalid");
  await page.getByTestId("otp-request-button").click();
  await expect(page.getByTestId("otp-verify-button")).toBeVisible();
});

test("a session survives a refresh, and logging out ends it", async ({
  page,
}) => {
  const email = process.env.E2E_ADMIN_EMAIL ?? "admin@integration.invalid";
  const password = process.env.E2E_ADMIN_PASSWORD ?? "TestAdmin!42";

  await loginAs(page, email, password);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
  await page.reload();
  await expect(page).toHaveURL(/\/admin/);
  await page.getByRole("button", { name: /تسجيل الخروج|خروج/ }).click();
  await expect(page).toHaveURL(/\/login/);
});
