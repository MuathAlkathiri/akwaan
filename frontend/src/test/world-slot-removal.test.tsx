import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  release: vi.fn(),
  preview: {
    data: undefined as unknown,
    isLoading: false,
    error: undefined as unknown,
  },
  board: {
    configurations: [] as unknown[],
    board: { blockers: [] as unknown[], warnings: [] as unknown[] },
  },
  showToast: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({ showToast: mocks.showToast }));

vi.mock("@/features/world-management/hooks/use-world-content", () => ({
  useWorldBoard: () => ({ data: mocks.board, isLoading: false }),
  useWorldContentMetadata: () => ({ data: { boardSlotCount: 4 } }),
  useWorldSlotRemovalPreview: (id?: string) =>
    id
      ? mocks.preview
      : { data: undefined, isLoading: false, error: undefined },
  useReleaseWorldSlot: () => ({
    mutate: mocks.release,
    isPending: false,
  }),
  useChallengeTypes: () => ({ data: [], isLoading: false }),
  useCreateWorldChallengeConfiguration: () => ({ mutateAsync: vi.fn() }),
  useUpdateWorldChallengeConfiguration: () => ({ mutateAsync: vi.fn() }),
}));

import { BoardSection } from "@/features/world-management/components/world-challenge-configurations/board-section";

/**
 * Removing one mechanic from one World board position.
 *
 * Two things are load-bearing here. The counts on the confirmation are the
 * server's, because the browser cannot see other Worlds' content. And the two
 * destructive halves — content and binding — leave as a single request, so the
 * browser never orchestrates them.
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

const previewOf = (total: number, ready: number, shared = 0) => ({
  worldId: "world-anime",
  worldName: "انمي",
  slotKey: "slot_2",
  challengeTypeId: "ct-combo",
  challengeTypeSlug: "combo",
  challengeTypeName: "الكومبو",
  content: { total, ready, exclusive: total - shared, shared },
  boardWillBecomeIncomplete: true,
});

const fullBoard = () => [
  otherSlot("slot_1", "اقرأ خصمك", "ryo"),
  COMBO_CONFIG,
  otherSlot("slot_3", "مين اقرب", "closest"),
  otherSlot("slot_4", "ركّبها", "di"),
];

beforeEach(() => {
  mocks.release.mockReset();
  mocks.showToast.mockReset();
  mocks.board = {
    configurations: fullBoard(),
    board: { blockers: [], warnings: [] },
  };
  mocks.preview = {
    data: previewOf(12, 12),
    isLoading: false,
    error: undefined,
  };
});

describe("removing a mechanic from one World slot", () => {
  it("asks for confirmation instead of deleting on the first click", () => {
    render(<BoardSection worldId="world-anime" />);
    expect(screen.queryByTestId("slot-removal-dialog")).toBeNull();

    fireEvent.click(
      within(screen.getByTestId("configuration-slot_2")).getByLabelText(
        "حذف الإعداد",
      ),
    );

    expect(screen.getByTestId("slot-removal-dialog")).toBeInTheDocument();
    // Nothing destructive has been requested by merely opening it.
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("shows the server's count, not a client guess", () => {
    render(<BoardSection worldId="world-anime" />);
    fireEvent.click(
      within(screen.getByTestId("configuration-slot_2")).getByLabelText(
        "حذف الإعداد",
      ),
    );

    expect(screen.getByTestId("slot-removal-total")).toHaveTextContent("12");
    expect(screen.getByTestId("slot-removal-ready")).toHaveTextContent(
      "الجاهزة: 12",
    );
  });

  it("names the mechanic and the World being changed", () => {
    render(<BoardSection worldId="world-anime" />);
    fireEvent.click(
      within(screen.getByTestId("configuration-slot_2")).getByLabelText(
        "حذف الإعداد",
      ),
    );

    expect(screen.getByTestId("slot-removal-mechanic")).toHaveTextContent(
      "الكومبو",
    );
    expect(screen.getByTestId("slot-removal-world")).toHaveTextContent("انمي");
  });

  it("warns that the World stops being playable until the slot is refilled", () => {
    render(<BoardSection worldId="world-anime" />);
    fireEvent.click(
      within(screen.getByTestId("configuration-slot_2")).getByLabelText(
        "حذف الإعداد",
      ),
    );

    const warning = screen.getByTestId("slot-removal-warning");
    expect(warning).toHaveTextContent("وإفراغ هذه الخانة");
    expect(warning).toHaveTextContent("لن يكون العالم جاهزًا للعب");
  });

  it("does nothing at all on cancel", () => {
    render(<BoardSection worldId="world-anime" />);
    fireEvent.click(
      within(screen.getByTestId("configuration-slot_2")).getByLabelText(
        "حذف الإعداد",
      ),
    );
    fireEvent.click(screen.getByTestId("slot-removal-cancel"));

    expect(mocks.release).not.toHaveBeenCalled();
    return waitFor(() =>
      expect(screen.queryByTestId("slot-removal-dialog")).toBeNull(),
    );
  });

  it("confirms through one operation carrying the expected mechanic", () => {
    render(<BoardSection worldId="world-anime" />);
    fireEvent.click(
      within(screen.getByTestId("configuration-slot_2")).getByLabelText(
        "حذف الإعداد",
      ),
    );
    fireEvent.click(screen.getByTestId("slot-removal-confirm"));

    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.release.mock.calls[0][0]).toEqual({
      configurationId: "cfg-combo",
      // The concurrency check: the mechanic the operator actually confirmed.
      expectedChallengeTypeId: "ct-combo",
    });
  });

  it("still allows removing a mechanic that has no content", () => {
    mocks.preview = {
      data: previewOf(0, 0),
      isLoading: false,
      error: undefined,
    };
    render(<BoardSection worldId="world-anime" />);
    fireEvent.click(
      within(screen.getByTestId("configuration-slot_2")).getByLabelText(
        "حذف الإعداد",
      ),
    );

    expect(screen.getByTestId("slot-removal-total")).toHaveTextContent("0");
    // No ready/total breakdown for an empty mechanic — nothing to break down.
    expect(screen.queryByTestId("slot-removal-ready")).toBeNull();
    fireEvent.click(screen.getByTestId("slot-removal-confirm"));
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("says when content will survive because another mechanic shares it", () => {
    mocks.preview = {
      data: previewOf(12, 12, 4),
      isLoading: false,
      error: undefined,
    };
    render(<BoardSection worldId="world-anime" />);
    fireEvent.click(
      within(screen.getByTestId("configuration-slot_2")).getByLabelText(
        "حذف الإعداد",
      ),
    );

    expect(screen.getByTestId("slot-removal-shared")).toHaveTextContent(
      "4 سؤال مشترك",
    );
  });

  it("hides the shared note when nothing is shared", () => {
    render(<BoardSection worldId="world-anime" />);
    fireEvent.click(
      within(screen.getByTestId("configuration-slot_2")).getByLabelText(
        "حذف الإعداد",
      ),
    );
    expect(screen.queryByTestId("slot-removal-shared")).toBeNull();
  });

  it("leaves the board untouched when the server refuses", () => {
    mocks.release.mockImplementation(
      (_input: unknown, options: { onError: (error: unknown) => void }) => {
        options.onError({
          response: { data: { code: "BOARD_SLOT_REBOUND" } },
        });
      },
    );
    render(<BoardSection worldId="world-anime" />);
    fireEvent.click(
      within(screen.getByTestId("configuration-slot_2")).getByLabelText(
        "حذف الإعداد",
      ),
    );
    fireEvent.click(screen.getByTestId("slot-removal-confirm"));

    // The dialog stays open — closing it would imply the removal happened.
    expect(screen.getByTestId("slot-removal-dialog")).toBeInTheDocument();
    expect(mocks.showToast).toHaveBeenCalled();
    // And slot_2 is still shown as configured.
    expect(screen.queryByTestId("empty-slot-slot_2")).toBeNull();
  });

  it("refuses to confirm before the server's count has arrived", () => {
    mocks.preview = { data: undefined, isLoading: true, error: undefined };
    render(<BoardSection worldId="world-anime" />);
    fireEvent.click(
      within(screen.getByTestId("configuration-slot_2")).getByLabelText(
        "حذف الإعداد",
      ),
    );

    expect(screen.getByTestId("slot-removal-loading")).toBeInTheDocument();
    expect(screen.getByTestId("slot-removal-confirm")).toBeDisabled();
  });
});

describe("the empty slot that removal leaves behind", () => {
  beforeEach(() => {
    // What the refreshed board looks like after slot_2 was released.
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
    render(<BoardSection worldId="world-anime" />);

    const empty = screen.getByTestId("empty-slot-slot_2");
    expect(empty).toHaveTextContent("الخانة 2");
    expect(empty).toHaveTextContent("لا توجد ميكانيكا");
    // The other three positions are untouched.
    expect(screen.queryByTestId("empty-slot-slot_1")).toBeNull();
    expect(screen.queryByTestId("empty-slot-slot_3")).toBeNull();
    expect(screen.queryByTestId("empty-slot-slot_4")).toBeNull();
  });

  it("offers assignment on that same position", () => {
    render(<BoardSection worldId="world-anime" />);
    const assign = screen.getByTestId("assign-slot-slot_2");
    expect(assign).toHaveTextContent("تعيين ميكانيكا");
    fireEvent.click(assign);
    expect(screen.getByText("تعيين ميكانيكا للخانة")).toBeInTheDocument();
  });

  it("reports the board as not ready while a position is empty", () => {
    render(<BoardSection worldId="world-anime" />);
    // The blocker the server returned is surfaced, not recomputed here.
    expect(screen.getByText(/تكوين اللوحة/)).toBeInTheDocument();
  });
});
