import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin permanent deletion (roadmap §19.1).
 *
 * Nothing is stubbed above the HTTP transport: the real dialog, hooks and API
 * module run against a stand-in for the server's preview/execute endpoints, so
 * the URLs, the request body and the retired endpoints are all observable.
 */

const server = vi.hoisted(() => ({
  previews: [] as unknown[],
  previewCalls: 0,
  executeResponses: [] as Array<() => Promise<unknown>>,
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({ showToast: server.showToast }));

vi.mock("@/lib/api/client", () => ({
  default: {
    get: server.get,
    post: server.post,
    delete: server.delete,
    patch: server.patch,
  },
}));

import { PermanentDeletionDialog } from "@/features/world-management/components/shared/permanent-deletion-dialog";
import type {
  DeletionEntityKind,
  DeletionPreview,
} from "@/features/world-management/types";

function previewOf(overrides: Partial<DeletionPreview> = {}): DeletionPreview {
  return {
    entity: { kind: "challengeType", id: "ct-1", name: "الكومبو", key: "combo" },
    operation: "permanent_delete",
    impact: {
      worlds: 0,
      scopes: 0,
      configurations: 3,
      tutorials: 1,
      scopeExclusions: 0,
      content: { toDelete: 12, toDeleteReady: 9, sharedPreserved: 4 },
      external: {
        matches: {
          liveMatches: 0,
          staleMatches: 0,
          finishedMatches: 2,
          purgeableMatches: 0,
          exposuresRemoved: 5,
        },
        "content-engine": { jobs: 2, runningJobs: 0 },
      },
      worldsBecomingIncomplete: [{ id: "w-1", name: "انمي" }],
    },
    blockers: [],
    safe: true,
    safeWithHistoryPurge: true,
    requiresHistoryPurge: false,
    reversible: false,
    fingerprint: "fp-1",
    generatedAt: "2026-11-18T00:00:00.000Z",
    ...overrides,
  };
}

const ok = <T,>(data: T) => Promise.resolve({ data: { data } });
const httpError = (status: number, code?: string) =>
  Promise.reject({
    isAxiosError: true,
    message: "Request failed",
    response: { status, data: code ? { code, message: "en" } : {} },
  });
const networkError = () =>
  Promise.reject({ isAxiosError: true, message: "Network Error" });

const RESULT = {
  requestId: "x",
  auditId: "audit-1",
  entity: { kind: "challengeType", id: "ct-1", name: "الكومبو" },
  operation: "permanent_delete",
  counts: {},
  unreferencedMediaCandidates: ["/uploads/a.jpg", "/uploads/b.jpg"],
  replayed: false,
};

beforeEach(() => {
  server.previews = [previewOf()];
  server.previewCalls = 0;
  server.executeResponses = [];
  server.get.mockReset().mockImplementation(() => {
    const preview =
      server.previews[Math.min(server.previewCalls, server.previews.length - 1)];
    server.previewCalls += 1;
    return ok(preview);
  });
  server.post.mockReset().mockImplementation(() => {
    const next = server.executeResponses.shift();
    return next ? next() : ok(RESULT);
  });
  server.delete.mockReset();
  server.patch.mockReset();
  server.showToast.mockReset();
});

function renderDialog(
  kind: DeletionEntityKind = "challengeType",
  id = "ct-1",
  onClose = vi.fn(),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PermanentDeletionDialog
        target={{ kind, id, name: "الكومبو" }}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { onClose, client };
}

const confirmButton = () => screen.getByTestId("deletion-confirm");
const acknowledge = () =>
  fireEvent.click(screen.getByTestId("deletion-acknowledge-checkbox"));
const loaded = () => screen.findByTestId("deletion-preview");

describe("PermanentDeletionDialog — preview", () => {
  it("reads the impact from the mechanic's deletion-preview endpoint", async () => {
    renderDialog();
    await loaded();
    expect(server.get).toHaveBeenCalledWith(
      "/admin/challenge-types/ct-1/deletion-preview",
    );
    // Opening is read-only.
    expect(server.post).not.toHaveBeenCalled();
  });

  it("shows the counts, the READY share, preserved shared content and related records", async () => {
    renderDialog();
    await loaded();
    expect(screen.getByTestId("deletion-entity-name")).toHaveTextContent(
      "الكومبو",
    );
    expect(screen.getByTestId("deletion-impact-content")).toHaveTextContent(
      "12",
    );
    expect(screen.getByTestId("deletion-impact-content")).toHaveTextContent(
      "منها 9 جاهزة للعب",
    );
    expect(
      screen.getByTestId("deletion-impact-configurations"),
    ).toHaveTextContent("3");
    expect(screen.getByTestId("deletion-shared-preserved")).toHaveTextContent(
      "سيُحتفظ بـ 4 سؤال مشترك مع آليات أخرى",
    );
    expect(screen.getByTestId("deletion-external-matches")).toHaveTextContent(
      "مباريات منتهية",
    );
    expect(
      screen.getByTestId("deletion-external-content-engine"),
    ).toHaveTextContent("مهام توليد");
    expect(screen.getByTestId("deletion-worlds-incomplete")).toHaveTextContent(
      "انمي",
    );
    expect(screen.getByTestId("deletion-operation-copy")).toHaveTextContent(
      "لا يمكن التراجع",
    );
    expect(screen.getByTestId("deletion-availability")).toHaveTextContent(
      "يمكن التنفيذ الآن",
    );
  });

  it("asks for no typed entity name", async () => {
    renderDialog();
    await loaded();
    expect(
      screen.getByTestId("permanent-deletion-dialog").querySelector("input"),
    ).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps confirm disabled while the preview loads", () => {
    server.get.mockImplementation(() => new Promise(() => {}));
    renderDialog();
    expect(screen.getByTestId("deletion-preview-loading")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("keeps confirm disabled and shows the error when the preview fails", async () => {
    server.get.mockImplementation(() => httpError(500));
    renderDialog();
    expect(
      await screen.findByTestId("deletion-preview-error"),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });
});

describe("PermanentDeletionDialog — confirmation", () => {
  it("enables the destructive confirm only after the irreversibility checkbox", async () => {
    renderDialog();
    await loaded();
    expect(screen.getByTestId("deletion-acknowledge")).toHaveTextContent(
      "أفهم أن هذا الحذف نهائي",
    );
    expect(confirmButton()).toBeDisabled();
    acknowledge();
    expect(confirmButton()).toBeEnabled();
  });

  it("lets an operator outside the permanent-deletion allowlist review but never confirm", async () => {
    server.previews = [previewOf({ actorMayExecute: false })];
    renderDialog();
    await loaded();
    expect(screen.getByTestId("deletion-not-permitted")).toHaveTextContent(
      "مقصور على المشغّلين المخوّلين",
    );
    acknowledge();
    expect(confirmButton()).toBeDisabled();
    expect(server.post).not.toHaveBeenCalled();
  });

  it("sends the reviewed fingerprint and a request id to permanent-delete, then closes with feedback", async () => {
    const { onClose } = renderDialog();
    await loaded();
    acknowledge();
    fireEvent.click(confirmButton());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(server.post).toHaveBeenCalledTimes(1);
    const [url, body] = server.post.mock.calls[0];
    expect(url).toBe("/admin/challenge-types/ct-1/permanent-delete");
    expect(body).toEqual({
      previewFingerprint: "fp-1",
      requestId: expect.any(String),
    });
    expect(server.showToast.mock.calls[0][0].message).toContain(
      "ملفات وسائط لم تعد مستخدمة: 2 — لم تُحذف",
    );
  });

  it("forces the history-purge checkbox when the server requires it", async () => {
    server.previews = [
      previewOf({
        safe: false,
        safeWithHistoryPurge: true,
        requiresHistoryPurge: true,
        blockers: [
          {
            code: "STALE_ACTIVE_MATCH",
            message: "1 abandoned Match(es)",
            count: 1,
            sample: [{ id: "m-1", label: "Match m-1" }],
            clearedByHistoryPurge: true,
          },
        ],
      }),
    ];
    renderDialog();
    await loaded();
    expect(screen.getByTestId("deletion-purge-option")).toHaveTextContent(
      "إزالة سجل اللعب التجريبي القديم المرتبط (مباريات منتهية/مهجورة)",
    );
    expect(
      screen.getByTestId("deletion-blocker-STALE_ACTIVE_MATCH"),
    ).toHaveTextContent("مباراة مهجورة");
    expect(
      screen.getByTestId("deletion-blocker-STALE_ACTIVE_MATCH"),
    ).toHaveTextContent("Match m-1");

    acknowledge();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(screen.getByTestId("deletion-purge-checkbox"));
    expect(confirmButton()).toBeEnabled();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(server.post).toHaveBeenCalledTimes(1));
    expect(server.post.mock.calls[0][1]).toMatchObject({
      purgeDisposableHistory: true,
    });
  });

  it("keeps confirm disabled on a hard blocker and explains why", async () => {
    server.previews = [
      previewOf({
        safe: false,
        safeWithHistoryPurge: false,
        blockers: [
          {
            code: "LIVE_MATCH_IN_PROGRESS",
            message: "2 Match(es) in a live session",
            count: 2,
          },
        ],
      }),
    ];
    renderDialog();
    await loaded();
    acknowledge();
    expect(confirmButton()).toBeDisabled();
    expect(
      screen.getByTestId("deletion-blocker-LIVE_MATCH_IN_PROGRESS"),
    ).toHaveTextContent("2 مباراة في جلسة مباشرة");
    expect(screen.getByTestId("deletion-availability")).toHaveTextContent(
      "التنفيذ غير متاح حاليًا",
    );
  });
});

describe("PermanentDeletionDialog — refusals and retries", () => {
  it("re-reads the preview after a stale refusal and requires re-confirmation with a new request id", async () => {
    server.previews = [
      previewOf(),
      previewOf({
        fingerprint: "fp-2",
        impact: {
          ...previewOf().impact,
          content: { toDelete: 13, toDeleteReady: 10, sharedPreserved: 4 },
        },
      }),
    ];
    server.executeResponses = [() => httpError(409, "DELETION_PREVIEW_STALE")];
    const { onClose } = renderDialog();
    await loaded();
    acknowledge();
    fireEvent.click(confirmButton());

    expect(await screen.findByTestId("deletion-failure")).toHaveTextContent(
      "تغيّر أثر الحذف منذ مراجعته؛ راجع الأثر الجديد وأكّد مجددًا",
    );
    await waitFor(() =>
      expect(screen.getByTestId("deletion-impact-content")).toHaveTextContent(
        "13",
      ),
    );
    expect(server.previewCalls).toBe(2);
    expect(onClose).not.toHaveBeenCalled();
    // Re-confirmation is required.
    expect(confirmButton()).toBeDisabled();

    acknowledge();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(server.post).toHaveBeenCalledTimes(2));
    const first = server.post.mock.calls[0][1];
    const second = server.post.mock.calls[1][1];
    expect(second.previewFingerprint).toBe("fp-2");
    expect(second.requestId).not.toBe(first.requestId);
  });

  it("reuses the same request id when the same confirmation is retried after a network failure", async () => {
    server.executeResponses = [networkError];
    const { onClose } = renderDialog();
    await loaded();
    acknowledge();
    fireEvent.click(confirmButton());

    expect(await screen.findByTestId("deletion-failure")).toBeInTheDocument();
    // The dialog stays open and the confirmation stands.
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(confirmButton()).toBeEnabled());

    fireEvent.click(confirmButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(server.post).toHaveBeenCalledTimes(2);
    expect(server.post.mock.calls[1][1].requestId).toBe(
      server.post.mock.calls[0][1].requestId,
    );
    // No preview re-read for a transport failure.
    expect(server.previewCalls).toBe(1);
  });
});

describe("PermanentDeletionDialog — endpoints per entity", () => {
  it.each([
    ["world", "w-1", "/admin/worlds/w-1"],
    ["scope", "s-1", "/admin/scopes/s-1"],
    ["contentItem", "c-1", "/admin/content-items/c-1"],
  ] as const)(
    "%s uses deletion-preview and permanent-delete",
    async (kind, id, base) => {
      server.previews = [
        previewOf({ entity: { kind, id, name: "س" }, blockers: [] }),
      ];
      renderDialog(kind, id);
      await loaded();
      acknowledge();
      fireEvent.click(confirmButton());
      await waitFor(() => expect(server.post).toHaveBeenCalledTimes(1));
      expect(server.get).toHaveBeenCalledWith(`${base}/deletion-preview`);
      expect(server.post.mock.calls[0][0]).toBe(`${base}/permanent-delete`);
      expect(server.delete).not.toHaveBeenCalled();
    },
  );

  it("never calls a retired endpoint", async () => {
    renderDialog();
    await loaded();
    acknowledge();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(server.post).toHaveBeenCalledTimes(1));
    const urls = [
      ...server.get.mock.calls.map((call) => call[0] as string),
      ...server.post.mock.calls.map((call) => call[0] as string),
    ];
    expect(server.delete).not.toHaveBeenCalled();
    expect(urls.some((url) => /removal-preview|\/release$/.test(url))).toBe(
      false,
    );
  });
});
