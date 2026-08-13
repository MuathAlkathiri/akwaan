---
patternId: shared-fragments
owningChallengeType: distributed-information
---

# Pattern: Shared-Fragments

- Challenge shape: exactly three independent ContentItems; both teams get the same set in independently randomized runtime order.
- Item shape: native `answerPayload` plus `mechanicPayload` with variant `shared-fragments`, a localized team `instruction`, exactly two localized private fragments, `[2,3]`, the author safety confirmation, and optional explanation.
- Content model: one complete puzzle per ContentItem. The author designs the puzzle, writes the instruction (the task the team must perform), fixes the deterministic answer, then splits the puzzle into exactly two complementary fragments. Fragments are literal puzzle pieces (letters, numbers, shapes, images, matrices, partial equations, rules, symbols, sequences, visual patterns, partial diagrams, answer choices, ordering information, map fragments, transformation rules) — never semantic clues to a separate fact.
- Distribution (runtime behavior, never authored): with two participants, one fragment per participant and the instruction randomly attached to one holder; with three participants, the two fragments go to two participants and the third holds only the instruction. Assignments are shuffled. Never author a fake third content fragment for a three-player team, participant identities, or schedules.
- Host/shared screen: reveals no puzzle-solving information — only the challenge name, timer, team status, readiness, progress, and waiting/resolution state. All puzzle material stays on participant phones; the host screen is never needed to solve.
- Answer modes: `match` with accepted values compared by simple trim, lowercase, and whitespace collapse; `multiple_choice` with localized option labels and one correct option ID; or finite numeric `closest` with nonnegative `acceptedTolerance`. Multiple accepted solutions are allowed only when the author records every accepted value explicitly.
- Wrong result: five-second lock for that team; main timer continues; retries remain unlimited until deadline. No hint is ever sent, and correct truth is never revealed during the item.
- Race: first to solve all three wins. Deadline compares solved count, then earliest elapsed time at that count, then true tie.
- Scoring: a non-tie winner receives one Match point; a true tie receives none.
- Visibility: an actor sees only the current public prompt, the team instruction (if assigned to them), their own fragment, answerer status, and own-team progress. Nothing private is projected.
- Media: optional fragment-owned image, audio, or video only when it improves the puzzle; text-only is preferred, and media must render on a phone.
- Authoring order: choose the family; design one complete puzzle; write the instruction; fix the answer; split into two complementary fragments; verify neither fragment alone solves; verify the two-participant shape; verify the three-participant shape (fragment + fragment + instruction-only); verify host-screen independence; confirm the puzzle is fun to describe aloud.
- Valid example: one shared letter puzzle where fragment A shows a shuffled set of letters, fragment B shows an additional letter set, and the instruction states the target class; combining both fragments plus the instruction yields the unique answer.
- Invalid example: a fragment names or contains the full answer, the full puzzle is duplicated on one participant's device, a fake third fragment is authored for a three-player team, trivia is presented as a distributed puzzle, answer choices replace the puzzle, the item needs the host screen, the instruction is unclear, the answer is ambiguous with no recorded accepted-solution policy, or solving needs information not present in the instruction and fragments.
- Anti-patterns: fragment leakage, duplicated full puzzles, fake third fragments, trivia as distributed puzzles, answer choices as the main architecture, host-dependent content, unclear instructions, non-deterministic answers, phone-unrenderable layouts, authored runtime state, hints, duplicated truth, or separate size-specific Patterns.
- Runtime persistence: launch-time choices persist so reconnect restores order, holdings, answerer, lock, and progress; fairness does not persist across Matches.
