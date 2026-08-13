import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

/**
 * Two colour systems, two jobs, no overlap.
 *
 * The rule is about *meaning*, not about how long something stays on screen:
 *
 *   - **Team colour is identity.** It answers "whose is this" — the score pill, the
 *     turn band, a team's card, its ownership of a field. It must never answer
 *     "was that right".
 *   - **Semantic colour is meaning.** It answers "how did that go" or "what state is
 *     this in" — correct, wrong, ready, disconnected. It must never become a team's
 *     identity.
 *
 * A persistent status is allowed a semantic colour: "ready" is genuinely a success
 * state and saying so in green helps a host. What is not allowed is either system
 * borrowing the other's job — a green *team*, or a team colour that means correct.
 * Both defects shipped, in both directions:
 *
 *   - Teams were literally named "الأخضر" and "الوردي", so at reveal time a green
 *     element meant "correct" and "team one" simultaneously.
 *   - A preflight card dropped its team colour until the team was ready, making the
 *     team's identity flicker on and off with its readiness.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** Utilities built on the semantic colours, in every form Tailwind writes them. */
const SEMANTIC_UTILITY =
  /\b(?:bg|text|border|ring|from|to|via)-(?:sem-success|sem-error|success|destructive)\b/;
/** Utilities built on a team's identity tokens. */
const TEAM_UTILITY = /\bteam-[12](?:-[a-z-]+)?\b/;

/** Only lines that ship — prose about the code is how these rules stay explained. */
function codeLines(source: string): Array<{ text: string; number: number }> {
  return source
    .split("\n")
    .map((text, number) => ({ text, number: number + 1 }))
    .filter(({ text }) => {
      const trimmed = text.trimStart();
      return (
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("/*")
      );
    });
}

describe("semantic colour never becomes a team's identity", () => {
  /**
   * Components whose whole job is to say *which team*. A semantic colour here would
   * make correctness and identity the same signal.
   */
  const TEAM_IDENTITY_SURFACES = [
    "src/components/akwaan/team-score.tsx",
    "src/lib/team-identity.ts",
  ];

  it("keeps success and error out of the components that draw a team", () => {
    for (const path of TEAM_IDENTITY_SURFACES) {
      const offending = codeLines(read(path))
        .filter(({ text }) => SEMANTIC_UTILITY.test(text))
        .map(({ number, text }) => `${path}:${number} ${text.trim()}`);
      expect(offending).toEqual([]);
    }
  });

  it("draws the active-turn band from team tokens alone", () => {
    // Whose turn it is is pure identity: there is nothing correct or wrong about
    // having the turn.
    const shell = read(
      "src/features/live-game-session/match/components/match-shell.tsx",
    );
    const band = shell.slice(
      shell.indexOf('data-testid="active-team-band"'),
      shell.indexOf("</header>"),
    );
    // Its colours come from the identity resolver — the only thing that emits team
    // tokens — and no class is written here by hand.
    expect(band).toContain("activeIdentity.surface");
    expect(band).toContain("activeIdentity.border");
    expect(band).toContain("activeIdentity.text");
    expect(band).not.toMatch(SEMANTIC_UTILITY);
  });

  it("gives a team its colour whether or not it is ready", () => {
    // The card belonged to this team before its phones arrived. Readiness is carried
    // by a status chip beside the name, not by the presence of the team's colour.
    const preflight = read(
      "src/features/live-game-session/match/components/challenge-preflight.tsx",
    );
    expect(preflight).not.toMatch(/team\.ready\s*\n?\s*\?\s*cn\(identity\./);
    expect(preflight).not.toMatch(/team\.ready\s*\?\s*identity\.text/);
    // And the status chip is semantic, with an icon as well as a colour.
    expect(preflight).toMatch(/preflight-team-status-/);
    expect(preflight).toMatch(/bg-success-subtle text-success/);
  });
});

describe("team colour never means correct or wrong", () => {
  it("draws the reveal in the reserved semantic colours, not a team's", () => {
    const panel = read(
      "src/features/live-game-session/components/ryo-gameplay-panel.tsx",
    );
    const revealBlock = panel.slice(panel.indexOf('data-testid="ryo-reveal"'));
    expect(revealBlock).not.toMatch(TEAM_UTILITY);
    // A full surface with its own foreground, so it is legible the instant it lands.
    expect(panel).toContain("bg-sem-success");
    expect(panel).toContain("bg-sem-error");
    expect(panel).toContain("text-sem-reveal-foreground");
  });

  it("keeps the lock indicators in team colour, since locking in is not a verdict", () => {
    // Both sides lock in during the blind window; neither has been right or wrong yet.
    const panel = read(
      "src/features/live-game-session/components/ryo-gameplay-panel.tsx",
    );
    const indicator = panel.slice(panel.indexOf("function TeamLockIndicator"));
    expect(indicator).not.toMatch(SEMANTIC_UTILITY);
    expect(indicator).toContain("identity.surface");
  });

  it("keeps a chosen answer out of the correctness colours", () => {
    // Selecting an option is a choice, not a verdict — the reveal has not happened.
    const option = read(
      "src/features/live-game-session/match/components/answer-option.tsx",
    );
    expect(option).not.toMatch(SEMANTIC_UTILITY);
    expect(option).toContain("border-selected");
  });
});

describe("a persistent status may still be legible", () => {
  it("states readiness in a semantic colour, an icon, and a word", () => {
    // Deliberately *not* stripped to neutral: "these players are ready" is a real
    // success state and a host is about to act on it.
    const preflight = read(
      "src/features/live-game-session/match/components/challenge-preflight.tsx",
    );
    expect(preflight).toContain("text-success");
    expect(preflight).toContain("اللاعبون مرتبطون وجاهزون");
  });

  it("escalates the connection pill from calm to amber to red", () => {
    // Colour tracks how much the room needs to care. Connected is calm because
    // "working normally" is not news; a pill that shouts all match stops being read.
    const shell = read(
      "src/features/live-game-session/match/components/match-shell.tsx",
    );
    const pill = shell.slice(shell.indexOf("function ConnectionPill"));
    expect(pill).toMatch(/connected:[\s\S]*?text-muted-foreground/);
    expect(pill).toMatch(/connecting:[\s\S]*?text-warning/);
    expect(pill).toMatch(/lost:[\s\S]*?text-destructive/);
    // Never colour alone: every state carries an icon and a label.
    expect(pill).toContain("Icon: Wifi");
    expect(pill).toContain("sr-only sm:not-sr-only");
  });

  it("lets the countdown redden as it runs out", () => {
    const countdown = read(
      "src/features/live-game-session/match/components/challenge-countdown.tsx",
    );
    expect(countdown).toMatch(/seconds <= 3[\s\S]*text-sem-error/);
    expect(countdown).toMatch(/seconds <= 6[\s\S]*text-brand-gold/);
  });
});

describe("no component holds a raw colour", () => {
  it("has no hex literals in the player-facing Match surfaces", () => {
    const paths = [
      "src/features/live-game-session/match/components/match-shell.tsx",
      "src/features/live-game-session/match/components/challenge-frame.tsx",
      "src/features/live-game-session/match/components/challenge-countdown.tsx",
      "src/features/live-game-session/match/components/answer-option.tsx",
      "src/features/live-game-session/components/ryo-gameplay-panel.tsx",
      "src/components/akwaan/team-score.tsx",
      "src/lib/team-identity.ts",
    ];
    for (const path of paths) {
      expect(read(path), path).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("keeps raw Tailwind palette colours out of them too", () => {
    // `violet-700` answers to no token and cannot be recoloured or theme-checked;
    // it was how a World card ended up with its own private purple.
    const RAW_PALETTE =
      /\b(?:bg|text|border|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
    for (const path of [
      "src/features/worlds/components/world-card.tsx",
      "src/features/live-game-session/components/ryo-gameplay-panel.tsx",
      "src/features/live-game-session/match/components/match-shell.tsx",
      "src/features/live-game-session/match/components/match-score-display.tsx",
    ]) {
      expect(read(path), path).not.toMatch(RAW_PALETTE);
    }
  });
});
