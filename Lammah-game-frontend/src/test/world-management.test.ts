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
  describeBlockingReferences,
  describeIssues,
  extractBlockingReferences,
  extractIssues,
  toReadinessChecklist,
  getReadinessLabel,
  getReadinessTone,
  localizeReadinessIssue,
} from "@/features/world-management/utils/readiness.util";
import { presentWorldReadiness } from "@/features/world-management/utils/world-readiness.presenter";
import {
  ANSWER_MODE_LABEL,
  worldChallengeConfigurationName,
} from "@/features/world-management/utils/world-content.labels";
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
  it("builds a World without a mechanic-specific board reference", () => {
    const payload = buildWorldPayload({
      name: "  Football  ",
      slug: "football",
      status: "draft",
    });
    expect(payload).toMatchObject({ name: "Football", slug: "football" });
    expect(Object.keys(payload)).not.toContain("signatureMechanicId");
  });

  it("carries the World presentation profiles and drops blank ones", () => {
    const payload = buildWorldPayload({
      name: "Anime",
      slug: "anime",
      status: "active",
      soundPack: "anime-opening",
      timerProfile: "  ",
      toneProfile: "playful",
    });
    expect(payload).toMatchObject({
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
  it("presents the server-provided One Clue wrapper with its product label", () => {
    expect(ANSWER_MODE_LABEL.one_clue).toBe("بدليل واحد");
  });

  it("serializes One Clue with the implemented generic Match winner rule", () => {
    expect(
      buildChallengeTypePayload({
        name: "بدليل واحد",
        slug: "one-clue",
        family: "coop",
        itemStructure: "discrete_triple",
        answerMode: "one_clue",
        scoringRuleId: "challenge.win",
        status: "active",
        defaultPresentation: {
          inputType: "phone-text",
          timerSeconds: 7,
        },
      }),
    ).toMatchObject({
      slug: "one-clue",
      answerMode: "one_clue",
      scoringRuleId: "challenge.win",
    });
  });
  it("falls back to the global mechanic name when no World name is configured", () => {
    const configuration = {
      effectiveName: "",
      displayName: undefined,
      challengeType: { name: "Read Your Opponent" },
    } as Parameters<typeof worldChallengeConfigurationName>[0];

    expect(worldChallengeConfigurationName(configuration)).toBe(
      "Read Your Opponent",
    );
  });

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

  it("assigns a mechanic and presentation copy to a generic position", () => {
    const values = {
      challengeTypeId: "challenge-1",
      slotKey: "slot_3" as const,
      displayName: "مين أقرب",
      description: "وصف كرة القدم",
      instructions: "اختر الإجابة الأقرب",
      sortOrder: 3,
      isEnabled: true,
    };
    expect(buildConfigurationPayload(values)).toEqual({
      challengeTypeId: "challenge-1",
      slotKey: "slot_3",
      displayName: "مين أقرب",
      description: "وصف كرة القدم",
      instructions: "اختر الإجابة الأقرب",
      sortOrder: 3,
      isEnabled: true,
    });
    expect(buildConfigurationPayload(values, true).challengeTypeId).toBe(
      "challenge-1",
    );
  });

  it("keeps generic positions independent of mechanic identity", () => {
    const first = buildConfigurationPayload({
      challengeTypeId: "ryo",
      slotKey: "slot_2",
      sortOrder: 1,
      isEnabled: true,
    });
    const second = buildConfigurationPayload({
      challengeTypeId: "top-5",
      slotKey: "slot_3",
      sortOrder: 2,
      isEnabled: true,
    });
    expect(first.challengeTypeId).not.toBe(second.challengeTypeId);
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

  it("builds one Top 5 ContentItem with ten classified entries", () => {
    const values = emptyContentItemForm("scope-1");
    values.promptAr = "أفضل 5";
    values.compatibleChallengeTypeIds = ["top-5"];
    values.answer.mode = "top_5";
    values.top5.title = "أفضل 5 هدافين";
    values.top5.instruction = "احتفظ بها أو دسّها للخصم";
    values.top5.rankingBasis = "عدد الأهداف الرسمية";
    values.top5.sourceLabel = "الاتحاد الرسمي";
    values.top5.sourceUrl = "https://example.com/ranking";
    values.top5.asOfDate = "2026-08-04";
    values.top5.entries = values.top5.entries.map((entry, index) => ({
      ...entry,
      label: `لاعب ${index + 1}`,
    }));
    const payload = buildContentItemPayload(values);
    expect(payload.answerPayload).toEqual({ mode: "top_5" });
    expect(payload.mechanicPayload).toMatchObject({
      variant: "keep-or-give",
      title: "أفضل 5 هدافين",
      instruction: "احتفظ بها أو دسّها للخصم",
      sourceUrl: "https://example.com/ranking",
      asOfDate: "2026-08-04",
    });
    const mechanic = payload.mechanicPayload as unknown as {
      entries: Array<{ id: string; label: string; rank: number | null }>;
    };
    // Ten entries, and the rank lives on the entry — there is no second array
    // that could disagree about which five are real.
    expect(mechanic.entries).toHaveLength(10);
    expect(
      mechanic.entries.filter((entry) => entry.rank !== null),
    ).toHaveLength(5);
    expect(
      mechanic.entries
        .map((entry) => entry.rank)
        .filter((rank): rank is number => rank !== null)
        .sort((left, right) => left - right),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(
      mechanic.entries.filter((entry) => entry.rank === null),
    ).toHaveLength(5);
    expect(mechanic.entries[0]).toMatchObject({
      id: "entry-1",
      label: "لاعب 1",
    });
    expect(payload).not.toHaveProperty("metadata");
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
            { code: "DUPLICATE_BOARD_CHALLENGE_TYPE", message: "مكرر" },
            { notAnIssue: true },
          ],
        },
      },
    };
    expect(describeIssues(extractIssues(error))).toEqual([
      "أكمل تحديات اللوحة الأربعة.",
      "اختر مكانيكا مختلفة؛ لا يمكن تكرار التحدي داخل العالم نفسه.",
    ]);
    expect(extractIssues(new Error("network"))).toEqual([]);
  });

  it("names the records that block a delete instead of only counting them", () => {
    const error = {
      response: {
        data: {
          code: "WORLD_CONTENT_STILL_REFERENCED",
          message:
            '1 record(s) in "legacy-questions" still reference this challengeType',
          references: [
            {
              source: "legacy-questions",
              id: "6a6e5b519e10fe3b881da12a",
              label: "سؤال بدون نص",
              status: "draft",
            },
          ],
        },
      },
    };

    const references = extractBlockingReferences(error);
    expect(references).toHaveLength(1);
    const described = describeBlockingReferences(references);
    // The admin can find the record: where it lives, what it is, and its id.
    expect(described).toContain("أسئلة قديمة");
    expect(described).toContain("6a6e5b519e10fe3b881da12a");
    expect(described).toContain("draft");
  });

  it("turns a readiness report into an actionable checklist", () => {
    const checks = toReadinessChecklist({
      readiness: "limited",
      blockers: [{ code: "CHALLENGE_TIMER_REQUIRED", message: "timer" }],
      warnings: [
        { code: "SCORING_RULE_AWAITING_MECHANIC", message: "awaiting" },
      ],
    });

    expect(checks.map((check) => check.state)).toEqual(["blocker", "warning"]);
    expect(checks[0].text).toBe("حدّد مدة المؤقّت لهذا التحدي.");
    // The warning that used to fall through to "review this section" now says
    // exactly why the mechanic is not playable.
    expect(checks[1].text).toContain("لم تُبرمج بعد");
    expect(checks[1].text).not.toContain("راجع هذا القسم");
  });

  it("shows one satisfied line when nothing is missing", () => {
    const checks = toReadinessChecklist(
      { readiness: "ready", blockers: [], warnings: [] },
      "جاهزة للاستخدام.",
    );
    expect(checks).toEqual([
      { code: "READY", state: "ok", text: "جاهزة للاستخدام." },
    ]);
  });

  it("still falls back readably for a code it has no copy for", () => {
    const checks = toReadinessChecklist({
      readiness: "not_ready",
      blockers: [{ code: "SOMETHING_BRAND_NEW", message: "x" }],
      warnings: [],
    });
    expect(checks[0].state).toBe("blocker");
    expect(checks[0].text).toBe("راجع هذا القسم وأكمل المعلومات المطلوبة.");
  });

  it("says nothing extra when the server named no records", () => {
    expect(extractBlockingReferences(new Error("boom"))).toEqual([]);
    expect(describeBlockingReferences([])).toBe("");
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
        hasRelationalChallenge: false,
        scopeCompatibility: [],
        board: {
          worldId: "world-1",
          blockers: [],
          warnings: [],
          slots: [{ slotKey: "slot_1" }],
        },
      },
    } as unknown as World;
    const view = presentWorldReadiness(world);
    expect(view.total).toBe(6);
    expect(view.complete).toBe(2);
    expect(view.items.find((item) => item.id === "slot-1")?.complete).toBe(
      true,
    );
    expect(view.items.find((item) => item.id === "slot-2")).toMatchObject({
      complete: false,
      actionTarget: "board",
    });
    expect(view.items.find((item) => item.id === "content")).toMatchObject({
      complete: false,
      actionTarget: "content",
    });
  });
});
