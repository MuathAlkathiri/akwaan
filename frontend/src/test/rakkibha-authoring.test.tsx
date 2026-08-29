import { describe, expect, it } from "vitest";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  findRakkibhaProblems,
  toRakkibhaFormState,
  type ContentItemFormValues,
  type RakkibhaFormState,
} from "@/features/world-management/services/content-item-form.service";
import type { RakkibhaPayload } from "@/features/world-management/types";

/** A complete, valid visual-assembly item as the form would hold it. */
function authored(
  overrides: Partial<RakkibhaFormState> = {},
): ContentItemFormValues {
  const base = emptyContentItemForm("scope-1");
  const rakkibha: RakkibhaFormState = {
    ...base.rakkibha,
    enabled: true,
    instructionAr: "صفوا الشكل ثم اختاروا القطعة المطابقة",
    referenceImageUrl: "/reference.png",
    candidateViews: [
      {
        id: "holder-1",
        contentAr: "",
        candidates: [
          { localId: "one", canonicalIdentity: "match", imageUrl: "/t1.png", contentAr: "" },
          { localId: "two", canonicalIdentity: "wrong-1", imageUrl: "/t2.png", contentAr: "" },
        ],
      },
      {
        id: "holder-2",
        contentAr: "",
        candidates: [
          { localId: "one", canonicalIdentity: "wrong-2", imageUrl: "/d1.png", contentAr: "" },
          { localId: "two", canonicalIdentity: "wrong-3", imageUrl: "/d2.png", contentAr: "" },
        ],
      },
    ],
    correctCanonicalIdentity: "match",
    safetyConfirmed: true,
    ...overrides,
  };
  return {
    ...base,
    promptAr: "أي قطعة تكمل الشكل؟",
    compatibleChallengeTypeIds: ["ct-rakkibha"],
    answer: { ...base.answer, mode: "match", acceptedAnswers: "x" },
    status: "ready",
    rakkibha,
  };
}

describe("ركّبها authoring payload", () => {
  it("emits a visual-assembly mechanicPayload, with the answer left in answerPayload", () => {
    const payload = buildContentItemPayload(authored());
    const mechanic = payload.mechanicPayload as RakkibhaPayload;

    expect(mechanic.variant).toBe("visual-assembly");
    expect(mechanic.reference.media.assets[0].url).toBe("/reference.png");
    expect(mechanic.candidateViews).toHaveLength(2);
    expect(mechanic.candidateViews[0].candidates[0]).toMatchObject({
      localId: "one",
      canonicalIdentity: "match",
    });
    expect(mechanic.correctCanonicalIdentity).toBe("match");
    // The canonical identity that reveals the answer must not leak into the answer
    // channel; the answer stays where every mechanic's answer lives.
    expect(payload.answerPayload).toMatchObject({ mode: "match" });
  });

  it("carries per-candidate image media in the canonical media shape", () => {
    const mechanic = buildContentItemPayload(authored())
      .mechanicPayload as RakkibhaPayload;
    expect(mechanic.candidateViews[1].candidates[0].media).toEqual({
      type: "image",
      assets: [{ url: "/d1.png" }],
    });
  });

  it("round-trips an authored payload back into the form", () => {
    const payload = buildContentItemPayload(authored())
      .mechanicPayload as RakkibhaPayload;
    const form = toRakkibhaFormState(payload);
    expect(form.instructionAr).toBe("صفوا الشكل ثم اختاروا القطعة المطابقة");
    expect(form.referenceImageUrl).toBe("/reference.png");
    expect(form.correctCanonicalIdentity).toBe("match");
    expect(form.candidateViews[0].candidates[0].imageUrl).toBe("/t1.png");
  });
});

describe("ركّبها authoring validation", () => {
  it("passes a complete item", () => {
    expect(findRakkibhaProblems(authored())).toEqual([]);
  });

  it("requires the instruction", () => {
    expect(findRakkibhaProblems(authored({ instructionAr: "  " }))).toContain(
      "تعليمات ركّبها مطلوبة.",
    );
  });

  it("requires the reference image", () => {
    expect(
      findRakkibhaProblems(authored({ referenceImageUrl: "" })),
    ).toContain("صورة الشكل الناقص مطلوبة.");
  });

  it("requires exactly one candidate to match the correct identity", () => {
    // Zero matches.
    expect(
      findRakkibhaProblems(authored({ correctCanonicalIdentity: "nobody" })),
    ).toContain("يجب أن تطابق قطعة واحدة فقط الهوية الصحيحة.");
    // Two matches.
    const twoTrue = authored();
    twoTrue.rakkibha.candidateViews[1].candidates[0].canonicalIdentity = "match";
    expect(findRakkibhaProblems(twoTrue)).toContain(
      "يجب أن تطابق قطعة واحدة فقط الهوية الصحيحة.",
    );
  });

  it("requires at least two candidate holders", () => {
    const single = authored();
    single.rakkibha.candidateViews = [single.rakkibha.candidateViews[0]];
    expect(findRakkibhaProblems(single)).toContain(
      "أضف حاملَي قطع على الأقل، ولكل حامل قطعتان أو ثلاث.",
    );
  });

  it("requires the safety confirmation before ready", () => {
    expect(
      findRakkibhaProblems(authored({ safetyConfirmed: false })),
    ).toContain("أكّد أنك راجعت التوزيع قبل جعل العنصر جاهزاً.");
  });
});
