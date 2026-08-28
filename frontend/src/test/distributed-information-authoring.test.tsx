import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  DistributedInformationFields,
  DISTRIBUTED_SAFETY_CONFIRMATION,
} from "@/features/world-management/components/content-items/distributed-information-fields";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  findDistributedProblems,
  toDistributedFormState,
  type ContentItemFormValues,
  type DistributedFormState,
} from "@/features/world-management/services/content-item-form.service";
import type { DistributedInformationPayload } from "@/features/world-management/types";

/** A complete authored item, as the form would hold it. */
function authored(
  overrides: Partial<DistributedFormState> = {},
): DistributedFormState {
  return {
    enabled: true,
    publicPromptAr: "من هو اللاعب؟",
    publicPromptEn: "",
    segments: [
      { id: "A", contentAr: "لعب في إسبانيا", contentEn: "", imageUrl: "", audioUrl: "" },
      { id: "B", contentAr: "كرة ذهبية واحدة", contentEn: "", imageUrl: "", audioUrl: "" },
      { id: "C", contentAr: "اعتزل 2019", contentEn: "", imageUrl: "", audioUrl: "" },
    ],
    mergeKeys: ["AC_B"],
    safetyConfirmed: true,
    explanation: "",
    ...overrides,
  };
}

function formValues(
  distributed: DistributedFormState,
  overrides: Partial<ContentItemFormValues> = {},
): ContentItemFormValues {
  const base = emptyContentItemForm("scope-1");
  return {
    ...base,
    promptAr: "من هو اللاعب؟",
    compatibleChallengeTypeIds: ["type-distributed"],
    answer: { ...base.answer, mode: "match", acceptedAnswers: "ميسي" },
    status: "ready",
    distributed,
    ...overrides,
  };
}

/** The fields are controlled, so the test owns the state like the form does. */
function Harness({ initial }: { initial: DistributedFormState }) {
  const [value, setValue] = useState(initial);
  return (
    <DistributedInformationFields
      value={value}
      onChange={setValue}
      answerMode="match"
    />
  );
}

describe("ركّبها authoring payload", () => {
  it("submits a native mechanicPayload with the answer left in answerPayload", () => {
    const payload = buildContentItemPayload(formValues(authored()));
    const mechanic = payload.mechanicPayload as DistributedInformationPayload;

    expect(mechanic.variant).toBe("three-segment-race");
    expect(mechanic.publicPrompt).toEqual({ ar: "من هو اللاعب؟" });
    expect(mechanic.segments.map((segment) => segment.id)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(mechanic.segments[1].content.ar).toBe("كرة ذهبية واحدة");
    expect(mechanic.twoPlayerMergeOptions).toEqual([
      { firstParticipantSegmentIds: ["A", "C"], secondParticipantSegmentIds: ["B"] },
    ]);
    expect(mechanic.supportedTeamSizes).toEqual([2, 3]);
    expect(mechanic.authorSafetyConfirmation).toBe(true);

    // The answer stays where every mechanic's answer lives, and nowhere else.
    expect(payload.answerPayload).toMatchObject({ mode: "match" });
    expect(JSON.stringify(mechanic)).not.toContain("ميسي");
    // No JSON smuggled into notes.
    expect(payload.metadata).toBeUndefined();
  });

  it("emits nothing when the mechanic is not selected", () => {
    const payload = buildContentItemPayload(
      formValues(authored({ enabled: false })),
    );
    expect(payload.mechanicPayload).toBeUndefined();
  });

  it("carries optional segment media through the existing media shape", () => {
    const payload = buildContentItemPayload(
      formValues(
        authored({
          segments: authored().segments.map((segment) =>
            segment.id === "A"
              ? { ...segment, imageUrl: "https://example.invalid/a.png" }
              : segment,
          ),
        }),
      ),
    );
    const mechanic = payload.mechanicPayload as DistributedInformationPayload;

    expect(mechanic.segments[0].media).toEqual({
      type: "image",
      assets: [{ url: "https://example.invalid/a.png" }],
    });
    expect(mechanic.segments[1].media).toBeUndefined();
  });

  it("carries optional segment audio through the existing media shape", () => {
    const payload = buildContentItemPayload(
      formValues(
        authored({
          segments: authored().segments.map((segment) =>
            segment.id === "C"
              ? { ...segment, audioUrl: "https://example.invalid/c.mp3" }
              : segment,
          ),
        }),
      ),
    );
    const mechanic = payload.mechanicPayload as DistributedInformationPayload;

    expect(mechanic.segments[2].media).toEqual({
      type: "audio",
      assets: [{ url: "https://example.invalid/c.mp3" }],
    });
  });

  it("prefers image over audio when a segment carries both", () => {
    const payload = buildContentItemPayload(
      formValues(
        authored({
          segments: authored().segments.map((segment) =>
            segment.id === "A"
              ? {
                  ...segment,
                  imageUrl: "https://example.invalid/a.png",
                  audioUrl: "https://example.invalid/a.mp3",
                }
              : segment,
          ),
        }),
      ),
    );
    const mechanic = payload.mechanicPayload as DistributedInformationPayload;
    expect(mechanic.segments[0].media?.type).toBe("image");
  });

  it("round-trips a segment audio url back into the form for editing", () => {
    const payload = buildContentItemPayload(
      formValues(
        authored({
          segments: authored().segments.map((segment) =>
            segment.id === "B"
              ? { ...segment, audioUrl: "https://example.invalid/b.mp3" }
              : segment,
          ),
        }),
      ),
    ).mechanicPayload as DistributedInformationPayload;

    const form = toDistributedFormState(payload);
    const segmentB = form.segments.find((segment) => segment.id === "B");
    expect(segmentB?.audioUrl).toBe("https://example.invalid/b.mp3");
    expect(segmentB?.imageUrl).toBe("");
  });

  it("round-trips an authored item back into the form for editing", () => {
    const payload = buildContentItemPayload(
      formValues(authored({ mergeKeys: ["AB_C", "BC_A"], explanation: "ملاحظة" })),
    ).mechanicPayload as DistributedInformationPayload;

    const restored = toDistributedFormState(payload);

    expect(restored.enabled).toBe(true);
    expect(restored.publicPromptAr).toBe("من هو اللاعب؟");
    expect(restored.segments.map((segment) => segment.contentAr)).toEqual([
      "لعب في إسبانيا",
      "كرة ذهبية واحدة",
      "اعتزل 2019",
    ]);
    expect(restored.mergeKeys).toEqual(["AB_C", "BC_A"]);
    expect(restored.safetyConfirmed).toBe(true);
    expect(restored.explanation).toBe("ملاحظة");
  });

  it("ignores an item that is not distributed-information content", () => {
    expect(toDistributedFormState(undefined).enabled).toBe(false);
  });
});

describe("ركّبها readiness errors in Arabic", () => {
  it("accepts a complete item", () => {
    expect(findDistributedProblems(formValues(authored()))).toEqual([]);
  });

  it("blocks ready without a safe merge", () => {
    expect(
      findDistributedProblems(formValues(authored({ mergeKeys: [] }))),
    ).toContain("اختر توزيعاً آمناً واحداً على الأقل لفريق من لاعبين.");
  });

  it("blocks ready without the safety confirmation", () => {
    expect(
      findDistributedProblems(formValues(authored({ safetyConfirmed: false }))),
    ).toContain("أكّد أنك راجعت التوزيع قبل جعل العنصر جاهزاً.");
    // A draft may still be mid-authoring.
    expect(
      findDistributedProblems(
        formValues(authored({ safetyConfirmed: false }), { status: "draft" }),
      ),
    ).not.toContain("أكّد أنك راجعت التوزيع قبل جعل العنصر جاهزاً.");
  });

  it("requires the public prompt and all three segments", () => {
    expect(
      findDistributedProblems(formValues(authored({ publicPromptAr: " " }))),
    ).toContain("السؤال العام مطلوب، ويراه كل أفراد الفريق.");
    expect(
      findDistributedProblems(
        formValues(
          authored({
            segments: authored().segments.map((segment) =>
              segment.id === "B" ? { ...segment, contentAr: "" } : segment,
            ),
          }),
        ),
      ),
    ).toContain("اكتب محتوى المعلومات الثلاث (أ، ب، ج).");
  });

  it("rejects an answer mode the mechanic cannot resolve", () => {
    const values = formValues(authored());
    expect(
      findDistributedProblems({
        ...values,
        answer: { ...values.answer, mode: "vote" },
      }),
    ).toContain(
      "طريقة الإجابة يجب أن تكون نصاً قصيراً أو رقماً أو اختياراً من متعدد.",
    );
  });
});

describe("ركّبها authoring UI", () => {
  it("offers three fixed segment builders and the three safe splits", () => {
    render(<Harness initial={authored()} />);

    for (const label of ["المعلومة أ", "المعلومة ب", "المعلومة ج"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    for (const split of ["A+B | C", "A+C | B", "B+C | A"]) {
      expect(screen.getByLabelText(split)).toBeTruthy();
    }
    expect(screen.getByLabelText(DISTRIBUTED_SAFETY_CONFIRMATION)).toBeTruthy();
  });

  it("previews one segment per phone for a three-player team", () => {
    render(<Harness initial={authored()} />);

    const phones = screen.getAllByRole("listitem", { name: undefined });
    expect(
      document.querySelectorAll("[data-preview-phone]"),
    ).toHaveLength(3);
    expect(phones.length).toBeGreaterThan(0);
    const first = document.querySelector('[data-preview-phone="1"]')!;
    expect(within(first as HTMLElement).getByText("لعب في إسبانيا")).toBeTruthy();
    // Only the answerer's phone shows an input affordance.
    expect(
      within(first as HTMLElement).getByText("أنت المجيب في هذا اللغز"),
    ).toBeTruthy();
    const second = document.querySelector('[data-preview-phone="2"]')!;
    expect(
      within(second as HTMLElement).getByText("ناقش معلوماتك مع فريقك"),
    ).toBeTruthy();
  });

  it("previews the selected 2+1 merge for a two-player team", async () => {
    const user = userEvent.setup();
    render(<Harness initial={authored()} />);

    await user.click(screen.getByRole("button", { name: "فريق من لاعبين" }));

    const phones = document.querySelectorAll("[data-preview-phone]");
    expect(phones).toHaveLength(2);
    const first = phones[0] as HTMLElement;
    // A+C on one phone, B on the other.
    expect(within(first).getByText("لعب في إسبانيا")).toBeTruthy();
    expect(within(first).getByText("اعتزل 2019")).toBeTruthy();
    expect(
      within(phones[1] as HTMLElement).getByText("كرة ذهبية واحدة"),
    ).toBeTruthy();
  });

  it("never shows the correct answer in a preview", () => {
    render(<Harness initial={authored()} />);
    expect(document.body.textContent).not.toContain("ميسي");
  });

  it("asks for a split before it can preview a two-player team", async () => {
    const user = userEvent.setup();
    render(<Harness initial={authored({ mergeKeys: [] })} />);

    await user.click(screen.getByRole("button", { name: "فريق من لاعبين" }));

    expect(
      screen.getByText("اختر توزيعاً آمناً لعرض معاينة فريق من لاعبين."),
    ).toBeTruthy();
  });

  it("lets an author toggle a split on and off", async () => {
    const user = userEvent.setup();
    render(<Harness initial={authored({ mergeKeys: [] })} />);

    await user.click(screen.getByLabelText("A+B | C"));
    expect(screen.getByLabelText("A+B | C")).toBeChecked();

    await user.click(screen.getByLabelText("A+B | C"));
    expect(screen.getByLabelText("A+B | C")).not.toBeChecked();
  });
});
