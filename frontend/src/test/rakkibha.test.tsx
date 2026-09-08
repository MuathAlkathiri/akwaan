import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RakkibhaPanel } from "@/features/live-game-session/components/rakkibha-panel";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

const gameplayCommand = vi.fn();
const clock = vi.hoisted(() => ({ nowMs: Date.parse("2026-01-01T00:00:00Z") }));
vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      teams: [
        { id: "alpha", name: "ألفا" },
        { id: "beta", name: "بيتا" },
      ],
    },
    gameplayCommand,
    connection: "connected",
  }),
}));
vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({ useLiveSessionClock: () => clock.nowMs }),
);
vi.mock("@/features/live-game-session/components/marhala-screen", () => ({
  MarhalaQuestionImage: ({ url }: { url: string }) => (
    <img src={url} alt="private visual" />
  ),
  MarhalaQuestionAudio: ({ url }: { url: string }) => <audio src={url} />,
}));

const runtime = (modeState: Record<string, unknown>) =>
  ({
    mode: { key: "rakkibha", version: 1, stateSchemaVersion: 1 },
    modeState: {
      phase: "active",
      puzzleCount: 3,
      puzzlePosition: 1,
      myTeamId: "alpha",
      contentItemId: "honeycomb",
      deadlineAt: "2026-01-01T00:02:15Z",
      progressJson: JSON.stringify([
        { teamId: "alpha", solved: 0, wrongAttempts: 0, locked: 0 },
        { teamId: "beta", solved: 0, wrongAttempts: 0, locked: 0 },
      ]),
      ...modeState,
    },
    activeRound: { id: "round-1", status: "active", modeState: {} },
  }) as unknown as GameplayRuntimeSnapshot;

describe("Rakkibha private UI", () => {
  beforeEach(() => {
    gameplayCommand.mockReset();
    clock.nowMs = Date.parse("2026-01-01T00:00:00Z");
  });
  it("renders a reference without answer controls", () => {
    render(
      <RakkibhaPanel
        runtime={runtime({
          hasReference: true,
          myReferenceJson: JSON.stringify({
            media: { type: "image", url: "/reference.webp" },
          }),
        })}
      />,
    );
    expect(screen.getByTestId("rakkibha-reference")).toBeTruthy();
    expect(screen.getByTestId("challenge-frame").innerHTML).toContain("px-4");
    expect(screen.getByTestId("rakkibha-reference")).toHaveAttribute(
      "dir",
      "ltr",
    );
    expect(screen.queryByRole("button", { name: "إرسال القطعة" })).toBeNull();
  });
  it("renders two local candidates and submits the selected local id", () => {
    render(
      <RakkibhaPanel
        runtime={runtime({
          myCandidatesJson: JSON.stringify({
            id: "holder-b",
            candidates: [
              {
                localId: "option-1",
                media: { type: "image", url: "/one.webp" },
              },
              {
                localId: "option-2",
                media: { type: "image", url: "/two.webp" },
              },
            ],
          }),
        })}
      />,
    );
    const candidates = screen.getByTestId("rakkibha-candidates");
    expect(
      Array.from(candidates.querySelectorAll("[data-candidate-id]")).map(
        (button) => button.getAttribute("data-candidate-id"),
      ),
    ).toEqual(["option-1", "option-2"]);
    fireEvent.click(candidates.querySelectorAll("button")[1]);
    fireEvent.click(screen.getByRole("button", { name: "إرسال القطعة" }));
    fireEvent.click(
      screen.getByRole("button", { name: "جارٍ تثبيت الاختيار…" }),
    );
    expect(gameplayCommand).toHaveBeenCalledTimes(1);
    expect(gameplayCommand).toHaveBeenCalledWith(
      "gameplay-command",
      expect.objectContaining({
        commandType: "submit-candidate",
        payload: { contentItemId: "honeycomb", localCandidateId: "option-2" },
      }),
    );
    expect(document.body.textContent).not.toContain("canonicalIdentity");
    expect(
      screen.getByTestId("rakkibha-candidates").querySelector("div[dir='ltr']"),
    ).toBeTruthy();
  });
  it("keeps the authoritative race deadline across a reconnect render", () => {
    const view = runtime({
      myCandidatesJson: JSON.stringify({
        id: "holder-b",
        candidates: [
          {
            localId: "option-1",
            media: { type: "image", url: "/one.webp" },
          },
        ],
      }),
    });
    const rendered = render(<RakkibhaPanel runtime={view} />);
    expect(screen.getByRole("timer")).toHaveAttribute(
      "aria-label",
      "الوقت المتبقي 135 ثانية",
    );
    clock.nowMs += 5_000;
    rendered.rerender(<RakkibhaPanel runtime={view} />);
    expect(screen.getByRole("timer")).toHaveAttribute(
      "aria-label",
      "الوقت المتبقي 130 ثانية",
    );
  });
});

describe("Rakkibha private visuals: scale, geometry and order", () => {
  const withCandidates = (count: number) =>
    runtime({
      hasReference: false,
      myCandidatesJson: JSON.stringify({
        id: "view-1",
        candidates: Array.from({ length: count }, (_unused, index) => ({
          localId: `option-${index + 1}`,
          media: { type: "image", url: `/option-${index + 1}.webp` },
        })),
      }),
    });

  it("gives each candidate the full width of the phone, not a half-width thumbnail", () => {
    // The visual is the gameplay: the player is matching fine detail against a
    // teammate's spoken description. A two-column grid on a ~330px region left
    // each candidate ~142px wide with most of the height unused.
    render(<RakkibhaPanel runtime={withCandidates(2)} />);
    const grid = screen
      .getByTestId("rakkibha-candidates")
      .querySelector(".grid")!;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).not.toContain("grid-cols-2 ");
    // Rows share the height, so two and three candidates both fill the region.
    expect(grid.className).toContain("auto-rows-fr");
    expect(grid.className).toContain("flex-1");
  });

  it("only returns to two columns once there is real width", () => {
    render(<RakkibhaPanel runtime={withCandidates(2)} />);
    const grid = screen
      .getByTestId("rakkibha-candidates")
      .querySelector(".grid")!;
    expect(grid.className).toContain("sm:grid-cols-2");
  });

  it.each([2, 3])("keeps %s candidates in their authored order", (count) => {
    render(<RakkibhaPanel runtime={withCandidates(count)} />);
    const ids = [...document.querySelectorAll("[data-candidate-id]")].map(
      (node) => node.getAttribute("data-candidate-id"),
    );
    expect(ids).toEqual(
      Array.from({ length: count }, (_u, i) => `option-${i + 1}`),
    );
  });

  it.each([2, 3])(
    "contains the visual without cropping or mirroring it (%s candidates)",
    (count) => {
      // The pieces are compared by shape. A cover-crop would remove the very
      // detail being described, and any flip would invert the geometry the two
      // players are talking about.
      render(<RakkibhaPanel runtime={withCandidates(count)} />);
      for (const button of document.querySelectorAll("[data-candidate-id]")) {
        expect(button.className).toContain("object-contain");
        expect(button.className).not.toContain("object-cover");
        expect(button.className).not.toContain("scale-x-");
        expect(button.className).not.toContain("-scale-x");
        expect(button.className).not.toContain("rotate-");
      }
    },
  );

  it("draws the candidate strip left-to-right so RTL cannot invert it", () => {
    render(<RakkibhaPanel runtime={withCandidates(3)} />);
    const grid = screen
      .getByTestId("rakkibha-candidates")
      .querySelector(".grid")!;
    expect(grid.getAttribute("dir")).toBe("ltr");
  });

  it("shows a candidate holder no reference, and a reference holder no controls", () => {
    // The asymmetry is the mechanic; a bigger layout must not widen either half.
    const { unmount } = render(<RakkibhaPanel runtime={withCandidates(2)} />);
    expect(screen.queryByTestId("rakkibha-reference")).toBeNull();
    unmount();

    render(
      <RakkibhaPanel
        runtime={runtime({
          hasReference: true,
          myReferenceJson: JSON.stringify({
            media: { type: "image", url: "/reference.webp" },
          }),
        })}
      />,
    );
    expect(screen.queryByTestId("rakkibha-candidates")).toBeNull();
    expect(document.querySelector("[data-candidate-id]")).toBeNull();
    expect(document.body.textContent).not.toContain("إرسال القطعة");
  });

  it("keeps the reference holder's own visual large", () => {
    render(
      <RakkibhaPanel
        runtime={runtime({
          hasReference: true,
          myReferenceJson: JSON.stringify({
            media: { type: "image", url: "/reference.webp" },
          }),
        })}
      />,
    );
    const reference = screen.getByTestId("rakkibha-reference");
    expect(reference.className).toContain("flex-1");
    expect(reference.className).toContain("object-contain");
  });
});
