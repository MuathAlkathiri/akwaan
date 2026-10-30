import { describe, expect, it } from "vitest";
import {
  hasIncompleteHistoricalVerification,
  hasPotentialOverlap,
  hasProvenDuplicate,
  parseDeduplicationMatch,
  summarizeDeduplication,
  translateReasonToAr,
} from "@/features/content-engine-review/deduplication-findings";

describe("Deduplication Findings Helper & Parser", () => {
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

  it("summarizes potential overlap state without blocking approval", () => {
    const summary = summarizeDeduplication([
      {
        code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT",
        severity: "warning",
        message: "Potential overlap with CANONICAL_READY item item-99: Identical answer for the same subject and property relationship",
      },
    ]);

    expect(summary.category).toBe("potential_overlap");
    expect(summary.statusLabelAr).toBe("شبهة تقاطع أو تشابه — يتطلب مراجعة بشرية");
    expect(summary.isApprovalBlocked).toBe(false);
    expect(summary.hasPotentialOverlap).toBe(true);
    expect(summary.matches).toHaveLength(1);
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
