import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { authoredText } from "@/features/live-game-session/authored-text";
import { RyoGameplayPanel } from "@/features/live-game-session/components/ryo-gameplay-panel";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * Rendering authored World Content.
 *
 * A prompt is stored as `{ ar: "…" }`, and the read-your-opponent runtime
 * republishes it unflattened. Rendering that object as a React child throws and
 * takes down the whole gameplay screen — which stayed hidden for as long as the
 * mechanic could not be launched at all.
 */

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      sessionId: "session-1",
      teams: [
        { id: "team-a", name: "البنفسجي", active: true },
        { id: "team-b", name: "الأخضر", active: true },
      ],
      participants: [],
    },
    gameplayCommand: vi.fn(),
    connection: "connected",
    nowMs: Date.parse("2026-08-07T00:00:00.000Z"),
  }),
}));

describe("authoredText", () => {
  it("prefers the product language", () => {
    expect(authoredText({ ar: "السؤال", en: "The question" })).toBe("السؤال");
  });

  it("passes an already-flat string through", () => {
    expect(authoredText("السؤال")).toBe("السؤال");
  });

  it("falls back to another locale rather than showing nothing", () => {
    expect(authoredText({ en: "The question" })).toBe("The question");
    expect(authoredText({ fr: "La question" } as never)).toBe("La question");
  });

  it("ignores blank values", () => {
    expect(authoredText({ ar: "   ", en: "English" })).toBe("English");
    expect(authoredText({ ar: "" }, "احتياطي")).toBe("احتياطي");
  });

  it("answers with the fallback for anything unusable", () => {
    expect(authoredText(undefined, "احتياطي")).toBe("احتياطي");
    expect(authoredText(null, "احتياطي")).toBe("احتياطي");
    expect(authoredText({}, "احتياطي")).toBe("احتياطي");
  });
});

function ryoRuntime(item: unknown): GameplayRuntimeSnapshot {
  return {
    runtimeId: "runtime-1",
    mode: { key: "read-your-opponent", version: 1 },
    status: "active",
    modeState: { currentItemIndex: 0 },
    transitions: [],
    availableActions: ["submission:create"],
    activeRound: {
      number: 1,
      status: "active",
      activeTeamId: "team-a",
      modeState: {},
      interaction: {
        interactionId: "interaction-1",
        status: "open",
        prompt: {
          deadlineAt: "2026-08-07T00:01:00.000Z",
          payload: {
            itemJson: JSON.stringify(item),
            actorRole: "answering",
            answeringTeamId: "team-a",
          },
        },
        submissions: [],
      },
    },
  } as unknown as GameplayRuntimeSnapshot;
}

describe("read-your-opponent renders authored content", () => {
  it("shows a localized prompt and localized option labels", () => {
    render(
      <RyoGameplayPanel
        runtime={ryoRuntime({
          id: "item-1",
          prompt: { ar: "من هو الهداف التاريخي لأبطال اوروبا ؟" },
          answerMode: "multiple_choice",
          options: [
            { id: "option-1", label: { ar: "كريستيانو رونالدو" } },
            { id: "option-2", label: { ar: "ميسي" } },
          ],
        })}
      />,
    );

    expect(
      screen.getByText("من هو الهداف التاريخي لأبطال اوروبا ؟"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "كريستيانو رونالدو" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "ميسي" })).toBeTruthy();
    // The failure mode this guards against.
    expect(document.body.textContent).not.toContain("[object Object]");
  });

  it("still renders content that was authored flat", () => {
    render(
      <RyoGameplayPanel
        runtime={ryoRuntime({
          id: "item-2",
          prompt: "كم عدد الأهداف؟",
          answerMode: "closest",
          options: null,
        })}
      />,
    );

    expect(screen.getByText("كم عدد الأهداف؟")).toBeTruthy();
  });
});
