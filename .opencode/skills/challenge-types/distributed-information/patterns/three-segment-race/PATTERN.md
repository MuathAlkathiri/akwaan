---
patternId: three-segment-race
owningChallengeType: distributed-information
---

# Pattern: Three-Segment Race

- Challenge shape: exactly three independent ContentItems; both teams get the same set in independently randomized runtime order.
- Item shape: native `answerPayload` plus `mechanicPayload` with variant, public prompt, A/B/C segments, safe merges, `[2,3]`, safety confirmation, and optional explanation.
- Distribution: three players receive one segment each; two players receive an approved 2+1 partition covering A/B/C exactly once. One item supports both sizes.
- Submission: runtime randomly assigns exactly one answerer per team and item. Three-player teams each answer once in random order; two-player teams alternate from a random start. Authors never store identity or schedule.
- Answer modes: `match` with normalized accepted values, `multiple_choice` with options and one correct option ID, or finite numeric `closest` with optional nonnegative tolerance.
- Wrong result: five-second lock for that team; main timer continues; retries remain unlimited until deadline.
- Race: first to solve all three wins. Deadline compares solved count, then earliest elapsed time at that count, then true tie.
- Scoring: a non-tie winner receives one Match point; a true tie receives none.
- Visibility: public projections expose no private segments or truth. An actor sees only the current public prompt, assigned segments and segment media, answerer status, and own-team progress.
- Media: optional segment-owned image, audio, or video only when it improves synthesis; text-only is preferred.
- Valid constructions: combined total, missing member, shared link, cross-reference, exact order, filtered count, deterministic visual assembly.
- Valid example: A, B, and C provide distinct values whose filtered total is the exact finite numeric result; neither an individual segment nor the approved two-segment holder determines which remaining values qualify.
- Invalid example: A names the result, A+B determine it without C, or the public prompt reproduces a private fragment.
- Anti-patterns: decorative holdings, read-aloud assembly, subjective interpretation, host resolution, authored runtime state, duplicated truth, unsafe 3+0 merge, or separate size-specific Patterns.
- Runtime persistence: launch-time choices persist so reconnect restores order, holdings, answerer, lock, and progress; fairness does not persist across Matches.
