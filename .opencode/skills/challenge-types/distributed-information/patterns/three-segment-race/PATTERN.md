---
patternId: three-segment-race
owningChallengeType: distributed-information
---

# Pattern: Three-Segment Race

- Challenge shape: exactly three independent ContentItems; both teams get the same set in independently randomized runtime order.
- Item shape: native `answerPayload` plus `mechanicPayload` with variant, public prompt, A/B/C segments, safe merges, `[2,3]`, safety confirmation, and optional explanation.
- Distribution: three players receive one segment each; two players receive a random two-plus-one partition covering A/B/C exactly once. Because the runtime draws the partition at random and never reads the authored merge list, all three partitions (AB|C, AC|B, BC|A) must leave the two-segment holder unable to solve alone. List all three canonical partitions in `twoPlayerMergeOptions` as the record of that safety proof.
- Submission: runtime randomly assigns exactly one answerer per team and item. Three-player teams each answer once in random order; two-player teams alternate from a random start. Authors never store identity or schedule.
- Answer modes: `match` with accepted values compared by simple trim, lowercase, and whitespace collapse; `multiple_choice` with localized option labels and one correct option ID; or finite numeric `closest` with nonnegative `acceptedTolerance`.
- Wrong result: five-second lock for that team; main timer continues; retries remain unlimited until deadline. No hint is ever sent, and correct truth is never revealed during the item.
- Race: first to solve all three wins. Deadline compares solved count, then earliest elapsed time at that count, then true tie.
- Scoring: a non-tie winner receives one Match point; a true tie receives none.
- Visibility: public projections expose no private segments or truth. An actor sees only the current public prompt, assigned segments and segment media, answerer status, and own-team progress.
- Media: optional segment-owned image, audio, or video only when it improves synthesis; text-only is preferred.
- Shared-link construction: give the public prompt a finite candidate pool without naming the answer, and design each derived clue to keep at least two candidates standing so that no pair of clues resolves alone.
- Creative personal-puzzle model: each segment is an independent mini-puzzle one player solves alone with World, Scope, and Scope Knowledge; the puzzle's answer is the derived World clue the player announces. Combine the three derived clues plus shared World knowledge to reach the single answer. Mini-puzzles are self-contained, solvable alone, and never use counting, sums, arithmetic, frequency, or list totals; resolution is World-grounded deduction, not aggregation.
- Valid example: A, B, and C are three distinct mini-puzzles; solving each alone yields a World clue (for example, a team, an office, and a trait), and the intersection of the three clues plus World knowledge is exactly one character. No single clue and no pair of clues determines that character alone.
- Invalid example: a segment names the result directly, a mini-puzzle can be skipped and the clue read aloud (decorative), a clue is itself the final answer rather than a derived World fact, a puzzle resolves by counting or arithmetic instead of World knowledge, the public prompt reproduces a private fragment, or a two-segment holding is the only information needed.
- Anti-patterns: decorative holdings, read-aloud assembly, count/sum/frequency/list-total constructions, a segment whose answer is the final truth, subjective interpretation, host resolution, authored runtime state, hints, duplicated truth, unsafe 3+0 merge, or separate size-specific Patterns.
- Runtime persistence: launch-time choices persist so reconnect restores order, holdings, answerer, lock, and progress; fairness does not persist across Matches.
