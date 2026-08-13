import { expect, Page } from "@playwright/test";

const accounts = {
  admin: { email: "admin@integration.invalid", password: "TestAdmin!42" },
  user: { email: "user@integration.invalid", password: "TestUser!42" },
  expired: { email: "expired@integration.invalid", password: "TestUser!42" },
} as const;

export async function login(page: Page, role: keyof typeof accounts) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(accounts[role].email);
  await page.locator('input[type="password"]').fill(accounts[role].password);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export function assertSafePage(page: Page) {
  return expect(page.locator("body")).not.toContainText(
    /__v|localPath|\/Users\/|stack trace|rawProvider|rawPrompt|Bearer\s/i,
  );
}
