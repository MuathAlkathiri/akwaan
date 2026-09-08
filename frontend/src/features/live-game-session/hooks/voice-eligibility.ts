/**
 * Which mechanics may listen, and what speech is allowed to do there.
 *
 * Deliberately an explicit per-mechanic declaration rather than anything derived
 * from the input type. Six mechanics accept typed answers and only two are safe
 * to speak into: in القطها, بدليل واحد and من أول نغمة a wrong answer hands the
 * *same* question to the opponent — who would have just heard the guess for free.
 * `inputType === 'phone-text'` cannot express that difference, so it must never
 * be the gate.
 *
 * Kept beside the hook that enforces it, and keyed by the runtime `mode.key`
 * every panel already carries. The backend's `ChallengePresentation` was
 * considered and rejected as the seam: gameplay panels receive only
 * `runtime.mode.key`, never the ChallengeType's presentation, so a field declared
 * there could not be read at the point the microphone is drawn — it would be a
 * second source of truth that no one consults.
 */
export type VoiceInputPolicy = "disabled" | "transcript" | "auto-submit";

const VOICE_INPUT_POLICY: Readonly<Record<string, VoiceInputPolicy>> = {
  // A 30-second clock: a confirmation tap would cost the team real time.
  bomb: "auto-submit",
  // A whole turn rides on one answer, so speech fills the field and the player
  // confirms. A misheard word must never spend the turn by itself.
  marhala: "transcript",
};

/**
 * The policy for a mechanic, defaulting to `disabled`.
 *
 * A mechanic that is not listed is silent. That direction matters: adding a
 * mechanic to the product must never quietly grant it a microphone.
 */
export function voiceInputPolicy(modeKey: string): VoiceInputPolicy {
  return VOICE_INPUT_POLICY[modeKey] ?? "disabled";
}
