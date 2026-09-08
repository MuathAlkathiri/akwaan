import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBombVoiceInput } from "@/features/live-game-session/hooks/use-bomb-voice-input";

/**
 * What القنبلة does with a recognised sentence.
 *
 * The shared hook stops at "here is the text". This is the only logic that
 * stayed behind with Bomb, so it is exercised through the real wrapper against a
 * fake engine rather than through a mocked hook — otherwise the one piece that
 * is genuinely Bomb-specific would be the one piece nothing tested.
 */

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {}
  stop() {}
  abort() {}
  emit(transcript: string, isFinal: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal, length: 1, 0: { transcript } } },
    });
  }
  static latest() {
    return FakeRecognition.instances[FakeRecognition.instances.length - 1];
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.instances = [];
  (window as unknown as Record<string, unknown>).SpeechRecognition =
    FakeRecognition;
});
afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
});

const speak = (text: string) => {
  act(() => FakeRecognition.latest().emit(text, true));
  act(() => void vi.advanceTimersByTime(200));
};

const setup = () => {
  const onAnswer = vi.fn();
  const onSkip = vi.fn();
  const view = renderHook(() =>
    useBombVoiceInput({
      enabled: true,
      connection: "connected",
      lifecycleKey: "item-1",
      onAnswer,
      onSkip,
    }),
  );
  act(() => view.result.current.start());
  return { ...view, onAnswer, onSkip };
};

describe("Bomb decides what a sentence means", () => {
  it.each(["تخطي", "تجاوز", "عدي"])(
    "treats %s as the canonical skip, not an answer",
    (word) => {
      const { onAnswer, onSkip } = setup();
      speak(word);
      expect(onSkip).toHaveBeenCalledTimes(1);
      expect(onAnswer).not.toHaveBeenCalled();
    },
  );

  it("still hears a skip word carrying diacritics", () => {
    const { onAnswer, onSkip } = setup();
    speak("تَخَطّي");
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("sends anything else as an answer, verbatim", () => {
    const { onAnswer, onSkip } = setup();
    speak("طوكيو");
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith("طوكيو");
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("auto-submits: reaching the callback is the submission", () => {
    // القنبلة is `auto-submit` by policy — no confirmation step exists here.
    const { onAnswer } = setup();
    speak("طوكيو");
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it("acts once per utterance, however many finals the engine emits", () => {
    const { onAnswer, onSkip } = setup();
    act(() => {
      FakeRecognition.latest().emit("طوكيو", true);
      FakeRecognition.latest().emit("طوكيو", true);
    });
    act(() => void vi.advanceTimersByTime(200));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
  });
});
