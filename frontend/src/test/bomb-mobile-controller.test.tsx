import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
      state: "idle" as const,
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
  }) as never;

const phoneTree = (
  runtime: GameplayRuntimeSnapshot,
  cmd: ReturnType<typeof vi.fn>,
  clockOver: Record<string, unknown> = {},
) => (
  <LiveSessionContext.Provider value={context(cmd, clockOver)}>
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
    expect(screen.getByTestId("bomb-phone-clock").className).toContain(
      "text-destructive",
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
    });
  });

  it("skips with the canonical command and never subtracts time itself", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("bomb-phone-skip"));
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "skip",
      payload: {},
    });
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
    });
  });

  it("routes a voice skip through the canonical skip command", () => {
    const { cmd } = renderPhone();
    voiceMock.onSkip?.();
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "skip",
      payload: {},
    });
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
    expect(screen.queryByTestId("challenge-frame")).toBeNull();
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
