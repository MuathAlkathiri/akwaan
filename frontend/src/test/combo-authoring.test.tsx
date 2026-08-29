import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ComboFields } from "@/features/world-management/components/content-items/combo-fields";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  findLocalFormProblems,
  toContentItemForm,
  COMBO_DIFFICULTIES,
  hasComboMechanic,
  type ComboFormState,
} from "@/features/world-management/services/content-item-form.service";
import type { ContentItem } from "@/features/world-management/types";

/**
 * Authoring "صعوبة السؤال" for a الكومبو item.
 *
 * The label is authoring copy and the stage is the canonical value, so the tests
 * hold that line: an author picks متوسط صعب, and what persists is
 * `mechanicPayload.comboStage: 2`. Nothing else about the item's payload moves.
 */

function Fields({ initial }: { initial: ComboFormState }) {
  const [value, setValue] = useState(initial);
  return <ComboFields value={value} onChange={setValue} />;
}

const comboForm = (stage: ComboFormState["stage"]) => ({
  ...emptyContentItemForm("scope-1"),
  promptAr: "من هو الهوكاجي الرابع؟",
  compatibleChallengeTypeIds: ["ct-combo"],
  answer: {
    ...emptyContentItemForm("scope-1").answer,
    mode: "match" as const,
    acceptedAnswers: "ميناتو",
  },
  combo: { enabled: true, stage },
});

describe("الكومبو difficulty authoring", () => {
  it("offers exactly the four approved difficulties", async () => {
    render(<Fields initial={{ enabled: true, stage: "" }} />);
    fireEvent.click(screen.getByTestId("combo-stage-select"));

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "متوسط",
      "متوسط صعب",
      "صعب",
      "صعب جدًا",
    ]);
  });

  it.each(
    COMBO_DIFFICULTIES.map((entry) => [entry.label, entry.stage] as const),
  )("persists %s as stage %i and never the label", async (label, stage) => {
    render(<Fields initial={{ enabled: true, stage: "" }} />);
    fireEvent.click(screen.getByTestId("combo-stage-select"));
    fireEvent.click(await screen.findByRole("option", { name: label }));

    const payload = buildContentItemPayload(comboForm(stage));
    expect(payload.mechanicPayload).toEqual({ comboStage: stage });
    expect(JSON.stringify(payload)).not.toContain(label);
  });

  it("refuses to save a Combo item with no difficulty chosen", () => {
    expect(findLocalFormProblems(comboForm(""))).toContain(
      "اختر صعوبة السؤال.",
    );
    // And nothing is emitted for it, so a bypass cannot save a stageless item.
    expect(
      buildContentItemPayload(comboForm("")).mechanicPayload,
    ).toBeUndefined();
  });

  it("hydrates an existing item's difficulty into the dropdown", () => {
    const saved = {
      id: "item-1",
      scopeId: "scope-1",
      worldId: "world-anime",
      prompt: { ar: "سؤال" },
      compatibleChallengeTypeIds: ["ct-combo"],
      answerPayload: { mode: "match", acceptedAnswers: ["ميناتو"] },
      mechanicPayload: { comboStage: 2 },
      isReusableAcrossSessions: false,
      status: "ready",
    } as unknown as ContentItem;

    const values = toContentItemForm(saved);
    expect(values.combo).toEqual({ enabled: true, stage: 2 });

    render(<Fields initial={values.combo} />);
    expect(screen.getByTestId("combo-stage-select")).toHaveTextContent(
      "متوسط صعب",
    );
  });

  it("persists a changed difficulty on edit", async () => {
    render(<Fields initial={{ enabled: true, stage: 2 }} />);
    expect(screen.getByTestId("combo-stage-select")).toHaveTextContent(
      "متوسط صعب",
    );

    fireEvent.click(screen.getByTestId("combo-stage-select"));
    fireEvent.click(await screen.findByRole("option", { name: "صعب جدًا" }));
    expect(screen.getByTestId("combo-stage-select")).toHaveTextContent(
      "صعب جدًا",
    );
    expect(buildContentItemPayload(comboForm(4)).mechanicPayload).toEqual({
      comboStage: 4,
    });
  });

  it("emits no Combo payload once Combo is no longer selected", () => {
    // Deselecting the mechanic stops emitting its metadata rather than leaving a
    // stale stage behind for another mechanic to inherit.
    const values = {
      ...comboForm(3),
      combo: { enabled: false, stage: 3 as const },
    };
    expect(buildContentItemPayload(values).mechanicPayload).toBeUndefined();
    expect(findLocalFormProblems(values)).not.toContain("اختر صعوبة السؤال.");
  });

  it("leaves another mechanic's payload untouched", () => {
    // A "ركّبها" item keeps its own visual-assembly payload; Combo's stage never
    // displaces its reference/candidate views.
    const base = emptyContentItemForm("scope-1");
    const rakkibha = {
      ...base,
      promptAr: "سؤال",
      compatibleChallengeTypeIds: ["ct-rakkibha"],
      rakkibha: { ...base.rakkibha, enabled: true },
      combo: { enabled: false, stage: 3 as const },
    };
    const payload = buildContentItemPayload(rakkibha);
    expect(payload.mechanicPayload).toBeDefined();
    expect(payload.mechanicPayload).not.toHaveProperty("comboStage");
    expect(payload.mechanicPayload).toHaveProperty("candidateViews");
    expect(payload.mechanicPayload).toHaveProperty("variant", "visual-assembly");
  });
});

describe("which mechanics ask for a Combo difficulty", () => {
  const configured = (...slugs: string[]) =>
    slugs.map((slug) => ({ challengeType: { slug } }));

  it("asks only when الكومبو is among the selected mechanics", () => {
    expect(hasComboMechanic(configured("combo"))).toBe(true);
    expect(hasComboMechanic(configured("read-your-opponent", "combo"))).toBe(
      true,
    );
  });

  it("never asks another mechanic for one", () => {
    // Combo answers in the generic `match` mode, so only the slug can single it
    // out — an answer-mode test would also catch every other typed mechanic.
    expect(hasComboMechanic(configured())).toBe(false);
    expect(hasComboMechanic(configured("read-your-opponent"))).toBe(false);
    expect(hasComboMechanic(configured("one-clue", "closest"))).toBe(false);
    expect(hasComboMechanic(configured("rakkibha"))).toBe(false);
  });
});
