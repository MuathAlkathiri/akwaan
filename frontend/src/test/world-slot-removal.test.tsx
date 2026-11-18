import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  board: {
    configurations: [] as unknown[],
    board: { blockers: [] as unknown[], warnings: [] as unknown[] },
  },
  showToast: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({ showToast: mocks.showToast }));

// The detach dialog talks to the transport directly; only the board reads are
// stubbed at the hook level.
vi.mock("@/lib/api/client", () => ({
  default: { get: mocks.get, post: mocks.post, delete: mocks.delete },
}));

vi.mock("@/features/world-management/hooks/use-world-content", () => ({
  useWorldBoard: () => ({ data: mocks.board, isLoading: false }),
  useWorldContentMetadata: () => ({ data: { boardSlotCount: 4 } }),
  useChallengeTypes: () => ({ data: [], isLoading: false }),
  useCreateWorldChallengeConfiguration: () => ({ mutateAsync: vi.fn() }),
  useUpdateWorldChallengeConfiguration: () => ({ mutateAsync: vi.fn() }),
}));

import { BoardSection } from "@/features/world-management/components/world-challenge-configurations/board-section";

/**
 * Detaching one mechanic from one World board position (roadmap §19.1).
 *
 * Detach removes the association only: the mechanic and every one of its
 * questions are kept. The impact shown is the server's detach preview, and
 * confirming sends one request carrying the reviewed fingerprint.
 */

const COMBO_CONFIG = {
  id: "cfg-combo",
  worldId: "world-anime",
  challengeTypeId: "ct-combo",
  slotKey: "slot_2",
  effectiveName: "الكومبو",
  isEnabled: true,
  sortOrder: 0,
  challengeType: {
    id: "ct-combo",
    name: "الكومبو",
    slug: "combo",
    family: "signature",
    answerMode: "match",
    itemStructure: "continuous",
    status: "active",
    defaultPresentation: { inputType: "phone-text", timerSeconds: 30 },
  },
};

const otherSlot = (slotKey: string, name: string, id: string) => ({
  ...COMBO_CONFIG,
  id,
  slotKey,
  effectiveName: name,
  challengeTypeId: `ct-${id}`,
  challengeType: {
    ...COMBO_CONFIG.challengeType,
    id: `ct-${id}`,
    name,
    slug: id,
  },
});

const DETACH_PREVIEW = {
  entity: {
    kind: "configuration",
    id: "cfg-combo",
    name: "الكومبو",
    key: "slot_2",
  },
  operation: "detach",
  impact: {
    worlds: 0,
    scopes: 0,
    configurations: 1,
    tutorials: 0,
    scopeExclusions: 0,
    content: { toDelete: 0, toDeleteReady: 0, sharedPreserved: 0 },
    external: {},
    worldsBecomingIncomplete: [{ id: "world-anime", name: "انمي" }],
  },
  blockers: [],
  safe: true,
  safeWithHistoryPurge: true,
  requiresHistoryPurge: false,
  reversible: false,
  fingerprint: "fp-detach",
  generatedAt: "2026-11-18T00:00:00.000Z",
};

const fullBoard = () => [
  otherSlot("slot_1", "اقرأ خصمك", "ryo"),
  COMBO_CONFIG,
  otherSlot("slot_3", "مين اقرب", "closest"),
  otherSlot("slot_4", "ركّبها", "di"),
];

const ok = <T,>(data: T) => Promise.resolve({ data: { data } });

function renderBoard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BoardSection worldId="world-anime" />
    </QueryClientProvider>,
  );
}

const openDetach = () =>
  fireEvent.click(
    within(screen.getByTestId("configuration-slot_2")).getByLabelText(
      "فصل عن العالم",
    ),
  );

beforeEach(() => {
  mocks.showToast.mockReset();
  mocks.get.mockReset().mockImplementation(() => ok(DETACH_PREVIEW));
  mocks.post.mockReset().mockImplementation(() =>
    ok({
      requestId: "r",
      auditId: "a",
      entity: DETACH_PREVIEW.entity,
      operation: "detach",
      counts: { configurations: 1 },
      unreferencedMediaCandidates: [],
      replayed: false,
    }),
  );
  mocks.delete.mockReset();
  mocks.board = {
    configurations: fullBoard(),
    board: { blockers: [], warnings: [] },
  };
});

describe("detaching a mechanic from one World slot", () => {
  it("asks for confirmation instead of detaching on the first click", async () => {
    renderBoard();
    expect(screen.queryByTestId("permanent-deletion-dialog")).toBeNull();

    openDetach();

    expect(
      await screen.findByTestId("permanent-deletion-dialog"),
    ).toBeInTheDocument();
    await screen.findByTestId("deletion-preview");
    expect(mocks.get).toHaveBeenCalledWith(
      "/admin/challenge-configurations/cfg-combo/detach-preview",
    );
    // Nothing destructive has been requested by merely opening it.
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("says the mechanic and its content are preserved", async () => {
    renderBoard();
    openDetach();
    await screen.findByTestId("deletion-preview");

    expect(screen.getByTestId("deletion-operation-copy")).toHaveTextContent(
      "تبقى الميكانيكا وجميع أسئلتها محفوظة",
    );
    expect(screen.getByTestId("deletion-operation")).toHaveTextContent(
      "فصل الارتباط فقط",
    );
    // Detach is not presented as an irreversible deletion.
    expect(screen.queryByTestId("deletion-acknowledge")).toBeNull();
    expect(screen.queryByTestId("deletion-impact-content")).toBeNull();
    expect(screen.getByTestId("deletion-confirm")).toHaveTextContent(
      "فصل عن العالم",
    );
  });

  it("warns that the World stops being selectable until the slot is refilled", async () => {
    renderBoard();
    openDetach();
    expect(
      await screen.findByTestId("deletion-worlds-incomplete"),
    ).toHaveTextContent("انمي");
  });

  it("does nothing at all on cancel", async () => {
    renderBoard();
    openDetach();
    await screen.findByTestId("deletion-preview");
    fireEvent.click(screen.getByTestId("deletion-cancel"));

    expect(mocks.post).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByTestId("permanent-deletion-dialog")).toBeNull(),
    );
  });

  it("confirms through one detach request carrying the reviewed fingerprint", async () => {
    renderBoard();
    openDetach();
    await screen.findByTestId("deletion-preview");
    fireEvent.click(screen.getByTestId("deletion-confirm"));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post.mock.calls[0][0]).toBe(
      "/admin/challenge-configurations/cfg-combo/detach",
    );
    expect(mocks.post.mock.calls[0][1]).toMatchObject({
      previewFingerprint: "fp-detach",
      requestId: expect.any(String),
    });
    // The retired endpoints are never used.
    expect(mocks.delete).not.toHaveBeenCalled();
    const urls = [...mocks.get.mock.calls, ...mocks.post.mock.calls].map(
      (call) => call[0] as string,
    );
    expect(urls.some((url) => /removal-preview|\/release$/.test(url))).toBe(
      false,
    );
    await waitFor(() =>
      expect(screen.queryByTestId("permanent-deletion-dialog")).toBeNull(),
    );
    expect(mocks.showToast.mock.calls[0][0].message).toContain(
      "تم فصل «الكومبو» عن العالم",
    );
  });

  it("leaves the board untouched and the dialog open when the server refuses", async () => {
    mocks.post.mockImplementation(() =>
      Promise.reject({
        isAxiosError: true,
        response: { status: 409, data: { code: "BOARD_SLOT_REBOUND", message: "x" } },
      }),
    );
    renderBoard();
    openDetach();
    await screen.findByTestId("deletion-preview");
    fireEvent.click(screen.getByTestId("deletion-confirm"));

    expect(await screen.findByTestId("deletion-failure")).toBeInTheDocument();
    expect(screen.getByTestId("permanent-deletion-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("empty-slot-slot_2")).toBeNull();
  });

  it("refuses to confirm before the server's preview has arrived", () => {
    mocks.get.mockImplementation(() => new Promise(() => {}));
    renderBoard();
    openDetach();

    expect(screen.getByTestId("deletion-preview-loading")).toBeInTheDocument();
    expect(screen.getByTestId("deletion-confirm")).toBeDisabled();
  });
});

describe("the empty slot that detaching leaves behind", () => {
  beforeEach(() => {
    // What the refreshed board looks like after slot_2 was detached.
    mocks.board = {
      configurations: fullBoard().filter(
        (configuration) => configuration.slotKey !== "slot_2",
      ),
      board: {
        blockers: [{ code: "BOARD_SLOT_EMPTY", message: "..." }],
        warnings: [],
      },
    };
  });

  it("keeps the position visible rather than dropping it from the board", () => {
    renderBoard();

    const empty = screen.getByTestId("empty-slot-slot_2");
    expect(empty).toHaveTextContent("الخانة 2");
    expect(empty).toHaveTextContent("لا توجد ميكانيكا");
    // The other three positions are untouched.
    expect(screen.queryByTestId("empty-slot-slot_1")).toBeNull();
    expect(screen.queryByTestId("empty-slot-slot_3")).toBeNull();
    expect(screen.queryByTestId("empty-slot-slot_4")).toBeNull();
  });

  it("offers assignment on that same position", () => {
    renderBoard();
    const assign = screen.getByTestId("assign-slot-slot_2");
    expect(assign).toHaveTextContent("تعيين ميكانيكا");
    fireEvent.click(assign);
    expect(screen.getByText("تعيين ميكانيكا للخانة")).toBeInTheDocument();
  });

  it("reports the board as not ready while a position is empty", () => {
    renderBoard();
    // The blocker the server returned is surfaced, not recomputed here.
    expect(screen.getByText(/تكوين اللوحة/)).toBeInTheDocument();
  });
});
