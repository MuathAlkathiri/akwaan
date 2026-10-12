import type { RyoDecision } from "../live-game-session/match/ryo-decision.presentation";

/**
 * The published tutorial a mechanic teaches with, as the server serves it.
 *
 * This mirrors `StoredTutorialScenario` on the backend, including `outcome` —
 * which the client renders but never computes. The score shown in the demo is
 * the one `RyoPayoffMatrixRule` produced at publish time, so the explainer
 * cannot teach a payoff the Match would not actually award, and no second
 * transcription of the scoring rules exists on this side.
 */
export interface RyoTutorialOption {
  id: string;
  label: string;
}

export interface RyoTutorialOutcome {
  teamRole: "answering" | "opposing";
  delta: number;
  reason: string;
  correct: boolean;
}

export interface RyoTutorialScenario {
  prompt: string;
  options: RyoTutorialOption[];
  correctOptionId: string;
  answeringSelectionOptionId: string;
  /** The server's canonical casing; mapped for presentation at the boundary. */
  opposingDecision: "TRUST" | "STEAL";
  caption?: string;
  outcome: RyoTutorialOutcome;
}

export interface PublishedTutorial {
  mechanicKey: string;
  revision: number;
  scenario: RyoTutorialScenario;
}

/**
 * The scoring rules speak `TRUST`/`STEAL`; the player-facing copy module speaks
 * `trust`/`steal`. One conversion, here, rather than two vocabularies drifting.
 */
export function toPresentationDecision(
  decision: "TRUST" | "STEAL",
): RyoDecision {
  return decision === "TRUST" ? "trust" : "steal";
}

/** The two demonstration teams. Presentation-only, never a real team. */
export const TUTORIAL_TEAMS = [
  { id: "tutorial-answering", name: "الفريق الأول" },
  { id: "tutorial-opposing", name: "الفريق الثاني" },
] as const;

export const TUTORIAL_ROLES = {
  answeringTeamId: TUTORIAL_TEAMS[0].id,
  opposingTeamId: TUTORIAL_TEAMS[1].id,
};

/** The real RYO question window, from `ChallengeCountdown`'s own contract. */
export const TUTORIAL_WINDOW_MS = 10_000;

/**
 * The payoff as the demo must present it: which *team* gains or loses.
 *
 * The rule already decided the role and the delta; this only maps the role onto
 * the two demonstration teams. No scoring decision is made here.
 */
export function tutorialPayoffTeamId(outcome: RyoTutorialOutcome): string {
  return outcome.teamRole === "answering"
    ? TUTORIAL_ROLES.answeringTeamId
    : TUTORIAL_ROLES.opposingTeamId;
}
