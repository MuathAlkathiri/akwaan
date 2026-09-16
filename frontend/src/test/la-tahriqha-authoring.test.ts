import { describe, expect, it } from "vitest";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  findLocalFormProblems,
  hasLaTahriqhaMechanic,
  toContentItemForm,
  LA_TAHRIQHA_PROMPT_AR,
} from "@/features/world-management/services/content-item-form.service";
import type { ContentItem } from "@/features/world-management/types";

/**
 * Authoring one "لا تحرقها" dish.
 *
 * The Admin runs the same structural contract the launcher does, so the failure
 * this file is really about is the one where a producer publishes a dish on
 * Thursday and the room finds out on Friday that it will not start.
 */

const LABELS = [
  "أرز",
  "دجاج",
  "بصل",
  "طماطم",
  "بهار الكبسة",
  "معكرونة",
  "جبن",
  "زيتون",
];

const complete = () => {
  const values = emptyContentItemForm("scope-food");
  values.compatibleChallengeTypeIds = ["ct-la-tahriqha"];
  values.laTahriqha = {
    enabled: true,
    dishName: "كبسة دجاج",
    dishNote: "الطريقة النجدية",
    timerSeconds: "",
    ingredients: LABELS.map((label, index) => ({
      localId: `ingredient-${index + 1}`,
      label,
      correct: index < 5,
    })),
  };
  return values;
};

describe("لا تحرقها authoring", () => {
  it("is selected only by the canonical mechanic slug", () => {
    expect(
      hasLaTahriqhaMechanic([{ challengeType: { slug: "la-tahriqha" } }]),
    ).toBe(true);
    expect(
      hasLaTahriqhaMechanic([{ challengeType: { slug: "laqatha" } }]),
    ).toBe(false);
  });

  it("starts already satisfying the five-and-three split", () => {
    const { laTahriqha } = emptyContentItemForm("scope-food");
    expect(laTahriqha.ingredients).toHaveLength(8);
    expect(laTahriqha.ingredients.filter((one) => one.correct)).toHaveLength(5);
    expect(
      new Set(laTahriqha.ingredients.map((one) => one.localId)).size,
    ).toBe(8);
  });

  it("builds the canonical dish payload and answers in its own mode", () => {
    const values = complete();
    expect(findLocalFormProblems(values)).toEqual([]);
    const payload = buildContentItemPayload(values);
    // The five correct cards are the answer, so the item carries no text.
    expect(payload.answerPayload).toEqual({ mode: "la_tahriqha" });
    expect(payload.prompt.ar).toBe(LA_TAHRIQHA_PROMPT_AR);
    expect(payload.mechanicPayload).toMatchObject({
      variant: "la-tahriqha",
      dishName: { ar: "كبسة دجاج" },
      dishNote: { ar: "الطريقة النجدية" },
    });
    const ingredients = (
      payload.mechanicPayload as {
        ingredients: Array<Record<string, unknown>>;
      }
    ).ingredients;
    expect(ingredients).toHaveLength(8);
    expect(ingredients[0]).toEqual({
      localId: "ingredient-1",
      label: { ar: "أرز" },
      correct: true,
    });
    expect(ingredients.filter((one) => one.correct)).toHaveLength(5);
  });

  it("omits the dish window unless the author set one", () => {
    const values = complete();
    expect(payloadOf(values)).not.toHaveProperty("timerSeconds");
    values.laTahriqha.timerSeconds = "45";
    expect(payloadOf(values)).toMatchObject({ timerSeconds: 45 });
  });

  const payloadOf = (values: ReturnType<typeof complete>) =>
    buildContentItemPayload(values).mechanicPayload as Record<string, unknown>;

  it("refuses a dish with no name", () => {
    const values = complete();
    values.laTahriqha.dishName = "  ";
    expect(findLocalFormProblems(values)).toContain("اسم الطبق مطلوب.");
  });

  it("refuses an unlabelled card", () => {
    const values = complete();
    values.laTahriqha.ingredients[4].label = "";
    expect(findLocalFormProblems(values)).toContain(
      "كل مكوّن يحتاج اسمًا بالعربية.",
    );
  });

  it("refuses any split other than five correct and three distractors", () => {
    const values = complete();
    values.laTahriqha.ingredients[0].correct = false;
    const problems = findLocalFormProblems(values);
    expect(problems).toContain("يجب اختيار 5 مكوّنات صحيحة بالضبط.");
    expect(problems).toContain("يجب ترك 3 مكوّنات خاطئة محتملة.");
  });

  it("refuses duplicate card ids so a selection cannot drift", () => {
    const values = complete();
    values.laTahriqha.ingredients[7].localId =
      values.laTahriqha.ingredients[0].localId;
    expect(findLocalFormProblems(values)).toContain(
      "معرفات المكوّنات يجب أن تكون موجودة وفريدة.",
    );
  });

  it("refuses a nonsensical dish window", () => {
    const values = complete();
    values.laTahriqha.timerSeconds = "2";
    expect(findLocalFormProblems(values)).toContain(
      "وقت الطبق يكون عددًا صحيحًا من الثواني، 5 على الأقل.",
    );
  });

  it("does not demand a prompt it supplies itself", () => {
    const values = complete();
    values.promptAr = "";
    expect(findLocalFormProblems(values)).not.toContain(
      "نص السؤال بالعربية مطلوب.",
    );
  });

  it("reopens a saved dish exactly as it was authored", () => {
    const saved = buildContentItemPayload(complete());
    const reopened = toContentItemForm({
      ...saved,
      id: "item-1",
      status: "ready",
      isReusableAcrossSessions: false,
    } as unknown as ContentItem);
    expect(reopened.laTahriqha.enabled).toBe(true);
    expect(reopened.laTahriqha.dishName).toBe("كبسة دجاج");
    expect(reopened.laTahriqha.dishNote).toBe("الطريقة النجدية");
    expect(reopened.laTahriqha.timerSeconds).toBe("");
    expect(reopened.laTahriqha.ingredients.map((one) => one.label)).toEqual(
      LABELS,
    );
    expect(
      reopened.laTahriqha.ingredients.map((one) => one.correct),
    ).toEqual([true, true, true, true, true, false, false, false]);
    // …and saving it again produces the same payload, so a reopen-and-save
    // round trip cannot quietly rewrite a published dish.
    expect(buildContentItemPayload(reopened).mechanicPayload).toEqual(
      saved.mechanicPayload,
    );
  });

  it("carries an authored window through a reopen", () => {
    const values = complete();
    values.laTahriqha.timerSeconds = "45";
    const saved = buildContentItemPayload(values);
    const reopened = toContentItemForm({
      ...saved,
      id: "item-1",
      status: "ready",
      isReusableAcrossSessions: false,
    } as unknown as ContentItem);
    expect(reopened.laTahriqha.timerSeconds).toBe("45");
  });
});
