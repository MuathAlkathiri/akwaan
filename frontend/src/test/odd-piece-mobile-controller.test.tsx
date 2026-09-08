import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OddPieceGameplayPanel } from "@/features/live-game-session/components/odd-piece-gameplay-panel";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  connection: "connected",
  now: Date.parse("2026-09-05T12:00:00.000Z"),
  receivedAt: Date.parse("2026-09-05T12:00:00.000Z"),
}));

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({
    useLiveSessionClock: () => mocks.now,
  }),
);
vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      serverTimestamp: "2026-09-05T12:00:00.000Z",
      teams: [
        { id: "team-a", name: "ألفا" },
        { id: "team-b", name: "بيتا" },
      ],
    },
    snapshotReceivedAtMs: mocks.receivedAt,
    gameplayCommand: mocks.command,
    connection: mocks.connection,
  }),
}));

const IDS = ["piece-z", "piece-a", "piece-q", "piece-b"];
const phonePieces = IDS.map((id) => ({ id }));
const hostPieces = IDS.map((id) => ({
  id,
  imageUrl: `https://private.example/${id}.jpg`,
  altText: `visual-${id}`,
}));

const stateWith = (overrides: Record<string, unknown> = {}) => ({
  phase: "open",
  currentPuzzleIndex: 0,
  puzzleCount: 3,
  prompt: "اختر القطعة الدخيلة",
  piecesJson: JSON.stringify(phonePieces),
  failedTeamIdsJson: "[]",
  actorTeamId: "team-a",
  canClaim: true,
  canSelect: false,
  attemptUsed: false,
  deadlineAt: "2026-09-05T12:00:30.000Z",
  ...overrides,
});

const runtimeWith = (
  state = stateWith(),
  actions = ["mode:claim-odd-piece", "mode:submit-odd-piece"],
) =>
  ({
    runtimeId: "runtime-odd",
    sessionId: "session-1",
    revision: 5,
    status: "round-active",
    mode: { key: "odd-piece", version: 1 },
    modeState: state,
    activeRound: { id: "round-1", status: "active" },
    availableActions: actions,
  }) as unknown as GameplayRuntimeSnapshot;

beforeEach(() => {
  mocks.command.mockReset();
  mocks.connection = "connected";
  mocks.now = mocks.receivedAt;
});

describe("القطعة الدخيلة phone controller", () => {
  it("uses a compact controller and renders no visual-puzzle or grading data", () => {
    render(
      <OddPieceGameplayPanel runtime={runtimeWith()} actor="participant" />,
    );
    expect(
      screen.getByTestId("odd-piece-phone-controller"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("challenge-frame").innerHTML).toContain("px-4");
    expect(screen.queryByTestId("odd-piece-grid")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(document.body).not.toHaveTextContent("private.example");
    expect(document.body).not.toHaveTextContent("targetVehicleReveal");
    expect(document.body).not.toHaveTextContent("correctPieceId");
  });

  it("submits one exact claim and converges when the opponent wins the CAS", () => {
    const { rerender } = render(
      <OddPieceGameplayPanel runtime={runtimeWith()} actor="participant" />,
    );
    const claim = screen.getByTestId("odd-piece-phone-claim");
    fireEvent.click(claim);
    fireEvent.click(claim);
    expect(mocks.command).toHaveBeenCalledTimes(1);
    expect(mocks.command).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "claim-odd-piece",
      payload: {},
    });
    expect(claim).toBeDisabled();
    expect(screen.queryByTestId("odd-piece-phone-piece-controls")).toBeNull();

    rerender(
      <OddPieceGameplayPanel
        runtime={runtimeWith(
          stateWith({
            phase: "selecting",
            answerOwnerTeamId: "team-b",
            canClaim: false,
          }),
        )}
        actor="participant"
      />,
    );
    expect(screen.queryByTestId("odd-piece-phone-claim")).toBeNull();
    expect(screen.queryByTestId("odd-piece-phone-piece-controls")).toBeNull();
    expect(screen.getByTestId("odd-piece-phone-waiting")).toHaveTextContent(
      "بيتا",
    );
  });

  it("maps numbers to the authoritative ID order without RTL reversal", () => {
    render(
      <OddPieceGameplayPanel
        runtime={runtimeWith(
          stateWith({
            phase: "selecting",
            answerOwnerTeamId: "team-a",
            canClaim: false,
            canSelect: true,
            deadlineAt: null,
          }),
        )}
        actor="participant"
      />,
    );
    const controls = screen.getByTestId("odd-piece-phone-piece-controls");
    expect(controls).toHaveAttribute("dir", "ltr");
    expect(
      Array.from(controls.querySelectorAll("button")).map((button) => [
        button.dataset.pieceId,
        button.textContent,
      ]),
    ).toEqual([
      ["piece-z", "1"],
      ["piece-a", "2"],
      ["piece-q", "3"],
      ["piece-b", "4"],
    ]);
  });

  it("selects without submitting, then submits the exact stable ID once", () => {
    render(
      <OddPieceGameplayPanel
        runtime={runtimeWith(
          stateWith({
            phase: "selecting",
            answerOwnerTeamId: "team-a",
            canClaim: false,
            canSelect: true,
            deadlineAt: null,
          }),
        )}
        actor="participant"
      />,
    );
    fireEvent.click(screen.getByTestId("odd-piece-phone-select-piece-q"));
    expect(mocks.command).not.toHaveBeenCalled();
    const submit = screen.getByTestId("odd-piece-phone-submit");
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mocks.command).toHaveBeenCalledTimes(1);
    expect(mocks.command).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-odd-piece",
      payload: { pieceId: "piece-q" },
    });
    expect(submit).toBeDisabled();
  });

  it("keeps the same puzzle IDs/order across a wrong-answer transfer", () => {
    const selecting = stateWith({
      phase: "selecting",
      answerOwnerTeamId: "team-a",
      canClaim: false,
      canSelect: true,
      deadlineAt: null,
    });
    const { rerender } = render(
      <OddPieceGameplayPanel
        runtime={runtimeWith(selecting)}
        actor="participant"
      />,
    );
    const before = Array.from(
      screen
        .getByTestId("odd-piece-phone-piece-controls")
        .querySelectorAll("button"),
    ).map((button) => button.dataset.pieceId);
    rerender(
      <OddPieceGameplayPanel
        runtime={runtimeWith(
          stateWith({
            phase: "selecting",
            answerOwnerTeamId: "team-b",
            failedTeamIdsJson: JSON.stringify(["team-a"]),
            canClaim: false,
            canSelect: false,
            attemptUsed: true,
            deadlineAt: null,
          }),
        )}
        actor="participant"
      />,
    );
    expect(screen.getByTestId("odd-piece-phone-waiting")).toHaveTextContent(
      "انتهت محاولة فريقكم",
    );
    expect(screen.queryByTestId("odd-piece-phone-piece-controls")).toBeNull();
    expect(
      JSON.parse(String(runtimeWith(selecting).modeState.piecesJson)).map(
        (p: { id: string }) => p.id,
      ),
    ).toEqual(before);
  });

  it("keeps the authoritative deadline across rerenders and reconnect", () => {
    const { rerender } = render(
      <OddPieceGameplayPanel runtime={runtimeWith()} actor="participant" />,
    );
    expect(screen.getByTestId("challenge-countdown")).toHaveTextContent("30");
    mocks.connection = "reconnecting";
    mocks.now += 5_000;
    rerender(
      <OddPieceGameplayPanel runtime={runtimeWith()} actor="participant" />,
    );
    expect(screen.getByTestId("challenge-countdown")).toHaveTextContent("25");
  });

  it("gives the phone answer truth as piece numbers, never identities or media", () => {
    // The device split is unchanged: the two vehicle identities and the proof
    // photo are the shared screen's job, and a phone here is a numbered input
    // surface — the server strips image urls from its pieces for that reason.
    // The numbers carry the whole answer without carrying any of that.
    render(
      <OddPieceGameplayPanel
        runtime={runtimeWith(
          stateWith({
            phase: "revealed",
            canClaim: false,
            deadlineAt: null,
            // `piece-q` is the third piece, so it is "القطعة 3" on the board.
            attemptsJson: JSON.stringify([
              { teamId: "team-a", pieceId: "piece-a", correct: false },
              { teamId: "team-b", pieceId: "piece-q", correct: true },
            ]),
            revealJson: JSON.stringify({
              oddPieceId: "piece-q",
              targetVehicleLabel: "BMW M4",
              intruderVehicleLabel: "AMG C63",
              targetReveal: { imageUrl: "https://private.example/full.jpg" },
            }),
          }),
        )}
        actor="participant"
      />,
    );
    expect(screen.getByTestId("odd-piece-phone-resolved")).toBeInTheDocument();
    // What this team picked, and what the answer was, by board number.
    expect(screen.getByTestId("odd-piece-phone-selected")).toHaveTextContent(
      "القطعة 2",
    );
    expect(screen.getByTestId("odd-piece-phone-odd")).toHaveTextContent(
      "القطعة 3",
    );
    expect(document.body).toHaveTextContent("إجابة غير صحيحة");
    // And none of the shared screen's material followed it here.
    expect(document.body).not.toHaveTextContent("BMW M4");
    expect(document.body).not.toHaveTextContent("AMG C63");
    expect(document.querySelector("img")).toBeNull();
    expect(document.body.innerHTML).not.toContain("private.example");
  });

  it("reveals no canonical piece while the opponent still owns an attempt", () => {
    // The transfer window. The second team is still solving this puzzle, so the
    // odd piece's number would be the answer handed straight to it.
    render(
      <OddPieceGameplayPanel
        runtime={runtimeWith(
          stateWith({
            phase: "selecting",
            canClaim: false,
            canSelect: false,
            attemptUsed: true,
            // The server projects neither of these before the puzzle is
            // terminal; this asserts the phone shows nothing even so.
            attemptsJson: "[]",
          }),
        )}
        actor="participant"
      />,
    );
    expect(screen.queryByTestId("odd-piece-phone-resolved")).toBeNull();
    expect(screen.queryByTestId("odd-piece-phone-odd")).toBeNull();
    expect(screen.queryByTestId("odd-piece-phone-selected")).toBeNull();
  });

  it("preserves the host visual board and mandatory full-vehicle reveal", () => {
    const { rerender } = render(
      <OddPieceGameplayPanel
        runtime={runtimeWith(
          stateWith({ piecesJson: JSON.stringify(hostPieces) }),
        )}
        actor="shared-screen"
      />,
    );
    expect(
      screen.getByTestId("odd-piece-grid").querySelectorAll("img"),
    ).toHaveLength(4);
    rerender(
      <OddPieceGameplayPanel
        runtime={runtimeWith(
          stateWith({
            phase: "revealed",
            piecesJson: JSON.stringify(hostPieces),
            deadlineAt: null,
            revealJson: JSON.stringify({
              oddPieceId: "piece-q",
              targetVehicleLabel: "BMW M4",
              intruderVehicleLabel: "AMG C63",
              targetReveal: { imageUrl: "https://private.example/full.jpg" },
            }),
          }),
        )}
        actor="shared-screen"
      />,
    );
    expect(screen.getByTestId("odd-piece-target-reveal")).toBeInTheDocument();
    expect(screen.getByText(/BMW M4/)).toBeInTheDocument();
  });

  it("keeps the controller mounted through preparation, next puzzle, and completion", () => {
    const { rerender } = render(
      <OddPieceGameplayPanel runtime={runtimeWith()} actor="participant" />,
    );
    const controller = screen.getByTestId("odd-piece-phone-controller");
    rerender(
      <OddPieceGameplayPanel
        runtime={runtimeWith(
          stateWith({ phase: "preparing", currentPuzzleIndex: 1 }),
        )}
        actor="participant"
      />,
    );
    expect(screen.getByTestId("odd-piece-phone-controller")).toBe(controller);
    expect(screen.getByTestId("odd-piece-phone-preparing")).toBeInTheDocument();
    rerender(
      <OddPieceGameplayPanel
        runtime={runtimeWith(
          stateWith({ phase: "completed", currentPuzzleIndex: 2 }),
        )}
        actor="participant"
      />,
    );
    expect(screen.getByTestId("odd-piece-phone-controller")).toBe(controller);
    expect(screen.getByTestId("odd-piece-phone-complete")).toBeInTheDocument();
  });
});
