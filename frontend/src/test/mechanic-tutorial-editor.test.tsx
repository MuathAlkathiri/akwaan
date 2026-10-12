import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MechanicTutorialEditor } from "@/features/world-management/components/challenge-types/mechanic-tutorial-editor";
import type { AdminTutorialState } from "@/features/world-management/api/mechanic-tutorial-api";

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
}));

vi.mock("@/features/world-management/api/mechanic-tutorial-api", () => api);
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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

const state = (overrides: Partial<AdminTutorialState> = {}): AdminTutorialState => ({
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

describe("mechanic tutorial editor", () => {
  it("loads the mechanic's existing draft to continue from", async () => {
    api.fetchAdminTutorial.mockResolvedValue(
      state({ draft: scenario, draftUpdatedAt: "2026-10-12T00:00:00.000Z" }),
    );
    await mount();
    await waitFor(() =>
      expect(screen.getByTestId("tutorial-prompt")).toHaveValue(scenario.prompt),
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
    const controls = [...editor.querySelectorAll("input, select, textarea")].map(
      (element) => element.getAttribute("data-testid"),
    );
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
            matches: [{ contentItemId: "6a725e414c19c862fcb4c0a7", similarity: 1 }],
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
          message: {
            issues: [
              { code: "TUTORIAL_PROMPT_REQUIRED", message: "السؤال التوضيحي مطلوب." },
            ],
          },
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
    expect(report.textContent).toContain("السؤال التوضيحي مطلوب.");
  });

  it("reports a load failure rather than rendering an empty editor", async () => {
    api.fetchAdminTutorial.mockRejectedValue(new Error("nope"));
    await mount();
    expect(await screen.findByTestId("tutorial-editor-error")).toBeInTheDocument();
    expect(screen.queryByTestId("tutorial-prompt")).toBeNull();
  });
});
