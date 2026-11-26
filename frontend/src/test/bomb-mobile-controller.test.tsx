import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { BombGameplayPanel } from "@/features/live-game-session/components/bomb-gameplay-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * القنبلة, split across surfaces.
 *
 * Bomb authorises per *participant*, not per team: the runtime names one
 * `activeParticipantId` and the server only puts `mode:submit-answer` in that
 * phone's `availableActions`. So "may this phone act" is never computed here —
 * and the sharpest assertions below are about the phones that may not, which
 * must not even hold the clock.
 */

/** Captures the callbacks the panel hands the voice hook, so a test can fire a
 *  final transcript exactly the way real speech recognition would. */
const voiceMock = vi.hoisted(() => ({
  onAnswer: undefined as ((value: string) => void) | undefined,
  onSkip: undefined as (() => void) | undefined,
  state: "idle" as string,
}));

vi.mock("@/features/live-game-session/hooks/use-bomb-voice-input", () => ({
  VOICE_MESSAGES: {
    idle: "",
    listening: "أستمع…",
    processing: "جارٍ المعالجة…",
    recognized: "تم",
    unsupported: "غير مدعوم",
    denied: "مرفوض",
    error: "خطأ",
  },
  useBombVoiceInput: (input: {
    onAnswer: (value: string) => void;
    onSkip: () => void;
  }) => {
    voiceMock.onAnswer = input.onAnswer;
    voiceMock.onSkip = input.onSkip;
    return {
      state: voiceMock.state as "idle",
      transcript: "",
      start: vi.fn(),
      stop: vi.fn(),
    };
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/join/live-session/ABC123",
}));

const team = (
  id: string,
  name: string,
  remainingMs: number,
  over: Record<string, unknown> = {},
) => ({
  id,
  name,
  active: true,
  // The authoritative TeamClock the session persists; the phone only reads it.
  clock: { remainingMs, running: false, startedAt: null, ...over },
});
const PROMPT = "وش اسم عاصمة اليابان؟";
const IMAGE = "/uploads/question-assets/tokyo.jpg";
const ACTOR_ACTIONS = ["mode:submit-answer", "mode:skip"];

const runtimeOf = (
  over: Record<string, unknown> = {},
  actions: string[] = ACTOR_ACTIONS,
  modeState: Record<string, unknown> = {},
) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "bomb", version: 1 },
    status: "round-active",
    revision: 4,
    availableActions: actions,
    activeTeamId: "team-alpha",
    prompt: PROMPT,
    currentItem: { index: 1, totalItems: 10 },
    activeRound: {
      id: "round-1",
      sequence: 1,
      status: "active",
      activeParticipantId: "p-1",
      modeState: { phase: "presenting", itemIndex: 1, itemCount: 10, ...modeState },
    },
    ...over,
  }) as unknown as GameplayRuntimeSnapshot;

const context = (
  gameplayCommand = vi.fn(),
  clockOver: Record<string, unknown> = {},
  over: Record<string, unknown> = {},
) =>
  ({
    snapshot: {
      sessionId: "session-1",
      revision: 4,
      status: "active",
      serverTimestamp: "2026-01-01T00:00:10.000Z",
      teams: [
        team("team-alpha", "أسود الشمال", 18_000, clockOver),
        team("team-beta", "صقور الرياض", 30_000),
      ],
      participants: [
        { id: "p-1", displayName: "مُعاذ", teamId: "team-alpha", role: "player" },
        { id: "p-2", displayName: "سالم", teamId: "team-alpha", role: "player" },
        { id: "p-3", displayName: "خالد", teamId: "team-beta", role: "player" },
      ],
      availableActions: [],
    },
    snapshotReceivedAtMs: Date.parse("2026-01-01T00:00:10.000Z"),
    connection: "connected",
    gameplayCommand,
    resync: vi.fn(),
    ...over,
  }) as never;

const phoneTree = (
  runtime: GameplayRuntimeSnapshot,
  cmd: ReturnType<typeof vi.fn>,
  clockOver: Record<string, unknown> = {},
  over: Record<string, unknown> = {},
) => (
  <LiveSessionContext.Provider value={context(cmd, clockOver, over)}>
    <MobileGameplayShell participantId="p-1">
      <BombGameplayPanel runtime={runtime} />
    </MobileGameplayShell>
  </LiveSessionContext.Provider>
);

const renderPhone = (
  runtime = runtimeOf(),
  cmd = vi.fn(),
  clockOver: Record<string, unknown> = {},
) => {
  const view = render(phoneTree(runtime, cmd, clockOver));
  return { ...view, cmd };
};

/** The shared screen: no phone shell, and the router strips its actions. */
const renderHost = (runtime = runtimeOf({}, []), cmd = vi.fn()) => {
  render(
    <LiveSessionContext.Provider value={context(cmd)}>
      <BombGameplayPanel runtime={runtime} />
    </LiveSessionContext.Provider>,
  );
  return { cmd };
};

const withImage = (actions = ACTOR_ACTIONS) =>
  runtimeOf(
    {
      currentItem: {
        index: 1,
        totalItems: 10,
        media: { type: "image", url: IMAGE, altText: "طوكيو" },
      },
    },
    actions,
    { mediaType: "image", mediaUrl: IMAGE },
  );

describe("the acting phone", () => {
  it("gets the concise question text near the keyboard", () => {
    renderPhone();
    expect(screen.getByTestId("bomb-phone-prompt")).toHaveTextContent(PROMPT);
  });

  it("never renders the item image, even when the item has one", () => {
    renderPhone(withImage());
    expect(document.querySelector("img")).toBeNull();
    expect(document.body.innerHTML).not.toContain("tokyo.jpg");
    // …but the wording still reaches the answerer.
    expect(screen.getByTestId("bomb-phone-prompt")).toHaveTextContent(PROMPT);
  });

  it("never renders a historical audio player", () => {
    renderPhone(
      runtimeOf({}, ACTOR_ACTIONS, {
        mediaType: "audio",
        mediaUrl: "/uploads/question-assets/clip.mp3",
      }),
    );
    expect(document.querySelector("audio")).toBeNull();
  });

  it("shows the compact authoritative clock", () => {
    renderPhone();
    expect(screen.getByTestId("bomb-phone-clock")).toHaveTextContent("0:18");
  });

  it("marks the clock urgent at low time without changing any rule", () => {
    renderPhone(runtimeOf(), vi.fn(), { remainingMs: 4_000 });
    expect(screen.getByTestId("bomb-phone-clock")).toHaveAttribute(
      "data-urgency",
      "critical",
    );
  });

  it("puts typing first and the microphone beside it", () => {
    renderPhone();
    const answer = screen.getByTestId("bomb-phone-answer");
    const mic = screen.getByTestId("bomb-phone-voice");
    expect(answer.className).toContain("h-16");
    // Secondary: a round icon button, never the centrepiece the old panel had.
    expect(mic.className).toContain("size-14");
    expect(mic.className).not.toContain("size-20");
  });

  it("submits with the mechanic's exact command", () => {
    const { cmd } = renderPhone();
    fireEvent.change(screen.getByTestId("bomb-phone-answer"), {
      target: { value: "  طوكيو  " },
    });
    fireEvent.click(screen.getByTestId("bomb-phone-submit"));
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-answer",
      payload: { answer: "طوكيو" },
    }, expect.anything());
  });

  it("skips with the canonical command and never subtracts time itself", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("bomb-phone-skip"));
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "skip",
      payload: {},
    }, expect.anything());
    // The clock is untouched by the client: only the server takes the 5 seconds.
    expect(screen.getByTestId("bomb-phone-clock")).toHaveTextContent("0:18");
  });

  it("lets one answer window produce exactly one command, however it arrives", () => {
    const { cmd } = renderPhone();
    const input = screen.getByTestId("bomb-phone-answer");
    fireEvent.change(input, { target: { value: "طوكيو" } });
    fireEvent.click(screen.getByTestId("bomb-phone-submit"));
    // A second tap, an Enter, and a skip all land in the same window.
    fireEvent.click(screen.getByTestId("bomb-phone-submit"));
    fireEvent.submit(screen.getByTestId("bomb-phone-controls"));
    fireEvent.click(screen.getByTestId("bomb-phone-skip"));
    expect(cmd).toHaveBeenCalledTimes(1);
  });

  it("lets voice and typing share one window, not one each", () => {
    // The real risk: a final transcript arrives in the same window as a tap.
    // Both paths call `submitAnswer`, so the guard has to hold across them.
    const { cmd } = renderPhone();
    fireEvent.change(screen.getByTestId("bomb-phone-answer"), {
      target: { value: "طوكيو" },
    });
    fireEvent.click(screen.getByTestId("bomb-phone-submit"));
    expect(cmd).toHaveBeenCalledTimes(1);
    // Speech recognition finalises just afterwards.
    voiceMock.onAnswer?.("طوكيو");
    voiceMock.onAnswer?.("طوكيو");
    expect(cmd).toHaveBeenCalledTimes(1);
  });

  it("routes a voice answer through the same command as typing", () => {
    const { cmd } = renderPhone();
    voiceMock.onAnswer?.("  طوكيو  ");
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-answer",
      payload: { answer: "طوكيو" },
    }, expect.anything());
  });

  it("routes a voice skip through the canonical skip command", () => {
    const { cmd } = renderPhone();
    voiceMock.onSkip?.();
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "skip",
      payload: {},
    }, expect.anything());
  });

  it("releases the guard when the server advances the item", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(runtimeOf(), cmd);
    fireEvent.change(screen.getByTestId("bomb-phone-answer"), {
      target: { value: "طوكيو" },
    });
    fireEvent.click(screen.getByTestId("bomb-phone-submit"));
    rerender(
      phoneTree(
        runtimeOf({ currentItem: { index: 2, totalItems: 10 } }, ACTOR_ACTIONS, {
          itemIndex: 2,
        }),
        cmd,
      ),
    );
    fireEvent.change(screen.getByTestId("bomb-phone-answer"), {
      target: { value: "أوساكا" },
    });
    fireEvent.click(screen.getByTestId("bomb-phone-submit"));
    expect(cmd).toHaveBeenCalledTimes(2);
  });
});

/**
 * The reported fault: a player types an answer, it does not go, and the clock
 * runs their team out. The phone's one-command-per-window lock was released
 * only when the item, the turn, the phase or the owner moved. A wrong answer
 * moves none of them — the server answers it with the same item, the same
 * team and a `bomb-answer-incorrect` transition — so after one wrong answer
 * the field, the send button, the microphone and skip all stayed disabled
 * until the clock expired.
 *
 * The lock now opens on the answer to *this* command, carried by the
 * connection: accepted (and judged wrong, or moved on), refused, or no answer
 * at all after the connection's bounded, same-id resends.
 */
describe("the answer lock opens on this command's own outcome", () => {
  type Delivery = {
    onOutcome: (outcome: Record<string, unknown>) => void;
    canResend: (latest: unknown) => boolean;
  };
  const deliveryOf = (cmd: ReturnType<typeof vi.fn>, call = -1) =>
    cmd.mock.calls.at(call)![2] as Delivery;

  /** What the server sends back after judging a submission wrong. */
  const afterWrongAnswer = (revision = 5) =>
    runtimeOf({
      revision,
      transitions: [
        { revision, type: "bomb-answer-incorrect", roundId: "round-1" },
      ],
    });

  const send = (value: string) => {
    fireEvent.change(screen.getByTestId("bomb-phone-answer"), {
      target: { value },
    });
    fireEvent.click(screen.getByTestId("bomb-phone-submit"));
  };
  const answerField = () => screen.getByTestId("bomb-phone-answer");
  const notice = () => screen.queryByTestId("bomb-phone-answer-notice");

  it("lets the player answer again after a wrong answer", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(runtimeOf(), cmd);
    send("أوساكا");
    act(() =>
      deliveryOf(cmd).onOutcome({ status: "accepted", runtimeRevision: 5 }),
    );
    rerender(phoneTree(afterWrongAnswer(), cmd));

    expect(answerField()).not.toBeDisabled();
    expect(screen.getByTestId("bomb-phone-skip")).not.toBeDisabled();
    expect(notice()).toHaveTextContent("غلط");
    send("طوكيو");
    expect(cmd).toHaveBeenCalledTimes(2);
    expect(cmd).toHaveBeenLastCalledWith(
      "gameplay-command",
      {
        roundId: "round-1",
        commandType: "submit-answer",
        payload: { answer: "طوكيو" },
      },
      expect.anything(),
    );
  });

  it("waits for the state the server answered with before reading its verdict", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(runtimeOf(), cmd);
    send("أوساكا");
    act(() =>
      deliveryOf(cmd).onOutcome({ status: "accepted", runtimeRevision: 5 }),
    );
    // The acknowledgement can overtake the snapshot it describes.
    expect(answerField()).toBeDisabled();
    rerender(phoneTree(afterWrongAnswer(), cmd));
    expect(answerField()).not.toBeDisabled();
  });

  it("holds the lock while the command has no answer, whatever else the session reports", () => {
    // An older command's wrong answer can reach the phone after a newer one
    // left — the phone's state lagged when it sent. That is not a verdict on
    // the newer one, and opening on it would let a third answer race it.
    const cmd = vi.fn();
    const { rerender } = renderPhone(runtimeOf({ revision: 4 }), cmd);
    send("طوكيو");
    rerender(phoneTree(afterWrongAnswer(5), cmd));
    expect(answerField()).toBeDisabled();
    expect(notice()).toBeNull();
    send("أوساكا");
    expect(cmd).toHaveBeenCalledTimes(1);
  });

  it("does not open on a reconnect alone, while the command's outcome is still coming", () => {
    // A reconnect is not an answer: the command may have landed and its
    // acknowledgement may simply be late. The connection resends it under the
    // same id and reports what became of it.
    const cmd = vi.fn();
    const { rerender } = renderPhone(runtimeOf(), cmd);
    send("طوكيو");
    rerender(phoneTree(runtimeOf(), cmd, {}, { connectionEpoch: 2 }));
    expect(answerField()).toBeDisabled();
  });

  it("ignores an outcome for a send the phone has already moved past", () => {
    const cmd = vi.fn();
    renderPhone(runtimeOf(), cmd);
    send("أوساكا");
    const first = deliveryOf(cmd);
    act(() => first.onOutcome({ status: "unknown" }));
    send("طوكيو");
    // The first send's late answer cannot open the second one.
    act(() => first.onOutcome({ status: "rejected", code: "X" }));
    expect(answerField()).toBeDisabled();
    expect(cmd).toHaveBeenCalledTimes(2);
  });

  it("gives the answer back when the server refuses it", () => {
    const cmd = vi.fn();
    renderPhone(runtimeOf(), cmd);
    send("طوكيو");
    act(() =>
      deliveryOf(cmd).onOutcome({
        status: "rejected",
        code: "BOMB_ROUND_COMPLETE",
      }),
    );
    expect(answerField()).not.toBeDisabled();
    expect(answerField()).toHaveValue("طوكيو");
    expect(notice()).toHaveTextContent("ما انقبلت");
  });

  it("gives the answer back, and says so honestly, when no answer ever came", () => {
    const cmd = vi.fn();
    renderPhone(runtimeOf(), cmd);
    send("طوكيو");
    act(() => deliveryOf(cmd).onOutcome({ status: "unknown" }));
    expect(answerField()).not.toBeDisabled();
    expect(answerField()).toHaveValue("طوكيو");
    // Not "wrong", not "sent": the phone does not know, and says that.
    expect(notice()).toHaveTextContent("ما وصلنا رد");
  });

  it("keeps the answer when it could not leave the phone at all", () => {
    // The socket refuses to send while it is not connected, and says so by
    // throwing. That used to escape with the lock already shut.
    const cmd = vi.fn();
    cmd.mockImplementation(() => {
      throw new Error("Live session connection is not available");
    });
    renderPhone(runtimeOf(), cmd);
    send("طوكيو");
    expect(answerField()).not.toBeDisabled();
    expect(answerField()).toHaveValue("طوكيو");
    expect(notice()).toHaveTextContent("ما انرسلت");
  });

  it("clears a handed-back answer when the question moves on", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(runtimeOf(), cmd);
    send("طوكيو");
    act(() => deliveryOf(cmd).onOutcome({ status: "unknown" }));
    expect(answerField()).toHaveValue("طوكيو");
    rerender(
      phoneTree(
        runtimeOf({ currentItem: { index: 2, totalItems: 10 } }, ACTOR_ACTIONS, {
          itemIndex: 2,
        }),
        cmd,
      ),
    );
    expect(answerField()).toHaveValue("");
    expect(notice()).toBeNull();
  });

  describe("an automatic resend goes only to the question it was made for", () => {
    const latest = (runtime: GameplayRuntimeSnapshot, status = "active") => ({
      status,
      gameplay: runtime,
    });
    const sentDelivery = () => {
      const cmd = vi.fn();
      renderPhone(runtimeOf(), cmd);
      send("طوكيو");
      return deliveryOf(cmd);
    };

    it("allows it while the same question is still this phone's to answer", () => {
      expect(sentDelivery().canResend(latest(runtimeOf({ revision: 9 })))).toBe(
        true,
      );
    });

    it("refuses it once the item has changed", () => {
      expect(
        sentDelivery().canResend(
          latest(
            runtimeOf(
              { currentItem: { index: 2, totalItems: 10 } },
              ACTOR_ACTIONS,
              { itemIndex: 2 },
            ),
          ),
        ),
      ).toBe(false);
    });

    it("refuses it once the turn has passed or the phone lost the bomb", () => {
      const delivery = sentDelivery();
      expect(
        delivery.canResend(latest(runtimeOf({ activeTeamId: "team-beta" }))),
      ).toBe(false);
      expect(delivery.canResend(latest(runtimeOf({}, [])))).toBe(false);
    });

    it("refuses it once the clock has ended the question", () => {
      const delivery = sentDelivery();
      expect(
        delivery.canResend(
          latest(runtimeOf({}, ACTOR_ACTIONS, { phase: "completed" })),
        ),
      ).toBe(false);
      expect(delivery.canResend(latest(runtimeOf(), "finished"))).toBe(false);
    });
  });
});

describe("voice says what it knows, and no more", () => {
  afterEach(() => {
    voiceMock.state = "idle";
  });

  it("never says an answer was sent before the server has answered", () => {
    voiceMock.state = "recognized";
    const cmd = vi.fn();
    const { rerender } = renderPhone(runtimeOf(), cmd);
    expect(screen.getByTestId("bomb-phone-voice-state")).toHaveTextContent(
      "تعرّفت على إجابتك",
    );
    expect(screen.getByTestId("bomb-phone-voice-state")).not.toHaveTextContent(
      "إرسال",
    );

    act(() => voiceMock.onAnswer?.("أوساكا"));
    // Sending is an attempt, said as one.
    expect(screen.getByTestId("bomb-phone-voice-state")).toHaveTextContent(
      "جارٍ الإرسال",
    );

    act(() =>
      (cmd.mock.calls.at(-1)![2] as {
        onOutcome: (o: Record<string, unknown>) => void;
      }).onOutcome({ status: "accepted", runtimeRevision: 5 }),
    );
    rerender(
      phoneTree(
        runtimeOf({
          revision: 5,
          transitions: [
            { revision: 5, type: "bomb-answer-incorrect", roundId: "round-1" },
          ],
        }),
        cmd,
      ),
    );
    // The verdict is the server's, in the answer notice, not the voice line.
    expect(screen.getByTestId("bomb-phone-voice-state")).not.toHaveTextContent(
      "جارٍ الإرسال",
    );
    expect(screen.getByTestId("bomb-phone-answer-notice")).toHaveTextContent(
      "غلط",
    );
  });
});

describe("every other phone waits, and waits empty", () => {
  /** A teammate on the active team who is not the active participant. */
  const peer = () => runtimeOf({}, []);

  it("gives an active-team peer a status and nothing else", () => {
    renderPhone(peer());
    const waiting = screen.getByTestId("bomb-phone-waiting");
    expect(waiting).toHaveTextContent("مُعاذ يجاوب الآن");
    expect(screen.queryByTestId("bomb-phone-answer")).toBeNull();
    expect(screen.queryByTestId("bomb-phone-voice")).toBeNull();
    expect(screen.queryByTestId("bomb-phone-skip")).toBeNull();
  });

  it("never gives a waiting phone the room's clock or its sound switch", () => {
    render(phoneTree(peer(), vi.fn()));
    expect(screen.queryByTestId("bomb-stage-clock")).toBeNull();
    expect(screen.queryByTestId("countdown-sound-toggle")).toBeNull();
    expect(screen.queryByTestId("challenge-countdown")).toBeNull();
  });

  it("never puts the exact clock in an active-team peer's DOM", () => {
    renderPhone(peer());
    expect(screen.queryByTestId("bomb-phone-clock")).toBeNull();
    expect(document.body.textContent).not.toContain("0:18");
  });

  it("never puts the question in a waiting phone's DOM", () => {
    renderPhone(peer());
    expect(document.body.textContent).not.toContain(PROMPT);
  });

  it("never puts the image in a waiting phone's DOM", () => {
    renderPhone(withImage([]));
    expect(document.querySelector("img")).toBeNull();
    expect(document.body.innerHTML).not.toContain("tokyo.jpg");
  });

  it("tells the opponent it is not their turn, with no clock", () => {
    // No active participant projected to this phone at all.
    renderPhone(
      runtimeOf({
        activeRound: {
          id: "round-1",
          sequence: 1,
          status: "active",
          modeState: { phase: "presenting", itemIndex: 1, itemCount: 10 },
        },
      }, []),
    );
    expect(screen.getByTestId("bomb-phone-waiting")).toHaveTextContent(
      "الدور على الفريق الآخر",
    );
    expect(screen.queryByTestId("bomb-phone-clock")).toBeNull();
  });
});

describe("ownership follows the server, never a team comparison", () => {
  it("hands the controller over on reassignment, with no remount and no clock reset", () => {
    const cmd = vi.fn();
    // p-1 is acting; the shell is mounted for p-1's phone.
    const { rerender } = renderPhone(runtimeOf(), cmd);
    const shellNode = screen.getByTestId("mobile-shell-main");
    expect(screen.getByTestId("bomb-phone-answer")).toBeInTheDocument();
    expect(screen.getByTestId("bomb-phone-clock")).toHaveTextContent("0:18");

    // p-1 drops; the runtime reassigns the owner to p-2, so this phone's
    // actions disappear from `availableActions`.
    rerender(
      phoneTree(
        runtimeOf(
          {
            activeRound: {
              id: "round-1",
              sequence: 1,
              status: "active",
              activeParticipantId: "p-2",
              modeState: { phase: "presenting", itemIndex: 1, itemCount: 10 },
            },
          },
          [],
        ),
        cmd,
      ),
    );
    // Old owner: no action, no clock, no question.
    expect(screen.queryByTestId("bomb-phone-answer")).toBeNull();
    expect(screen.queryByTestId("bomb-phone-clock")).toBeNull();
    expect(document.body.textContent).not.toContain(PROMPT);
    expect(screen.getByTestId("bomb-phone-waiting")).toHaveTextContent(
      "سالم يجاوب الآن",
    );
    // Nothing under the shell remounted.
    expect(screen.getByTestId("mobile-shell-main")).toBe(shellNode);
  });

  it("gives the new owner the controller with the clock continuing, not restarting", () => {
    // The same runtime as p-2's phone sees it: it now holds the actions, and
    // the clock still reads what the team had left — never a fresh 30 seconds.
    renderPhone(
      runtimeOf({
        activeRound: {
          id: "round-1",
          sequence: 1,
          status: "active",
          activeParticipantId: "p-2",
          modeState: { phase: "presenting", itemIndex: 1, itemCount: 10 },
        },
      }),
    );
    expect(screen.getByTestId("bomb-phone-answer")).toBeInTheDocument();
    expect(screen.getByTestId("bomb-phone-skip")).toBeInTheDocument();
    const clock = screen.getByTestId("bomb-phone-clock");
    expect(clock).toHaveTextContent("0:18");
    expect(clock).not.toHaveTextContent("0:30");
  });

  it("hands off to the other team on a correct answer without remounting", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(runtimeOf(), cmd);
    const shellNode = screen.getByTestId("mobile-shell-main");
    rerender(
      phoneTree(
        runtimeOf(
          {
            activeTeamId: "team-beta",
            activeRound: {
              id: "round-1",
              sequence: 1,
              status: "active",
              activeParticipantId: "p-3",
              modeState: { phase: "presenting", itemIndex: 2, itemCount: 10 },
            },
          },
          [],
        ),
        cmd,
      ),
    );
    expect(screen.getByTestId("bomb-phone-waiting")).toBeInTheDocument();
    expect(screen.queryByTestId("bomb-phone-clock")).toBeNull();
    expect(screen.getByTestId("mobile-shell-main")).toBe(shellNode);
  });
});

describe("the shared screen keeps the room's Bomb", () => {
  it("keeps the question, the image and the dramatic clock", () => {
    renderHost(withImage([]));
    expect(document.body.textContent).toContain(PROMPT);
    expect(document.querySelector("img")).not.toBeNull();
    expect(document.body.textContent).toContain("0:18");
  });

  it("gains no phone controls and no compact frame", () => {
    renderHost();
    expect(screen.queryByTestId("bomb-phone-answer")).toBeNull();
    expect(screen.queryByTestId("bomb-phone-voice")).toBeNull();
    expect(screen.queryByTestId("bomb-phone-skip")).toBeNull();
    expect(screen.queryByTestId("mobile-action-area")).toBeNull();
    // The room wears the shared frame now, in its screen form, never the
    // phone's compact one.
    expect(screen.getByTestId("challenge-frame")).toHaveAttribute(
      "data-frame-surface",
      "screen",
    );
  });

  it("keeps the historical audio item playing on the room's screen", () => {
    renderHost(
      runtimeOf({}, [], {
        mediaType: "audio",
        mediaUrl: "/uploads/question-assets/clip.mp3",
      }),
    );
    expect(document.querySelector("audio")).not.toBeNull();
  });
});

/**
 * Bomb audit F2 (2026-11-16): the phone's own clock never decides the turn is
 * over. A phone a minute or more fast used to read the running clock as spent,
 * hide the answer box and show «انتهى وقتكم» while the server still had time.
 */
describe("a phone whose clock is wrong", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["61 s fast", 61_000],
    ["an hour fast", 3_600_000],
    ["61 s slow", -61_000],
  ])("keeps the holder's answer box while the server has time (%s)", (_l, skew) => {
    const stamped = Date.parse("2026-01-01T00:00:10.000Z");
    // The phone received the snapshot at its own (wrong) time, and it is now.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(stamped + skew);
    render(
      phoneTree(
        runtimeOf(),
        vi.fn(),
        {
          running: true,
          startedAt: "2026-01-01T00:00:05.000Z",
          allocatedMs: 30_000,
          consumedMs: 0,
          remainingMs: 25_000,
        },
        { snapshotReceivedAtMs: stamped + skew },
      ),
    );
    expect(screen.queryByText("انتهى وقتكم. جارٍ حساب النتيجة…")).toBeNull();
    expect(screen.getByTestId("bomb-phone-answer")).toBeEnabled();
  });
});
