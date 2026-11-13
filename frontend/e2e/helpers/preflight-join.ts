import type { Page } from "@playwright/test";

/** Read the real link through the same copy action available to the host. */
export async function preflightJoinCode(page: Page): Promise<string> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const copy = page.getByRole("button", { name: /نسخ رابط الانضمام/ });
  if (!(await copy.isVisible()))
    await page.getByTestId("preflight-join-toggle").click();
  await copy.click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const code = new URL(link).pathname.split("/").filter(Boolean).pop();
  if (!code) throw new Error("Copied join link has no join code");
  return decodeURIComponent(code);
}
