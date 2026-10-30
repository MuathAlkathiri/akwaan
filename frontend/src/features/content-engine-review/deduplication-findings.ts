export const INCOMPLETE_HISTORICAL_CODES = [
  "HISTORICAL_INVENTORY_PARTIAL",
  "HISTORICAL_INVENTORY_UNAVAILABLE",
  "HISTORICAL_INVENTORY_NOT_CONFIGURED",
  "HISTORICAL_INVENTORY_SCOPE_MISMATCH",
] as const;

export const PROVEN_DUPLICATE_CODES = [
  "DUPLICATE_HISTORICAL_CONTENT",
  "DUPLICATE_HISTORICAL_DRAFT",
  "DUPLICATE_APPROVED_CANDIDATE",
  "DUPLICATE_IN_BATCH",
  "CONFLICTING_ANSWER_KEY_IN_BATCH",
  "DUPLICATE_QUESTION",
  "DUPLICATE_IN_BATCH_EXACT",
] as const;

export const POTENTIAL_OVERLAP_CODES = [
  "POTENTIAL_OVERLAP_HISTORICAL_CONTENT",
  "POTENTIAL_OVERLAP_HISTORICAL_DRAFT",
  "POTENTIAL_OVERLAP_APPROVED_CANDIDATE",
  "POTENTIAL_OVERLAP_IN_BATCH",
  "CROSS_SCOPE_ADVISORY",
] as const;

export type DeduplicationCategory =
  | "proven_duplicate"
  | "potential_overlap"
  | "incomplete_verification"
  | "clean";

export type MatchSourceType =
  | "current_batch"
  | "canonical_ready"
  | "canonical_draft"
  | "approved_candidate"
  | "cross_scope"
  | "unknown";

export interface FindingItem {
  code: string;
  severity: "blocking" | "warning" | "deferred" | string;
  message: string;
}

export interface ParsedDeduplicationMatch {
  code: string;
  category: DeduplicationCategory;
  sourceType: MatchSourceType;
  sourceLabelAr: string;
  referenceId?: string;
  scopeKey?: string;
  reasonAr: string;
  rawMessage: string;
  severity: string;
}

export interface DeduplicationSummary {
  category: DeduplicationCategory;
  statusLabelAr: string;
  statusDescriptionAr: string;
  badgeClass: string;
  isApprovalBlocked: boolean;
  isIncomplete: boolean;
  hasProvenDuplicate: boolean;
  hasPotentialOverlap: boolean;
  matches: ParsedDeduplicationMatch[];
  incompleteFindings: FindingItem[];
}

export function hasIncompleteHistoricalVerification(
  findings?: FindingItem[] | null,
): boolean {
  if (!findings || !Array.isArray(findings)) return false;
  return findings.some((f) =>
    (INCOMPLETE_HISTORICAL_CODES as readonly string[]).includes(f.code),
  );
}

export function hasProvenDuplicate(
  findings?: FindingItem[] | null,
): boolean {
  if (!findings || !Array.isArray(findings)) return false;
  return findings.some((f) =>
    (PROVEN_DUPLICATE_CODES as readonly string[]).includes(f.code),
  );
}

export function hasPotentialOverlap(
  findings?: FindingItem[] | null,
): boolean {
  if (!findings || !Array.isArray(findings)) return false;
  return findings.some((f) =>
    (POTENTIAL_OVERLAP_CODES as readonly string[]).includes(f.code),
  );
}

const KNOWN_REASON_MAP: Record<string, string> = {
  "identical factual task and correct answer; distractor variation does not create a new gameplay task":
    "تطابق تام في المهمة المعرفية والإجابة الصحيحة؛ اختلاف الخيارات المشتتة لا ينشئ تحدياً جديداً.",
  "identical answer for the same subject and property relationship":
    "تطابق في الإجابة لنفس العلاقة والموضوع المعرفي المستهدف.",
  "identical prompt text and correct answer":
    "تطابق تام في نص السؤال والإجابة الصحيحة.",
  "another candidate asks the same thing":
    "مرشح آخر في الدفعة الحالية يطرح نفس التحدي المعرفي.",
  "another candidate offers this same puzzle with a different correct answer":
    "مرشح آخر في الدفعة الحالية يقدم نفس اللغز بإجابة صحيحة متناقضة.",
  "same puzzle with a different correct answer":
    "نفس اللغز بإجابة صحيحة مختلفة.",
};

export function translateReasonToAr(rawReason: string): string {
  const normalized = rawReason.trim().toLowerCase().replace(/\.$/, "");
  for (const [key, translation] of Object.entries(KNOWN_REASON_MAP)) {
    if (normalized.includes(key.toLowerCase())) {
      return translation;
    }
  }
  return rawReason.trim();
}

/**
 * Extracts reference ID, scope, and match explanation safely from finding messages.
 * Never invents evidence; falls back cleanly if message doesn't contain structured data.
 */
export function parseDeduplicationMatch(finding: FindingItem): ParsedDeduplicationMatch {
  const code = finding.code;
  const rawMessage = finding.message || "";
  let category: DeduplicationCategory = "clean";
  let sourceType: MatchSourceType = "unknown";
  let sourceLabelAr = "محتوى غير محدد";

  if ((PROVEN_DUPLICATE_CODES as readonly string[]).includes(code)) {
    category = "proven_duplicate";
    if (code === "DUPLICATE_HISTORICAL_CONTENT") {
      sourceType = "canonical_ready";
      sourceLabelAr = "محتوى جاهز معتمد (READY)";
    } else if (code === "DUPLICATE_HISTORICAL_DRAFT") {
      sourceType = "canonical_draft";
      sourceLabelAr = "مسودة قانونية سابقة (DRAFT)";
    } else if (code === "DUPLICATE_APPROVED_CANDIDATE") {
      sourceType = "approved_candidate";
      sourceLabelAr = "مرشح معتمد سابق (Approved Candidate)";
    } else {
      sourceType = "current_batch";
      sourceLabelAr = "الدفعة الحالية (In-Batch)";
    }
  } else if ((POTENTIAL_OVERLAP_CODES as readonly string[]).includes(code)) {
    category = "potential_overlap";
    if (code === "POTENTIAL_OVERLAP_HISTORICAL_CONTENT") {
      sourceType = "canonical_ready";
      sourceLabelAr = "محتوى جاهز معتمد (READY)";
    } else if (code === "POTENTIAL_OVERLAP_HISTORICAL_DRAFT") {
      sourceType = "canonical_draft";
      sourceLabelAr = "مسودة قانونية سابقة (DRAFT)";
    } else if (code === "POTENTIAL_OVERLAP_APPROVED_CANDIDATE") {
      sourceType = "approved_candidate";
      sourceLabelAr = "مرشح معتمد سابق (Approved Candidate)";
    } else if (code === "CROSS_SCOPE_ADVISORY") {
      sourceType = "cross_scope";
      sourceLabelAr = "نطاق آخر (Cross-Scope Advisory)";
    } else {
      sourceType = "current_batch";
      sourceLabelAr = "الدفعة الحالية (In-Batch Overlap)";
    }
  } else if ((INCOMPLETE_HISTORICAL_CODES as readonly string[]).includes(code)) {
    category = "incomplete_verification";
    sourceType = "unknown";
    sourceLabelAr = "فحص تاريخي غير مكتمل";
  }

  let referenceId: string | undefined;
  let scopeKey: string | undefined;
  let rawReason = rawMessage;

  // Specific structured patterns:
  // "Duplicate of <SOURCE> item <ID>: <EXPLANATION>"
  // "Potential overlap with <SOURCE> item <ID>: <EXPLANATION>"
  const structuredMatch = rawMessage.match(
    /(?:Duplicate of|Potential overlap with)\s+[A-Z_]+\s+item\s+([a-zA-Z0-9_\-\.]+):?\s*(.*)$/i,
  );
  if (structuredMatch) {
    referenceId = structuredMatch[1];
    if (structuredMatch[2]) {
      rawReason = structuredMatch[2];
    }
  } else {
    // Cross-scope pattern: "Cross-Scope match with <ID> (<SCOPE>): <EXPLANATION>"
    const crossMatch = rawMessage.match(
      /match with\s+([a-zA-Z0-9_\-\.]+)\s*\(([^)]+)\):?\s*(.*)$/i,
    );
    if (crossMatch) {
      referenceId = crossMatch[1];
      scopeKey = crossMatch[2];
      if (crossMatch[3]) {
        rawReason = crossMatch[3];
      }
    } else {
      // Batch candidate pattern: "Cross-Scope match with batch candidate <ID>: <EXPLANATION>"
      const batchCandidateMatch = rawMessage.match(
        /batch candidate\s+([a-zA-Z0-9_\-\.]+):?\s*(.*)$/i,
      );
      if (batchCandidateMatch) {
        referenceId = batchCandidateMatch[1];
        if (batchCandidateMatch[2]) {
          rawReason = batchCandidateMatch[2];
        }
      }
    }
  }

  const reasonAr = translateReasonToAr(rawReason);

  return {
    code,
    category,
    sourceType,
    sourceLabelAr,
    referenceId,
    scopeKey,
    reasonAr,
    rawMessage,
    severity: finding.severity,
  };
}

export function summarizeDeduplication(
  findings?: FindingItem[] | null,
): DeduplicationSummary {
  const safeFindings = Array.isArray(findings) ? findings : [];

  const incompleteFindings = safeFindings.filter((f) =>
    (INCOMPLETE_HISTORICAL_CODES as readonly string[]).includes(f.code),
  );
  const duplicateFindings = safeFindings.filter((f) =>
    (PROVEN_DUPLICATE_CODES as readonly string[]).includes(f.code),
  );
  const overlapFindings = safeFindings.filter((f) =>
    (POTENTIAL_OVERLAP_CODES as readonly string[]).includes(f.code),
  );

  const matches = [...duplicateFindings, ...overlapFindings].map(
    parseDeduplicationMatch,
  );

  const hasProven = duplicateFindings.length > 0;
  const isIncomplete = incompleteFindings.length > 0;
  const hasOverlap = overlapFindings.length > 0;

  if (hasProven) {
    return {
      category: "proven_duplicate",
      statusLabelAr: "تكرار مثبت — الاعتماد محظور",
      statusDescriptionAr:
        "تم رصد تطابق تام في الهوية التنافسية أو المعرفية مع محتوى سابق أو مرشح آخر في الدفعة. لا يمكن اعتماد هذا المرشح دون تعديل جوهري.",
      badgeClass: "border-rose-300 bg-rose-100 text-rose-900 font-semibold",
      isApprovalBlocked: true,
      isIncomplete,
      hasProvenDuplicate: true,
      hasPotentialOverlap: hasOverlap,
      matches,
      incompleteFindings,
    };
  }

  if (isIncomplete) {
    return {
      category: "incomplete_verification",
      statusLabelAr: "تحقق تاريخي غير مكتمل — الاعتماد محظور",
      statusDescriptionAr:
        "تعذر استكمال فحص التكرار ضد كامل السجل التاريخي للنطاق. يجب إعادة الفحص بعد توفر سجل النطاق قبل السماح بالاعتماد البشري.",
      badgeClass: "border-orange-300 bg-orange-100 text-orange-900 font-semibold",
      isApprovalBlocked: true,
      isIncomplete: true,
      hasProvenDuplicate: false,
      hasPotentialOverlap: hasOverlap,
      matches,
      incompleteFindings,
    };
  }

  if (hasOverlap) {
    return {
      category: "potential_overlap",
      statusLabelAr: "شبهة تقاطع أو تشابه — يتطلب مراجعة بشرية",
      statusDescriptionAr:
        "يوجد تشابه جزئي أو تقاطع معرفي مع محتوى سابق. الاعتماد غير محظور آلياً لكنه يتطلب عناية المراجع للتأكد من تنوع تجربة اللعب.",
      badgeClass: "border-amber-300 bg-amber-100 text-amber-900 font-semibold",
      isApprovalBlocked: false,
      isIncomplete: false,
      hasProvenDuplicate: false,
      hasPotentialOverlap: true,
      matches,
      incompleteFindings,
    };
  }

  return {
    category: "clean",
    statusLabelAr: "لم يتم رصد تكرار ضمن النطاق المفحوص",
    statusDescriptionAr:
      "تم فحص المرشح ومقارنة هويته بنجاح ضمن النطاق المفحوص وسجل الدفعة الحالية دون رصد تكرار. لا يعني ذلك تفرداً مطلقاً خارج هذا النطاق.",
    badgeClass: "border-emerald-300 bg-emerald-100 text-emerald-900 font-medium",
    isApprovalBlocked: false,
    isIncomplete: false,
    hasProvenDuplicate: false,
    hasPotentialOverlap: false,
    matches: [],
    incompleteFindings: [],
  };
}
