import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gameplay: undefined as unknown,
  gameplayCommand: vi.fn(),
  connection: "connected" as string,
  nowMs: Date.parse("2026-01-01T00:00:10.000Z"),
  reducedMotion: false,
}));

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({ useLiveSessionClock: () => mocks.nowMs }),
);

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      sessionId: "session-1",
      gameplay: mocks.gameplay,
      serverTimestamp: "2026-01-01T00:00:10.000Z",
      teams: [
        { id: "team-alpha", name: "ألفا" },
        { id: "team-beta", name: "بيتا" },
      ],
      participants: [],
    },
    snapshotReceivedAtMs: mocks.nowMs,
    gameplayCommand: mocks.gameplayCommand,
    connection: mocks.connection,
  }),
}));

import { MarhalaScreen } from "@/features/live-game-session/components/marhala-screen";
import { MarhalaPhonePanel } from "@/features/live-game-session/components/marhala-phone-panel";
import { MatchGameplayRenderer } from "@/features/live-game-session/match/match-stage-router";
import { MARHALA_MODE_KEY } from "@/features/live-game-session/match/marhala.presentation";

/**
 * "المرحلة" as the room and the players see it.
 *
 * The two views have different jobs and are tested as such: the shared screen must
 * keep the board readable and never claim anything the projection did not say, and
 * a phone must offer exactly the control the server authorized this actor for —
 * never one it merely knows the name of.
 */

const DEADLINE = "2026-01-01T00:00:40.000Z";

/** The shared projection: what `publicState` publishes with no actor. */
const sharedState = (overrides: Record<string, unknown> = {}) => ({
  phase: "difficulty-choice",
  activeTeamId: "team-alpha",
  teamIdsJson: JSON.stringify(["team-alpha", "team-beta"]),
  positionsJson: JSON.stringify({ "team-alpha": 5, "team-beta": 1 }),
  turnNumber: 3,
  availableDifficultiesJson: JSON.stringify(["easy", "medium", "hard"]),
  movementRangesJson: JSON.stringify({
    easy: { min: 1, max: 2 },
    medium: { min: 2, max: 4 },
    hard: { min: 4, max: 6 },
  }),
  ...overrides,
});

/** A question open, with the landings its band could produce. */
const questionState = (overrides: Record<string, unknown> = {}) =>
  sharedState({
    phase: "question",
    selectedDifficulty: "medium",
    possibleLandingsJson: JSON.stringify([7, 8, 9]),
    deadlineAt: DEADLINE,
    questionPrompt: JSON.stringify({ ar: "ما اسم هذه اللعبة؟" }),
    questionScopeId: "scope-gta",
    questionContentItemId: "item-1",
    ...overrides,
  });

const runtime = (modeState: Record<string, unknown>, actions: string[] = []) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: MARHALA_MODE_KEY, version: 1, stateSchemaVersion: 1 },
    status: "round-active",
    revision: 4,
    availableActions: actions,
    activeRound: { id: "round-1", sequence: 1, status: "active", modeState },
    modeState,
  }) as never;

/** Which tile a team's token is currently drawn on, straight from the DOM. */
const tokenTile = (teamId: string): number | undefined => {
  const token = screen.queryByTestId(`marhala-token-${teamId}`);
  const tile = token?.closest("[data-tile-kind]")?.getAttribute("data-testid");
  return tile ? Number(tile.replace("marhala-tile-", "")) : undefined;
};

beforeEach(() => {
  mocks.gameplay = undefined;
  mocks.gameplayCommand.mockReset();
  mocks.connection = "connected";
  mocks.nowMs = Date.parse("2026-01-01T00:00:10.000Z");
  window.matchMedia = ((query: string) => ({
    matches: mocks.reducedMotion && query.includes("reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as never;
  mocks.reducedMotion = false;
});

describe("routing a live المرحلة runtime", () => {
  it("gives the shared screen the board rather than the unsupported notice", () => {
    mocks.gameplay = runtime(sharedState());
    render(<MatchGameplayRenderer actor="shared-screen" />);
    expect(screen.getByTestId("marhala-screen")).toBeInTheDocument();
    expect(screen.getByTestId("marhala-board")).toBeInTheDocument();
    expect(screen.queryByTestId("runtime-renderer-missing")).toBeNull();
  });

  it("gives a phone the input surface, not the board", () => {
    mocks.gameplay = runtime(
      { ...sharedState(), actorTeamId: "team-alpha", isActiveTeam: true },
      ["mode:choose-marhala-difficulty"],
    );
    render(<MatchGameplayRenderer actor="participant" />);
    expect(screen.getByTestId("marhala-phone")).toBeInTheDocument();
    expect(screen.queryByTestId("marhala-board")).toBeNull();
  });

  it("routes by the runtime's key, never by the World it is played in", () => {
    // The same key from any World reaches the same screen; an unknown key still
    // says so rather than being mapped onto Marhala.
    mocks.gameplay = runtime(sharedState());
    const { rerender } = render(<MatchGameplayRenderer actor="controller" />);
    expect(screen.getByTestId("marhala-screen")).toBeInTheDocument();

    mocks.gameplay = {
      ...(runtime(sharedState()) as unknown as Record<string, unknown>),
      mode: { key: "not-a-mechanic", version: 1, stateSchemaVersion: 1 },
    };
    rerender(<MatchGameplayRenderer actor="controller" />);
    expect(screen.getByTestId("runtime-renderer-missing")).toBeInTheDocument();
    expect(screen.queryByTestId("marhala-screen")).toBeNull();
  });
});

describe("the shared screen during the decision", () => {
  const renderScreen = (state = sharedState()) =>
    render(<MarhalaScreen runtime={runtime(state)} />);

  it("shows the board, both positions and whose turn it is", () => {
    renderScreen();
    expect(screen.getByTestId("marhala-board")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("marhala-tile-5")).getByTestId(
        "marhala-token-team-alpha",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("marhala-tile-1")).getByTestId(
        "marhala-token-team-beta",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("marhala-standing-team-alpha")).toHaveTextContent(
      "دورهم",
    );
  });

  it("compares the three bands by where they could land from here", () => {
    renderScreen();
    // From tile 5: سهل reaches 6–7, متوسط reaches 7–9, صعب reaches 9–11.
    const easy = within(screen.getByTestId("marhala-band-easy"));
    expect(easy.getByTestId("marhala-landing-6")).toBeInTheDocument();
    expect(easy.getByTestId("marhala-landing-7")).toBeInTheDocument();

    const medium = within(screen.getByTestId("marhala-band-medium"));
    expect(medium.getByTestId("marhala-landing-9")).toHaveAttribute(
      "data-landing-kind",
      "trap",
    );

    const hard = within(screen.getByTestId("marhala-band-hard"));
    expect(hard.getByTestId("marhala-landing-10")).toHaveAttribute(
      "data-landing-kind",
      "boost",
    );
    expect(hard.getByTestId("marhala-landing-11")).toHaveAttribute(
      "data-landing-kind",
      "trap",
    );
  });

  it("shows a band the server has run out of as spent, not as an option", () => {
    renderScreen(
      sharedState({
        availableDifficultiesJson: JSON.stringify(["easy", "medium"]),
      }),
    );
    expect(screen.getByTestId("marhala-band-hard")).toHaveAttribute(
      "data-band-available",
      "false",
    );
    expect(screen.getByTestId("marhala-band-hard-spent")).toHaveTextContent(
      "لا أسئلة جديدة",
    );
    // And it is not dressed up as selectable by showing its destinations.
    expect(
      within(screen.getByTestId("marhala-band-hard")).queryByTestId(
        "marhala-landing-9",
      ),
    ).toBeNull();
  });

  it("does not invent availability the server withheld", () => {
    renderScreen(
      sharedState({ availableDifficultiesJson: JSON.stringify([]) }),
    );
    for (const band of ["easy", "medium", "hard"]) {
      expect(screen.getByTestId(`marhala-band-${band}`)).toHaveAttribute(
        "data-band-available",
        "false",
      );
    }
  });

  it("clamps a near-finish preview to the finish", () => {
    renderScreen(
      sharedState({
        positionsJson: JSON.stringify({ "team-alpha": 13, "team-beta": 2 }),
      }),
    );
    const hard = within(screen.getByTestId("marhala-band-hard"));
    expect(hard.getByTestId("marhala-landing-16")).toHaveAttribute(
      "data-landing-kind",
      "finish",
    );
    // No tile 17, 18 or 19 is claimed to exist.
    for (const position of [17, 18, 19]) {
      expect(screen.queryByTestId(`marhala-landing-${position}`)).toBeNull();
    }
  });

  it("shows no question before a band is committed", () => {
    renderScreen();
    expect(screen.queryByTestId("marhala-question")).toBeNull();
    expect(screen.getByTestId("marhala-decision")).toBeInTheDocument();
  });
});

describe("the shared screen with a question open", () => {
  it("keeps the board and adds the prompt beside it", () => {
    render(<MarhalaScreen runtime={runtime(questionState())} />);
    expect(screen.getByTestId("marhala-board")).toBeInTheDocument();
    expect(screen.getByTestId("marhala-question")).toHaveTextContent(
      "ما اسم هذه اللعبة؟",
    );
    // The decision is over; its comparison is gone rather than lingering.
    expect(screen.queryByTestId("marhala-decision")).toBeNull();
  });

  it("names the chosen band and its movement range", () => {
    render(<MarhalaScreen runtime={runtime(questionState())} />);
    const chip = screen.getByTestId("marhala-selected-band");
    expect(chip).toHaveTextContent("متوسط");
    expect(chip).toHaveTextContent("2–4");
  });

  it("highlights the tiles that band could still reach", () => {
    render(<MarhalaScreen runtime={runtime(questionState())} />);
    for (const position of [7, 8, 9]) {
      expect(screen.getByTestId(`marhala-tile-${position}`)).toHaveAttribute(
        "data-tile-highlighted",
        "true",
      );
    }
  });

  it("counts down from the server's own deadline", () => {
    render(<MarhalaScreen runtime={runtime(questionState())} />);
    // 30 seconds between the snapshot's server timestamp and the deadline.
    expect(screen.getByTestId("challenge-countdown")).toHaveTextContent("30");
  });

  it("shows a light preparing state if a reconnect lands on a pending draw", () => {
    render(
      <MarhalaScreen
        runtime={runtime(
          sharedState({
            phase: "question-pending",
            selectedDifficulty: "hard",
          }),
        )}
      />,
    );
    expect(screen.getByTestId("marhala-pending")).toHaveTextContent(
      "جارٍ تجهيز السؤال…",
    );
    // The board and the committed choice stay; no question is fabricated.
    expect(screen.getByTestId("marhala-board")).toBeInTheDocument();
    expect(screen.getByTestId("marhala-pending")).toHaveTextContent("صعب");
    expect(screen.queryByTestId("marhala-question")).toBeNull();
  });
});

describe("a resolved turn on the shared screen", () => {
  const turn = (overrides: Record<string, unknown> = {}) => ({
    turnNumber: 3,
    teamId: "team-alpha",
    difficulty: "medium",
    correct: true,
    resolvedBy: "answer",
    movement: 3,
    baseLanding: 8,
    tile: "normal",
    finalLanding: 8,
    ...overrides,
  });

  it("shows no movement for a wrong answer", () => {
    render(
      <MarhalaScreen
        runtime={runtime(
          sharedState({
            lastTurnJson: JSON.stringify(
              turn({
                correct: false,
                movement: undefined,
                baseLanding: undefined,
                tile: undefined,
                finalLanding: undefined,
              }),
            ),
          }),
        )}
      />,
    );
    const line = screen.getByTestId("marhala-last-turn");
    expect(line).toHaveAttribute("data-turn-outcome", "wrong");
    expect(line).toHaveTextContent("بقوا في مكانهم");
    expect(screen.queryByTestId("marhala-movement-reveal")).toBeNull();
    // The token is exactly where the projection says, with no punishment move.
    expect(
      within(screen.getByTestId("marhala-tile-5")).getByTestId(
        "marhala-token-team-alpha",
      ),
    ).toBeInTheDocument();
  });

  it("shows no movement for a timeout, and says the clock ran out", () => {
    render(
      <MarhalaScreen
        runtime={runtime(
          sharedState({
            lastTurnJson: JSON.stringify(
              turn({
                correct: false,
                resolvedBy: "timeout",
                movement: undefined,
                baseLanding: undefined,
                tile: undefined,
                finalLanding: undefined,
              }),
            ),
          }),
        )}
      />,
    );
    const line = screen.getByTestId("marhala-last-turn");
    expect(line).toHaveAttribute("data-turn-outcome", "timeout");
    expect(line).toHaveTextContent("انتهى وقت");
  });

  it("reports a correct turn with the server's roll and final tile", () => {
    render(
      <MarhalaScreen
        runtime={runtime(
          sharedState({
            positionsJson: JSON.stringify({
              "team-alpha": 8,
              "team-beta": 1,
            }),
            lastTurnJson: JSON.stringify(turn()),
          }),
        )}
      />,
    );
    const line = screen.getByTestId("marhala-last-turn");
    expect(line).toHaveAttribute("data-turn-outcome", "correct");
    expect(line).toHaveTextContent("3");
    expect(line).toHaveTextContent("8");
  });

  it("adopts the authoritative position on a reconnect instead of replaying", () => {
    // A fresh mount has no idea where the token was, so it shows where the server
    // says it is. Nothing is animated from an invented starting tile.
    render(
      <MarhalaScreen
        runtime={runtime(
          sharedState({
            positionsJson: JSON.stringify({ "team-alpha": 13, "team-beta": 1 }),
            lastTurnJson: JSON.stringify(
              turn({
                movement: 3,
                baseLanding: 8,
                tile: "boost",
                finalLanding: 13,
              }),
            ),
          }),
        )}
      />,
    );
    expect(
      within(screen.getByTestId("marhala-tile-13")).getByTestId(
        "marhala-token-team-alpha",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("marhala-movement-reveal")).toBeNull();
  });

  it("replays a turn it watched, tile by tile, then the boost", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <MarhalaScreen runtime={runtime(questionState())} />,
      );
      // The token is on 5 and the room has been watching it there.
      expect(tokenTile("team-alpha")).toBe(5);

      rerender(
        <MarhalaScreen
          runtime={runtime(
            sharedState({
              positionsJson: JSON.stringify({
                "team-alpha": 13,
                "team-beta": 1,
              }),
              lastTurnJson: JSON.stringify(
                turn({
                  movement: 3,
                  baseLanding: 8,
                  tile: "boost",
                  finalLanding: 13,
                }),
              ),
            }),
          )}
        />,
      );

      // The roll is revealed first, with the token still where it was.
      expect(screen.getByTestId("marhala-movement-reveal")).toHaveAttribute(
        "data-movement",
        "3",
      );
      expect(tokenTile("team-alpha")).toBe(5);

      // Sampled rather than timed: the assertion is the *path*, not the pace.
      const path: number[] = [5];
      let announcedOn: number | undefined;
      for (let sample = 0; sample < 24; sample += 1) {
        act(() => void vi.advanceTimersByTime(200));
        const tile = tokenTile("team-alpha");
        if (tile !== undefined && tile !== path[path.length - 1]) {
          path.push(tile);
        }
        if (
          announcedOn === undefined &&
          screen.queryByTestId("marhala-effect-boost")
        ) {
          announcedOn = tile;
        }
      }

      // Walked 6 → 7 → 8, and only then the boost's destination. Never a jump
      // straight to 13 just because the server had already committed it.
      expect(path).toEqual([5, 6, 7, 8, 13]);
      // And the room heard "قفزة" while the token still stood on the tile that
      // fired it, which is what makes the jump legible.
      expect(announcedOn).toBe(8);
      expect(tokenTile("team-alpha")).toBe(13);
    } finally {
      vi.useRealTimers();
    }
  });

  it("replays a trap the same way: base landing first, then the fall back", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <MarhalaScreen
          runtime={runtime(
            questionState({
              positionsJson: JSON.stringify({
                "team-alpha": 6,
                "team-beta": 1,
              }),
            }),
          )}
        />,
      );
      expect(tokenTile("team-alpha")).toBe(6);

      rerender(
        <MarhalaScreen
          runtime={runtime(
            sharedState({
              positionsJson: JSON.stringify({
                "team-alpha": 7,
                "team-beta": 1,
              }),
              lastTurnJson: JSON.stringify(
                turn({
                  movement: 3,
                  baseLanding: 9,
                  tile: "trap",
                  finalLanding: 7,
                }),
              ),
            }),
          )}
        />,
      );

      const path: number[] = [6];
      let announcedOn: number | undefined;
      for (let sample = 0; sample < 24; sample += 1) {
        act(() => void vi.advanceTimersByTime(200));
        const tile = tokenTile("team-alpha");
        if (tile !== undefined && tile !== path[path.length - 1]) {
          path.push(tile);
        }
        if (
          announcedOn === undefined &&
          screen.queryByTestId("marhala-effect-trap")
        ) {
          announcedOn = tile;
        }
      }
      // Forward to the tile the roll bought, and only then dragged back — the
      // hazard is a consequence the room watches happen, not a smaller roll.
      expect(path).toEqual([6, 7, 8, 9, 7]);
      expect(announcedOn).toBe(9);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispatches nothing while replaying, so no turn depends on a timer", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <MarhalaScreen runtime={runtime(questionState())} />,
      );
      rerender(
        <MarhalaScreen
          runtime={runtime(
            sharedState({
              positionsJson: JSON.stringify({
                "team-alpha": 13,
                "team-beta": 1,
              }),
              lastTurnJson: JSON.stringify(
                turn({
                  movement: 3,
                  baseLanding: 8,
                  tile: "boost",
                  finalLanding: 13,
                }),
              ),
            }),
          )}
        />,
      );
      // Drained frame by frame, the way the screen actually advances.
      for (let sample = 0; sample < 24; sample += 1) {
        act(() => void vi.advanceTimersByTime(200));
      }

      // Turn advancement, scoring, the next question and the tile resolution all
      // happened server-side before this screen ever saw the turn. A finished
      // animation must therefore command nothing at all.
      expect(mocks.gameplayCommand).not.toHaveBeenCalled();
      expect(tokenTile("team-alpha")).toBe(13);
    } finally {
      vi.useRealTimers();
    }
  });

  it("presents the outcome in one step under reduced motion", () => {
    mocks.reducedMotion = true;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as never;
    const { rerender } = render(
      <MarhalaScreen runtime={runtime(questionState())} />,
    );
    rerender(
      <MarhalaScreen
        runtime={runtime(
          sharedState({
            positionsJson: JSON.stringify({ "team-alpha": 13, "team-beta": 1 }),
            lastTurnJson: JSON.stringify(
              turn({
                movement: 3,
                baseLanding: 8,
                tile: "boost",
                finalLanding: 13,
              }),
            ),
          }),
        )}
      />,
    );
    // No walk, but the record is still readable: final tile plus what happened.
    expect(
      within(screen.getByTestId("marhala-tile-13")).getByTestId(
        "marhala-token-team-alpha",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("marhala-last-turn")).toHaveTextContent("قفزة");
  });
});

describe("the race ending on the shared screen", () => {
  it("names the winning team", () => {
    render(
      <MarhalaScreen
        runtime={runtime(
          sharedState({
            phase: "completed",
            positionsJson: JSON.stringify({ "team-alpha": 16, "team-beta": 9 }),
            resultJson: JSON.stringify({
              winnerTeamId: "team-alpha",
              endedBy: "finish",
              positions: { "team-alpha": 16, "team-beta": 9 },
              turnsPlayed: 7,
            }),
          }),
        )}
      />,
    );
    expect(screen.getByTestId("marhala-finished")).toHaveTextContent("ألفا");
  });

  it("says the questions ran out, without a loser and without a reward", () => {
    render(
      <MarhalaScreen
        runtime={runtime(
          sharedState({
            phase: "completed",
            resultJson: JSON.stringify({
              winnerTeamId: null,
              endedBy: "content-exhausted",
              positions: { "team-alpha": 5, "team-beta": 1 },
              turnsPlayed: 4,
            }),
          }),
        )}
      />,
    );
    const panel = screen.getByTestId("marhala-exhausted");
    expect(panel).toHaveTextContent("خلصت الأسئلة الجديدة المتاحة لهذا التحدي");
    expect(panel).toHaveTextContent("لم تُمنح نقاط");
    expect(screen.queryByTestId("marhala-finished")).toBeNull();
  });

  it("never prints a raw technical label", () => {
    render(
      <MarhalaScreen
        runtime={runtime(
          sharedState({
            phase: "completed",
            resultJson: JSON.stringify({
              winnerTeamId: null,
              endedBy: "content-exhausted",
              positions: {},
              turnsPlayed: 2,
            }),
          }),
        )}
      />,
    );
    const text = screen.getByTestId("marhala-screen").textContent ?? "";
    for (const leak of [
      "winnerTeamId",
      "endedBy",
      "content-exhausted",
      "challenge.win",
      "MATCH_CONTENT_EXHAUSTED_FOR_ACCOUNT",
      "marhalaDifficulty",
      "question-pending",
    ]) {
      expect(text).not.toContain(leak);
    }
  });
});

describe("the active team's phone", () => {
  const activeState = (overrides: Record<string, unknown> = {}) => ({
    ...sharedState(overrides),
    actorTeamId: "team-alpha",
    isActiveTeam: true,
  });

  it("offers the three bands with their ranges and destinations", () => {
    render(
      <MarhalaPhonePanel
        runtime={runtime(activeState(), ["mode:choose-marhala-difficulty"])}
      />,
    );
    expect(screen.getByTestId("marhala-band-choices")).toBeInTheDocument();
    expect(screen.getByTestId("marhala-choose-easy")).toHaveTextContent("1–2");
    expect(screen.getByTestId("marhala-choose-medium")).toHaveTextContent(
      "2–4",
    );
    expect(screen.getByTestId("marhala-choose-hard")).toHaveTextContent("4–6");
    // The phone is an input surface: no board on it.
    expect(screen.queryByTestId("marhala-board")).toBeNull();
  });

  it("sends the chosen band through the existing command client", () => {
    render(
      <MarhalaPhonePanel
        runtime={runtime(activeState(), ["mode:choose-marhala-difficulty"])}
      />,
    );
    screen.getByTestId("marhala-choose-hard").click();
    expect(mocks.gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "choose-marhala-difficulty",
      payload: { difficulty: "hard" },
    });
  });

  it("cannot dispatch a band the server marked unavailable", () => {
    render(
      <MarhalaPhonePanel
        runtime={runtime(
          activeState({
            availableDifficultiesJson: JSON.stringify(["easy"]),
          }),
          ["mode:choose-marhala-difficulty"],
        )}
      />,
    );
    const hard = screen.getByTestId("marhala-choose-hard");
    expect(hard).toBeDisabled();
    expect(hard).toHaveTextContent("لا أسئلة جديدة");
    hard.click();
    expect(mocks.gameplayCommand).not.toHaveBeenCalled();
  });

  it("takes the answer through the shared match input, and sends no answers back down", () => {
    render(
      <MarhalaPhonePanel
        runtime={runtime(
          { ...questionState(), actorTeamId: "team-alpha", isActiveTeam: true },
          ["mode:submit-marhala-answer"],
        )}
      />,
    );
    const form = screen.getByTestId("marhala-answer-form");
    expect(form).toHaveTextContent("ما اسم هذه اللعبة؟");
    expect(screen.getByLabelText("الإجابة")).toBeInTheDocument();
    // The projection carries a prompt and never accepted answers; there is
    // nothing on this phone that could leak one.
    expect(form.textContent).not.toContain("acceptedAnswers");
  });

  it("cannot choose a second band while the draw is pending", () => {
    render(
      <MarhalaPhonePanel
        runtime={runtime(
          {
            ...activeState({
              phase: "question-pending",
              selectedDifficulty: "hard",
            }),
          },
          ["mode:choose-marhala-difficulty"],
        )}
      />,
    );
    expect(screen.getByTestId("marhala-phone-pending")).toBeInTheDocument();
    expect(screen.queryByTestId("marhala-band-choices")).toBeNull();
    expect(screen.queryByTestId("marhala-choose-hard")).toBeNull();
  });
});

describe("what a phone can and cannot see", () => {
  it("renders only the fields the projection actually carries", () => {
    // The runtime keeps `acceptedAnswers` inside the question it drew and its
    // projection publishes a prompt instead — so there is nothing to leak. Even
    // handed a state that carried them, nothing here reads or prints them: a field
    // being expressible in a type is not permission to render it.
    const contaminated = {
      ...questionState(),
      actorTeamId: "team-alpha",
      isActiveTeam: true,
      acceptedAnswers: JSON.stringify(["جي تي إي", "GTA"]),
      questionAcceptedAnswers: "جي تي إي",
    };
    render(
      <MarhalaPhonePanel
        runtime={runtime(contaminated, ["mode:submit-marhala-answer"])}
      />,
    );
    const text = screen.getByTestId("marhala-phone").textContent ?? "";
    expect(text).toContain("ما اسم هذه اللعبة؟");
    expect(text).not.toContain("جي تي إي");
    expect(text).not.toContain("GTA");
    expect(text).not.toContain("acceptedAnswers");
  });

  it("prints no raw technical label on a phone either", () => {
    render(
      <MarhalaPhonePanel
        runtime={runtime(
          {
            ...sharedState({
              phase: "question-pending",
              selectedDifficulty: "hard",
              availableDifficultiesJson: JSON.stringify(["easy"]),
            }),
            actorTeamId: "team-alpha",
            isActiveTeam: true,
          },
          ["mode:choose-marhala-difficulty"],
        )}
      />,
    );
    const text = screen.getByTestId("marhala-phone").textContent ?? "";
    for (const leak of [
      "question-pending",
      "marhalaDifficulty",
      "availableDifficulties",
      "isActiveTeam",
      "mode:choose-marhala-difficulty",
      "easy",
      "hard",
    ]) {
      expect(text).not.toContain(leak);
    }
  });
});

describe("the opposing team's phone", () => {
  const opposingState = (overrides: Record<string, unknown> = {}) => ({
    ...sharedState(overrides),
    actorTeamId: "team-beta",
    isActiveTeam: false,
  });

  it("waits during the other team's decision", () => {
    render(<MarhalaPhonePanel runtime={runtime(opposingState(), [])} />);
    expect(screen.getByTestId("marhala-phone-waiting")).toHaveTextContent(
      "دور الفريق الآخر",
    );
    expect(screen.queryByTestId("marhala-band-choices")).toBeNull();
  });

  it("cannot choose a band even if the action name is present", () => {
    // Belt and braces: the server does not offer this action to a non-active
    // team, and the panel additionally refuses to render it without the server's
    // own `isActiveTeam`. Authorization is never the disabled attribute.
    render(
      <MarhalaPhonePanel
        runtime={runtime(opposingState(), ["mode:choose-marhala-difficulty"])}
      />,
    );
    expect(screen.queryByTestId("marhala-choose-easy")).toBeNull();
    expect(mocks.gameplayCommand).not.toHaveBeenCalled();
  });

  it("cannot answer the active team's question", () => {
    render(
      <MarhalaPhonePanel
        runtime={runtime(
          { ...questionState(), actorTeamId: "team-beta", isActiveTeam: false },
          ["mode:submit-marhala-answer"],
        )}
      />,
    );
    expect(screen.queryByTestId("marhala-answer-form")).toBeNull();
    expect(screen.getByTestId("marhala-phone-waiting")).toHaveTextContent(
      "الفريق الآخر يجيب",
    );
  });

  it("adopts the action set of whatever state it reconnects into", () => {
    const { rerender } = render(
      <MarhalaPhonePanel runtime={runtime(opposingState(), [])} />,
    );
    expect(screen.queryByTestId("marhala-band-choices")).toBeNull();

    // The turn passes: the same phone becomes the active one purely because the
    // server said so in the next snapshot.
    rerender(
      <MarhalaPhonePanel
        runtime={runtime(
          {
            ...sharedState({ activeTeamId: "team-beta" }),
            actorTeamId: "team-beta",
            isActiveTeam: true,
          },
          ["mode:choose-marhala-difficulty"],
        )}
      />,
    );
    expect(screen.getByTestId("marhala-band-choices")).toBeInTheDocument();
  });
});
