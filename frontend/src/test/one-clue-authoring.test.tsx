import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { OneClueFields } from "@/features/world-management/components/content-items/one-clue-fields";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  findLocalFormProblems,
  selectCompatibleContentPattern,
  toContentItemForm,
  type OneClueFormState,
} from "@/features/world-management/services/content-item-form.service";
import type { ContentItem } from "@/features/world-management/types";

const complete = (): OneClueFormState => ({
  enabled: true,
  targetAnswer: "كريستيانو رونالدو",
  clues: ["الدليل الصعب", "الدليل 2", "الدليل 3", "الدليل 4", "الدليل الواضح"],
});

function Harness() {
  const [value, setValue] = useState(complete());
  const [aliases, setAliases] = useState("رونالدو\nCristiano Ronaldo");
  return (
    <OneClueFields
      value={value}
      acceptedAnswers={aliases}
      onChange={setValue}
      onAcceptedAnswersChange={setAliases}
    />
  );
}

describe("One Clue ContentItem authoring", () => {
  it("renders exactly five fixed progressive clue editors", () => {
    render(<Harness />);
    expect(screen.getAllByRole("textbox")).toHaveLength(7);
    for (const [label, score] of [
      ["الدليل الأول", 5],
      ["الدليل الثاني", 4],
      ["الدليل الثالث", 3],
      ["الدليل الرابع", 2],
      ["الدليل الخامس", 1],
    ] as const) {
      expect(screen.getByRole("textbox", { name: label })).toBeInTheDocument();
      expect(screen.getByText(`${score} نقاط`)).toBeInTheDocument();
    }
    expect(screen.queryByText("إضافة دليل")).not.toBeInTheDocument();
    expect(screen.queryByText("حذف")).not.toBeInTheDocument();
  });

  it("edits target, aliases, and clue text as controlled fields", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.clear(screen.getByRole("textbox", { name: "الدليل الثالث" }));
    await user.type(
      screen.getByRole("textbox", { name: "الدليل الثالث" }),
      "وسط",
    );
    expect(screen.getByRole("textbox", { name: "الدليل الثالث" })).toHaveValue(
      "وسط",
    );
    expect(screen.getByText("الإجابات المقبولة")).toBeInTheDocument();
  });

  it("serializes the canonical answerPayload and five-clue mechanicPayload", () => {
    const values = emptyContentItemForm("scope-1");
    values.compatibleChallengeTypeIds = ["one-clue-id"];
    values.oneClue = complete();
    values.answer.acceptedAnswers = "رونالدو\nCristiano Ronaldo";
    const payload = buildContentItemPayload(values);
    expect(payload.prompt.ar).toBe("اكتشف الإجابة المستهدفة من الأدلة");
    expect(payload.answerPayload).toEqual({
      mode: "match",
      acceptedAnswers: ["كريستيانو رونالدو", "رونالدو", "Cristiano Ronaldo"],
    });
    expect(payload.mechanicPayload).toEqual({
      clues: complete().clues.map((text, index) => ({
        order: index + 1,
        value: 5 - index,
        text: { ar: text },
      })),
    });
  });

  it("hydrates an existing item without losing clues or aliases", () => {
    const item = {
      id: "item-1",
      scopeId: "scope-1",
      worldId: "world-1",
      prompt: { ar: "تعرف على الشخصية" },
      compatibleChallengeTypeIds: ["one-clue-id"],
      answerPayload: {
        mode: "match",
        acceptedAnswers: ["كريستيانو رونالدو", "رونالدو"],
      },
      mechanicPayload: {
        clues: complete().clues.map((text, index) => ({
          order: index + 1,
          value: 5 - index,
          text: { ar: text },
        })),
      },
      isReusableAcrossSessions: false,
      status: "ready",
      readiness: { readiness: "ready", blockers: [], warnings: [] },
      compatibleFamilies: ["coop"],
      isSessionReuseExempt: false,
    } as ContentItem;
    const form = toContentItemForm(item);
    expect(form.oneClue.targetAnswer).toBe("كريستيانو رونالدو");
    expect(form.oneClue.clues).toEqual(complete().clues);
    expect(form.answer.acceptedAnswers).toBe("رونالدو");
    expect(form.promptAr).toBe("تعرف على الشخصية");
  });

  it("blocks missing and duplicate clues before save", () => {
    const values = emptyContentItemForm("scope-1");
    values.compatibleChallengeTypeIds = ["one-clue-id"];
    values.oneClue = {
      ...complete(),
      clues: ["نفسه", "نفسه", "", "رابع", "خامس"],
    };
    expect(findLocalFormProblems(values)).toEqual(
      expect.arrayContaining([
        "اكتب الأدلة الخمسة كاملة.",
        "لا يمكن تكرار نص الدليل نفسه.",
      ]),
    );
  });

  it("replaces an incompatible Rakkibha selection instead of cross-selecting it", () => {
    const patterns = {
      "one-clue-id": "one_clue",
      "rakkibha-id": "distributed_information",
      "another-one-clue": "one_clue",
    } as const;
    expect(
      selectCompatibleContentPattern(["rakkibha-id"], "one-clue-id", patterns),
    ).toEqual(["one-clue-id"]);
    expect(
      selectCompatibleContentPattern(
        ["one-clue-id"],
        "another-one-clue",
        patterns,
      ),
    ).toEqual(["one-clue-id", "another-one-clue"]);
  });
});
