import axios from "axios";

import type {
  DeletionBlocker,
  DeletionEntityKind,
  DeletionPreview,
  DeletionResult,
} from "../types";

/**
 * Pure presentation of the server's deletion preview (roadmap §19.1).
 *
 * Every number shown comes from the server; nothing here counts records. The
 * only decision taken in the browser is whether the operator has given the
 * confirmations the preview asks for.
 */

export const DELETION_ENTITY_LABEL: Record<DeletionEntityKind, string> = {
  world: "العالم",
  scope: "نطاق المحتوى",
  challengeType: "الميكانيكا",
  contentItem: "عنصر المحتوى",
  configuration: "ربط الميكانيكا بالعالم",
};

export interface ImpactRow {
  key: string;
  label: string;
  value: number;
  /** A secondary line under the count, e.g. how many are READY. */
  detail?: string;
}

/** Records removed with the entity itself, only those actually affected. */
export function directImpactRows(preview: DeletionPreview): ImpactRow[] {
  const { impact } = preview;
  const rows: ImpactRow[] = [
    { key: "worlds", label: "عوالم", value: impact.worlds },
    { key: "scopes", label: "نطاقات محتوى", value: impact.scopes },
    {
      key: "configurations",
      label: "ارتباطات لوحة العالم",
      value: impact.configurations,
    },
    { key: "tutorials", label: "شروحات ميكانيكا", value: impact.tutorials },
    {
      key: "scopeExclusions",
      label: "استثناءات نطاق",
      value: impact.scopeExclusions,
    },
    {
      key: "content",
      label: "أسئلة ستُحذف",
      value: impact.content.toDelete,
      detail:
        impact.content.toDelete > 0
          ? `منها ${impact.content.toDeleteReady} جاهزة للعب`
          : undefined,
    },
  ];
  return rows.filter((row) => row.value > 0);
}

const MATCH_LABEL: Record<string, string> = {
  liveMatches: "مباريات جارية الآن",
  staleMatches: "مباريات مهجورة",
  finishedMatches: "مباريات منتهية",
  purgeableMatches: "مباريات تجريبية قابلة للإزالة",
  exposuresRemoved: "سجلات عدم تكرار الأسئلة",
};

const CONTENT_ENGINE_LABEL: Record<string, string> = {
  jobs: "مهام توليد",
  runningJobs: "مهام توليد قيد التشغيل",
  pendingCandidates: "مرشحات بانتظار المراجعة",
  publishedItemsDeleted: "عناصر منشورة من محرك المحتوى ستُحذف",
};

const SOURCE_LABEL: Record<string, string> = {
  matches: "المباريات المرتبطة",
  "content-engine": "محرك المحتوى",
};

export interface ExternalGroup {
  source: string;
  title: string;
  rows: ImpactRow[];
}

/** Related gameplay and content-engine records, plus any future source. */
export function externalImpactGroups(
  preview: DeletionPreview,
): ExternalGroup[] {
  const order = ["matches", "content-engine"];
  const sources = Object.keys(preview.impact.external ?? {}).sort(
    (left, right) =>
      (order.indexOf(left) + 1 || order.length + 1) -
      (order.indexOf(right) + 1 || order.length + 1),
  );
  return sources
    .map((source) => {
      const labels =
        source === "matches"
          ? MATCH_LABEL
          : source === "content-engine"
            ? CONTENT_ENGINE_LABEL
            : {};
      const rows = Object.entries(preview.impact.external[source] ?? {})
        .filter(([, value]) => typeof value === "number" && value > 0)
        .map(([key, value]) => ({ key, label: labels[key] ?? key, value }));
      return { source, title: SOURCE_LABEL[source] ?? source, rows };
    })
    .filter((group) => group.rows.length > 0);
}

/** Matches the optional purge would remove (finished or abandoned only). */
export function purgeableMatchCount(preview: DeletionPreview): number {
  return preview.impact.external?.matches?.purgeableMatches ?? 0;
}

/**
 * The server's blocker messages are English operator text; the Admin is Arabic.
 * Known codes are translated with the server's count; unknown codes fall back
 * to the server's own message so nothing is ever hidden.
 */
export function blockerMessage(blocker: DeletionBlocker): string {
  const n = blocker.count;
  switch (blocker.code) {
    case "LIVE_MATCH_IN_PROGRESS":
      return `${n} مباراة في جلسة مباشرة ما زالت تستخدم هذا السجل. انتظر انتهاءها أو ألغِها أولًا.`;
    case "STALE_ACTIVE_MATCH":
      return `${n} مباراة مهجورة (انتهت جلستها) ما زالت تستخدم هذا السجل.`;
    case "HISTORY_SNAPSHOT_UNSAFE":
      return `${n} مباراة منتهية لا يمكن عرض نتائجها دون هذا السجل.`;
    case "CONTENT_ENGINE_JOB_RUNNING":
      return `${n} مهمة في محرك المحتوى ما زالت تولّد لهذا الهدف. ألغِها أو انتظر انتهاءها أولًا.`;
    case "LEGACY_RECORDS_REFERENCE_ENTITY":
      return `${n} سجل قديم ما زال يشير إلى هذا العنصر.`;
    default:
      return blocker.message;
  }
}

export type DeletionAvailability = "safe" | "requires_purge" | "blocked";

export function deletionAvailability(
  preview: DeletionPreview,
): DeletionAvailability {
  if (preview.safe) return "safe";
  if (preview.safeWithHistoryPurge) return "requires_purge";
  return "blocked";
}

export const AVAILABILITY_LABEL: Record<DeletionAvailability, string> = {
  safe: "يمكن التنفيذ الآن",
  requires_purge: "يتطلب إزالة سجل اللعب التجريبي القديم",
  blocked: "التنفيذ غير متاح حاليًا",
};

/** Whether the purge checkbox is shown at all. */
export function offersHistoryPurge(preview: DeletionPreview): boolean {
  return preview.requiresHistoryPurge || purgeableMatchCount(preview) > 0;
}

/**
 * The single place that decides whether the confirm button is enabled.
 * Permanent delete needs the irreversibility acknowledgement; both operations
 * need the purge ticked when the server says it is required, and neither can
 * run past a hard blocker.
 */
export function canConfirmDeletion(
  preview: DeletionPreview,
  confirmation: { acknowledged: boolean; purge: boolean },
): boolean {
  // Permanent deletion is fail-closed server-side (PERMANENT_DELETION_ADMIN_IDS);
  // an operator not on that list may review the impact but not confirm it.
  if (preview.actorMayExecute === false) return false;
  const executable =
    preview.safe || (preview.safeWithHistoryPurge && confirmation.purge);
  if (!executable) return false;
  if (preview.operation === "permanent_delete" && !confirmation.acknowledged) {
    return false;
  }
  return true;
}

export type DeletionErrorKind =
  | "stale"
  | "blocked"
  | "requires_purge"
  | "request_reused"
  | "not_found"
  | "other";

export function deletionErrorKind(error: unknown): DeletionErrorKind {
  if (!axios.isAxiosError(error) || !error.response) return "other";
  if (error.response.status === 404) return "not_found";
  const code = (error.response.data as { code?: unknown } | undefined)?.code;
  switch (code) {
    case "DELETION_PREVIEW_STALE":
      return "stale";
    case "DELETION_BLOCKED":
      return "blocked";
    case "DELETION_REQUIRES_HISTORY_PURGE":
      return "requires_purge";
    case "DELETION_REQUEST_ID_REUSED":
      return "request_reused";
    default:
      return "other";
  }
}

export const DELETION_ERROR_MESSAGE: Record<
  Exclude<DeletionErrorKind, "other">,
  string
> = {
  stale: "تغيّر أثر الحذف منذ مراجعته؛ راجع الأثر الجديد وأكّد مجددًا",
  blocked: "ظهرت عوائق تمنع التنفيذ. راجع الأثر المحدَّث.",
  requires_purge:
    "يتطلب التنفيذ إزالة سجل اللعب التجريبي القديم المرتبط. راجع الأثر المحدَّث.",
  request_reused: "تعذر تمييز هذا الطلب عن طلب سابق. أكّد مجددًا.",
  not_found: "لم يعد هذا السجل موجودًا؛ ربما حُذف بالفعل.",
};

/** The success toast, including media left on storage for a later cleanup. */
export function deletionSuccessMessage(result: DeletionResult): string {
  const name = result.entity.name;
  const base =
    result.operation === "detach"
      ? `تم فصل «${name}» عن العالم.`
      : `تم حذف «${name}» نهائيًا.`;
  const media = result.unreferencedMediaCandidates?.length ?? 0;
  return media > 0
    ? `${base} ملفات وسائط لم تعد مستخدمة: ${media} — لم تُحذف`
    : base;
}
