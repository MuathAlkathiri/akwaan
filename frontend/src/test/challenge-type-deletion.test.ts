import { describe, expect, it } from "vitest";

import {
  blockerMessage,
  canConfirmDeletion,
  deletionAvailability,
  deletionErrorKind,
  deletionSuccessMessage,
  directImpactRows,
  offersHistoryPurge,
} from "@/features/world-management/utils/deletion-preview.presenter";
import type { DeletionPreview } from "@/features/world-management/types";

/**
 * Mechanic (ChallengeType) permanent deletion, presented from the generic
 * server preview. Replaces the old `canHardDelete` / "الحذف غير متاح" presenter:
 * whether deletion is possible is now the server's blockers, not a client rule.
 */

const preview = (overrides: Partial<DeletionPreview> = {}): DeletionPreview => ({
  entity: { kind: "challengeType", id: "ct-1", name: "تجريبية", key: "trial" },
  operation: "permanent_delete",
  impact: {
    worlds: 0,
    scopes: 0,
    configurations: 3,
    tutorials: 0,
    scopeExclusions: 2,
    content: { toDelete: 36, toDeleteReady: 30, sharedPreserved: 5 },
    external: { matches: { purgeableMatches: 0, finishedMatches: 4 } },
    worldsBecomingIncomplete: [],
  },
  blockers: [],
  safe: true,
  safeWithHistoryPurge: true,
  requiresHistoryPurge: false,
  reversible: false,
  fingerprint: "fp",
  generatedAt: "2026-11-18T00:00:00.000Z",
  ...overrides,
});

describe("mechanic deletion preview presentation", () => {
  it("lists only the affected records, with the READY share of deleted content", () => {
    const rows = directImpactRows(preview());
    expect(rows.map((row) => row.key)).toEqual([
      "configurations",
      "scopeExclusions",
      "content",
    ]);
    expect(rows.find((row) => row.key === "content")).toMatchObject({
      value: 36,
      detail: "منها 30 جاهزة للعب",
    });
  });

  it("needs the irreversibility acknowledgement for a permanent delete", () => {
    expect(
      canConfirmDeletion(preview(), { acknowledged: false, purge: false }),
    ).toBe(false);
    expect(
      canConfirmDeletion(preview(), { acknowledged: true, purge: false }),
    ).toBe(true);
  });

  it("does not need the acknowledgement for a detach", () => {
    expect(
      canConfirmDeletion(preview({ operation: "detach" }), {
        acknowledged: false,
        purge: false,
      }),
    ).toBe(true);
  });

  it("requires the history purge when the server says so", () => {
    const needsPurge = preview({
      safe: false,
      safeWithHistoryPurge: true,
      requiresHistoryPurge: true,
    });
    expect(deletionAvailability(needsPurge)).toBe("requires_purge");
    expect(offersHistoryPurge(needsPurge)).toBe(true);
    expect(
      canConfirmDeletion(needsPurge, { acknowledged: true, purge: false }),
    ).toBe(false);
    expect(
      canConfirmDeletion(needsPurge, { acknowledged: true, purge: true }),
    ).toBe(true);
  });

  it("never allows a hard-blocked deletion, purge or not", () => {
    const blocked = preview({
      safe: false,
      safeWithHistoryPurge: false,
      blockers: [
        { code: "LIVE_MATCH_IN_PROGRESS", message: "2 live", count: 2 },
      ],
    });
    expect(deletionAvailability(blocked)).toBe("blocked");
    expect(
      canConfirmDeletion(blocked, { acknowledged: true, purge: true }),
    ).toBe(false);
    expect(blockerMessage(blocked.blockers[0])).toContain(
      "2 مباراة في جلسة مباشرة",
    );
  });

  it("falls back to the server's message for an unknown blocker code", () => {
    expect(
      blockerMessage({ code: "SOMETHING_NEW", message: "server text", count: 1 }),
    ).toBe("server text");
  });

  it("classifies the server's refusal codes", () => {
    const refusal = (status: number, code?: string) => ({
      isAxiosError: true,
      response: { status, data: { code } },
    });
    expect(deletionErrorKind(refusal(409, "DELETION_PREVIEW_STALE"))).toBe(
      "stale",
    );
    expect(deletionErrorKind(refusal(409, "DELETION_BLOCKED"))).toBe("blocked");
    expect(
      deletionErrorKind(refusal(409, "DELETION_REQUIRES_HISTORY_PURGE")),
    ).toBe("requires_purge");
    expect(deletionErrorKind(refusal(409, "DELETION_REQUEST_ID_REUSED"))).toBe(
      "request_reused",
    );
    expect(deletionErrorKind(refusal(404))).toBe("not_found");
    expect(deletionErrorKind({ isAxiosError: true })).toBe("other");
  });

  it("reports unused media in the success message without deleting it", () => {
    expect(
      deletionSuccessMessage({
        requestId: "r",
        auditId: "a",
        entity: { kind: "challengeType", id: "ct-1", name: "تجريبية" },
        operation: "permanent_delete",
        counts: {},
        unreferencedMediaCandidates: ["/uploads/x.jpg"],
        replayed: false,
      }),
    ).toBe(
      "تم حذف «تجريبية» نهائيًا. ملفات وسائط لم تعد مستخدمة: 1 — لم تُحذف",
    );
  });
});
