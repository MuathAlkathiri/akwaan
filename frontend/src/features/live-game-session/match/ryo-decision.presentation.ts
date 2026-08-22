/**
 * The one place "اقرأ خصمك" turns its canonical decision into player-facing copy.
 *
 * The runtime, the protocol, the payload and the scoring all speak in `trust` and
 * `steal` — those never change and are never shown to a player. What a player
 * reads is the *psychological* decision underneath: "do I think the answering
 * team actually knows the answer?". `trust` is the doubtful read ("شاكك فيهم"),
 * `steal` is the confident read that bets against them ("متأكد منهم").
 *
 * Every RYO surface — the phone choice buttons, the locked-in echo, the reveal,
 * the result recap — reads its wording from here, so the pair can never drift into
 * two different vocabularies on two screens, and no component hand-maps a raw
 * `trust`/`steal` to Arabic on its own.
 */
export type RyoDecision = "trust" | "steal";

export interface RyoDecisionCopy {
  /** The dominant choice title. */
  title: string;
  /** Static instructional copy shown under the title, before selection. */
  description: string;
  /** The choice named on its own, for locked/reveal/recap surfaces. */
  revealLabel: string;
}

export const RYO_DECISION_PRESENTATION: Record<RyoDecision, RyoDecisionCopy> = {
  trust: {
    title: "شاكك فيهم",
    description: "مو متأكد إنهم يعرفون الجواب.",
    revealLabel: "شاكك فيهم",
  },
  steal: {
    title: "متأكد منهم",
    description:
      "متأكد إنهم بيعرفون الجواب — بسرق نقاطهم، بس لو غلطوا أخسر نقطة.",
    revealLabel: "متأكد منهم",
  },
};

/** The player-facing copy for a canonical decision, or undefined if unknown. */
export function ryoDecisionCopy(
  decision: string | undefined | null,
): RyoDecisionCopy | undefined {
  return decision === "trust" || decision === "steal"
    ? RYO_DECISION_PRESENTATION[decision]
    : undefined;
}

/** The short reveal label for a decision, falling back to the raw value's dash. */
export function ryoDecisionRevealLabel(decision: string | undefined | null): string {
  return ryoDecisionCopy(decision)?.revealLabel ?? "—";
}
