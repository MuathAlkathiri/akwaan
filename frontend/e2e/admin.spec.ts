import { expect, test } from "@playwright/test";
import { assertSafePage, login } from "./helpers";

test.describe("@admin administrator browser workflows", () => {
  test.beforeEach(async ({ page }) => login(page, "admin"));

  test("loads dashboard statistics and every administrator screen", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Admin Dashboard" }),
    ).toBeVisible();
    for (const label of [
      "Total catalogs",
      "Total categories",
      "Total questions",
    ])
      await expect(page.getByText(label, { exact: true })).toBeVisible();

    const routes = [
      ["Dashboard", "/admin", "Admin Dashboard"],
      ["الكتالوجات", "/admin/catalogs", "إدارة الكتالوجات"],
      ["الفئات", "/admin/categories", "إدارة الفئات"],
      ["الأسئلة", "/admin/questions", "إدارة الأسئلة"],
      ["AI", "/admin/ai-generator", "مولد الأسئلة بالذكاء الاصطناعي"],
      [
        "AI Generated",
        "/admin/ai-generated",
        "الأسئلة المولدة بالذكاء الاصطناعي",
      ],
      ["المستخدمين", "/admin/subscriptions", "إدارة الاشتراكات"],
    ] as const;
    for (const [label, url, heading] of routes) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(`${url.replaceAll("/", "\\/")}$`),
      );
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/subscriptions$/);
    await assertSafePage(page);
  });

  test("creates, edits, and deletes an isolated Catalog", async ({ page }) => {
    const name = `كتالوج متصفح ${Date.now()}`;
    const updated = `${name} محدّث`;
    await page.goto("/admin/catalogs");
    await expect(page.getByText("اختبارات التكامل")).toBeVisible();
    await page.getByRole("button", { name: "إضافة كتالوج جديد" }).click();
    await page.getByPlaceholder("مثال: رياضة").fill(name);
    await page.getByRole("button", { name: "إنشاء كتالوج" }).click();
    const card = page.getByTestId("catalog-card").filter({ hasText: name });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "تعديل" }).click();
    await page.getByPlaceholder("مثال: رياضة").fill(updated);
    await page.getByRole("button", { name: "حفظ الكتالوج" }).click();
    const updatedCard = page
      .getByTestId("catalog-card")
      .filter({ hasText: updated });
    await expect(updatedCard).toBeVisible();
    await updatedCard.getByRole("button", { name: "حذف" }).click();
    await expect(updatedCard).toHaveCount(0);
    await assertSafePage(page);
  });
});
