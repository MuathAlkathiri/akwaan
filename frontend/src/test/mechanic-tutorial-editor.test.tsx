import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MechanicTutorialEditor } from "@/features/world-management/components/challenge-types/mechanic-tutorial-editor";
import type { AdminTutorialState } from "@/features/world-management/api/mechanic-tutorial-api";
import {
  SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO,
  type OneClueTutorialScenario,
} from "@/features/challenge-explainer";

/**
 * The Admin editor's job is to make three things impossible to get wrong:
 * publishing a competitive question, believing a draft is live, and asserting a
 * score the rules would not produce.
 */

const api = vi.hoisted(() => ({
  fetchAdminTutorial: vi.fn(),
  saveTutorialDraft: vi.fn(),
  validateTutorialDraft: vi.fn(),
  publishTutorial: vi.fn(),
  withdrawScopedTutorial: vi.fn(),
  restoreScopedTutorial: vi.fn(),
}));
const worldApi = vi.hoisted(() => ({
  fetchTutorialWorldOptions: vi.fn(),
}));
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/features/world-management/api/mechanic-tutorial-api", () => api);
vi.mock("@/features/world-management/api/world-content.api", () => worldApi);
vi.mock("sonner", () => ({ toast }));

const scenario = {
  prompt: "كم لونًا في قوس قزح؟",
  options: [
    { id: "a", label: "سبعة" },
    { id: "b", label: "خمسة" },
    { id: "c", label: "ستة" },
    { id: "d", label: "ثمانية" },
  ],
  correctOptionId: "a",
  answeringSelectionOptionId: "a",
  opposingDecision: "STEAL" as const,
  outcome: {
    teamRole: "opposing" as const,
    delta: 1,
    reason: "ryo.steal.correct",
    correct: true,
  },
};

const closestScenario = {
  kind: "closest" as const,
  version: 1 as const,
  prompt: "كم يبلغ ارتفاع برج المملكة تقريبًا؟",
  teamAEstimate: 280,
  teamBEstimate: 320,
  correctValue: 302,
  unit: "متر",
  outcome: {
    teamADistance: 22,
    teamBDistance: 18,
    winnerTeam: "team-b" as const,
    tie: false,
    mechanicTallyDelta: 1,
    matchPointDelta: 0 as const,
    reason: "closest.absolute-distance" as const,
  },
};

const bombScenario = {
  kind: "bomb" as const,
  version: 1 as const,
  prompt: "ما هو أكبر كوكب؟",
  acceptedAnswer: "المشتري",
  nextPrompt: "كم ضلعًا للمثلث؟",
  startingTeam: "team-a" as const,
  correctAtSecondsRemaining: 18,
  opponentExpiresAtSecondsRemaining: 0 as const,
  outcome: {
    passedToTeam: "team-a" as const,
    expiredTeam: "team-a" as const,
    winnerTeam: "team-b" as const,
    correctAnswerPassesTurn: true as const,
    timerResetsOnPass: false as const,
    matchPointDelta: 1 as const,
    reason: "bomb.clock-expired" as const,
  },
};

const oneClueScenario: OneClueTutorialScenario = {
  kind: "one-clue" as const,
  version: 1 as const,
  prompt: "ما المدينة المقصودة؟",
  clues: [
    { order: 1, value: 5, text: "مدينة عربية ساحلية" },
    { order: 2, value: 4, text: "واجهة بحرية طويلة" },
    { order: 3, value: 3, text: "فيها نافورة الملك فهد" },
    { order: 4, value: 2, text: "عروس البحر الأحمر" },
    { order: 5, value: 1, text: "تبدأ بحرف الجيم" },
  ],
  acceptedAnswer: "جدة",
  firstSubmittedAnswer: "الدمام",
  secondSubmittedAnswer: "جدة",
  outcome: {
    itemCount: 3 as const,
    firstLockedTeam: "team-a" as const,
    firstLockedAtClue: 2 as const,
    firstLockedValue: 4 as const,
    firstAnswerCorrect: false as const,
    eliminatedTeam: "team-a" as const,
    continuingTeam: "team-b" as const,
    correctTeam: "team-b" as const,
    correctAtClue: 3 as const,
    correctValue: 3 as const,
    itemPoints: { "team-a": 0, "team-b": 3 },
    finalTotals: { "team-a": 5, "team-b": 7 },
    winnerTeam: "team-b" as const,
    matchPointDelta: 1 as const,
    reason: "one-clue.progressive-lock" as const,
  },
};

const state = (
  overrides: Partial<AdminTutorialState> = {},
): AdminTutorialState => ({
  mechanicKey: "read-your-opponent",
  mechanicName: "اقرأ خصمك",
  draft: null,
  published: null,
  publishedRevision: 0,
  publishedAt: null,
  draftUpdatedAt: null,
  hasUnpublishedChanges: false,
  ...overrides,
});

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  worldApi.fetchTutorialWorldOptions.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  worldApi.fetchTutorialWorldOptions.mockResolvedValue([]);
  api.fetchAdminTutorial.mockResolvedValue(state());
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  });
});

afterEach(() => cleanup());

const mount = async () => {
  render(<MechanicTutorialEditor mechanicKey="read-your-opponent" />);
  await waitFor(() => expect(api.fetchAdminTutorial).toHaveBeenCalled());
};

const mountClosest = async () => {
  render(<MechanicTutorialEditor mechanicKey="closest" />);
  await waitFor(() => expect(api.fetchAdminTutorial).toHaveBeenCalled());
};

const mountBomb = async () => {
  render(<MechanicTutorialEditor mechanicKey="bomb" />);
  await waitFor(() => expect(api.fetchAdminTutorial).toHaveBeenCalled());
};

const mountOneClue = async () => {
  render(<MechanicTutorialEditor mechanicKey="one-clue" />);
  await waitFor(() => expect(api.fetchAdminTutorial).toHaveBeenCalled());
};

const mountEkshifni = async () => {
  render(<MechanicTutorialEditor mechanicKey="ekshifni" />);
  await waitFor(() => expect(api.fetchAdminTutorial).toHaveBeenCalled());
};

describe("mechanic tutorial editor", () => {
  it("offers board-backed World scopes without changing the generic flow", async () => {
    const user = userEvent.setup();
    worldApi.fetchTutorialWorldOptions.mockResolvedValue([
      {
        worldId: "world-1",
        worldName: "عالم السيارات",
        worldSlug: "cars",
        configurationId: "configuration-1",
        effectiveName: "القطعة الدخيلة",
        isEnabled: true,
      },
    ]);
    api.fetchAdminTutorial.mockImplementation(
      async (mechanicKey: string, worldId?: string) =>
        state({ mechanicKey, draft: worldId ? null : undefined }),
    );

    render(<MechanicTutorialEditor mechanicKey="read-your-opponent" />);
    await waitFor(() =>
      expect(screen.getByTestId("tutorial-world-selector")).toBeInTheDocument(),
    );
    expect(worldApi.fetchTutorialWorldOptions).toHaveBeenCalledWith(
      "read-your-opponent",
    );
    expect(
      screen.getByRole("option", { name: /عالم السيارات/ }),
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByTestId("tutorial-world-selector"),
      "world-1",
    );
    await waitFor(() =>
      expect(api.fetchAdminTutorial).toHaveBeenCalledWith(
        "read-your-opponent",
        "world-1",
      ),
    );
    expect(
      screen.getByText(/مثال خاص بعالم عالم السيارات/),
    ).toBeInTheDocument();
  });

  it("resets unsaved fields when changing tutorial scope", async () => {
    const user = userEvent.setup();
    worldApi.fetchTutorialWorldOptions.mockResolvedValue([
      {
        worldId: "world-1",
        worldName: "عالم السيارات",
        worldSlug: "cars",
        configurationId: "configuration-1",
        effectiveName: "القطعة الدخيلة",
        isEnabled: true,
      },
    ]);
    api.fetchAdminTutorial.mockImplementation(
      async (mechanicKey: string, worldId?: string) =>
        state({ mechanicKey, draft: null, worldId }),
    );

    render(<MechanicTutorialEditor mechanicKey="read-your-opponent" />);
    const selector = await screen.findByTestId("tutorial-world-selector");
    const prompt = screen.getByTestId("tutorial-prompt");
    await user.type(prompt, "مسودة لا تنتقل");
    await user.selectOptions(selector, "world-1");

    await waitFor(() =>
      expect(api.fetchAdminTutorial).toHaveBeenCalledWith(
        "read-your-opponent",
        "world-1",
      ),
    );
    expect(screen.getByTestId("tutorial-prompt")).toHaveValue("");
  });

  it("exposes scoped withdrawal and revision restore without touching generic state", async () => {
    const user = userEvent.setup();
    worldApi.fetchTutorialWorldOptions.mockResolvedValue([
      {
        worldId: "world-1",
        worldName: "عالم السيارات",
        worldSlug: "cars",
        configurationId: "configuration-1",
        effectiveName: "القطعة الدخيلة",
        isEnabled: true,
      },
    ]);
    api.fetchAdminTutorial.mockResolvedValue(
      state({
        worldId: "world-1",
        published: scenario,
        generic: { published: true, publishedRevision: 1 },
        revisions: [
          {
            revision: 1,
            publishedAt: "2026-01-01T00:00:00.000Z",
            restoredFromRevision: null,
          },
        ],
      }),
    );
    api.withdrawScopedTutorial.mockResolvedValue(
      state({
        worldId: "world-1",
        published: null,
        generic: { published: true, publishedRevision: 1 },
        revisions: [],
      }),
    );

    render(<MechanicTutorialEditor mechanicKey="read-your-opponent" />);
    await user.selectOptions(
      await screen.findByTestId("tutorial-world-selector"),
      "world-1",
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("tutorial-scope-lifecycle"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("tutorial-scope-resolution").textContent,
    ).toContain("مثال هذا العالم");
    expect(
      screen.getByRole("button", { name: "سحب نشر مثال العالم" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "مراجعة 1" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "سحب نشر مثال العالم" }),
    );
    await waitFor(() =>
      expect(api.withdrawScopedTutorial).toHaveBeenCalledWith(
        "world-1",
        "read-your-opponent",
      ),
    );
  });

  it("loads, validates, and previews an Ekshifni draft", async () => {
    const user = userEvent.setup();
    api.fetchAdminTutorial.mockResolvedValue(
      state({
        mechanicKey: "ekshifni",
        mechanicName: "اكشفني",
        draft: SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO,
        hasUnpublishedChanges: true,
      }),
    );
    api.validateTutorialDraft.mockResolvedValue({
      valid: true,
      issues: [],
      competitiveOverlap: [],
      outcome: SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO.outcome,
    });
    await mountEkshifni();
    await waitFor(() =>
      expect(screen.getByTestId("tutorial-ekshifni-identity")).toHaveValue(
        "رضوى الشربيني",
      ),
    );
    await user.click(screen.getByTestId("tutorial-validate"));
    expect(
      within(await screen.findByTestId("tutorial-preview")).getByTestId(
        "ekshifni-explainer",
      ),
    ).toBeInTheDocument();
    expect(api.validateTutorialDraft).toHaveBeenCalledWith(
      "ekshifni",
      expect.objectContaining({ kind: "ekshifni", regions: expect.any(Array) }),
    );
  });

  it("locks the RYO opposing decision for a World-scoped example", async () => {
    api.fetchAdminTutorial.mockResolvedValue(
      state({
        draft: {
          kind: "ryo",
          version: 1,
          ...scenario,
        },
      }),
    );
    render(
      <MechanicTutorialEditor
        mechanicKey="read-your-opponent"
        worldId="anime-world"
      />,
    );
    await waitFor(() => expect(api.fetchAdminTutorial).toHaveBeenCalled());
    expect(screen.getByTestId("tutorial-decision")).toBeDisabled();
  });

  it("loads, validates, and previews a One Clue draft", async () => {
    const user = userEvent.setup();
    api.fetchAdminTutorial.mockResolvedValue(
      state({
        mechanicKey: "one-clue",
        mechanicName: "بدليل واحد",
        draft: oneClueScenario,
        hasUnpublishedChanges: true,
      }),
    );
    api.validateTutorialDraft.mockResolvedValue({
      valid: true,
      issues: [],
      competitiveOverlap: [],
      outcome: oneClueScenario.outcome,
    });

    await mountOneClue();
    await waitFor(() =>
      expect(screen.getByTestId("tutorial-one-clue-prompt")).toHaveValue(
        oneClueScenario.prompt,
      ),
    );
    await user.click(screen.getByTestId("tutorial-validate"));
    expect(
      within(await screen.findByTestId("tutorial-preview")).getByTestId(
        "one-clue-explainer",
      ),
    ).toBeInTheDocument();
    expect(api.validateTutorialDraft).toHaveBeenCalledWith(
      "one-clue",
      expect.objectContaining({ kind: "one-clue", version: 1 }),
    );
  });

  it("loads, validates, and previews a Bomb draft", async () => {
    const user = userEvent.setup();
    api.fetchAdminTutorial.mockResolvedValue(
      state({
        mechanicKey: "bomb",
        mechanicName: "القنبلة",
        draft: bombScenario,
        hasUnpublishedChanges: true,
      }),
    );
    api.validateTutorialDraft.mockResolvedValue({
      valid: true,
      issues: [],
      competitiveOverlap: [],
      outcome: bombScenario.outcome,
    });

    await mountBomb();
    await waitFor(() =>
      expect(screen.getByLabelText("السؤال الأول")).toHaveValue(
        bombScenario.prompt,
      ),
    );
    await user.click(screen.getByRole("button", { name: /فحص ومعاينة/ }));
    expect(
      within(await screen.findByTestId("tutorial-preview")).getByTestId(
        "bomb-explainer",
      ),
    ).toBeInTheDocument();
    expect(api.validateTutorialDraft).toHaveBeenCalledWith(
      "bomb",
      expect.objectContaining({ kind: "bomb", version: 1 }),
    );
  });

  it("authors and previews a Closest scenario with a server-derived outcome", async () => {
    const user = userEvent.setup();
    api.fetchAdminTutorial.mockResolvedValue(
      state({
        mechanicKey: "closest",
        mechanicName: "مين أقرب",
        draft: closestScenario,
        hasUnpublishedChanges: true,
      }),
    );
    api.validateTutorialDraft.mockResolvedValue({
      valid: true,
      issues: [],
      competitiveOverlap: [],
      outcome: closestScenario.outcome,
    });

    await mountClosest();
    await waitFor(() =>
      expect(screen.getByTestId("tutorial-team-a-estimate")).toHaveValue(280),
    );
    expect(screen.getByTestId("tutorial-team-b-estimate")).toHaveValue(320);
    expect(screen.getByTestId("tutorial-correct-value")).toHaveValue(302);

    await user.click(screen.getByTestId("tutorial-validate"));
    const preview = await screen.findByTestId("tutorial-preview");
    expect(
      within(preview).getByTestId("closest-explainer"),
    ).toBeInTheDocument();
    expect(api.validateTutorialDraft).toHaveBeenCalledWith(
      "closest",
      expect.objectContaining({
        kind: "closest",
        version: 1,
        teamAEstimate: 280,
        teamBEstimate: 320,
        correctValue: 302,
      }),
    );
  });

  it("loads the mechanic's existing draft to continue from", async () => {
    api.fetchAdminTutorial.mockResolvedValue(
      state({ draft: scenario, draftUpdatedAt: "2026-10-12T00:00:00.000Z" }),
    );
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("tutorial-prompt")).toHaveValue(
        scenario.prompt,
      ),
    );
    // Keyed by mechanic, never by World or Scope.
    expect(api.fetchAdminTutorial).toHaveBeenCalledWith("read-your-opponent");
  });

  it("offers no way to assert a score", async () => {
    await mount();
    const editor = screen.getByTestId("mechanic-tutorial-editor");
    // Enumerate every control an editor can actually touch: the prompt, the four
    // options, and the three choices that drive the simulation. Nothing through
    // which a score could be asserted — that is derived server-side.
    const controls = [
      ...editor.querySelectorAll("input, select, textarea"),
    ].map((element) => element.getAttribute("data-testid"));
    expect(controls.sort()).toEqual(
      [
        "tutorial-prompt",
        "tutorial-option-a",
        "tutorial-option-b",
        "tutorial-option-c",
        "tutorial-option-d",
        "tutorial-correct",
        "tutorial-selection",
        "tutorial-decision",
      ].sort(),
    );
  });

  it("says plainly when a published tutorial has unpublished edits", async () => {
    api.fetchAdminTutorial.mockResolvedValue(
      state({
        draft: { ...scenario, prompt: "سؤال جديد؟" },
        published: scenario,
        publishedRevision: 3,
        hasUnpublishedChanges: true,
      }),
    );
    await mount();
    const badge = await screen.findByTestId("tutorial-publish-state");
    expect(badge).toHaveAttribute("data-published", "true");
    expect(badge).toHaveAttribute("data-dirty", "true");
    expect(badge.textContent).toContain("غير منشورة");
  });

  it("previews with the real explainer once the server derives an outcome", async () => {
    const user = userEvent.setup();
    api.fetchAdminTutorial.mockResolvedValue(state());
    api.validateTutorialDraft.mockResolvedValue({
      valid: true,
      issues: [],
      competitiveOverlap: [],
      outcome: scenario.outcome,
    });
    await mount();
    await user.type(screen.getByTestId("tutorial-prompt"), "س");
    await user.click(screen.getByTestId("tutorial-validate"));

    const preview = await screen.findByTestId("tutorial-preview");
    // The production component, not a mock of it.
    expect(within(preview).getByTestId("ryo-explainer")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-validation")).toHaveAttribute(
      "data-valid",
      "true",
    );
  });

  it("shows the competitive items a draft collides with", async () => {
    const user = userEvent.setup();
    api.validateTutorialDraft.mockResolvedValue({
      valid: false,
      issues: [
        {
          code: "TUTORIAL_OVERLAPS_COMPETITIVE_CONTENT",
          message: "هذا السؤال يطابق محتوى تنافسي قابل للعب.",
          details: {
            matches: [
              { contentItemId: "6a725e414c19c862fcb4c0a7", similarity: 1 },
            ],
          },
        },
      ],
      competitiveOverlap: [
        { contentItemId: "6a725e414c19c862fcb4c0a7", similarity: 1 },
      ],
      outcome: null,
    });
    await mount();
    await user.click(screen.getByTestId("tutorial-validate"));

    const report = await screen.findByTestId("tutorial-validation");
    expect(report).toHaveAttribute("data-valid", "false");
    expect(
      within(screen.getByTestId("tutorial-overlap")).getByText(
        /6a725e414c19c862fcb4c0a7/,
      ),
    ).toBeInTheDocument();
    // Nothing was published, and no preview of unsafe content was offered.
    expect(api.publishTutorial).not.toHaveBeenCalled();
    expect(screen.queryByTestId("tutorial-preview")).toBeNull();
  });

  it("cannot publish before a draft is saved", async () => {
    await mount();
    expect(screen.getByTestId("tutorial-publish")).toBeDisabled();
  });

  it("publishes a saved draft and reports the new revision", async () => {
    const user = userEvent.setup();
    api.fetchAdminTutorial.mockResolvedValue(
      state({ draft: scenario, hasUnpublishedChanges: true }),
    );
    api.publishTutorial.mockResolvedValue(
      state({
        draft: scenario,
        published: scenario,
        publishedRevision: 1,
        hasUnpublishedChanges: false,
      }),
    );
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("tutorial-publish")).toBeEnabled(),
    );
    await user.click(screen.getByTestId("tutorial-publish"));

    await waitFor(() =>
      expect(api.publishTutorial).toHaveBeenCalledWith("read-your-opponent"),
    );
    const badge = await screen.findByTestId("tutorial-publish-state");
    expect(badge).toHaveAttribute("data-dirty", "false");
    expect(badge.textContent).toContain("1");
  });

  it("surfaces a server rejection instead of appearing to succeed", async () => {
    const user = userEvent.setup();
    api.fetchAdminTutorial.mockResolvedValue(state({ draft: scenario }));
    api.publishTutorial.mockRejectedValue({
      response: {
        data: {
          code: "WORLD_CONTENT_VALIDATION_FAILED",
          message: "Tutorial scenario invalid",
          issues: [
            {
              code: "TUTORIAL_PROMPT_REQUIRED",
              message: "السؤال التوضيحي مطلوب.",
            },
          ],
        },
      },
    });
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("tutorial-publish")).toBeEnabled(),
    );
    await user.click(screen.getByTestId("tutorial-publish"));

    const report = await screen.findByTestId("tutorial-validation");
    expect(report).toHaveAttribute("data-valid", "false");
    expect(report.textContent).toContain(
      "أدخل السؤال التعليمي قبل فحص ومعاينة الشرح.",
    );
  });

  it("shows the localized message for an empty Closest DTO rejection", async () => {
    const user = userEvent.setup();
    api.validateTutorialDraft.mockRejectedValue({
      response: {
        status: 400,
        data: {
          statusCode: 400,
          error: "Bad Request",
          message: "prompt must be longer than or equal to 1 characters",
        },
      },
    });
    await mountClosest();
    await user.click(screen.getByTestId("tutorial-validate"));

    const report = await screen.findByTestId("tutorial-validation");
    expect(report.textContent).toContain(
      "أدخل السؤال التعليمي قبل فحص ومعاينة الشرح.",
    );
    expect(toast.error).toHaveBeenCalledWith(
      "أدخل السؤال التعليمي قبل فحص ومعاينة الشرح.",
    );
  });

  it("supports the legacy nested issue response", async () => {
    const user = userEvent.setup();
    api.validateTutorialDraft.mockRejectedValue({
      response: {
        status: 400,
        data: {
          message: {
            issues: [
              {
                code: "TUTORIAL_PROMPT_REQUIRED",
                message: "السؤال التوضيحي مطلوب.",
              },
            ],
          },
        },
      },
    });
    await mount();
    await user.click(screen.getByTestId("tutorial-validate"));

    expect(
      (await screen.findByTestId("tutorial-validation")).textContent,
    ).toContain("أدخل السؤال التعليمي قبل فحص ومعاينة الشرح.");
  });

  it("shows every class-validator message from an error array once", async () => {
    const user = userEvent.setup();
    api.validateTutorialDraft.mockRejectedValue({
      response: {
        status: 400,
        data: {
          statusCode: 400,
          error: "Bad Request",
          message: [
            "prompt must be longer than or equal to 1 characters",
            "version must be one of the following values: 1, 2",
          ],
        },
      },
    });
    await mountClosest();
    await user.click(screen.getByTestId("tutorial-validate"));

    const report = await screen.findByTestId("tutorial-validation");
    expect(report.textContent).toContain(
      "أدخل السؤال التعليمي قبل فحص ومعاينة الشرح.",
    );
    expect(report.textContent).toContain("نسخة الشرح غير مدعومة.");
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("keeps the generic fallback for an unexpected network failure", async () => {
    const user = userEvent.setup();
    api.validateTutorialDraft.mockRejectedValue(new Error("network down"));
    await mountClosest();
    await user.click(screen.getByTestId("tutorial-validate"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "تعذّرت العملية. حاول مرة ثانية.",
      ),
    );
  });

  it("reports a load failure rather than rendering an empty editor", async () => {
    api.fetchAdminTutorial.mockRejectedValue(new Error("nope"));
    await mount();
    expect(
      await screen.findByTestId("tutorial-editor-error"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("tutorial-prompt")).toBeNull();
  });
});
