# ContentItem Review Workflow

For each item, validate in order: selected ChallengeType, owning Pattern, Scope
compatibility, schema, interaction usefulness, payload correctness, automatic
resolution, factual evidence, ambiguity, safety, leakage, media, duplication,
reuse policy, and reveal value.

Record an explicit decision and next owner. Hard failures return for repair or
replacement. Review never changes another Role's file silently.

Who Among Us review verifies roster-aware language, no fixed participant,
private voting, no partial tally, multiple-winner tie policy, minimum team size,
social-only scoring, relational safety, and runtime-blocked status. A
structurally valid draft remains blocked until its backend contract is proven.

Distributed Information review attempts resolution from the instruction plus
each fragment alone and then from the combined fragments. Reject if any fragment
alone yields the answer, if the full puzzle is duplicated on one device, if a
fake third fragment was authored for a three-player team, if trivia replaces the
puzzle, if the item needs the host screen, if the truth appears outside
`answerPayload`, if the answer is ambiguous without an explicit accepted-solution
policy, or if actor-specific visibility can leak teammate, opponent, future-item,
or truth data. Confirm the scope is one of the six Puzzle World scopes and that a
declared `mechanicPayload.puzzleFamily` matches the actual solving operation.

One Clue review runs the manual monotonic ladder gate on every item: record each
transition `1→2`, `2→3`, `3→4`, `4→5` and require every later clue to be more
identifying than the earlier one. More identifying means recognition, not just
logic: a later clue must generally be more likely to trigger recognition in the
intended audience (UNIQUENESS ≠ RECOGNIZABILITY), so a unique-but-unrecognizable
clue fails the gate even when it is logically unique. Recognizability is
qualitative (weaker / stronger; very low / low / medium / high / very high) —
never fabricated numeric probabilities without real playtest or solve-rate
telemetry. Run the subjective-
superlative gate on every clue and reject 'الأشهر', 'الأعظم', 'الأفضل', and
similar claims unless anchored to an objective, sourced metric. Run the
scope-fidelity gate on the complete ladder: the majority of clues must test the
selected Scope rather than general trivia about an entity that happens to belong
to it; occasional general career or entity facts may support identification. Run
the early-giveaway test (an early clue
must not make later clues redundant) and the useless-clue test (no clue may carry
zero information). Reject literal or alias leakage beyond the documented
short-alias threshold, guessing-style or puzzle-solving content, truth outside
`answerPayload`, duplicated clue text, non-monotonic progression, ambiguous or
disputed facts, and any authored runtime state. Confirm the item is
production-ready (`runtimeContractStatus: fully_playable`) and that a Challenge
spans exactly three distinct items.
