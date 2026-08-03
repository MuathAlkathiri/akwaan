import { describe, expect, it } from "vitest";

import {
  buildChallengeTypePayload,
  buildConfigurationPayload,
  buildScopePayload,
  buildWorldPayload,
  EMPTY_PRESENTATION,
} from "@/features/world-management/services/world-content-forms";
import {
  buildAnswerPayload,
  buildContentItemPayload,
  emptyAnswerState,
  emptyContentItemForm,
  findLocalFormProblems,
  toContentItemForm,
} from "@/features/world-management/services/content-item-form.service";
import {
  describeIssues,
  extractIssues,
  getReadinessLabel,
  getReadinessTone,
  localizeReadinessIssue,
} from "@/features/world-management/utils/readiness.util";
import { presentWorldReadiness } from "@/features/world-management/utils/world-readiness.presenter";
import { adminNavigation } from "@/config/admin-navigation";
import type { ContentItem, World } from "@/features/world-management/types";

describe("World Management admin navigation", () => {
  it("points at the World Management route and no longer at the old content route", () => {
    const hrefs = adminNavigation.map((entry) => entry.href);
    expect(hrefs).toContain("/admin/worlds");
    expect(hrefs).not.toContain("/admin/content");
  });
});

describe("world and scope payloads", () => {
  it("omits an unset Signature mechanic instead of sending an empty value", () => {
    const payload = buildWorldPayload({
      name: "  Football  ",
      slug: "football",
      status: "draft",
    });
    expect(payload).toMatchObject({ name: "Football", slug: "football" });
    expect("signatureMechanicId" in payload).toBe(false);
  });

  it("carries the World presentation profiles and drops blank ones", () => {
    const payload = buildWorldPayload({
      name: "Anime",
      slug: "anime",
      status: "active",
      signatureMechanicId: "challenge-1",
      soundPack: "anime-opening",
      timerProfile: "  ",
      toneProfile: "playful",
    });
    expect(payload).toMatchObject({
      signatureMechanicId: "challenge-1",
      soundPack: "anime-opening",
      timerProfile: undefined,
      toneProfile: "playful",
    });
  });

  it("sends Scope exclusions as the full replacement list", () => {
    expect(
      buildScopePayload({
        name: "Religious Knowledge",
        slug: "religious-knowledge",
        status: "active",
        excludedChallengeTypeIds: ["relational-1", "split-1"],
      }).excludedChallengeTypeIds,
    ).toEqual(["relational-1", "split-1"]);
  });
});

describe("mechanic and configuration payloads", () => {
  it("never sends exclusivity: the backend derives it from the family", () => {
    const payload = buildChallengeTypePayload({
      name: "Read Your Opponent",
      slug: "read-your-opponent",
      family: "ryo",
      itemStructure: "discrete_triple",
      answerMode: "ryo",
      scoringRuleId: "ryo.payoff-matrix",
      status: "active",
      defaultPresentation: EMPTY_PRESENTATION,
    });
    expect("isExclusive" in payload).toBe(false);
    // Media never appears on a mechanic.
    expect(Object.keys(payload.defaultPresentation)).not.toContain("mediaType");
    expect(payload.scoringRuleId).toBe("ryo.payoff-matrix");
  });

  it("assigns a mechanic to a board position and nothing else", () => {
    // Timing, input, reveal, and name belong to the mechanic; media belongs to
    // the ContentItem. Assignment carries none of them.
    const values = {
      challengeTypeId: "challenge-1",
      slotKey: "ryo_2" as const,
      sortOrder: 3,
      isEnabled: true,
    };
    expect(buildConfigurationPayload(values)).toEqual({
      challengeTypeId: "challenge-1",
      slotKey: "ryo_2",
      sortOrder: 3,
      isEnabled: true,
    });
    // The mechanic is immutable once assigned.
    expect("challengeTypeId" in buildConfigurationPayload(values, true)).toBe(
      false,
    );
  });

  it("lets the same canonical mechanic fill both RYO positions", () => {
    const first = buildConfigurationPayload({
      challengeTypeId: "ryo",
      slotKey: "ryo_1",
      sortOrder: 1,
      isEnabled: true,
    });
    const second = buildConfigurationPayload({
      challengeTypeId: "ryo",
      slotKey: "ryo_2",
      sortOrder: 2,
      isEnabled: true,
    });
    expect(first.challengeTypeId).toBe(second.challengeTypeId);
    expect(first.slotKey).not.toBe(second.slotKey);
  });
});

describe("content item answer payloads", () => {
  it("builds a multiple-choice payload with its correct option", () => {
    const answer = emptyAnswerState("multiple_choice");
    answer.options = [
      { id: "france", label: "فرنسا" },
      { id: "croatia", label: "كرواتيا" },
    ];
    answer.correctOptionId = "france";
    expect(buildAnswerPayload(answer)).toEqual({
      mode: "multiple_choice",
      options: [
        { id: "france", label: { ar: "فرنسا" } },
        { id: "croatia", label: { ar: "كرواتيا" } },
      ],
      correctOptionId: "france",
    });
  });

  it("splits accepted answers by line and drops blanks", () => {
    const answer = emptyAnswerState("match");
    answer.acceptedAnswers = "الأهلي\n\n  الهلال  \n";
    expect(buildAnswerPayload(answer)).toEqual({
      mode: "match",
      acceptedAnswers: ["الأهلي", "الهلال"],
    });
  });

  it("keeps closest-mode tolerance optional", () => {
    const answer = emptyAnswerState("closest");
    answer.correctValue = "1998";
    expect(buildAnswerPayload(answer)).toEqual({
      mode: "closest",
      correctValue: 1998,
    });
    answer.acceptedTolerance = "3";
    expect(buildAnswerPayload(answer)).toMatchObject({ acceptedTolerance: 3 });
  });

  it("builds an RYO payload as multiple choice or a numeric estimate, never open text", () => {
    const withOptions = emptyAnswerState("ryo");
    withOptions.options = [
      { id: "a", label: "١٩٩٨" },
      { id: "b", label: "٢٠٠٢" },
    ];
    withOptions.correctOptionId = "a";
    expect(buildAnswerPayload(withOptions)).toMatchObject({
      mode: "ryo",
      correctOptionId: "a",
    });

    const numeric = emptyAnswerState("ryo");
    numeric.options = [];
    numeric.correctValue = "42";
    expect(buildAnswerPayload(numeric)).toEqual({
      mode: "ryo",
      options: null,
      correctValue: 42,
    });
  });

  it("keeps split fragments seat-addressed", () => {
    const answer = emptyAnswerState("split");
    answer.fragments = [
      { seat: 1, clue: "النصف الأول" },
      { seat: 2, clue: "النصف الثاني" },
    ];
    answer.acceptedAnswers = "ميسي";
    expect(buildAnswerPayload(answer)).toEqual({
      mode: "split",
      splitPayload: {
        fragments: [
          { seat: 1, clue: { ar: "النصف الأول" } },
          { seat: 2, clue: { ar: "النصف الثاني" } },
        ],
      },
      acceptedAnswers: ["ميسي"],
    });
  });

  it("builds one poison-deck ContentItem with 14 classified cards", () => {
    const values = emptyContentItemForm("scope-1");
    values.promptAr = "أفضل عشرة";
    values.compatibleChallengeTypeIds = ["top-10"];
    values.answer.mode = "top_10";
    values.top10.variant = "poison-deck";
    values.top10.title = "أفضل عشرة هدافين";
    values.top10.rankingBasis = "عدد الأهداف الرسمية";
    values.top10.sourceLabel = "الاتحاد الرسمي";
    values.top10.cards = values.top10.cards.map((card, index) => ({
      ...card,
      label: `لاعب ${index + 1}`,
    }));
    const payload = buildContentItemPayload(values);
    expect(payload.answerPayload).toEqual({ mode: "top_10" });
    expect(payload.mechanicPayload).toMatchObject({
      variant: "poison-deck",
      title: "أفضل عشرة هدافين",
      candidates: expect.arrayContaining([
        expect.objectContaining({ id: "card-1", label: "لاعب 1" }),
      ]),
    });
    expect(payload.mechanicPayload).toEqual(
      expect.objectContaining({
        candidates: expect.any(Array),
        rankedAnswer: expect.any(Array),
        decoyCandidateIds: expect.any(Array),
      }),
    );
    const mechanic = payload.mechanicPayload as {
      candidates: unknown[];
      rankedAnswer: unknown[];
      decoyCandidateIds: unknown[];
    };
    expect(mechanic.candidates).toHaveLength(14);
    expect(mechanic.rankedAnswer).toHaveLength(10);
    expect(mechanic.decoyCandidateIds).toHaveLength(4);
  });

  it("omits media entirely when the item has none", () => {
    const values = emptyContentItemForm("scope-1");
    values.promptAr = "سؤال";
    values.compatibleChallengeTypeIds = ["challenge-1"];
    const payload = buildContentItemPayload(values);
    expect("media" in payload).toBe(false);
    // The World is derived from the Scope server-side, so it is never sent.
    expect("worldId" in payload).toBe(false);
  });

  it("never sends legacy point or difficulty fields", () => {
    const values = emptyContentItemForm("scope-1");
    values.promptAr = "سؤال";
    values.compatibleChallengeTypeIds = ["challenge-1"];
    const serialized = JSON.stringify(buildContentItemPayload(values));
    expect(serialized).not.toMatch(
      /points|difficulty|correctAnswer|hostDecision/,
    );
  });

  it("reports the presence checks the form needs before the server replies", () => {
    expect(findLocalFormProblems(emptyContentItemForm("scope-1"))).toHaveLength(
      2,
    );
    const values = emptyContentItemForm("scope-1");
    values.promptAr = "سؤال";
    values.compatibleChallengeTypeIds = ["challenge-1"];
    expect(findLocalFormProblems(values)).toEqual([]);
  });

  it("round-trips an existing item back into form state", () => {
    const item = {
      id: "content-1",
      scopeId: "scope-1",
      worldId: "world-1",
      prompt: { ar: "سؤال", en: "Question" },
      compatibleChallengeTypeIds: ["challenge-1"],
      answerPayload: {
        mode: "match" as const,
        acceptedAnswers: ["الأهلي", "الهلال"],
      },
      isReusableAcrossSessions: true,
      status: "ready" as const,
      readiness: { readiness: "ready" as const, blockers: [], warnings: [] },
      compatibleFamilies: ["relational" as const],
      isSessionReuseExempt: true,
    } as ContentItem;
    const form = toContentItemForm(item);
    expect(form.answer.mode).toBe("match");
    expect(form.answer.acceptedAnswers).toBe("الأهلي\nالهلال");
    expect(form.isReusableAcrossSessions).toBe(true);
  });
});

describe("readiness presentation", () => {
  it("maps each readiness level to a label and tone", () => {
    expect(getReadinessLabel("ready")).toBe("جاهز");
    expect(getReadinessTone("not_ready")).toBe("danger");
    expect(getReadinessTone("limited")).toBe("warning");
  });

  it("surfaces every domain issue returned by a failed save", () => {
    const error = {
      response: {
        data: {
          code: "WORLD_CONTENT_VALIDATION_FAILED",
          issues: [
            { code: "BOARD_SLOT_COUNT_MISMATCH", message: "اللوحة ناقصة" },
            { code: "SIGNATURE_MECHANIC_NOT_SET", message: "لا توقيع" },
            { notAnIssue: true },
          ],
        },
      },
    };
    expect(describeIssues(extractIssues(error))).toEqual([
      "أكمل تحديات اللوحة الأربعة.",
      "اختر تحديًا خاصًا يميّز هذا العالم.",
    ]);
    expect(extractIssues(new Error("network"))).toEqual([]);
  });

  it("never exposes a raw backend validation message", () => {
    expect(
      localizeReadinessIssue({
        code: "UNMAPPED_DOMAIN_RULE",
        message: "A World board must contain exactly 2 ryo slots, found 1",
      }),
    ).toBe("راجع هذا القسم وأكمل المعلومات المطلوبة.");
  });

  it("builds a grouped six-step guide from backend readiness evidence", () => {
    const world = {
      id: "world-1",
      name: "عالم",
      slug: "world",
      status: "draft",
      sortOrder: 0,
      scopeCount: 2,
      challengeConfigurationCount: 1,
      contentItemCount: 0,
      readiness: {
        readiness: "not_ready",
        blockers: [
          { code: "BOARD_SLOT_COUNT_MISMATCH", message: "raw board" },
          { code: "CHALLENGE_WITHOUT_READY_CONTENT", message: "raw content" },
        ],
        warnings: [],
        boardReady: false,
        hasRelationalFlexSlot: false,
        scopeCompatibility: [],
        board: {
          worldId: "world-1",
          blockers: [],
          warnings: [],
          slots: [{ slotKey: "ryo_1" }],
        },
      },
    } as unknown as World;
    const view = presentWorldReadiness(world);
    expect(view.total).toBe(6);
    expect(view.complete).toBe(2);
    expect(view.items.find((item) => item.id === "ryo-1")?.complete).toBe(true);
    expect(view.items.find((item) => item.id === "ryo-2")).toMatchObject({
      complete: false,
      actionTarget: "board",
    });
    expect(view.items.find((item) => item.id === "content")).toMatchObject({
      complete: false,
      actionTarget: "content",
    });
  });
});
