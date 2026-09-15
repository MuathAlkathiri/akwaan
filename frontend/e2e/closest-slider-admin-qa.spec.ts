import { expect, test, type Page } from "@playwright/test";

const API = process.env.SMOKE_API ?? "http://127.0.0.1:3002";
const EMAIL = process.env.SMOKE_EMAIL ?? "marhala-smoke@local.invalid";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "SmokePass!42";
const PROMPT = "[QA محلي] في أي سنة صدر أول جهاز بلايستيشن؟";

async function login(page: Page) {
  const response = await page.request.post(`${API}/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  await page.addInitScript(
    ([token, user]) => {
      localStorage.setItem("akwaan_access_token", token as string);
      localStorage.setItem("akwaan_user", JSON.stringify(user));
    },
    [session.accessToken, session.user],
  );
}

test("@admin Closest slider create, reopen, switch mode and delete", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/worlds");
  await page
    .getByRole("button", { name: /فيديو قيمز/ })
    .first()
    .click();
  await page.getByRole("tab", { name: "المحتوى" }).click();
  await page.getByRole("button", { name: /إضافة عنصر/ }).click();

  let dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("textarea").first().fill(PROMPT);
  await dialog
    .locator("label", { hasText: /مين اقرب|مين أقرب/ })
    .first()
    .click();
  await dialog.getByLabel("نمط الإجابة").click();
  await page.getByRole("option", { name: "الأقرب رقمياً" }).click();
  await dialog.locator('input[type="number"]').first().fill("1994");
  await dialog.getByLabel("طريقة تفاعل مين أقرب").click();
  await page.getByRole("option", { name: "نطاق رقمي" }).click();
  await dialog.getByLabel("الحد الأدنى").fill("1950");
  await dialog.getByLabel("الحد الأعلى").fill("2026");
  await dialog.getByLabel("الخطوة").fill("1");
  await dialog.getByLabel("الوحدة").fill("سنة");
  await dialog.getByRole("button", { name: "إضافة عنصر" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  const card = page
    .locator("div.rounded-xl.border", { hasText: PROMPT })
    .first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "تعديل العنصر" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("طريقة تفاعل مين أقرب")).toContainText(
    "نطاق رقمي",
  );
  await expect(dialog.getByLabel("الحد الأدنى")).toHaveValue("1950");
  await expect(dialog.getByLabel("الوحدة")).toHaveValue("سنة");

  await dialog.getByLabel("طريقة تفاعل مين أقرب").click();
  await page.getByRole("option", { name: "بين نقطتي ارتكاز" }).click();
  await dialog.getByLabel("الحد الأدنى").fill("0");
  await dialog.getByLabel("الحد الأعلى").fill("100");
  await dialog.getByLabel("الخطوة").fill("1");
  await dialog
    .getByLabel("نقطة الارتكاز اليسرى")
    .fill("تجربة فردية تعتمد على المهارة");
  await dialog
    .getByLabel("نقطة الارتكاز اليمنى")
    .fill("تجربة جماعية تعتمد على التنسيق");
  await dialog.locator('input[type="number"]').first().fill("65");
  await dialog.getByRole("button", { name: "حفظ العنصر" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  await card.getByRole("button", { name: "تعديل العنصر" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("طريقة تفاعل مين أقرب")).toContainText(
    "بين نقطتي ارتكاز",
  );
  await expect(dialog.getByLabel("نقطة الارتكاز اليسرى")).toHaveValue(
    "تجربة فردية تعتمد على المهارة",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await card.getByRole("button", { name: "حذف العنصر" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "حذف", exact: true }).click();
  await expect(page.getByText(PROMPT)).toHaveCount(0, { timeout: 20_000 });
});
