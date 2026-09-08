import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useVoiceInput,
  DEFAULT_VOICE_LANG,
} from "@/features/live-game-session/hooks/use-voice-input";
import { voiceInputPolicy } from "@/features/live-game-session/hooks/voice-eligibility";

/**
 * The shared speech capability, and the line it must not cross.
 *
 * Two things are pinned here. The hook is a *listener*: it produces transcripts
 * and never a gameplay meaning. And eligibility is a declaration, not an
 * inference — six mechanics take typed answers and only two may be spoken into,
 * so anything derived from the input type would silently arm the wrong ones.
 */

/** A deterministic stand-in for the browser engine — no microphone involved. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  started = 0;
  stopped = 0;
  aborted = 0;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
  }
  abort() {
    this.aborted += 1;
  }

  /** Emit one result, interim or final, the way the real engine would. */
  emit(transcript: string, isFinal: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal, length: 1, 0: { transcript } } },
    });
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
  static latest() {
    return FakeRecognition.instances[FakeRecognition.instances.length - 1];
  }
}

const setup = (over: Record<string, unknown> = {}) => {
  const onFinalTranscript = vi.fn();
  const view = renderHook(
    (props: Record<string, unknown>) =>
      useVoiceInput({
        enabled: true,
        connection: "connected",
        lifecycleKey: "turn-1",
        onFinalTranscript,
        ...props,
      } as never),
    { initialProps: over },
  );
  return { ...view, onFinalTranscript };
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.instances = [];
  (window as unknown as Record<string, unknown>).SpeechRecognition =
    FakeRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
});

describe("browser support", () => {
  it("reports unsupported when the browser has no engine at all", () => {
    // Discovered on the first attempt rather than at mount: the lifecycle reset
    // runs after the support probe, so mount settles on `idle`. This is the
    // behaviour القنبلة has always shipped, and it is what matters in practice —
    // the player learns the moment they reach for the microphone.
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    const { result } = setup();
    act(() => result.current.start());
    expect(result.current.state).toBe("unsupported");
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it("accepts the webkit-prefixed engine", () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition =
      FakeRecognition;
    const { result } = setup();
    expect(result.current.state).toBe("idle");
    act(() => result.current.start());
    expect(FakeRecognition.latest().started).toBe(1);
  });

  it("starts idle on a supported browser", () => {
    expect(setup().result.current.state).toBe("idle");
  });
});

describe("a listening session", () => {
  it("goes to listening and configures the engine", () => {
    const { result } = setup();
    act(() => result.current.start());
    expect(result.current.state).toBe("listening");
    const engine = FakeRecognition.latest();
    expect(engine.lang).toBe(DEFAULT_VOICE_LANG);
    expect(engine.interimResults).toBe(true);
    expect(engine.continuous).toBe(false);
  });

  it("accepts a caller-supplied language", () => {
    const { result } = setup({ lang: "en-US" });
    act(() => result.current.start());
    expect(FakeRecognition.latest().lang).toBe("en-US");
  });

  it("shows the interim transcript without calling back", () => {
    const { result, onFinalTranscript } = setup();
    act(() => result.current.start());
    act(() => FakeRecognition.latest().emit("طو", false));
    expect(result.current.transcript).toBe("طو");
    expect(onFinalTranscript).not.toHaveBeenCalled();
  });

  it("calls back exactly once with the final transcript", () => {
    const { result, onFinalTranscript } = setup();
    act(() => result.current.start());
    act(() => FakeRecognition.latest().emit("طوكيو", true));
    expect(result.current.state).toBe("processing");
    act(() => void vi.advanceTimersByTime(200));
    expect(onFinalTranscript).toHaveBeenCalledTimes(1);
    expect(onFinalTranscript).toHaveBeenCalledWith("طوكيو");
    expect(result.current.state).toBe("recognized");
  });

  it("ignores a duplicate final result for the same utterance", () => {
    // Engines re-emit `isFinal`; one sentence must never mean two actions.
    const { result, onFinalTranscript } = setup();
    act(() => result.current.start());
    act(() => {
      FakeRecognition.latest().emit("طوكيو", true);
      FakeRecognition.latest().emit("طوكيو", true);
      FakeRecognition.latest().emit("أوساكا", true);
    });
    act(() => void vi.advanceTimersByTime(200));
    expect(onFinalTranscript).toHaveBeenCalledTimes(1);
  });

  it("settles back to idle after the recognised beat", () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => FakeRecognition.latest().emit("طوكيو", true));
    act(() => void vi.advanceTimersByTime(1_500));
    expect(result.current.state).toBe("idle");
    expect(result.current.transcript).toBe("");
  });
});

describe("failure modes never block play", () => {
  it("maps no-speech", () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => FakeRecognition.latest().fail("no-speech"));
    expect(result.current.state).toBe("no-speech");
  });

  it.each(["not-allowed", "service-not-allowed"])(
    "maps %s to permission-denied",
    (error) => {
      const { result } = setup();
      act(() => result.current.start());
      act(() => FakeRecognition.latest().fail(error));
      expect(result.current.state).toBe("permission-denied");
    },
  );

  it("recovers by itself from a generic engine error", () => {
    // A transient engine failure clears back to idle on a healthy connection, so
    // one bad attempt never leaves the microphone stuck.
    const { result } = setup();
    act(() => result.current.start());
    act(() => FakeRecognition.latest().fail("audio-capture"));
    expect(result.current.state).toBe("idle");
  });

  it("keeps a permission refusal visible instead of clearing it", () => {
    // Unlike a transient error, this one must persist: the player has to be told
    // why the microphone did nothing, and typing is the way forward.
    const { result } = setup();
    act(() => result.current.start());
    act(() => FakeRecognition.latest().fail("not-allowed"));
    expect(result.current.state).toBe("permission-denied");
  });

  it("reports no-speech when the engine ends without a final result", () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => FakeRecognition.latest().onend?.());
    expect(result.current.state).toBe("no-speech");
  });
});

describe("lifecycle and cleanup", () => {
  it("aborts and detaches its handlers on stop", () => {
    const { result } = setup();
    act(() => result.current.start());
    const engine = FakeRecognition.latest();
    act(() => result.current.stop());
    expect(engine.aborted).toBe(1);
    expect(engine.onresult).toBeNull();
    expect(engine.onerror).toBeNull();
    expect(engine.onend).toBeNull();
  });

  it("aborts on unmount", () => {
    const { result, unmount } = setup();
    act(() => result.current.start());
    const engine = FakeRecognition.latest();
    unmount();
    expect(engine.aborted).toBe(1);
  });

  it("resets when the lifecycle key changes", () => {
    const { result, rerender } = setup();
    act(() => result.current.start());
    act(() => FakeRecognition.latest().emit("طو", false));
    const engine = FakeRecognition.latest();
    rerender({ lifecycleKey: "turn-2" });
    expect(engine.aborted).toBe(1);
    expect(result.current.state).toBe("idle");
    expect(result.current.transcript).toBe("");
  });

  it("goes to reconnecting while the socket is down, and recovers", () => {
    const { result, rerender } = setup();
    rerender({ connection: "reconnecting" });
    expect(result.current.state).toBe("reconnecting");
    rerender({ connection: "connected" });
    expect(result.current.state).toBe("idle");
  });

  it("cannot start while disabled", () => {
    const { result } = setup({ enabled: false });
    act(() => result.current.start());
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it("cannot start while disconnected", () => {
    const { result } = setup({ connection: "reconnecting" });
    act(() => result.current.start());
    expect(FakeRecognition.instances).toHaveLength(0);
  });
});

describe("eligibility is declared, never inferred", () => {
  it("enables exactly the two approved mechanics", () => {
    expect(voiceInputPolicy("bomb")).toBe("auto-submit");
    expect(voiceInputPolicy("marhala")).toBe("transcript");
  });

  it.each([
    "combo",
    "first-note",
    "laqatha",
    "one-clue",
    "closest",
    "read-your-opponent",
    "odd-piece",
    "top-5",
    "rakkibha",
  ])("keeps %s disabled", (modeKey) => {
    // These are not oversights. القطها, بدليل واحد and من أول نغمة hand the same
    // question to the opponent after a wrong answer, so a spoken guess would be
    // a free gift; the rest have no typed answer to speak into at all.
    expect(voiceInputPolicy(modeKey)).toBe("disabled");
  });

  it("defaults an unknown mechanic to disabled", () => {
    // Adding a mechanic must never quietly grant it a microphone.
    expect(voiceInputPolicy("some-future-mechanic")).toBe("disabled");
  });

  it("does not gate on the input type", () => {
    // Six mechanics declare `phone-text`; only two may listen. A gate written
    // against the input type would arm four unsafe ones.
    const phoneText = [
      "bomb",
      "marhala",
      "combo",
      "one-clue",
      "laqatha",
      "first-note",
    ];
    const enabled = phoneText.filter(
      (key) => voiceInputPolicy(key) !== "disabled",
    );
    expect(enabled.sort()).toEqual(["bomb", "marhala"]);
  });
});

describe("no audio ever reaches Akwaan", () => {
  const sources = [
    "src/features/live-game-session/hooks/use-voice-input.ts",
    "src/features/live-game-session/hooks/use-bomb-voice-input.ts",
    "src/features/live-game-session/hooks/voice-eligibility.ts",
  ];

  it.each(sources)("adds no capture or upload path in %s", (relative) => {
    // The browser engine may still send audio to its vendor to recognise it —
    // that is a browser property, not an Akwaan pipeline. What is guaranteed is
    // that Akwaan neither receives, uploads nor stores any of it.
    // Comments are stripped first: this guard is about what the code *does*, and
    // the doc comments deliberately name these APIs to say they are not used.
    const source = readFileSync(resolve(process.cwd(), relative), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const forbidden of [
      "MediaRecorder",
      "getUserMedia",
      "FormData",
      "fetch(",
      "XMLHttpRequest",
      "localStorage",
      "sessionStorage",
      "IndexedDB",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
