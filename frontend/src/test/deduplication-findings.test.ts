import { describe, expect, it } from "vitest";
import {
  hasIncompleteHistoricalVerification,
  hasPotentialOverlap,
  hasProvenDuplicate,
  overlapRequirementsFromFindings,
  overlapRequirementsFromServer,
  parseDeduplicationMatch,
  summarizeDeduplication,
  translateReasonToAr,
} from "@/features/content-engine-review/deduplication-findings";

describe("Deduplication Findings Helper & Parser", () => {
  it("distinguishes inconclusive subjective comparison from a clean result", () => {
    const summary = summarizeDeduplication([{ code: "SUBJECTIVE_COMPARISON_INCONCLUSIVE", severity: "deferred", message: "inconclusive" }]);
    expect(summary.category).toBe("inconclusive");
    expect(summary.isApprovalBlocked).toBe(false);
    expect(summary.statusDescriptionAr).toContain("لم تكن حاسمة");
  });
  it("detects proven duplicates correctly", () => {
    expect(
      hasProvenDuplicate([
        {
          code: "DUPLICATE_HISTORICAL_CONTENT",
          severity: "blocking",
          message: "Duplicate of CANONICAL_READY item item-cairo: Identical factual task",
        },
      ]),
    ).toBe(true);

    expect(
      hasProvenDuplicate([
        {
          code: "DUPLICATE_IN_BATCH",
          severity: "blocking",
          message: "another candidate asks the same thing",
        },
      ]),
    ).toBe(true);

    expect(
      hasProvenDuplicate([
        {
          code: "CONFLICTING_ANSWER_KEY_IN_BATCH",
          severity: "blocking",
          message: "another candidate offers this same puzzle with a different correct answer",
        },
      ]),
    ).toBe(true);

    expect(
      hasProvenDuplicate([
        {
          code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT",
          severity: "warning",
          message: "overlap",
        },
      ]),
    ).toBe(false);

    expect(hasProvenDuplicate([])).toBe(false);
  });

  it("detects incomplete historical verification correctly", () => {
    expect(
      hasIncompleteHistoricalVerification([
        {
          code: "HISTORICAL_INVENTORY_UNAVAILABLE",
          severity: "warning",
          message: "retrieval failed",
        },
      ]),
    ).toBe(true);

    expect(
      hasIncompleteHistoricalVerification([
        {
          code: "HISTORICAL_INVENTORY_PARTIAL",
          severity: "warning",
          message: "truncated at 1000",
        },
      ]),
    ).toBe(true);

    expect(
      hasIncompleteHistoricalVerification([
        {
          code: "HISTORICAL_INVENTORY_NOT_CONFIGURED",
          severity: "warning",
          message: "scope not found",
        },
      ]),
    ).toBe(true);

    expect(hasIncompleteHistoricalVerification([])).toBe(false);
  });

  it("detects potential overlap correctly", () => {
    expect(
      hasPotentialOverlap([
        {
          code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT",
          severity: "warning",
          message: "potential overlap",
        },
      ]),
    ).toBe(true);

    expect(
      hasPotentialOverlap([
        {
          code: "CROSS_SCOPE_ADVISORY",
          severity: "warning",
          message: "match in external scope",
        },
      ]),
    ).toBe(true);

    expect(hasPotentialOverlap([])).toBe(false);
  });

  it("parses historical READY duplicate finding with reference ID and translated reason", () => {
    const finding = {
      code: "DUPLICATE_HISTORICAL_CONTENT",
      severity: "blocking",
      message:
        "Duplicate of CANONICAL_READY item item-cairo: Identical factual task and correct answer; distractor variation does not create a new gameplay task.",
    };

    const parsed = parseDeduplicationMatch(finding);
    expect(parsed.category).toBe("proven_duplicate");
    expect(parsed.sourceType).toBe("canonical_ready");
    expect(parsed.sourceLabelAr).toBe("محتوى جاهز معتمد (READY)");
    expect(parsed.referenceId).toBe("item-cairo");
    expect(parsed.reasonAr).toContain("تطابق تام في المهمة المعرفية والإجابة الصحيحة");
  });

  it("parses cross-scope advisory with external scope key", () => {
    const finding = {
      code: "CROSS_SCOPE_ADVISORY",
      severity: "warning",
      message: "Cross-Scope match with item-paris (world-capitals): Similar subject",
    };

    const parsed = parseDeduplicationMatch(finding);
    expect(parsed.category).toBe("potential_overlap");
    expect(parsed.sourceType).toBe("cross_scope");
    expect(parsed.sourceLabelAr).toBe("نطاق آخر (Cross-Scope Advisory)");
    expect(parsed.referenceId).toBe("item-paris");
    expect(parsed.scopeKey).toBe("world-capitals");
  });

  it("parses in-batch duplicate finding", () => {
    const finding = {
      code: "DUPLICATE_IN_BATCH",
      severity: "blocking",
      message: "another candidate asks the same thing",
    };

    const parsed = parseDeduplicationMatch(finding);
    expect(parsed.category).toBe("proven_duplicate");
    expect(parsed.sourceType).toBe("current_batch");
    expect(parsed.sourceLabelAr).toBe("الدفعة الحالية (In-Batch)");
    expect(parsed.reasonAr).toContain("مرشح آخر في الدفعة الحالية");
  });

  it("translates known comparison reason strings into clean Arabic", () => {
    expect(
      translateReasonToAr(
        "Identical factual task and correct answer; distractor variation does not create a new gameplay task",
      ),
    ).toBe(
      "تطابق تام في المهمة المعرفية والإجابة الصحيحة؛ اختلاف الخيارات المشتتة لا ينشئ تحدياً جديداً.",
    );

    expect(translateReasonToAr("custom reason")).toBe("custom reason");
  });

  it("summarizes proven duplicate state with blocking approval", () => {
    const summary = summarizeDeduplication([
      {
        code: "DUPLICATE_HISTORICAL_CONTENT",
        severity: "blocking",
        message: "Duplicate of CANONICAL_READY item 65b123: Identical prompt text and correct answer",
      },
    ]);

    expect(summary.category).toBe("proven_duplicate");
    expect(summary.statusLabelAr).toBe("تكرار مثبت — الاعتماد محظور");
    expect(summary.isApprovalBlocked).toBe(true);
    expect(summary.hasProvenDuplicate).toBe(true);
    expect(summary.matches).toHaveLength(1);
    expect(summary.matches[0].referenceId).toBe("65b123");
  });

  it("summarizes incomplete historical verification state with blocking approval", () => {
    const summary = summarizeDeduplication([
      {
        code: "HISTORICAL_INVENTORY_UNAVAILABLE",
        severity: "warning",
        message: "Historical scope inventory could not be verified",
      },
    ]);

    expect(summary.category).toBe("incomplete_verification");
    expect(summary.statusLabelAr).toBe("تحقق تاريخي غير مكتمل — الاعتماد محظور");
    expect(summary.isApprovalBlocked).toBe(true);
    expect(summary.isIncomplete).toBe(true);
    expect(summary.incompleteFindings).toHaveLength(1);
  });

  it("summarizes a fingerprinted potential overlap as requiring explicit acknowledgment", () => {
    const summary = summarizeDeduplication([
      {
        code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT",
        severity: "warning",
        message: "Potential overlap with CANONICAL_READY item item-99: Identical answer for the same subject and property relationship",
        fingerprint: `ovl1:${"a".repeat(64)}`,
        evidence: {
          candidateContentHash: "c".repeat(64),
          reasonCode: "SAME_TARGET",
          reference: { kind: "CANONICAL_READY", id: "item-99", contentHash: "r".repeat(64) },
        },
      },
    ]);

    expect(summary.category).toBe("potential_overlap");
    expect(summary.statusLabelAr).toBe("شبهة تقاطع — تتطلب إقراراً صريحاً من المراجع");
    expect(summary.isApprovalBlocked).toBe(false);
    expect(summary.requiresAcknowledgment).toBe(true);
    expect(summary.hasPotentialOverlap).toBe(true);
    expect(summary.matches).toHaveLength(1);
    expect(summary.matches[0].referenceId).toBe("item-99");
  });

  it("summarizes an overlap without a stable reference as unverifiable and blocked", () => {
    const summary = summarizeDeduplication([
      {
        code: "POTENTIAL_OVERLAP_IN_BATCH",
        severity: "warning",
        message: "another candidate in this batch potentially overlaps",
      },
    ]);
    expect(summary.statusLabelAr).toBe("شبهة تقاطع غير قابلة للتحقق — الاعتماد محظور");
    expect(summary.isApprovalBlocked).toBe(true);
    expect(summary.hasUnverifiableOverlap).toBe(true);
    expect(summary.requiresAcknowledgment).toBe(false);
  });

  it("treats a cross-Scope advisory as informational, not an acknowledgment requirement", () => {
    const summary = summarizeDeduplication([
      { code: "CROSS_SCOPE_ADVISORY", severity: "warning", message: "match in external scope" },
    ]);
    expect(summary.requiresAcknowledgment).toBe(false);
    expect(summary.isApprovalBlocked).toBe(false);
    expect(summary.statusLabelAr).toBe("تنبيه تقاطع مع نطاق آخر — للاطلاع");
  });

  it("only accepts well-formed server fingerprints with a stable reference", () => {
    const fp = `ovl1:${"b".repeat(64)}`;
    const ref = { kind: "BATCH_CANDIDATE", id: "sib-1", contentHash: "x" };
    const { required, unverifiable } = overlapRequirementsFromFindings([
      { code: "POTENTIAL_OVERLAP_IN_BATCH", severity: "warning", message: "m", fingerprint: fp, evidence: { reference: ref } },
      { code: "POTENTIAL_OVERLAP_IN_BATCH", severity: "warning", message: "m", fingerprint: "ovl1:short", evidence: { reference: ref } },
      { code: "POTENTIAL_OVERLAP_HISTORICAL_DRAFT", severity: "warning", message: "m", fingerprint: fp.replace("b", "c") },
    ]);
    expect(required.map((r) => r.fingerprint)).toEqual([fp]);
    expect(required[0]).toMatchObject({ referenceKind: "BATCH_CANDIDATE", referenceId: "sib-1" });
    expect(unverifiable).toHaveLength(2);
    expect(
      overlapRequirementsFromServer([
        { fingerprint: fp, code: "POTENTIAL_OVERLAP_IN_BATCH", reasonCode: null, reference: ref },
        { fingerprint: "bogus", code: "X", reference: ref },
      ]).map((r) => r.fingerprint),
    ).toEqual([fp]);
  });

  it("summarizes clean state without claiming absolute global uniqueness", () => {
    const summary = summarizeDeduplication([]);

    expect(summary.category).toBe("clean");
    expect(summary.statusLabelAr).toBe("لم يتم رصد تكرار ضمن النطاق المفحوص");
    expect(summary.statusDescriptionAr).toContain("ضمن النطاق المفحوص");
    expect(summary.statusDescriptionAr).not.toContain("فريد تماماً ومطلقاً");
    expect(summary.isApprovalBlocked).toBe(false);
  });
});

describe("Deduplication list badge and mixed findings", () => {
  const FP = `ovl1:${"a".repeat(64)}`;
  const inconclusive = {
    code: "SUBJECTIVE_COMPARISON_INCONCLUSIVE",
    severity: "deferred",
    message: "Some subjective comparisons could not be conclusively evaluated; no actionable overlap was established.",
  };
  const factualPending = {
    code: "FACTUAL_VERIFICATION_PENDING",
    severity: "deferred",
    message: "claims are verified in Phase 1c",
  };
  const overlap = {
    code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT",
    severity: "warning",
    message: "Potential overlap with CANONICAL_READY item item-a: Same target answer",
    fingerprint: FP,
    evidence: {
      candidateContentHash: "c".repeat(64),
      reasonCode: "UNCERTAIN_FACTUAL_RELATIONSHIP",
      reference: { kind: "CANONICAL_READY", id: "item-a", contentHash: "r".repeat(64) },
    },
  };

  it("labels an inconclusive-only candidate neutrally, never as a potential overlap", () => {
    const summary = summarizeDeduplication([inconclusive, factualPending]);
    expect(summary.category).toBe("inconclusive");
    expect(summary.listBadge?.labelAr).toBe("مقارنة غير حاسمة");
    expect(summary.listBadge?.labelAr).not.toBe("شبهة تقاطع");
    expect(summary.listBadge?.className).toContain("slate");
    expect(summary.listBadge?.className).not.toContain("amber");
    expect(summary.requiresAcknowledgment).toBe(false);
    expect(summary.isApprovalBlocked).toBe(false);
  });

  it("treats the batch-level inconclusive code the same way", () => {
    const summary = summarizeDeduplication([
      { code: "SUBJECTIVE_BATCH_COMPARISON_INCONCLUSIVE", severity: "deferred", message: "batch" },
    ]);
    expect(summary.category).toBe("inconclusive");
    expect(summary.listBadge?.labelAr).toBe("مقارنة غير حاسمة");
  });

  it("labels an acknowledgeable overlap as a potential overlap", () => {
    const summary = summarizeDeduplication([overlap]);
    expect(summary.listBadge?.labelAr).toBe("شبهة تقاطع");
    expect(summary.requiresAcknowledgment).toBe(true);
  });

  it("labels an unverifiable overlap as a potential overlap", () => {
    const { fingerprint: _omit, ...unverifiable } = overlap;
    const summary = summarizeDeduplication([unverifiable]);
    expect(summary.hasUnverifiableOverlap).toBe(true);
    expect(summary.listBadge?.labelAr).toBe("شبهة تقاطع");
  });

  it("labels proven duplicates and incomplete verification by their blocking category", () => {
    expect(
      summarizeDeduplication([
        { code: "DUPLICATE_IN_BATCH", severity: "blocking", message: "another candidate asks the same thing" },
        inconclusive,
      ]).listBadge?.labelAr,
    ).toBe("تكرار مثبت");
    expect(
      summarizeDeduplication([
        { code: "HISTORICAL_INVENTORY_PARTIAL", severity: "blocking", message: "partial" },
        inconclusive,
      ]).listBadge?.labelAr,
    ).toBe("فحص ناقص");
  });

  it("labels a cross-Scope advisory as informational, not as a potential overlap", () => {
    const summary = summarizeDeduplication([
      { code: "CROSS_SCOPE_ADVISORY", severity: "warning", message: "Cross-Scope match with x (other): similar" },
    ]);
    expect(summary.requiresAcknowledgment).toBe(false);
    expect(summary.listBadge?.labelAr).toBe("تنبيه نطاق آخر");
  });

  it("shows no badge when there is no deduplication concern", () => {
    expect(summarizeDeduplication([factualPending]).listBadge).toBeNull();
    expect(summarizeDeduplication([]).listBadge).toBeNull();
    expect(summarizeDeduplication(null).listBadge).toBeNull();
  });

  it("keeps inconclusive findings visible alongside an actionable overlap", () => {
    const summary = summarizeDeduplication([overlap, inconclusive, factualPending]);
    expect(summary.category).toBe("potential_overlap");
    expect(summary.requiresAcknowledgment).toBe(true);
    expect(summary.hasInconclusiveComparison).toBe(true);
    expect(summary.inconclusiveFindings.map((f) => f.code)).toEqual([
      "SUBJECTIVE_COMPARISON_INCONCLUSIVE",
    ]);
    expect(summary.listBadge?.labelAr).toBe("شبهة تقاطع");
  });

  it("never turns an inconclusive finding into an acknowledgment requirement", () => {
    const { required, unverifiable } = overlapRequirementsFromFindings([
      overlap,
      inconclusive,
      { code: "SUBJECTIVE_BATCH_COMPARISON_INCONCLUSIVE", severity: "deferred", message: "batch" },
    ]);
    expect(required.map((r) => r.fingerprint)).toEqual([FP]);
    expect(unverifiable).toEqual([]);
  });
});
