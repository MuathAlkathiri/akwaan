import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { assertSafePage, login } from "./helpers";

const asset = {
  type: "image",
  url: "/uploads/test/ready.svg",
  provider: "e2e-fake",
  source: "fixture",
};

const adminUser = {
  _id: "admin-e2e",
  email: "admin@integration.invalid",
  fullName: "Admin",
  role: "admin",
  subscriptionStatus: "active",
};

async function mockSession(page: Page) {
  await page.route("**/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accessToken: "e2e-token", user: adminUser }),
    }),
  );
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(adminUser),
    }),
  );
  await page.route("**/categories**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            _id: "science-category",
            id: "science-category",
            name: "علوم",
            slug: "science",
            catalog: { _id: "catalog-1", name: "عام", slug: "general" },
          },
        ],
      }),
    }),
  );
}

const reviewedResponse = {
  statusCode: 201,
  message: "Reviewed question drafts generated successfully",
  count: 2,
  meta: {},
  data: {
    questions: [
      {
        question: "من صاحب هذا الإنجاز؟",
        correctAnswer: "الإجابة الآمنة",
        wrongAnswers: ["خاطئة 1", "خاطئة 2", "خاطئة 3"],
        difficulty: "medium",
        gameMode: "identifyImage",
        type: "image",
        explanation: "شرح حتمي للاختبار",
        qualityScore: 9,
        issues: ["QUESTION_ACADEMIC_STYLE", "QUESTION_WORDING_REPAIRED"],
        assetStatus: "READY",
        primaryAssetStatus: "READY",
        asset,
        primaryAsset: asset,
        coverImageStatus: "READY",
        coverImage: asset,
      },
      {
        question: "ما السؤال الذي يبقى صالحًا عند فشل الملف؟",
        correctAnswer: "المحتوى يبقى متاحًا",
        wrongAnswers: ["يختفي", "يتسرب المسار", "يتوقف النموذج"],
        difficulty: "hard",
        gameMode: "trivia",
        type: "text",
        explanation: "الفشل الجزئي لا يخفي السؤال",
        qualityScore: 8,
        issues: ["فشل ملف آمن"],
        assetStatus: "FAILED",
        primaryAssetStatus: "FAILED",
        assetFailureReason: "لم يعثر المزود التجريبي على نتيجة",
        assetFailureStep: "safe-e2e-resolution",
        coverImageStatus: "FAILED",
        coverImageFailureReason: "تعذر تجهيز الغلاف",
      },
    ],
  },
};

const verifiedSongResponse = {
  ...reviewedResponse,
  count: 1,
  data: {
    questions: [
      {
        question: "ما اسم هذه الأغنية؟",
        correctAnswer: "الأماكن",
        wrongAnswers: ["ليلة", "رماد المصابيح", "مجموعة إنسان"],
        difficulty: "medium",
        gameMode: "identifySong",
        type: "audio",
        explanation: "fixture",
        qualityScore: 9,
        issues: [],
        assetStatus: "READY",
        primaryAssetStatus: "READY",
        asset: {
          type: "audio",
          url: "/uploads/test/song.mp3",
          provider: "youtube",
          source: "fixture",
        },
        primaryAsset: {
          type: "audio",
          url: "/uploads/test/song.mp3",
          provider: "youtube",
          source: "fixture",
        },
        coverImageStatus: "FAILED",
        verificationDiagnostics: {
          verificationStatus: "VERIFIED",
          canonicalEntity: "الأماكن",
          canonicalAnswer: "الأماكن",
          overallConfidence: 0.86,
          evidenceSourceCount: 8,
          verificationCacheHit: false,
          canonicalSongTitle: "الأماكن",
          canonicalArtist: "محمد عبده",
        },
      },
    ],
  },
};

const verifiedImageResponse = {
  ...reviewedResponse,
  count: 1,
  data: {
    questions: [
      {
        question: "من هذه الشخصية؟",
        correctAnswer: "Deidara",
        wrongAnswers: ["Sasuke", "Gaara", "Itachi"],
        difficulty: "medium",
        gameMode: "identifyImage",
        type: "image",
        explanation: "fixture",
        qualityScore: 9,
        issues: [],
        assetStatus: "READY",
        primaryAssetStatus: "READY",
        asset,
        primaryAsset: asset,
        coverImageStatus: "FAILED",
        verificationDiagnostics: {
          verificationStatus: "VERIFIED",
          canonicalEntity: "Deidara",
          canonicalAnswer: "Deidara",
          overallConfidence: 0.9,
          evidenceSourceCount: 8,
          verificationCacheHit: true,
          verifiedFranchise: "Naruto",
        },
      },
    ],
  },
};

const failedVerificationResponse = {
  ...reviewedResponse,
  count: 1,
  data: {
    questions: [
      {
        question: "من هذه الشخصية؟",
        correctAnswer: "شخصية غير مؤكدة",
        wrongAnswers: ["أ", "ب", "ج"],
        difficulty: "medium",
        gameMode: "identifyImage",
        type: "image",
        explanation: "fixture",
        qualityScore: 5,
        issues: ["ENTITY_VERIFICATION_REJECTED"],
        assetStatus: "FAILED",
        primaryAssetStatus: "FAILED",
        assetFailureReason:
          "Entity verification did not permit provider search",
        assetFailureStep: "entity-verification",
        coverImageStatus: "FAILED",
        verificationDiagnostics: {
          verificationStatus: "REJECTED",
          canonicalEntity: "شخصية غير مؤكدة",
          canonicalAnswer: "شخصية غير مؤكدة",
          overallConfidence: 0.1,
          evidenceSourceCount: 0,
          verificationCacheHit: false,
        },
      },
    ],
  },
};

const savedSongQuestion = {
  _id: "saved-song-question",
  id: "saved-song-question",
  category: "science-category",
  categoryId: "science-category",
  question: "ما اسم هذه الأغنية؟",
  answer: "الأماكن",
  correctAnswer: "الأماكن",
  wrongAnswers: ["ليلة", "رماد المصابيح", "مجموعة إنسان"],
  difficulty: "medium",
  gameMode: "identifySong",
  type: "audio",
  status: "draft",
  source: "ai",
  explanation: "fixture",
  assetStatus: "READY",
  primaryAsset: {
    type: "audio",
    url: "/uploads/test/song.mp3",
    provider: "youtube",
    source: "fixture",
  },
};

test.describe("@ai deterministic AI Generator presentation", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
    await login(page, "admin");
  });

  test("renders two reviewed drafts with ready and failed asset states", async ({
    page,
  }) => {
    await page.route(
      "**/admin/ai-generator/generate-reviewed",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(reviewedResponse),
        });
      },
    );
    await page.route("**/uploads/test/*.svg", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#22c55e"/></svg>',
      }),
    );
    await page.goto("/admin/ai-generator");
    await page.getByRole("combobox", { name: "الفئة" }).click();
    await page.getByRole("option", { name: "علوم" }).click();
    await page.getByLabel("عدد الأسئلة").fill("2");
    await page.getByRole("combobox", { name: "الصعوبة" }).click();
    await page.getByRole("option", { name: "صعب" }).click();
    const generationRequest = page.waitForRequest(
      "**/admin/ai-generator/generate-reviewed",
    );
    await page.getByRole("button", { name: "توليد 2 أسئلة" }).click();
    expect((await generationRequest).postDataJSON()).toMatchObject({
      count: 2,
      difficulty: "hard",
    });
    await expect(
      page.getByRole("button", { name: "جاري التوليد..." }),
    ).toBeDisabled();
    await expect(page.getByTestId("ai-draft-0")).toBeVisible();
    await expect(page.getByTestId("ai-draft-1")).toBeVisible();
    await expect(page.getByText("تم اختصار السؤال")).toBeVisible();
    await expect(page.getByText("من صاحب هذا الإنجاز؟")).toBeVisible();
    await expect(
      page.getByTestId("ai-draft-0").getByTestId("primary-asset-status"),
    ).toContainText("READY");
    await expect(
      page.getByTestId("ai-draft-1").getByTestId("primary-asset-status"),
    ).toContainText("FAILED");
    await expect(
      page.getByText("لم يعثر المزود التجريبي على نتيجة"),
    ).toBeVisible();
    await assertSafePage(page);
  });

  test("shows safe timeout guidance and re-enables generation", async ({
    page,
  }) => {
    await page.route("**/admin/ai-generator/generate-reviewed", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 500,
          message: "انتهت مهلة التوليد. حاول مجددًا.",
        }),
      }),
    );
    await page.goto("/admin/ai-generator");
    await page.getByRole("combobox", { name: "الفئة" }).click();
    await page.getByRole("option", { name: "علوم" }).click();
    await page.getByRole("button", { name: "توليد 2 أسئلة" }).click();
    await expect(
      page.getByText("انتهت مهلة التوليد. حاول مجددًا."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "توليد 2 أسئلة" }),
    ).toBeEnabled();
    await assertSafePage(page);
  });

  test("shows verified song diagnostics, audio preview, and saves draft", async ({
    page,
  }) => {
    await page.route("**/admin/ai-generator/generate-reviewed", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(verifiedSongResponse),
      }),
    );
    await page.route("**/admin/ai-generator/save-drafts", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          savedCount: 1,
          failedCount: 0,
          savedQuestions: [savedSongQuestion],
          failures: [],
        }),
      }),
    );
    await page.route("**/uploads/test/song.mp3", (route) =>
      route.fulfill({ status: 200, contentType: "audio/mpeg", body: "" }),
    );

    await page.goto("/admin/ai-generator");
    await page.getByRole("combobox", { name: "الفئة" }).click();
    await page.getByRole("option", { name: "علوم" }).click();
    await page.getByRole("button", { name: "توليد 2 أسئلة" }).click();

    await expect(page.getByText("تحقق Wigolo: VERIFIED")).toBeVisible();
    await page.getByText("تحقق Wigolo: VERIFIED").click();
    await expect(page.getByText("الكيان: الأماكن")).toBeVisible();
    await expect(page.getByText("الفنان: محمد عبده")).toBeVisible();
    await expect(page.locator("audio")).toBeVisible();
    await page.getByRole("checkbox", { name: "تحديد للحفظ" }).check();
    await page.getByRole("button", { name: "حفظ المحدد" }).click();
    await expect(page.getByText("تم الحفظ")).toBeVisible();
    await expect(page.getByRole("link", { name: "عرض الأسئلة المحفوظة" })).toBeVisible();
    await assertSafePage(page);
  });

  test("shows verified image diagnostics and image preview", async ({
    page,
  }) => {
    await page.route("**/admin/ai-generator/generate-reviewed", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(verifiedImageResponse),
      }),
    );
    await page.route("**/uploads/test/*.svg", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#22c55e"/></svg>',
      }),
    );

    await page.goto("/admin/ai-generator");
    await page.getByRole("combobox", { name: "الفئة" }).click();
    await page.getByRole("option", { name: "علوم" }).click();
    await page.getByRole("button", { name: "توليد 2 أسئلة" }).click();

    await page.getByText("تحقق Wigolo: VERIFIED").click();
    await expect(page.getByText("الكيان: Deidara")).toBeVisible();
    await expect(page.getByText("العمل: Naruto")).toBeVisible();
    await expect(page.getByAltText("Question asset")).toBeVisible();
    await assertSafePage(page);
  });

  test("shows safe failed verification without unrelated media", async ({
    page,
  }) => {
    await page.route("**/admin/ai-generator/generate-reviewed", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(failedVerificationResponse),
      }),
    );

    await page.goto("/admin/ai-generator");
    await page.getByRole("combobox", { name: "الفئة" }).click();
    await page.getByRole("option", { name: "علوم" }).click();
    await page.getByRole("button", { name: "توليد 2 أسئلة" }).click();

    await expect(page.getByText("تحقق Wigolo: REJECTED")).toBeVisible();
    await expect(page.getByText("entity-verification", { exact: true })).toBeVisible();
    await expect(page.locator("audio")).toHaveCount(0);
    await expect(page.getByAltText("Question asset")).toHaveCount(0);
    await assertSafePage(page);
  });

  test("does not expose Wigolo diagnostics in player-facing flow", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(/Wigolo|evidence|confidence/i)).toHaveCount(0);
    await assertSafePage(page);
  });
});
