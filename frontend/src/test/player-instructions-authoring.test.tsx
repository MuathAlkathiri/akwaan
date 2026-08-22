import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({ showToast: vi.fn() }));

vi.mock("@/features/world-management/hooks/use-world-content", () => ({
  useWorldContentMetadata: () => ({
    data: {
      productionMechanics: [],
      families: [
        {
          value: "ryo",
          allowedAnswerModes: ["ryo"],
          mustBeExclusive: false,
          defaultTimerSeconds: 25,
        },
      ],
      itemStructures: ["discrete_triple"],
      scoringRules: [{ id: "ryo.payoff-matrix", label: "نظام اقرأ خصمك" }],
      boardSlotCount: 4,
      slots: [],
      answerModeCompatibility: [],
    },
  }),
  useCreateChallengeType: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateChallengeType: () => ({ mutateAsync: mocks.update, isPending: false }),
}));

import { ChallengeTypeForm } from "@/features/world-management/components/challenge-types/challenge-type-form";
import { PlayerInstructionsFields } from "@/features/world-management/components/shared/player-instructions-fields";
import {
  buildChallengeTypePayload,
  normalizePlayerInstructions,
} from "@/features/world-management/services/world-content-forms";
import type {
  ChallengeType,
  PlayerInstructions,
} from "@/features/world-management/types";

/**
 * Authoring "شرح التحدي للاعبين" on the mechanic.
 *
 * The instructions are canonical data on the ChallengeType, not copy hardcoded in
 * the player client — so these tests hold the authoring surface (add, edit,
 * reorder, remove), its hydration on edit, and the guarantee that a blank or
 * half-filled form persists "no instructions" rather than a broken shape.
 */

function Fields({ initial }: { initial: PlayerInstructions }) {
  const [value, setValue] = useState(initial);
  return <PlayerInstructionsFields value={value} onChange={setValue} />;
}

describe("PlayerInstructionsFields", () => {
  it("adds, edits, reorders and removes steps", () => {
    render(<Fields initial={{ summary: "", steps: [] }} />);

    fireEvent.click(screen.getByRole("button", { name: "إضافة خطوة" }));
    fireEvent.click(screen.getByRole("button", { name: "إضافة خطوة" }));
    fireEvent.change(screen.getByLabelText("الخطوة 1"), {
      target: { value: "أولى" },
    });
    fireEvent.change(screen.getByLabelText("الخطوة 2"), {
      target: { value: "ثانية" },
    });

    // Reorder: move the first step down; the values swap, not the boxes.
    fireEvent.click(
      screen.getByRole("button", { name: "تحريك الخطوة 1 لأسفل" }),
    );
    expect((screen.getByLabelText("الخطوة 1") as HTMLInputElement).value).toBe(
      "ثانية",
    );
    expect((screen.getByLabelText("الخطوة 2") as HTMLInputElement).value).toBe(
      "أولى",
    );

    // Remove the first step; one input remains, carrying the survivor.
    fireEvent.click(screen.getByRole("button", { name: "حذف الخطوة 1" }));
    expect(screen.queryByLabelText("الخطوة 2")).toBeNull();
    expect((screen.getByLabelText("الخطوة 1") as HTMLInputElement).value).toBe(
      "أولى",
    );
  });

  it("hydrates an existing mechanic's authored instructions", () => {
    render(
      <Fields
        initial={{
          summary: "اقرأ خصمك.",
          steps: ["اختر توقعك", "اكشفوا معًا"],
          highlights: ["لا تكشف بدري"],
        }}
      />,
    );
    expect(
      (screen.getByLabelText("نبذة قصيرة") as HTMLTextAreaElement).value,
    ).toBe("اقرأ خصمك.");
    expect((screen.getByLabelText("الخطوة 1") as HTMLInputElement).value).toBe(
      "اختر توقعك",
    );
    expect((screen.getByLabelText("الخطوة 2") as HTMLInputElement).value).toBe(
      "اكشفوا معًا",
    );
    expect((screen.getByLabelText("ملاحظة 1") as HTMLInputElement).value).toBe(
      "لا تكشف بدري",
    );
  });
});

describe("player instructions payload normalization", () => {
  it("drops a blank form to null rather than an unsaveable empty object", () => {
    expect(
      normalizePlayerInstructions({ summary: "  ", steps: ["", "  "] }),
    ).toBeNull();
  });

  it("trims and drops empty rows when building the challenge-type payload", () => {
    const payload = buildChallengeTypePayload({
      name: "اقرأ خصمك",
      slug: "read-your-opponent",
      family: "ryo",
      itemStructure: "discrete_triple",
      answerMode: "ryo",
      scoringRuleId: "ryo.payoff-matrix",
      status: "draft",
      defaultPresentation: {
        inputType: "phone-multiple-choice",
        timerSeconds: 25,
        playerInstructions: {
          summary: "  اقرأ خصمك.  ",
          steps: ["  اختر توقعك  ", "   "],
          highlights: ["  ", "نصيحة"],
        },
      },
    });
    expect(payload.defaultPresentation.playerInstructions).toEqual({
      summary: "اقرأ خصمك.",
      steps: ["اختر توقعك"],
      highlights: ["نصيحة"],
    });
  });
});

describe("ChallengeTypeForm player instructions", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.update.mockReset();
    mocks.create.mockResolvedValue({ id: "new" });
    mocks.update.mockResolvedValue({ id: "existing" });
  });

  it("submits authored, normalized player instructions on create", async () => {
    render(<ChallengeTypeForm onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("نبذة قصيرة"), {
      target: { value: "اقرأ خصمك." },
    });
    fireEvent.click(screen.getByRole("button", { name: "إضافة خطوة" }));
    fireEvent.change(screen.getByLabelText("الخطوة 1"), {
      target: { value: "  اختر توقعك  " },
    });

    fireEvent.click(screen.getByRole("button", { name: "إضافة مكانيكا" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const { data } = mocks.create.mock.calls[0][0];
    expect(data.defaultPresentation.playerInstructions).toEqual({
      summary: "اقرأ خصمك.",
      steps: ["اختر توقعك"],
    });
  });

  it("hydrates instructions on edit and shows the player preview", () => {
    const challengeType = {
      id: "existing",
      name: "اقرأ خصمك",
      slug: "read-your-opponent",
      family: "ryo",
      itemStructure: "discrete_triple",
      answerMode: "ryo",
      scoringRuleId: "ryo.payoff-matrix",
      status: "active",
      defaultPresentation: {
        inputType: "phone-multiple-choice",
        timerSeconds: 25,
        soundPack: null,
        revealStyle: null,
        playerInstructions: {
          summary: "اقرأ خصمك قبل ما يقرأك.",
          steps: ["اختر توقعك بسرية", "اكشفوا معًا"],
        },
      },
      sortOrder: 0,
      worldConfigurationCount: 0,
      contentItemCount: 0,
      readiness: { readiness: "ready", missing: [] },
    } as unknown as ChallengeType;

    render(<ChallengeTypeForm challengeType={challengeType} onSuccess={vi.fn()} />);

    expect(
      (screen.getByLabelText("نبذة قصيرة") as HTMLTextAreaElement).value,
    ).toBe("اقرأ خصمك قبل ما يقرأك.");
    // The live preview renders what a player would meet.
    const preview = screen.getByTestId("player-instructions-preview");
    expect(preview.textContent).toContain("اقرأ خصمك قبل ما يقرأك.");
    expect(preview.textContent).toContain("كيف تلعبون؟");
    expect(preview.textContent).toContain("اختر توقعك بسرية");
  });
});
