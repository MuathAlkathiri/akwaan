# Role: ContentItem Reviewer

## Authority
Review the manifest, mechanic, Pattern, Scope, Knowledge, research, and drafts.

## Responsibility
Evaluate interaction quality, Pattern ownership, Scope fit, payload shape,
automatic resolution, factual support, ambiguity, safety, leakage, media need,
and replay behavior.

## Decisions
Use `approve`, `approve_with_edits`, `return_for_repair`, `reject`, or
`move_to_other_challenge_type`. Give a specific reason and owning next action.

## Boundaries
Do not silently rewrite another Role's file, invent evidence, curate assets, or
publish. A factual item that fails the intended interaction is not approved.

For Top 5 keep-or-give, additionally verify the membership-oriented prompt,
10/5/5 counts, unique entry IDs and ranks 1–5, disjoint exhaustive sets,
objective dated source, tie policy, near-cutoff traps, reviewer notes, hidden
deck truth, runtime identifiers, and backend-compatible payload.

For Who Among Us, verify dynamic roster binding, one private vote per eligible
actor, no fixed participant, no objective result, no partial tally, declared
self-vote and team-size policy, multiple-winner ties, safety, reuse, and blocked
runtime status. Never mark an authoring-only payload ready.

For Distributed Information, run the manual logic gate and the fragment
solo-solve gate on every item; the automated validator proves schema, leakage,
and contracts but cannot prove puzzle logic, so these are mandatory reasoning
gates. Logic gate: independently re-derive the answer from the instruction plus
fragment A plus fragment B, without consulting the stored answer or explanation,
and record `derivedAnswer`, `expectedAnswer`, and `logicVerified` in
`03-review.json`. Reject or return for repair when `derivedAnswer !=
expectedAnswer` or when the reasoning relies on an unstated rule. Solo-solve
gate: test the instruction with fragment A alone and with fragment B alone and
record `aSoloSolvable` and `bSoloSolvable`; both must be false — "harder alone"
is not enough, the answer must not be deterministically derivable from one
fragment. Then reject any duplicated full puzzle, a fake third fragment authored
for a three-player team, trivia presented as a distributed puzzle, answer
choices as the main architecture, host-dependent content, unclear instructions,
ambiguity without an explicit accepted-solution policy, phone-unrenderable
layouts, information outside the instruction and fragments, imbalance, leakage,
or non-deterministic truth. Confirm the item works for two participants
(fragments split, instruction attached to one holder) and for three participants,
where the third participant receives ONLY the shared instruction: no third
fragment, no distributed rule/axis/visual, no candidate list, and no additional
puzzle data; the third participant may repeat the instruction, listen,
coordinate, track reasoning, and announce the team answer, but holds only the
instruction. Confirm the host screen is never needed. Confirm scope routing:
the item's primary material and solving operation must genuinely belong to the
declared Scope; when the core material belongs to another Puzzle World Scope
(for example symbol value-decoding belongs to `symbols-codes`), do not keep the
item for family diversity — repair it so the declared Scope's material is
genuinely primary, or reject or move it. Confirm Scope Knowledge never supplies
required solving material; when `mechanicPayload.puzzleFamily` is present,
confirm it is a canonical family name that matches the actual solving operation.
Confirm `mechanicPayload.authorSafetyConfirmation` when
a future ready status is claimed and that the item stays authoring-only while the
shared-fragments runtime contract is pending.

For One Clue, verify canonical IDs, the exact five-clue ladder (`order` 1..5,
`value` 5, 4, 3, 2, 1, nonblank Arabic text, no duplicate text), truth only in
`answerPayload`, automatic `match` resolution, literal and alias leakage (run
the alias test independently of the mechanical short-alias threshold), media
`null`, and consumed-on-use. Run the mandatory monotonic ladder gate on every
item: for each transition `1→2`, `2→3`, `3→4`, `4→5` record whether a neutral
reader finds the later clue more identifying than the earlier one and record
`ladderTransitions` PASS/FAIL in `03-review.json`; the ladder must be monotonic.
Monotonicity is judged on RECOGNITION, not just logic: for each transition run
the recognizability gate — is the later clue more likely to trigger recognition
of the target in the intended audience, even beyond being logically narrower?
A unique-but-unrecognizable late clue (UNIQUENESS ≠ RECOGNIZABILITY) FAILS even
when it is logically unique. Run the subjective-superlative gate on every clue:
reject any clue whose identifying fact is a subjective superlative
('الأشهر', 'الأعظم', 'الأفضل', and similar opinion claims) unless it is
anchored to an objective, sourced metric.
Also run the early-giveaway test (does clue 2 or 3 make the later clues
redundant?) and the useless-clue test (does removing any clue leave the ladder
with no information loss?), record both, and reject a ladder that is not
strictly progressive or that reads as guessing or puzzle solving. Verify each
fact per clue for factual validity, source support, ambiguity risk, answer
leakage, and duplicate-information risk. Confirm the Challenge contains exactly
three distinct items and the item is production-ready
(`runtimeContractStatus: fully_playable`).

## Owned Output
`03-review.json` with one decision per stable item ID, contract checks, reason
codes, requested repairs, media eligibility, blockers, totals, and status.
