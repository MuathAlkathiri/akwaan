# Distributed Information Validation

Run `python3 .opencode/validators/validate_distributed_information.py <paths>`. A valid draft or ready item passes; ready status additionally requires the author safety confirmation.

## Deterministic Rules Enforced

- Canonical routing: `distributed-information` type, `three-segment-race` pattern, `distributed` wrapper mode.
- Native objects: `answerPayload` and `mechanicPayload` are real objects, never JSON strings.
- Supported inner modes `match`, `closest`, `multiple_choice` with machine-resolvable truth: nonempty accepted answers, finite numeric value with a finite nonnegative tolerance, or a valid set of option IDs with a present correct one.
- Structure: nonempty Arabic public prompt; exactly three segments with unique IDs A/B/C and distinct nonempty content; at least one exhaustive non-overlapping 2+1 merge; team sizes exactly `[2,3]`.
- Safety confirmation: required whenever status is `ready`.
- Truth separation: no truth key nested anywhere in `mechanicPayload`.
- Runtime ownership: no runtime-owned key (`hint`, lock, timer, answerer, order, progress, score, reveal) anywhere in `mechanicPayload`.
- Privacy: neither the public prompt nor any segment exposes an accepted answer, the numeric value, or the correct option ID as an exact substring; no segment reproduces the public prompt.
- Metadata: `notes` is allowed only as a plain string; a structured `notes` value is a payload workaround.
- Status coherence: `status` in `{draft, ready}` equals `metadata.validationStatus`, `runtimeContractStatus` is `fully_playable`, and `runtimeBlocker` is null.

## Semantic Review Not Automatable

The validator cannot prove safety of play; these remain editorial checks per item:

- Every single segment is a genuine, self-contained mini-puzzle solvable alone by its holder using World, Scope, and Scope Knowledge; its answer is a derived World clue (a team, office, trait, relation, or symbol) that the player announces. The clue must not be the final truth itself.
- The mini-puzzles never resolve by counting, summing, measuring frequency, totaling lists, or arithmetic; the final resolution is World-grounded deduction combining the three derived clues with shared World knowledge.
- Every single clue is insufficient alone, and every one of the three canonical two-plus-one partitions (AB|C, AC|B, BC|A) is also insufficient alone, because the runtime draws a random partition for two-player teams.
- Synthesis rather than recall: the item resolves by combining derived holdings, not by one participant's pre-existing knowledge, and no pair of derived clues resolves alone.
- The shared-link pool is finite and inferable from the public prompt and Scope, and no pair of clues resolves alone.
- Numeric tolerance and multiple-choice option set accept the intended answers and reject plausible wrong ones.
- Scope, spoiler, and version boundaries hold; no sensitive or subjective material.

The hard, structural failures the validator catches must be repaired; the editorial checks above are the minimum bar for `ready`.
