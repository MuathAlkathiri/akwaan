import type { RankedListEntry } from "@/types";

export const TOP_10_POINTS = [
  10, 20, 30, 40, 50, 60, 70, 90, 100, 130,
] as const;

export const createDefaultRankedListEntries = (): RankedListEntry[] =>
  TOP_10_POINTS.map((points, index) => ({
    clientId: `row-${index}`,
    rank: index + 1,
    answer: { ar: "", en: "" },
    aliases: [],
    points,
  }));

export function normalizeRankedListAnswer(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^the\s+/i, "")
    .replace(/^ال(?=[\u0600-\u06ff])/u, "")
    .trim();
}

export function validateRankedListEntries(entries: RankedListEntry[]): string[] {
  const issues: string[] = [];
  if (entries.length !== 10) issues.push("يجب إدخال 10 إجابات مرتبة بالضبط.");
  const total = entries.reduce((sum, entry) => sum + entry.points, 0);
  if (total !== 600) issues.push(`مجموع النقاط ${total}، ويجب أن يساوي 600.`);
  const owners = new Map<string, number>();
  for (const [index, entry] of entries.entries()) {
    if (!entry.answer.ar.trim() && !entry.answer.en?.trim())
      issues.push(`الإجابة الأساسية مطلوبة للمرتبة ${entry.rank}.`);
    if (!Number.isInteger(entry.points) || entry.points <= 0)
      issues.push(`نقاط المرتبة ${entry.rank} يجب أن تكون عدداً صحيحاً موجباً.`);
    if (index > 0 && entry.points <= entries[index - 1].points)
      issues.push(
        `نقاط المرتبة ${entry.rank} يجب أن تكون أكبر من المرتبة ${entries[index - 1].rank}.`,
      );
    for (const answer of [
      entry.answer.ar,
      entry.answer.en,
      ...entry.aliases,
    ].filter((value): value is string => Boolean(value?.trim()))) {
      const normalized = normalizeRankedListAnswer(answer);
      const owner = owners.get(normalized);
      if (owner !== undefined && owner !== entry.rank)
        issues.push(
          `الإجابة أو الاسم البديل "${answer}" مكرر بين المرتبتين ${owner} و${entry.rank}.`,
        );
      owners.set(normalized, entry.rank);
    }
  }
  for (const messages of Object.values(getRankedListConflictRows(entries)))
    issues.push(...messages);
  return Array.from(new Set(issues));
}

export function getRankedListConflictRows(entries: RankedListEntry[]) {
  const rows: Record<number, string[]> = {};
  const owners = new Map<string, number>();
  const add = (index: number, message: string) => {
    rows[index] = [...(rows[index] ?? []), message];
  };
  entries.forEach((entry, index) => {
    const local = new Map<string, "canonical" | "alias">();
    const values = [
      { value: entry.answer.ar, kind: "canonical" as const },
      { value: entry.answer.en, kind: "canonical" as const },
      ...entry.aliases.map((value) => ({ value, kind: "alias" as const })),
    ];
    values.forEach(({ value, kind }) => {
      if (value === undefined) return;
      const normalized = normalizeRankedListAnswer(value);
      if (!normalized) {
        if (kind === "alias") add(index, "لا يمكن حفظ اسم مقبول فارغ.");
        return;
      }
      if (local.has(normalized)) {
        add(
          index,
          local.get(normalized) === "canonical"
            ? `الاسم المقبول "${value}" يطابق الإجابة الأساسية.`
            : `الاسم المقبول "${value}" مكرر.`,
        );
        return;
      }
      local.set(normalized, kind);
      const owner = owners.get(normalized);
      if (owner !== undefined && owner !== index) {
        add(index, `القيمة "${value}" مستخدمة أيضاً في المرتبة ${owner + 1}.`);
        add(owner, `توجد قيمة متعارضة مع المرتبة ${index + 1}.`);
      } else owners.set(normalized, index);
    });
  });
  return rows;
}
